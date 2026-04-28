const TERMINAL_COPY_MESSAGE = "pier:terminal-copy";

type ClipboardLike = {
	readonly writeText?: (text: string) => Promise<void>;
};

type NavigatorLike = {
	readonly clipboard?: ClipboardLike;
};

type DocumentLike = Pick<Document, "body" | "createElement" | "execCommand">;

export function isTerminalCopyMessage(data: unknown): data is { readonly type: string; readonly text: string } {
	if (typeof data !== "object" || data === null) return false;
	if (!("type" in data) || data.type !== TERMINAL_COPY_MESSAGE) return false;
	if (!("text" in data) || typeof data.text !== "string") return false;
	return data.text.length > 0;
}

export async function copyTextWithFallback({
	text,
	navigatorRef = navigator,
	documentRef = document,
}: {
	readonly text: string;
	readonly navigatorRef?: NavigatorLike;
	readonly documentRef?: DocumentLike;
}): Promise<boolean> {
	try {
		if (navigatorRef?.clipboard?.writeText) {
			await navigatorRef.clipboard.writeText(text);
			return true;
		}
	} catch {
		// Fall through to document fallback.
	}

	try {
		const textarea = documentRef?.createElement("textarea");
		if (!textarea || !documentRef?.body) return false;
		textarea.value = text;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.left = "-9999px";
		documentRef.body.appendChild(textarea);
		textarea.select();
		const copied = documentRef.execCommand("copy");
		textarea.remove();
		return copied;
	} catch {
		return false;
	}
}

export function terminalClipboardHelperScript(): string {
	return `(() => {
  const messageType = "${TERMINAL_COPY_MESSAGE}";
  let lastText = "";
  let timer = 0;
  const sendSelection = () => {
    const selection = window.getSelection && window.getSelection();
    const text = selection ? selection.toString() : "";
    if (!text || text === lastText) return;
    lastText = text;
    window.parent.postMessage({ type: messageType, text }, "*");
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(sendSelection, 80);
  };
  document.addEventListener("selectionchange", schedule);
  document.addEventListener("mouseup", schedule);
  document.addEventListener("copy", sendSelection);
})();`;
}

export function installTerminalClipboardHelper(iframe: HTMLIFrameElement): void {
	try {
		const iframeDocument = iframe.contentDocument;
		if (!iframeDocument?.body) return;
		if (iframeDocument.querySelector("script[data-pier-terminal-copy]")) return;
		const script = iframeDocument.createElement("script");
		script.dataset.pierTerminalCopy = "1";
		script.textContent = terminalClipboardHelperScript();
		iframeDocument.body.appendChild(script);
	} catch {
		// Cross-origin or sandboxed iframes cannot be injected; allow attribute still permits manual copy paths.
	}
}

export function wireTerminalClipboardBridge({
	terminalHost,
	windowRef = window,
	navigatorRef = navigator,
	documentRef = document,
}: {
	readonly terminalHost: HTMLElement;
	readonly windowRef?: Window;
	readonly navigatorRef?: NavigatorLike;
	readonly documentRef?: DocumentLike;
}): () => void {
	const onMessage = (event: MessageEvent<unknown>) => {
		if (!isTerminalCopyMessage(event.data)) return;
		const frames = terminalHost.querySelectorAll("iframe");
		const fromTerminal = Array.from(frames).some((frame) => frame.contentWindow === event.source);
		if (!fromTerminal) return;
		void copyTextWithFallback({ text: event.data.text, navigatorRef, documentRef });
	};
	windowRef.addEventListener("message", onMessage);
	return () => windowRef.removeEventListener("message", onMessage);
}
