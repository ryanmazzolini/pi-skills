import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createGithubPrMonitorAdapter } from "./adapters/github-pr.ts";
import { createPiMonitorsRuntime, type PiMonitorsRuntime } from "./runtime.ts";
import type { PiMonitorAdapter } from "./types.ts";
import { createMonitorUi } from "./ui.ts";

export function createPiMonitorsExtension(
	pi: ExtensionAPI,
	adapters: readonly PiMonitorAdapter[],
): PiMonitorsRuntime {
	const runtime = createPiMonitorsRuntime(pi, adapters);
	const ui = createMonitorUi(runtime);
	pi.registerCommand("monitors", {
		description: "Inspect and manage monitors attached to this conversation",
		async handler(_args, ctx) {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("Monitor management is available only in interactive TUI mode.", "warning");
				return;
			}
			await ui.open(ctx);
		},
	});
	runtime.addCleanup(() => ui.dispose());
	return runtime;
}

export default function piMonitorsExtension(pi: ExtensionAPI): void {
	createPiMonitorsExtension(pi, [createGithubPrMonitorAdapter()]);
}
