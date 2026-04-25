export type ArtifactKind =
	| "markdown"
	| "mermaid"
	| "image"
	| "svg"
	| "pdf"
	| "audio"
	| "video"
	| "html"
	| "json"
	| "vega"
	| "text"
	| "binary";

export const EXT_TO_MIME: Record<string, { kind: ArtifactKind; mime: string }> = {
	".md": { kind: "markdown", mime: "text/markdown; charset=utf-8" },
	".markdown": { kind: "markdown", mime: "text/markdown; charset=utf-8" },
	".mmd": { kind: "mermaid", mime: "text/plain; charset=utf-8" },
	".mermaid": { kind: "mermaid", mime: "text/plain; charset=utf-8" },
	".png": { kind: "image", mime: "image/png" },
	".jpg": { kind: "image", mime: "image/jpeg" },
	".jpeg": { kind: "image", mime: "image/jpeg" },
	".gif": { kind: "image", mime: "image/gif" },
	".webp": { kind: "image", mime: "image/webp" },
	".svg": { kind: "svg", mime: "image/svg+xml" },
	".pdf": { kind: "pdf", mime: "application/pdf" },
	".mp3": { kind: "audio", mime: "audio/mpeg" },
	".wav": { kind: "audio", mime: "audio/wav" },
	".ogg": { kind: "audio", mime: "audio/ogg" },
	".mp4": { kind: "video", mime: "video/mp4" },
	".webm": { kind: "video", mime: "video/webm" },
	".mov": { kind: "video", mime: "video/quicktime" },
	".html": { kind: "html", mime: "text/html; charset=utf-8" },
	".htm": { kind: "html", mime: "text/html; charset=utf-8" },
	".json": { kind: "json", mime: "application/json; charset=utf-8" },
	".vega": { kind: "vega", mime: "application/json; charset=utf-8" },
	".txt": { kind: "text", mime: "text/plain; charset=utf-8" },
	".log": { kind: "text", mime: "text/plain; charset=utf-8" },
};

const DEFAULT = { kind: "binary" as const, mime: "application/octet-stream" };

export const classify = (path: string): { kind: ArtifactKind; mime: string } => {
	const lastDot = path.lastIndexOf(".");
	if (lastDot === -1) return DEFAULT;
	const ext = path.slice(lastDot).toLowerCase();
	return EXT_TO_MIME[ext] ?? DEFAULT;
};
