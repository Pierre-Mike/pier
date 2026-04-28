/**
 * Drag-and-drop file upload
 */
import { api } from "../api";
import { refreshFiles } from "./files";
import { store } from "./state";
import { $, toast } from "./utils";

async function copyToClipboard(text: string, successMsg: string): Promise<boolean> {
	try {
		window.focus();
		await navigator.clipboard.writeText(text);
		toast(successMsg);
		return true;
	} catch {
		// Fallback
	}
	try {
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.style.cssText = "position:fixed;left:-9999px;top:0";
		document.body.appendChild(ta);
		ta.select();
		const ok = document.execCommand("copy");
		document.body.removeChild(ta);
		if (ok) {
			toast(successMsg);
			return true;
		}
	} catch {
		// Ignore
	}
	toast(`Copy failed. Path: ${text}`);
	return false;
}

/** Called when the server returns injected: false — copies paths to clipboard so the user can paste manually. */
async function handleTerminalNotReachable(paths: string): Promise<void> {
	await copyToClipboard(paths, `Terminal not reachable — paths copied. ⌘V to paste.`);
}

async function handleOSFileDrop(files: File[]): Promise<void> {
	if (!store.activeProject) {
		toast("Select a project first — dropped files need a target repo");
		return;
	}
	toast(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
	try {
		const r = await api.api.projects[":id"].drop.$post({
			param: { id: store.activeProject },
			form: { files },
		});
		if (!r.ok) {
			const err = await r.json().catch(() => ({ error: "Upload failed" }));
			toast(`Upload failed: ${(err as { error?: string }).error ?? r.status}`);
			return;
		}
		const data = (await r.json()) as { files: Array<{ path: string }>; injected: boolean };
		const paths = data.files.map((f) => f.path).join(" ");
		if (data.injected) {
			toast(`Inserted into terminal: ${paths}`);
		} else {
			// injected === false: server could not reach the zellij session.
			// Delegate to clipboard fallback so user can paste manually.
			await handleTerminalNotReachable(paths);
		}
		if (store.activeProject) await refreshFiles(store.activeProject);
	} catch (e) {
		const msg = e instanceof Error ? e.message : "unknown error";
		toast(`Upload error: ${msg}`);
	}
}

export function wireTerminalDrop(): void {
	const host = $("#terminals");
	const clearDragging = () => document.body.classList.remove("dragging-file");
	window.addEventListener("dragenter", () => document.body.classList.add("dragging-file"));
	window.addEventListener("dragend", clearDragging);
	window.addEventListener("drop", clearDragging);
	window.addEventListener("dragleave", (e) => {
		if (
			e.clientX <= 0 ||
			e.clientY <= 0 ||
			e.clientX >= window.innerWidth ||
			e.clientY >= window.innerHeight
		) {
			clearDragging();
		}
	});
	window.addEventListener("blur", clearDragging);
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) clearDragging();
	});
	host.addEventListener("dragover", (e) => {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
		host.classList.add("drag-over");
	});
	host.addEventListener("dragleave", (e) => {
		if (e.target === host) host.classList.remove("drag-over");
	});
	host.addEventListener("drop", async (e) => {
		e.preventDefault();
		host.classList.remove("drag-over");
		document.body.classList.remove("dragging-file");
		const osFiles = e.dataTransfer?.files;
		if (osFiles && osFiles.length > 0) {
			await handleOSFileDrop([...osFiles]);
			return;
		}
		const text = e.dataTransfer?.getData("text/plain");
		if (!text) return;
		await copyToClipboard(text, `Copied — press ⌘V in terminal: ${text}`);
	});
}
