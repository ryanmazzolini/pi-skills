import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATUS_ID = "session-id";

export default function registerSessionId(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionId();
		ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("dim", `[${sessionId}]`));
	});
}
