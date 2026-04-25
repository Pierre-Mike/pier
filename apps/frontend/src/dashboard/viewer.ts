/**
 * Artifact viewer modal
 */

import { appConfig } from "./files";
import { store } from "./state";
import { $, escapeAttr, escapeHTML } from "./utils";

type ArtifactKind =
	| "markdown"
	| "mermaid"
	| "image"
	| "svg"
	| "pdf"
	| "audio"
	| "video"
	| "html"
	| "json"
	| "text";

function kindFromContentType(contentType: string | null): ArtifactKind {
	if (!contentType) return "text";
	const mime = contentType.split(";")[0].trim();
	if (mime === "text/markdown") return "markdown";
	if (mime === "text/plain") return "text";
	if (mime.startsWith("image/") && mime !== "image/svg+xml") return "image";
	if (mime === "image/svg+xml") return "svg";
	if (mime === "application/pdf") return "pdf";
	if (mime.startsWith("audio/")) return "audio";
	if (mime.startsWith("video/")) return "video";
	if (mime === "text/html") return "html";
	if (mime === "application/json") return "json";
	return "text";
}

async function detectKind(url: string): Promise<ArtifactKind> {
	try {
		const res = await fetch(url, { method: "HEAD" });
		const contentType = res.headers.get("Content-Type");
		const kind = kindFromContentType(contentType);
		if (kind === "text" && (url.includes(".mmd") || url.includes(".mermaid"))) {
			return "mermaid";
		}
		return kind;
	} catch {
		return "text";
	}
}

export function wireViewerModal(): void {
	const modal = $("#viewer-modal");
	modal.addEventListener("click", (e) => {
		const target = e.target as HTMLElement;
		if (target.dataset && target.dataset.close !== undefined) closeViewer();
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			const logsModal = document.getElementById("logs-modal");
			const logsOpen = logsModal && !logsModal.classList.contains("hidden");
			if (!logsOpen && !modal.classList.contains("hidden")) closeViewer();
		}
	});
}

function openViewer(): void {
	$("#viewer-modal").classList.remove("hidden");
}

function closeViewer(): void {
	$("#viewer-modal").classList.add("hidden");
	const viewer = $("#artifact-viewer");
	viewer.innerHTML = `<div class="placeholder">Click a file to view.</div>`;
	viewer.className = "empty";
	store.activeFilePath = null;
}

export async function openRepoFile(path: string, name: string): Promise<void> {
	store.activeFilePath = path;
	openViewer();
	const viewer = $("#artifact-viewer");
	// biome-ignore lint/style/noNonNullAssertion: called only from file tree which guards on activeProject
	const projectId = store.activeProject!;
	const blobUrl = `/api/projects/${encodeURIComponent(projectId)}/blob?path=${encodeURIComponent(path)}`;
	const kind = await detectKind(blobUrl);
	const openUrl =
		kind === "html"
			? `http://127.0.0.1:${appConfig?.sandboxPort ?? 5174}/repo?project=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`
			: blobUrl;
	const absPath = absoluteRepoPath(projectId, path);
	const vscodeUrl = `vscode-insiders://file${absPath.startsWith("/") ? "" : "/"}${absPath}`;
	const head = `
    <div class="viewer-head">
      <strong>${escapeHTML(name)}</strong>
      <span>· ${escapeHTML(path)}</span>
      <span style="flex:1"></span>
      <a href="${escapeAttr(vscodeUrl)}" title="Open in VSCode Insiders">VSCode ↗</a>
      <a href="${openUrl}" target="_blank" rel="noopener">open ↗</a>
      <a href="${blobUrl}" download>download</a>
    </div>`;
	viewer.className = "";
	switch (kind) {
		case "markdown":
			fetch(blobUrl)
				.then((r) => r.text())
				.then((txt) => {
					viewer.innerHTML =
						head +
						`<div class="viewer-body md-body"><div class="markdown-body">rendering…</div></div>`;
					// biome-ignore lint/style/noNonNullAssertion: element just created above
					renderMarkdown(viewer.querySelector(".markdown-body")!, txt);
				});
			break;
		case "mermaid":
			fetch(blobUrl)
				.then((r) => r.text())
				.then((txt) => {
					viewer.innerHTML = `${head}<div class="viewer-body"><pre class="mermaid">${escapeHTML(txt)}</pre></div>`;
					renderMermaid();
				});
			break;
		case "image":
		case "svg":
			viewer.innerHTML = `${head}<div class="viewer-body"><img src="${blobUrl}" alt="${escapeAttr(name)}" /></div>`;
			break;
		case "pdf":
			viewer.innerHTML = `${head}<div class="viewer-body"><embed src="${blobUrl}" type="application/pdf" /></div>`;
			break;
		case "audio":
			viewer.innerHTML = `${head}<div class="viewer-body"><audio controls src="${blobUrl}"></audio></div>`;
			break;
		case "video":
			viewer.innerHTML = `${head}<div class="viewer-body"><video controls src="${blobUrl}"></video></div>`;
			break;
		case "html": {
			const sandboxUrl = `http://127.0.0.1:${appConfig?.sandboxPort ?? 5174}/repo?project=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`;
			viewer.innerHTML =
				head +
				`<div class="viewer-body html-body"><iframe sandbox="allow-scripts" src="${sandboxUrl}"></iframe></div>`;
			break;
		}
		default:
			fetch(blobUrl)
				.then((r) => r.text())
				.then((txt) => {
					viewer.innerHTML = `${head}<div class="viewer-body"><pre>${escapeHTML(txt)}</pre></div>`;
				});
	}
}

function absoluteRepoPath(projectId: string, relPath: string): string {
	const root = appConfig?.projectsRoot?.replace(/\/+$/, "") ?? "";
	return `${root}/${projectId}/${relPath}`;
}

type MarkdownLibs = {
	marked: { parse: (text: string, opts?: unknown) => string };
	DOMPurify: { sanitize: (html: string) => string };
};

let mdLibs: MarkdownLibs | null = null;

async function loadMarkdownLibs(): Promise<MarkdownLibs> {
	if (mdLibs) return mdLibs;
	// CDN imports — type at site
	const [marked, purify] = (await Promise.all([
		// biome-ignore lint/suspicious/noExplicitAny: CDN import needs type override
		import("https://cdn.jsdelivr.net/npm/marked@13/+esm" as string as any),
		// biome-ignore lint/suspicious/noExplicitAny: CDN import needs type override
		import("https://cdn.jsdelivr.net/npm/dompurify@3/+esm" as string as any),
	])) as [
		{ marked?: { parse: (t: string, o?: unknown) => string }; default?: unknown },
		{ default?: { sanitize: (h: string) => string } },
	];
	if (!document.querySelector("link[data-md-css]")) {
		const link = document.createElement("link");
		link.rel = "stylesheet";
		link.href = "https://cdn.jsdelivr.net/npm/github-markdown-css@5/github-markdown-dark.min.css";
		link.dataset.mdCss = "1";
		document.head.appendChild(link);
	}
	const result: MarkdownLibs = {
		marked: (marked.marked ?? marked.default ?? marked) as MarkdownLibs["marked"],
		DOMPurify: (purify.default ?? purify) as MarkdownLibs["DOMPurify"],
	};
	mdLibs = result;
	return result;
}

async function renderMarkdown(target: HTMLElement, text: string): Promise<void> {
	try {
		const { marked, DOMPurify } = await loadMarkdownLibs();
		const html = marked.parse(text, { gfm: true, breaks: false });
		target.innerHTML = DOMPurify.sanitize(html);
	} catch (e) {
		target.innerHTML = `<pre>${escapeHTML(text)}</pre>`;
		// biome-ignore lint/suspicious/noConsole: Error logging
		console.warn("markdown render failed", e);
	}
}

let mermaidLoaded = false;
async function renderMermaid(): Promise<void> {
	if (!mermaidLoaded) {
		// CDN import — type at site
		const m = (await import(
			// biome-ignore lint/suspicious/noExplicitAny: CDN import needs type override
			"https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs" as string as any
		)) as {
			default: { initialize: (opts: unknown) => void; run: () => Promise<void> };
		};
		m.default.initialize({ startOnLoad: false, theme: "default" });
		(window as { __mermaid?: typeof m.default }).__mermaid = m.default;
		mermaidLoaded = true;
	}
	const mermaid = (window as { __mermaid?: { run: () => Promise<void> } }).__mermaid;
	if (mermaid) {
		try {
			await mermaid.run();
		} catch (e) {
			// biome-ignore lint/suspicious/noConsole: Error logging
			console.warn(e);
		}
	}
}
