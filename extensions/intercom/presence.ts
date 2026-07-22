import fs from "node:fs";
import path from "node:path";
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
