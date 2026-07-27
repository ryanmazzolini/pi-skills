import fs from "node:fs";
import path from "node:path";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { isPiSessionPresence, type PiSessionPresence } from "./client.ts";

interface SessionPresenceSource {
	getSessionId(): string;
	getSessionFile(): string | undefined;
	getLeafId(): string | null;
}

interface PresenceIdentity {
	presence: Omit<PiSessionPresence, "revision">;
	key: string;
}

export interface PresenceRefresh {
	changed: boolean;
	presence?: PiSessionPresence;
}

function hasTextContent(content: unknown): boolean {
	if (typeof content === "string") return content.length > 0;
	return Array.isArray(content) && content.some((block) =>
		typeof block === "object"
		&& block !== null
		&& "type" in block
		&& block.type === "text"
		&& "text" in block
		&& typeof block.text === "string"
		&& block.text.length > 0);
}

/** Latest canonical timestamp among the newest text events used by triage tails. */
export function lastConversationalTimestamp(source: { getBranch(): SessionEntry[] }): number | null {
	const branch = source.getBranch();
	let eligible = 0;
	let latest: number | null = null;
	const unresolvedToolResults = new Set<string>();
	for (let index = branch.length - 1; index >= 0; index--) {
		const entry = branch[index]!;
		if (entry.type !== "message") continue;
		const message = entry.message;
		if (message.role === "toolResult" && eligible < 8) {
			unresolvedToolResults.add(message.toolCallId);
		} else if (message.role === "assistant" && unresolvedToolResults.size > 0) {
			for (const block of message.content) {
				if (block.type === "toolCall") unresolvedToolResults.delete(block.id);
			}
		}
		const conversational = message.role === "user"
			? hasTextContent(message.content)
			: message.role === "assistant"
				&& message.stopReason !== "error"
				&& message.stopReason !== "aborted"
				&& hasTextContent(message.content);
		if (conversational) {
			eligible++;
			const timestamp = Date.parse(entry.timestamp);
			if (!Number.isSafeInteger(timestamp) || new Date(timestamp).toISOString() !== entry.timestamp) return null;
			latest = latest === null ? timestamp : Math.max(latest, timestamp);
		}
		if (eligible >= 8 && unresolvedToolResults.size === 0) break;
	}
	return latest;
}

function currentIdentity(source: SessionPresenceSource): PresenceIdentity | undefined {
	const sessionFile = source.getSessionFile();
	if (!sessionFile || !path.isAbsolute(sessionFile)) return undefined;
	try {
		const pathStat = fs.lstatSync(sessionFile, { bigint: true });
		if (!pathStat.isFile() || pathStat.isSymbolicLink()) return undefined;
		const uid = process.getuid?.();
		if (uid !== undefined && pathStat.uid !== BigInt(uid)) return undefined;
		fs.accessSync(sessionFile, fs.constants.R_OK);
		const fileLocator = fs.realpathSync(sessionFile);
		const canonicalStat = fs.statSync(fileLocator, { bigint: true });
		if (!canonicalStat.isFile() || canonicalStat.dev !== pathStat.dev || canonicalStat.ino !== pathStat.ino) return undefined;
		const presence = {
			sessionId: source.getSessionId(),
			fileLocator,
			activeLeafId: source.getLeafId(),
		};
		const key = [
			presence.sessionId,
			presence.fileLocator,
			presence.activeLeafId ?? "<root>",
			canonicalStat.dev,
			canonicalStat.ino,
			canonicalStat.size,
			canonicalStat.mtimeNs,
			canonicalStat.ctimeNs,
		].join("\0");
		return { presence, key };
	} catch {
		return undefined;
	}
}

export class PiSessionPresenceTracker {
	private revision = 0;
	private key: string | undefined;
	private advertised: PiSessionPresence | undefined;

	refresh(source: SessionPresenceSource): PresenceRefresh {
		const identity = currentIdentity(source);
		if (!identity) {
			const changed = this.advertised !== undefined;
			this.key = undefined;
			this.advertised = undefined;
			return { changed };
		}
		if (identity.key === this.key && this.advertised) {
			return { changed: false, presence: { ...this.advertised } };
		}
		const next = { ...identity.presence, revision: this.revision + 1 };
		if (!isPiSessionPresence(next)) {
			const changed = this.advertised !== undefined;
			this.key = undefined;
			this.advertised = undefined;
			return { changed };
		}
		this.revision = next.revision;
		this.key = identity.key;
		this.advertised = next;
		return { changed: true, presence: { ...this.advertised } };
	}

	current(): PiSessionPresence | undefined {
		return this.advertised ? { ...this.advertised } : undefined;
	}
}
