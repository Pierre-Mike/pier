export function focusTerminalIframe(event: Event): void {
	const iframe = event.currentTarget;
	if (iframe instanceof HTMLIFrameElement) {
		iframe.focus({ preventScroll: true });
	}
}
