import { DEFAULT_RESULT_LIMIT_BYTES, type DelegationRun, type DeliveryOutcome, type ParentDelivery, type RunView } from "./runtime.ts";

export interface CurrentParentState {
	sessionId: string;
	inputGeneration: number;
	branchIds: string[];
}

export interface DeliveryMetadata {
	kind: "result" | "attention";
	eventId: string;
	childId?: string;
}

export interface ParentDeliveryOptions {
	current(): CurrentParentState | undefined;
	alreadyDelivered?(eventId: string): boolean;
	send(content: string, details: RunView, metadata: DeliveryMetadata): void;
	onHeld?(run: DelegationRun, reason: "user_intervened" | "session_changed", metadata: DeliveryMetadata): void;
}

function resultValue(result: NonNullable<RunView["children"][number]["result"]>): string {
	return result.kind === "text" ? result.value : JSON.stringify(result.value, null, 2);
}

function boundContent(content: string, maxBytes = DEFAULT_RESULT_LIMIT_BYTES): string {
	if (Buffer.byteLength(content, "utf8") <= maxBytes) return content;
	const marker = "\n\n[Delivery truncated. Full run remains persisted.]";
	let end = Math.min(content.length, maxBytes - Buffer.byteLength(marker, "utf8"));
	while (end > 0 && Buffer.byteLength(content.slice(0, end), "utf8") > maxBytes - Buffer.byteLength(marker, "utf8")) end--;
	return `${content.slice(0, end)}${marker}`;
}

function formatRun(view: RunView): string {
	const lines = [`Agents ${view.status}: ${view.runId}`, `Full run: ${view.recordRef}`];
	if (view.truncated) lines.push("The model-visible result was truncated; the complete result remains in the run record.");
	for (const child of view.children) {
		lines.push("", `### ${child.label} — ${child.state}`);
		if (child.workspace?.state === "working") {
			lines.push(`Temporary workspace preserved. Review it with delegate_control action=review, runId=${view.runId}, childId=${child.childId}.`);
		} else if (child.workspace) {
			lines.push(`Temporary workspace: ${child.workspace.state}${child.workspace.revision ? ` (${child.workspace.revision})` : ""}.`);
			if (child.workspace.message) lines.push(`Workspace note: ${child.workspace.message}`);
			if (child.workspace.cleanupError) lines.push(`Cleanup failed: ${child.workspace.cleanupError}. Retry with delegate_control action=cleanup.`);
		}
		if (child.workspace?.patchRef) lines.push(`Patch: ${child.workspace.patchRef}`);
		if (child.workspace?.manifestRef) lines.push(`Manifest: ${child.workspace.manifestRef}`);
		if (child.result) lines.push(resultValue(child.result));
		else if (child.error) lines.push(`Error: ${child.error.message}`);
		else if (child.attention) lines.push(`Needs attention: ${child.attention.question}`);
		else lines.push(child.lastActivity.summary);
	}
	if (view.omittedChildren) lines.push("", `${view.omittedChildren} agent snapshots were omitted from this bounded delivery.`);
	return boundContent(lines.join("\n"));
}

function formatAttention(view: RunView, childId: string): string {
	const child = view.children.find((candidate) => candidate.childId === childId);
	if (!child?.attention) return `Agent run ${view.runId} needs attention. Full run: ${view.recordRef}`;
	return boundContent([
		`Agent ${child.label} needs ${child.attention.kind}:`,
		child.attention.question,
		...(child.attention.context ? ["", `Context: ${child.attention.context}`] : []),
		"",
		`Run: ${view.runId}`,
		`Child: ${child.childId}`,
		`Full run: ${view.recordRef}`,
	].join("\n"));
}

export function createParentDelivery(options: ParentDeliveryOptions): ParentDelivery {
	let stopped = false;
	const deliver = async (
		run: DelegationRun,
		view: RunView,
		metadata: DeliveryMetadata,
		content: string,
	): Promise<DeliveryOutcome> => {
		if (stopped) return "held:session_changed";
		const current = options.current();
		if (!current || current.sessionId !== run.parent.sessionId) {
			options.onHeld?.(run, "session_changed", metadata);
			return "held:session_changed";
		}
		if (options.alreadyDelivered?.(metadata.eventId)) return "delivered";
		if (run.parent.leafId !== null && !current.branchIds.includes(run.parent.leafId)) {
			options.onHeld?.(run, "user_intervened", metadata);
			return "held:user_intervened";
		}
		if (current.inputGeneration !== run.parent.inputGeneration) {
			options.onHeld?.(run, "user_intervened", metadata);
			return "held:user_intervened";
		}
		options.send(content, view, metadata);
		return "delivered";
	};
	return {
		deliver(run, view) {
			return deliver(run, view, { kind: "result", eventId: `${run.id}:result` }, formatRun(view));
		},
		deliverAttention(run, view, childId) {
			const child = run.children.find((candidate) => candidate.id === childId);
			const eventId = child?.attention?.id ?? `${run.id}:${childId}:attention`;
			return deliver(run, view, { kind: "attention", eventId, childId }, formatAttention(view, childId));
		},
		shutdown() {
			stopped = true;
		},
	};
}
