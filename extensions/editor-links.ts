import { execFile } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
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
// bridge that launches Zed instead of using zed:// directly.
// ponytail: fixed port; whichever pi session is running serves all scrollback links
const BRIDGE_PORT = 48291;
const ZED_CLI = "/Applications/Zed.app/Contents/MacOS/cli";
const ZED_FILE_PREFIX = "zed://file";

type ExecuteFile = (file: string, args: readonly string[]) => void;

const executeFile: ExecuteFile = (file, args) => {
	execFile(file, args);
};

// ponytail: zed hardcoded, swap this template if another editor ever matters
const urlFor = (absolutePath: string, position: string) =>
	`http://127.0.0.1:${BRIDGE_PORT}/open?url=${encodeURIComponent(`${ZED_FILE_PREFIX}${pathToFileURL(absolutePath).pathname}${position}`)}`;

function parseZedFileTarget(target: string): { path: string; position: string } | undefined {
	if (!target.startsWith(`${ZED_FILE_PREFIX}/`)) return undefined;
	const position = target.match(/:\d+(?::\d+)?$/)?.[0] ?? "";
	const encodedPath = target.slice(ZED_FILE_PREFIX.length, position ? -position.length : undefined);
	try {
		const path = fileURLToPath(`file://${encodedPath}`);
		return isAbsolute(path) ? { path, position } : undefined;
	} catch {
		return undefined;
	}
}

function nearestGitRoot(path: string): string | undefined {
	let directory: string;
	try {
		directory = statSync(path).isDirectory() ? path : dirname(path);
	} catch {
		directory = dirname(path);
	}

	while (true) {
		if (existsSync(join(directory, ".git"))) return directory;
		const parent = dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

function isExecutable(path: string): boolean {
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export function startBridge(
	port = BRIDGE_PORT,
	openCmd = "open",
	zedCli = ZED_CLI,
	runFile: ExecuteFile = executeFile,
) {
	const server = createServer((req, res) => {
		const target = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("url") ?? "";
		const fileTarget = parseZedFileTarget(target);
		if (fileTarget) {
			const gitRoot = nearestGitRoot(fileTarget.path);
			if (gitRoot && isExecutable(zedCli)) {
				runFile(zedCli, [gitRoot, `${fileTarget.path}${fileTarget.position}`]);
			} else {
				runFile(openCmd, [target]);
			}
		}
		res.writeHead(fileTarget ? 200 : 400, { "content-type": "text/html" });
		res.end(fileTarget ? "<script>window.close()</script>Opened in Zed — close this tab." : "Bad link");
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
type LinesTransform = (lines: string[], originalLines: string[]) => string[];

interface ToolLinkTransforms {
	call?: TextTransform;
	callLines?: (lines: string[], originalLines: string[], args: unknown, toolName: string) => string[];
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

function rawOffsetAfterPlainPrefix(text: string, plainPrefix: string): number | undefined {
	const plainText = stripVTControlCharacters(text);
	for (let offset = 0; offset <= text.length; offset++) {
		const prefix = stripVTControlCharacters(text.slice(0, offset));
		if (prefix !== plainPrefix) continue;
		if (prefix + stripVTControlCharacters(text.slice(offset)) === plainText) return offset;
	}
	return undefined;
}

function linkifyPlainToolCallPath(
	lines: string[],
	originalLines: string[],
	cwd: string,
	args: unknown,
	toolName: string,
): string[] {
	if (lines.some((line, index) => line !== originalLines[index])) return lines;
	if (!args || typeof args !== "object") return lines;
	const record = args as Record<string, unknown>;
	const rawPath = record.file_path ?? record.path;
	if (typeof rawPath !== "string" || !rawPath) return lines;
	const url = toEditorUrl(rawPath, cwd);
	if (!url) return lines;
	const home = homedir();
	let remaining = rawPath.startsWith(home) ? `~${rawPath.slice(home.length)}` : rawPath;
	const replacements: Array<{ line: number; plainStart: number; segment: string }> = [];
	let labelSeen = false;
	let pathStarted = false;

	for (let index = 0; index < lines.length && remaining; index++) {
		const plainLine = stripVTControlCharacters(lines[index] ?? "");
		let plainStart = plainLine.search(/\S/);
		if (plainStart === -1) continue;
		let visible = plainLine.slice(plainStart).trimEnd();
		if (!labelSeen && (visible === toolName || visible.startsWith(`${toolName} `))) {
			labelSeen = true;
			plainStart += toolName.length;
			while (plainLine[plainStart] === " ") plainStart++;
			visible = plainLine.slice(plainStart).trimEnd();
			if (!visible) continue;
		}
		let segment: string;
		if (remaining.startsWith(visible)) {
			segment = visible;
		} else if (visible.startsWith(remaining)) {
			segment = remaining;
		} else if (!pathStarted) {
			continue;
		} else {
			return lines;
		}
		pathStarted = true;
		replacements.push({ line: index, plainStart, segment });
		remaining = remaining.slice(segment.length);
	}
	if (remaining || replacements.length === 0) return lines;

	const linked = [...lines];
	for (const replacement of replacements) {
		const line = linked[replacement.line];
		if (line === undefined) return lines;
		const plainLine = stripVTControlCharacters(line);
		const start = rawOffsetAfterPlainPrefix(line, plainLine.slice(0, replacement.plainStart));
		const end = rawOffsetAfterPlainPrefix(
			line,
			plainLine.slice(0, replacement.plainStart + replacement.segment.length),
		);
		if (start === undefined || end === undefined || end <= start) return lines;
		linked[replacement.line] = `${line.slice(0, start)}\x1b]8;;${url}\x1b\\${line.slice(start, end)}\x1b]8;;\x1b\\${line.slice(end)}`;
	}
	return linked;
}

class EditorLinkComponent implements Component {
	inner: Component;
	transform: TextTransform;
	linesTransform?: LinesTransform;

	constructor(inner: Component, transform: TextTransform, linesTransform?: LinesTransform) {
		this.inner = inner;
		this.transform = transform;
		this.linesTransform = linesTransform;
	}

	render(width: number): string[] {
		const originalLines = this.inner.render(width);
		const lines = originalLines.map(this.transform);
		return this.linesTransform?.(lines, originalLines) ?? lines;
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
					const linesTransform = transforms.callLines
						? (lines: string[], originalLines: string[]) =>
							transforms.callLines?.(lines, originalLines, args, definition.name) ?? lines
						: undefined;

					if (wrapper) {
						wrapper.inner = inner;
						wrapper.transform = callTransform;
						wrapper.linesTransform = linesTransform;
						return wrapper;
					}
					return new EditorLinkComponent(inner, callTransform, linesTransform);
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
							wrapper.linesTransform = undefined;
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

	const callLines = (lines: string[], originalLines: string[], args: unknown, toolName: string) =>
		linkifyPlainToolCallPath(lines, originalLines, cwd, args, toolName);
	if (builtInTools.has("read")) {
		pi.registerTool(
			linkifyToolDefinition(
				createReadToolDefinition(cwd, { autoResizeImages: settings.getImageAutoResize() }),
				{ callLines },
			),
		);
	}
	if (builtInTools.has("write")) {
		pi.registerTool(linkifyToolDefinition(createWriteToolDefinition(cwd), { callLines }));
	}
	if (builtInTools.has("edit")) {
		pi.registerTool(linkifyToolDefinition(createEditToolDefinition(cwd), { callLines }));
	}
	if (builtInTools.has("ls")) {
		pi.registerTool(linkifyToolDefinition(createLsToolDefinition(cwd), { callLines }));
	}
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
