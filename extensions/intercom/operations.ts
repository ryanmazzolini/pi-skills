import { randomUUID } from "node:crypto";

export type IntercomOperationKind = "send" | "ask" | "reply";
export type IntercomOperationState = "queued" | "routing" | "waiting_reply" | "completed" | "failed" | "timed_out" | "cancelled" | "interrupted";

export interface IntercomOperationSnapshot {
	operationId: string;
	sequence: number;
	kind: IntercomOperationKind;
	state: IntercomOperationState;
	acceptedAt: number;
	finishedAt?: number;
	target?: string;
	reason?: string;
	deliveryUncertain?: boolean;
	remoteMayProcess?: boolean;
}

export interface OperationResult {
	target?: string;
	reply?: boolean;
	/** Ephemeral model-visible completion text; never copied into a snapshot. */
	completionText?: string;
}

export const INTERCOM_OPERATION_LIMITS = Object.freeze({
	maxActive: 64,
	maxRetained: 128,
	sendReplyDeadlineMs: 30_000,
	askDeadlineMs: 10 * 60 * 1000,
	maxTargetBytes: 256,
	maxReasonBytes: 512,
});

interface Operation {
	snapshot: IntercomOperationSnapshot;
	controller: AbortController;
	timer: NodeJS.Timeout;
	deliveryRejected: boolean;
}

/** Bounded, session-scoped operation registry. Payloads deliberately never enter this object. */
export class IntercomOperations {
	private readonly active = new Map<string, Operation>();
	private readonly retained: IntercomOperationSnapshot[] = [];
	private sequence = 0;
	private disposed = false;
	private readonly onTerminal: (snapshot: IntercomOperationSnapshot, result?: OperationResult) => void;
	private readonly limits: typeof INTERCOM_OPERATION_LIMITS;

	constructor(
		onTerminal: (snapshot: IntercomOperationSnapshot, result?: OperationResult) => void,
		limits = INTERCOM_OPERATION_LIMITS,
	) {
		this.onTerminal = onTerminal;
		this.limits = limits;
	}

	start(kind: IntercomOperationKind, target: string | undefined, run: (signal: AbortSignal, update: (state: "routing" | "waiting_reply" | "delivery_rejected") => void) => Promise<OperationResult>): IntercomOperationSnapshot {
		if (this.disposed) throw new Error("Intercom operations are unavailable");
		if (this.active.size >= this.limits.maxActive) throw new Error("Too many active intercom operations");
		const snapshot: IntercomOperationSnapshot = {
			operationId: randomUUID(),
			sequence: ++this.sequence,
			kind,
			state: "queued",
			acceptedAt: Date.now(),
			...(target ? { target: this.compact(target, this.limits.maxTargetBytes) } : {}),
		};
		const controller = new AbortController();
		const operation = { snapshot, controller, timer: undefined as unknown as NodeJS.Timeout, deliveryRejected: false };
		const deadlineMs = kind === "ask" ? this.limits.askDeadlineMs : this.limits.sendReplyDeadlineMs;
		operation.timer = setTimeout(() => {
			controller.abort();
			this.finish(operation, "timed_out", {
				reason: `Operation deadline exceeded after ${deadlineMs}ms`,
				deliveryUncertain: snapshot.state === "routing",
				remoteMayProcess: snapshot.state === "routing" || snapshot.state === "waiting_reply",
			});
		}, deadlineMs);
		this.active.set(snapshot.operationId, operation);
		const receipt = { ...snapshot };
		void (async () => {
			try {
				const result = await run(controller.signal, (state) => {
					if (this.active.get(snapshot.operationId) !== operation) return;
					if (state === "routing" && snapshot.state === "queued") snapshot.state = state;
					if (state === "waiting_reply" && snapshot.state === "routing") snapshot.state = state;
					if (state === "delivery_rejected" && snapshot.state === "routing") operation.deliveryRejected = true;
				});
				this.finish(operation, "completed", {}, result);
			} catch (error) {
				if (this.active.get(snapshot.operationId) !== operation) return;
				const cancelled = controller.signal.aborted;
				this.finish(operation, cancelled ? "cancelled" : "failed", {
					reason: this.reason(error),
					deliveryUncertain: !cancelled && snapshot.state === "routing" && !operation.deliveryRejected,
					remoteMayProcess: cancelled && (snapshot.state === "routing" || snapshot.state === "waiting_reply"),
				});
			}
		})();
		return receipt;
	}

	list(operationId?: string): IntercomOperationSnapshot[] {
		const snapshots = [...this.active.values()].map((entry) => entry.snapshot).concat(this.retained);
		return snapshots.filter((entry) => !operationId || entry.operationId === operationId).map((entry) => ({ ...entry }));
	}

	cancel(operationId: string): IntercomOperationSnapshot {
		const operation = this.active.get(operationId);
		if (!operation) {
			const retained = this.retained.find((entry) => entry.operationId === operationId);
			if (retained) return { ...retained };
			throw new Error(`Unknown intercom operation: ${operationId}`);
		}
		operation.controller.abort();
		this.finish(operation, "cancelled", { reason: "Cancelled", remoteMayProcess: operation.snapshot.state !== "queued" });
		return { ...operation.snapshot };
	}

	dispose(): void {
		this.disposed = true;
		for (const operation of [...this.active.values()]) {
			operation.controller.abort();
			this.finish(operation, "interrupted", { reason: "Session ended", remoteMayProcess: operation.snapshot.state !== "queued" });
		}
	}

	private reason(error: unknown): string {
		return this.compact(error instanceof Error ? error.message : String(error), this.limits.maxReasonBytes);
	}

	private compact(value: string, maximumBytes: number): string {
		const clean = value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim();
		const truncateTo = (limit: number): { text: string; truncated: boolean } => {
			let text = "";
			let bytes = 0;
			for (const character of clean) {
				const characterBytes = Buffer.byteLength(character, "utf8");
				if (bytes + characterBytes > limit) return { text, truncated: true };
				text += character;
				bytes += characterBytes;
			}
			return { text, truncated: false };
		};
		const bounded = truncateTo(maximumBytes);
		if (!bounded.truncated) return bounded.text;
		const preferredMarker = " [truncated]";
		const marker = Buffer.byteLength(preferredMarker, "utf8") <= maximumBytes ? preferredMarker : "…";
		const markerBytes = Buffer.byteLength(marker, "utf8");
		if (markerBytes > maximumBytes) return "";
		return `${truncateTo(maximumBytes - markerBytes).text.trimEnd()}${marker}`;
	}

	private finish(operation: Operation, state: Extract<IntercomOperationState, "completed" | "failed" | "timed_out" | "cancelled" | "interrupted">, patch: Partial<IntercomOperationSnapshot>, result?: OperationResult): void {
		if (this.active.get(operation.snapshot.operationId) !== operation) return;
		clearTimeout(operation.timer);
		this.active.delete(operation.snapshot.operationId);
		Object.assign(operation.snapshot, patch, { state, finishedAt: Date.now() });
		this.retained.unshift({ ...operation.snapshot });
		this.retained.length = Math.min(this.retained.length, this.limits.maxRetained);
		this.onTerminal({ ...operation.snapshot }, result);
	}
}
