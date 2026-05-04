import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { execFile, type ExecFileException } from "node:child_process";

const DEFAULT_GMUX_URL = "http://127.0.0.1:8790";
const COMMAND_TIMEOUT_MS = 8_000;
const MAX_OUTPUT_BYTES = 256 * 1024;

type CommandResult = {
	ok: boolean;
	stdout: string;
	stderr: string;
	error?: string;
};

type GmuxStatus = {
	localUrl: string;
	remoteUrl?: string;
	raw?: string;
	error?: string;
};

function execFileText(command: string, args: string[] = []): Promise<CommandResult> {
	return new Promise((resolve) => {
		execFile(
			command,
			args,
			{ timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
			(error: ExecFileException | null, stdout: string | Buffer, stderr: string | Buffer) => {
				const stdoutText = stdout.toString();
				const stderrText = stderr.toString();
				if (!error) {
					resolve({ ok: true, stdout: stdoutText, stderr: stderrText });
					return;
				}

				resolve({
					ok: false,
					stdout: stdoutText,
					stderr: stderrText,
					error: error.message,
				});
			},
		);
	});
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function shortSessionId(sessionId: string | undefined): string | undefined {
	const trimmed = sessionId?.trim();
	if (!trimmed) return undefined;
	const withoutPrefix = trimmed.startsWith("sess-") ? trimmed.slice("sess-".length) : trimmed;
	return withoutPrefix.slice(0, 8);
}

function parseStatus(output: string): GmuxStatus {
	const tcp = output.match(/^\s*tcp:\s+(.+)$/m)?.[1]?.trim();
	const remote = output.match(/^\s*remote:\s+(.+)$/m)?.[1]?.trim();
	const localUrl = tcp
		? (tcp.startsWith("http://") || tcp.startsWith("https://") ? tcp : `http://${tcp}`)
		: DEFAULT_GMUX_URL;

	return {
		localUrl,
		remoteUrl: remote || undefined,
		raw: output,
	};
}

async function getGmuxStatus(): Promise<GmuxStatus> {
	const result = await execFileText("gmuxd", ["status"]);
	if (!result.ok) {
		const details = [result.stderr.trim(), result.stdout.trim(), result.error].filter(Boolean).join("\n");
		return {
			localUrl: DEFAULT_GMUX_URL,
			error: details || "gmuxd status failed",
		};
	}
	return parseStatus(result.stdout);
}

async function openGmuxUi(): Promise<CommandResult> {
	return execFileText("gmux");
}

function buildInGmuxMessage(status: GmuxStatus, openResult: CommandResult | undefined): string {
	const sessionId = process.env.GMUX_SESSION_ID;
	const displayId = shortSessionId(sessionId);
	const opened = openResult
		? openResult.ok
			? "I also asked `gmux` to open the UI in your browser."
			: `I tried to open the gmux UI, but that command failed:\n${openResult.stderr.trim() || openResult.error || "unknown error"}`
		: "I did not open a browser because you passed `--no-open`.";

	const lines = [
		"gmux remote control is available for this Pi session.",
		"",
		opened,
		"",
		`- Local UI: ${status.localUrl}`,
	];

	if (status.remoteUrl) {
		lines.push(`- Remote UI: ${status.remoteUrl}`);
	} else {
		lines.push("- Remote UI: not enabled yet; run `gmuxd remote` to set up Tailscale access.");
	}

	if (displayId) {
		lines.push(`- Current gmux session: ${displayId}`);
		lines.push(`- Reattach from another terminal: \`gmux --attach ${displayId}\``);
		lines.push(`- Send input from a shell: \`gmux --send ${displayId} $'your message\\n'\``);
	}

	lines.push(
		"",
		"The terminal and browser/mobile UI share the same PTY, so you can keep this terminal open and steer from gmux at the same time.",
	);

	if (status.error) {
		lines.push("", `Note: \`gmuxd status\` failed, so the URL above is the default. Details:\n${status.error}`);
	}

	return lines.join("\n");
}

function buildNotInGmuxMessage(sessionFile: string | undefined): string {
	const resumeCommand = sessionFile
		? `gmux pi --session ${shellQuote(sessionFile)} -c`
		: "gmux pi";

	return [
		"This Pi process is not running inside gmux, so I cannot attach gmux to the already-running terminal PTY.",
		"",
		"Exit this Pi process, then start or resume it under gmux instead:",
		"",
		"```bash",
		resumeCommand,
		"```",
		"",
		"After that, run `/remote-control` again. The new gmux-managed session will stay usable from both your terminal and the gmux browser/mobile UI.",
	].join("\n");
}

function shouldOpen(args: string): boolean {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	return !parts.includes("--no-open");
}

function display(pi: ExtensionAPI, content: string, details: Record<string, unknown> = {}): void {
	pi.sendMessage({
		customType: "gmux-remote-control",
		content,
		display: true,
		details,
	});
}

export default function gmuxRemoteControlExtension(pi: ExtensionAPI) {
	async function handler(args: string, ctx: ExtensionCommandContext) {
		const sessionId = process.env.GMUX_SESSION_ID;
		if (!process.env.GMUX || !sessionId) {
			let sessionFile: string | undefined;
			try {
				sessionFile = ctx.sessionManager.getSessionFile();
			} catch {
				sessionFile = undefined;
			}
			const message = buildNotInGmuxMessage(sessionFile);
			display(pi, message, { inGmux: false, sessionFile });
			ctx.ui.notify("This session must be restarted under gmux for remote control.", "warning");
			return;
		}

		const openResult = shouldOpen(args) ? await openGmuxUi() : undefined;
		const status = await getGmuxStatus();
		const message = buildInGmuxMessage(status, openResult);
		display(pi, message, {
			inGmux: true,
			sessionId,
			localUrl: status.localUrl,
			remoteUrl: status.remoteUrl,
			openOk: openResult?.ok,
		});
		ctx.ui.notify(
			status.remoteUrl ? "gmux remote control is ready." : "gmux UI opened. Run gmuxd remote for phone access.",
			status.remoteUrl ? "success" : "info",
		);
	}

	pi.registerCommand("remote-control", {
		description: "Open or explain gmux remote control for this Pi session; pass --no-open to only print instructions",
		handler,
	});

	pi.registerCommand("rc", {
		description: "Alias for /remote-control",
		handler,
	});
}
