import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import {
	createBashToolDefinition,
	createEditToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type ExtensionAPI,
	SettingsManager,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { TSchema } from "typebox";

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
const MARKDOWN_LINK_RE = /(?<!!)(\[[^\]\n]*\]\()(<[^>\n]+>|[^)\s]+)([^)\n]*\))/g;
const INLINE_CODE_RE = /(?<!`)(`)([^`\n]+)`(?!`)/g;
const OSC8_FILE_LINK_RE = /(\x1b\]8;[^;]*;)(file:\/\/[^\x07\x1b]*)(\x07|\x1b\\)/g;

type TextTransform = (text: string) => string;

interface ToolLinkTransforms {
	call?: TextTransform;
	result?: TextTransform;
}

export function linkifyToolOutput(text: string): string {
	return text.replace(OSC8_FILE_LINK_RE, (match, prefix: string, fileUrl: string, terminator: string) => {
		try {
			return `${prefix}${urlFor(fileURLToPath(fileUrl), "")}${terminator}`;
		} catch {
			return match;
		}
	});
}

export function linkifyRenderedPaths(text: string, cwd: string): string {
	const plainText = stripVTControlCharacters(text);
	const replacements: Array<{ start: number; end: number; url: string }> = [];
	let rawOffset = 0;

	for (const match of plainText.matchAll(PATH_RE)) {
		const rawPath = match[2];
		if (!rawPath) continue;
		const url = toEditorUrl(rawPath, cwd);
		if (!url) continue;
		const start = text.indexOf(rawPath, rawOffset);
		if (start === -1) continue;
		const end = start + rawPath.length;
		replacements.push({ start, end, url });
		rawOffset = end;
	}

	let linked = text;
	for (const { start, end, url } of replacements.reverse()) {
		linked = `${linked.slice(0, start)}\x1b]8;;${url}\x1b\\${linked.slice(start, end)}\x1b]8;;\x1b\\${linked.slice(end)}`;
	}
	return linked;
}

class EditorLinkComponent implements Component {
	inner: Component;
	transform: TextTransform;

	constructor(inner: Component, transform: TextTransform) {
		this.inner = inner;
		this.transform = transform;
	}

	render(width: number): string[] {
		return this.inner.render(width).map(this.transform);
	}

	invalidate(): void {
		this.inner.invalidate();
	}
}

export function linkifyToolDefinition<TParams extends TSchema, TDetails, TState>(
	definition: ToolDefinition<TParams, TDetails, TState>,
	transforms: ToolLinkTransforms = {},
): ToolDefinition<TParams, TDetails, TState> {
	const renderCall = definition.renderCall;
	const renderResult = definition.renderResult;
	const callTransform = transforms.call ?? linkifyToolOutput;
	const resultTransform = transforms.result;

	return {
		...definition,
		renderCall: renderCall
			? (args, theme, context) => {
					const previous = context.lastComponent;
					const wrapper = previous instanceof EditorLinkComponent ? previous : undefined;
					const inner = renderCall(args, theme, {
						...context,
						lastComponent: wrapper?.inner ?? previous,
					});

					if (wrapper) {
						wrapper.inner = inner;
						wrapper.transform = callTransform;
						return wrapper;
					}
					return new EditorLinkComponent(inner, callTransform);
				}
			: undefined,
		renderResult:
			resultTransform && renderResult
				? (result, options, theme, context) => {
						const previous = context.lastComponent;
						const wrapper = previous instanceof EditorLinkComponent ? previous : undefined;
						const inner = renderResult(result, options, theme, {
							...context,
							lastComponent: wrapper?.inner ?? previous,
						});

						if (wrapper) {
							wrapper.inner = inner;
							wrapper.transform = resultTransform;
							return wrapper;
						}
						return new EditorLinkComponent(inner, resultTransform);
					}
				: renderResult,
	};
}

export function registerBuiltInToolLinks(pi: ExtensionAPI, cwd: string, projectTrusted = true): void {
	const builtInTools = new Set(
		pi
			.getAllTools()
			.filter((tool) => tool.sourceInfo.source === "builtin")
			.map((tool) => tool.name),
	);
	const settings = SettingsManager.create(cwd, undefined, { projectTrusted });

	if (builtInTools.has("read")) {
		pi.registerTool(
			linkifyToolDefinition(
				createReadToolDefinition(cwd, { autoResizeImages: settings.getImageAutoResize() }),
			),
		);
	}
	if (builtInTools.has("write")) pi.registerTool(linkifyToolDefinition(createWriteToolDefinition(cwd)));
	if (builtInTools.has("edit")) pi.registerTool(linkifyToolDefinition(createEditToolDefinition(cwd)));
	if (builtInTools.has("ls")) pi.registerTool(linkifyToolDefinition(createLsToolDefinition(cwd)));
	if (builtInTools.has("bash")) {
		pi.registerTool(
			linkifyToolDefinition(
				createBashToolDefinition(cwd, {
					commandPrefix: settings.getShellCommandPrefix(),
					shellPath: settings.getShellPath(),
				}),
				{ result: (text) => linkifyRenderedPaths(text, cwd) },
			),
		);
	}
}

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

function linkifyMarkdownLinks(line: string, cwd: string): string {
	return line.replace(
		MARKDOWN_LINK_RE,
		(match: string, prefix: string, rawDestination: string, suffix: string, offset: number) => {
			if (isInsideInlineCode(line, offset)) return match;
			const destination = rawDestination.startsWith("<")
				? rawDestination.slice(1, -1)
				: rawDestination;
			const hasScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(destination);
			if (destination.startsWith("#") || destination.startsWith("//") || hasScheme) return match;
			let decodedDestination: string;
			try {
				decodedDestination = decodeURI(destination);
			} catch {
				return match;
			}
			const url = toEditorUrl(decodedDestination, cwd);
			return url ? `${prefix}${url}${suffix}` : match;
		},
	);
}

function linkifyInlineCodePaths(line: string, cwd: string): string {
	return line.replace(
		INLINE_CODE_RE,
		(match: string, _tick: string, rawPath: string, offset: number) => {
			if (isProbablyMarkdownLink(line, offset, offset + match.length)) return match;
			const url = toEditorUrl(rawPath, cwd);
			return url ? `[${match}](${url})` : match;
		},
	);
}

function linkifyLine(line: string, cwd: string): string {
	const linkedMarkdown = linkifyMarkdownLinks(line, cwd);
	const linkedLine = linkifyInlineCodePaths(linkedMarkdown, cwd);
	return linkedLine.replace(PATH_RE, (match: string, prefix: string, rawPath: string, _pos: string, offset: number) => {
		const pathStart = offset + prefix.length;
		if (
			isProbablyMarkdownLink(linkedLine, pathStart, pathStart + rawPath.length) ||
			isInsideInlineCode(linkedLine, pathStart)
		) {
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
	pi.on("session_start", (_event, ctx) => {
		registerBuiltInToolLinks(pi, ctx.cwd, ctx.isProjectTrusted());
	});
	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		let changed = false;
		const content = event.message.content.map((block) => {
			if (block.type !== "text" || !block.text) return block;
			const text = linkifyText(block.text, ctx.cwd);
			if (text === block.text) return block;
			changed = true;
			return { ...block, text };
		});
		if (changed) return { message: { ...event.message, content } };
	});
}
