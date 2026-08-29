import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { link, lstat, mkdir, open, opendir, rename, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseSessionSummaryCard, type SessionSummaryDisplayCard } from "./session-summary.ts";

export const SESSION_SUMMARY_CACHE_SCHEMA_VERSION = 1;
export const SESSION_SUMMARY_CACHE_MAX_BYTES = 32 * 1024;
const SESSION_SUMMARY_CACHE_TEMP_STALE_MS = 5 * 60 * 1_000;

export interface SessionSummaryCacheRecord {
	schemaVersion: typeof SESSION_SUMMARY_CACHE_SCHEMA_VERSION;
	sessionId: string;
	createdAt: string;
	capturedAtSummary: string;
	lastTurnAtSummary: string;
	activeLeafIdAtSummary: string | null;
	revisionAtSummary: number;
	tailDigestAtSummary: string;
	card: SessionSummaryDisplayCard;
}

export type SessionSummaryCacheWriteResult = "stored" | "superseded" | "same-turn-retained";

export interface SessionSummaryCache {
	read(sessionId: string): Promise<SessionSummaryCacheRecord | undefined>;
	write(record: SessionSummaryCacheRecord): Promise<SessionSummaryCacheWriteResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalTimestamp(value: unknown, name: string): string {
	if (typeof value !== "string") throw new Error(`${name} must be a timestamp`);
	const timestamp = Date.parse(value);
	if (!Number.isSafeInteger(timestamp) || new Date(timestamp).toISOString() !== value) {
		throw new Error(`${name} must be a canonical ISO timestamp`);
	}
	return value;
}

function boundedString(value: unknown, name: string, maximumBytes: number): string {
	if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > maximumBytes) {
		throw new Error(`${name} is invalid`);
	}
	return value;
}

function activeLeafId(value: unknown): string | null {
	return value === null ? null : boundedString(value, "activeLeafIdAtSummary", 256);
}

function positiveSafeInteger(value: unknown, name: string): number {
	if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`${name} is invalid`);
	return value as number;
}

function sha256Digest(value: unknown, name: string): string {
	const digest = boundedString(value, name, 64);
	if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error(`${name} is invalid`);
	return digest;
}

export function parseSessionSummaryCacheRecord(value: unknown): SessionSummaryCacheRecord {
	if (!isRecord(value) || value.schemaVersion !== SESSION_SUMMARY_CACHE_SCHEMA_VERSION) {
		throw new Error("Session summary cache record has an unsupported schema");
	}
	if (!isRecord(value.card) || "evidenceIds" in value.card) throw new Error("Session summary cache card is invalid");
	const parsedCard = parseSessionSummaryCard({ ...value.card, evidenceIds: ["CACHED"] }, ["CACHED"]);
	const { evidenceIds: _evidenceIds, ...card } = parsedCard;
	return {
		schemaVersion: SESSION_SUMMARY_CACHE_SCHEMA_VERSION,
		sessionId: boundedString(value.sessionId, "sessionId", 1_024),
		createdAt: canonicalTimestamp(value.createdAt, "createdAt"),
		capturedAtSummary: canonicalTimestamp(value.capturedAtSummary, "capturedAtSummary"),
		lastTurnAtSummary: canonicalTimestamp(value.lastTurnAtSummary, "lastTurnAtSummary"),
		activeLeafIdAtSummary: activeLeafId(value.activeLeafIdAtSummary),
		revisionAtSummary: positiveSafeInteger(value.revisionAtSummary, "revisionAtSummary"),
		tailDigestAtSummary: sha256Digest(value.tailDigestAtSummary, "tailDigestAtSummary"),
		card,
	};
}

function cacheDirectoryName(sessionId: string): string {
	return createHash("sha256").update(sessionId).digest("hex");
}

function cacheFilename(lastTurnAtSummary: string): string {
	const timestamp = Date.parse(lastTurnAtSummary);
	if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error("Session summary cache turn timestamp is invalid");
	return `${String(timestamp).padStart(16, "0")}.json`;
}

export class FileSessionSummaryCache implements SessionSummaryCache {
	private readonly rootDir: string;

	constructor(rootDir: string) {
		this.rootDir = rootDir;
	}

	async read(sessionId: string): Promise<SessionSummaryCacheRecord | undefined> {
		if (!(await this.validateExistingDirectory(this.rootDir, "root"))) return undefined;
		const directory = join(this.rootDir, cacheDirectoryName(sessionId));
		if (!(await this.validateExistingDirectory(directory, "session"))) return undefined;
		for (let attempt = 0; attempt < 2; attempt++) {
			const latest = await this.pruneCacheFiles(directory);
			if (!latest) return undefined;
			try {
				return await this.readCacheRecord(join(directory, latest.name), sessionId, latest.timestamp);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw error;
			}
		}
		return undefined;
	}

	async write(record: SessionSummaryCacheRecord): Promise<SessionSummaryCacheWriteResult> {
		const normalized = parseSessionSummaryCacheRecord(record);
		const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
		if (Buffer.byteLength(serialized, "utf8") > SESSION_SUMMARY_CACHE_MAX_BYTES) {
			throw new Error("Session summary cache record is oversized");
		}
		const directory = await this.ensureSessionDirectory(normalized.sessionId);
		const incomingTimestamp = Date.parse(normalized.lastTurnAtSummary);
		const existingNewest = await this.pruneCacheFiles(directory);
		if (existingNewest && existingNewest.timestamp > incomingTimestamp) return "superseded";
		const filename = cacheFilename(normalized.lastTurnAtSummary);
		const target = join(directory, filename);
		const temporary = join(directory, `.${filename}.${randomUUID()}.tmp`);
		try {
			const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
			try {
				await handle.writeFile(serialized, { encoding: "utf8" });
			} finally {
				await handle.close();
			}
			for (let attempt = 0; attempt < 4; attempt++) {
				const result = await this.installSameTurnRecord(target, temporary, normalized, incomingTimestamp);
				const newest = await this.pruneCacheFiles(directory);
				if (newest?.name !== filename) return "superseded";
				let retained: SessionSummaryCacheRecord;
				try {
					retained = await this.readCacheRecord(target, normalized.sessionId, incomingTimestamp);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
					throw error;
				}
				if (JSON.stringify(retained) === JSON.stringify(normalized)) return result;
				const retainedResult = this.retainedWriteResult(retained, normalized);
				if (retainedResult) return retainedResult;
			}
			throw new Error("Session summary cache target changed repeatedly after repair");
		} finally {
			await rm(temporary, { force: true }).catch(() => {});
		}
	}

	private async readCacheRecord(path: string, sessionId: string | undefined, timestamp: number): Promise<SessionSummaryCacheRecord> {
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			const info = await handle.stat();
			const uid = process.getuid?.();
			if (!info.isFile() || (uid !== undefined && info.uid !== uid) || (info.mode & 0o077) !== 0) {
				throw new Error("Session summary cache record is not a private current-user regular file");
			}
			if (info.size < 1 || info.size > SESSION_SUMMARY_CACHE_MAX_BYTES) {
				throw new Error("Session summary cache record is empty or oversized");
			}
			const raw = await handle.readFile({ encoding: "utf8" });
			const record = parseSessionSummaryCacheRecord(JSON.parse(raw) as unknown);
			if ((sessionId !== undefined && record.sessionId !== sessionId) || Date.parse(record.lastTurnAtSummary) !== timestamp) {
				throw new Error("Session summary cache record identity is invalid");
			}
			return record;
		} finally {
			await handle.close();
		}
	}

	private retainedWriteResult(
		retained: SessionSummaryCacheRecord,
		incoming: SessionSummaryCacheRecord,
	): SessionSummaryCacheWriteResult | undefined {
		const sameBranch = retained.activeLeafIdAtSummary === incoming.activeLeafIdAtSummary
			&& retained.revisionAtSummary === incoming.revisionAtSummary;
		if (sameBranch) return "same-turn-retained";
		return Date.parse(retained.capturedAtSummary) >= Date.parse(incoming.capturedAtSummary)
			? "superseded"
			: undefined;
	}

	private async installSameTurnRecord(
		target: string,
		temporary: string,
		incoming: SessionSummaryCacheRecord,
		timestamp: number,
	): Promise<SessionSummaryCacheWriteResult> {
		for (let attempt = 0; attempt < 8; attempt++) {
			try {
				await link(temporary, target);
				return "stored";
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
			let retained: SessionSummaryCacheRecord | undefined;
			try {
				retained = await this.readCacheRecord(target, incoming.sessionId, timestamp);
			} catch {
				// Move and validate the exact target below; another writer may repair it first.
			}
			if (retained) {
				const result = this.retainedWriteResult(retained, incoming);
				if (result) return result;
			}
			const quarantine = `${target}.${randomUUID()}.quarantine`;
			try {
				await rename(target, quarantine);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw error;
			}
			try {
				let moved: SessionSummaryCacheRecord | undefined;
				try {
					moved = await this.readCacheRecord(quarantine, incoming.sessionId, timestamp);
				} catch {
					// An unreadable target is replaced by the valid incoming record.
				}
				const movedResult = moved ? this.retainedWriteResult(moved, incoming) : undefined;
				try {
					await link(movedResult ? quarantine : temporary, target);
					return movedResult ?? "stored";
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				}
			} finally {
				await rm(quarantine, { force: true }).catch(() => {});
			}
		}
		throw new Error("Session summary cache target changed repeatedly during repair");
	}

	private async recoverQuarantine(directory: string, name: string): Promise<boolean> {
		const path = join(directory, name);
		let info: Stats;
		try {
			info = await lstat(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
			throw error;
		}
		const uid = process.getuid?.();
		if (!info.isFile() || (uid !== undefined && info.uid !== uid) || (info.mode & 0o077) !== 0) {
			throw new Error("Session summary cache quarantine is unsafe");
		}
		if (info.mtimeMs > Date.now() - SESSION_SUMMARY_CACHE_TEMP_STALE_MS) return false;
		const filename = name.slice(0, 16 + ".json".length);
		const timestamp = Number(filename.slice(0, 16));
		let record: SessionSummaryCacheRecord;
		try {
			record = await this.readCacheRecord(path, undefined, timestamp);
			if (cacheDirectoryName(record.sessionId) !== basename(directory)) throw new Error("Quarantined cache identity is invalid");
		} catch {
			await rm(path, { force: true });
			return true;
		}
		try {
			await this.installSameTurnRecord(join(directory, filename), path, record, timestamp);
		} finally {
			await rm(path, { force: true }).catch(() => {});
		}
		return true;
	}

	private async pruneCacheFiles(directory: string, attempt = 0): Promise<{ name: string; timestamp: number } | undefined> {
		let newest: { name: string; timestamp: number } | undefined;
		let repairInProgress = false;
		const entries = await opendir(directory);
		for await (const entry of entries) {
			if (/^\d{16}\.json\.[0-9a-f-]{36}\.quarantine$/u.test(entry.name)) {
				repairInProgress ||= !(await this.recoverQuarantine(directory, entry.name));
				continue;
			}
			if (/^\.\d{16}\.json\.[0-9a-f-]{36}\.tmp$/u.test(entry.name)) {
				const path = join(directory, entry.name);
				try {
					const info = await lstat(path);
					const uid = process.getuid?.();
					if (info.isFile()
						&& (uid === undefined || info.uid === uid)
						&& (info.mode & 0o077) === 0
						&& info.mtimeMs <= Date.now() - SESSION_SUMMARY_CACHE_TEMP_STALE_MS) {
						await rm(path, { force: true });
					}
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				}
				continue;
			}
			if (!/^\d{16}\.json$/u.test(entry.name)) continue;
			const timestamp = Number(entry.name.slice(0, -".json".length));
			if (!Number.isSafeInteger(timestamp)) continue;
			const candidate = { name: entry.name, timestamp };
			if (!newest || candidate.timestamp > newest.timestamp) {
				if (newest) await rm(join(directory, newest.name), { force: true });
				newest = candidate;
			} else {
				await rm(join(directory, candidate.name), { force: true });
			}
		}
		if (repairInProgress) {
			if (attempt >= 100) throw new Error("Session summary cache repair remained in progress");
			await delay(10);
			return this.pruneCacheFiles(directory, attempt + 1);
		}
		return newest;
	}

	private validateDirectoryInfo(info: Stats, label: "root" | "session"): void {
		const uid = process.getuid?.();
		if (!info.isDirectory() || info.isSymbolicLink() || (uid !== undefined && info.uid !== uid) || (info.mode & 0o077) !== 0) {
			throw new Error(`Session summary cache ${label} is not a private current-user real directory`);
		}
	}

	private async validateExistingDirectory(path: string, label: "root" | "session"): Promise<boolean> {
		try {
			this.validateDirectoryInfo(await lstat(path), label);
			return true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw error;
		}
	}

	private async ensureRoot(): Promise<void> {
		await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
		this.validateDirectoryInfo(await lstat(this.rootDir), "root");
	}

	private async ensureSessionDirectory(sessionId: string): Promise<string> {
		await this.ensureRoot();
		const directory = join(this.rootDir, cacheDirectoryName(sessionId));
		try {
			await mkdir(directory, { mode: 0o700 });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
		this.validateDirectoryInfo(await lstat(directory), "session");
		return directory;
	}
}
