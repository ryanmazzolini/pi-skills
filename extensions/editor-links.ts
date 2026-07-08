import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Ghostty only opens http(s) OSC8 links, so links point at a loopback
// bridge that runs `open zed://...` instead of using zed:// directly.
// ponytail: fixed port; whichever pi session is running serves all scrollback links
const BRIDGE_PORT = 48291;

// ponytail: zed hardcoded, swap this template if another editor ever matters
const urlFor = (absolutePath: string, position: string) =>
	`http://127.0.0.1:${BRIDGE_PORT}/open?url=${encodeURIComponent(`zed://file${pathToFileURL(absolutePath).pathname}${position}`)}`;

export function startBridge(port = BRIDGE_PORT, openCmd = "open") {
	const server = createServer((req, res) => {
		const target = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("url") ?? "";
		const ok = target.startsWith("zed://file/");
		if (ok) execFile(openCmd, [target]);
		res.writeHead(ok ? 200 : 400, { "content-type": "text/html" });
		res.end(ok ? "<script>window.close()</script>Opened in Zed — close this tab." : "Bad link");
	});
	server.unref();
	server.on("error", () => {}); // EADDRINUSE: another session's bridge is serving
	server.listen(port, "127.0.0.1");
	return server;
}

const PATH_RE = /(^|[\s(\[{<"'])(@?(?:~|\.{1,2}|\/)?[A-Za-z0-9_.~/-]+\/[A-Za-z0-9_.~/-]+(:\d+(?::\d+)?)?)(?=$|[\s)\]}>"',;])/g;

function expandPath(input: string, cwd: string): string {
	const clean = input.startsWith("@") ? input.slice(1) : input;
	if (clean.startsWith("~/")) return join(homedir(), clean.slice(2));
	return isAbsolute(clean) ? clean : resolve(cwd, clean);
}

function toEditorUrl(rawPath: string, cwd: string): string | undefined {
	const match = rawPath.match(/^(.*?)(:\d+(?::\d+)?)?$/);
	const base = match?.[1];
	if (!base) return undefined;
	const absolutePath = expandPath(base, cwd);
	if (!existsSync(absolutePath)) return undefined;
	return urlFor(absolutePath, match?.[2] ?? "");
}

function isInsideInlineCode(text: string, offset: number): boolean {
	return (text.slice(0, offset).match(/`/g)?.length ?? 0) % 2 === 1;
}

function isProbablyMarkdownLink(text: string, start: number, end: number): boolean {
	if (text.slice(Math.max(0, start - 2), start) === "](") return true;
	if (text[start - 1] === "[" && text.slice(end, end + 2) === "](") return true;
	return false;
}

function linkifyLine(line: string, cwd: string): string {
	return line.replace(PATH_RE, (match: string, prefix: string, rawPath: string, _pos: string, offset: number) => {
		const pathStart = offset + prefix.length;
		if (isProbablyMarkdownLink(line, pathStart, pathStart + rawPath.length) || isInsideInlineCode(line, pathStart)) {
			return match;
		}
		const url = toEditorUrl(rawPath, cwd);
		return url ? `${prefix}[${rawPath}](${url})` : match;
	});
}

export function linkifyText(text: string, cwd: string): string {
	let inFence = false;
	return text
		.split("\n")
		.map((line) => {
			if (/^\s*(```|~~~)/.test(line)) {
				inFence = !inFence;
				return line;
			}
			return inFence ? line : linkifyLine(line, cwd);
		})
		.join("\n");
}

export default function editorLinksExtension(pi: ExtensionAPI) {
	startBridge();
	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		let changed = false;
		const content = event.message.content.map((block: { type: string; text?: string }) => {
			if (block.type !== "text" || !block.text) return block;
			const text = linkifyText(block.text, ctx.cwd);
			if (text === block.text) return block;
			changed = true;
			return { ...block, text };
		});
		if (changed) return { message: { ...event.message, content } };
	});
}
