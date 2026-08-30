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

const CURRENT_CACHE_FILENAME = "current.json";
const CACHE_TEMP_PATTERN = /^\.current\.json\.[0-9a-f-]{36}\.tmp$/u;
const CACHE_QUARANTINE_PATTERN = /^current\.json\.[0-9a-f-]{36}\.quarantine$/u;
const LEGACY_CACHE_PATTERN = /^\d{16}\.json$/u;
const LEGACY_TEMP_PATTERN = /^\.\d{16}\.json\.[0-9a-f-]{36}\.tmp$/u;
const LEGACY_QUARANTINE_PATTERN = /^\d{16}\.json\.[0-9a-f-]{36}\.quarantine$/u;

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
			await this.pruneCacheFiles(directory);
			try {
				return await this.readCacheRecord(join(directory, CURRENT_CACHE_FILENAME), sessionId);
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
		await this.pruneCacheFiles(directory);
		const target = join(directory, CURRENT_CACHE_FILENAME);
		const temporary = join(directory, `.${CURRENT_CACHE_FILENAME}.${randomUUID()}.tmp`);
		try {
			const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
			try {
				await handle.writeFile(serialized, { encoding: "utf8" });
			} finally {
				await handle.close();
			}
			for (let attempt = 0; attempt < 4; attempt++) {
				const result = await this.installCurrentRecord(target, temporary, normalized);
				await this.pruneCacheFiles(directory);
				let retained: SessionSummaryCacheRecord;
				try {
					retained = await this.readCacheRecord(target, normalized.sessionId);
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

	private async readCacheRecord(path: string, sessionId: string | undefined): Promise<SessionSummaryCacheRecord> {
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
			if (sessionId !== undefined && record.sessionId !== sessionId) {
				throw new Error("Session summary cache record identity is invalid");
			}
			return record;
		} finally {
			await handle.close();
		}
	}

	private recordIdentity(record: SessionSummaryCacheRecord): string {
		return [
			record.lastTurnAtSummary,
			record.activeLeafIdAtSummary ?? "",
			String(record.revisionAtSummary).padStart(16, "0"),
			record.tailDigestAtSummary,
		].join("\0");
	}

	private retainedWriteResult(
		retained: SessionSummaryCacheRecord,
		incoming: SessionSummaryCacheRecord,
	): SessionSummaryCacheWriteResult | undefined {
		const retainedCapture = Date.parse(retained.capturedAtSummary);
		const incomingCapture = Date.parse(incoming.capturedAtSummary);
		if (retainedCapture !== incomingCapture) return retainedCapture > incomingCapture ? "superseded" : undefined;
		const retainedIdentity = this.recordIdentity(retained);
		const incomingIdentity = this.recordIdentity(incoming);
		if (retainedIdentity === incomingIdentity) return "same-turn-retained";
		return retainedIdentity > incomingIdentity ? "superseded" : undefined;
	}

	private async installCurrentRecord(
		target: string,
		temporary: string,
		incoming: SessionSummaryCacheRecord,
		depth = 0,
	): Promise<SessionSummaryCacheWriteResult> {
		if (depth >= 8) throw new Error("Session summary cache repair nested repeatedly");
		for (let attempt = 0; attempt < 8; attempt++) {
			try {
				await link(temporary, target);
				return "stored";
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
			let retained: SessionSummaryCacheRecord | undefined;
			try {
				retained = await this.readCacheRecord(target, incoming.sessionId);
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
					moved = await this.readCacheRecord(quarantine, incoming.sessionId);
				} catch {
					// An unreadable target is replaced by the valid incoming record.
				}
				const movedResult = moved ? this.retainedWriteResult(moved, incoming) : undefined;
				try {
					await link(movedResult ? quarantine : temporary, target);
					return movedResult ?? "stored";
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
					if (movedResult && moved) {
						// Preserve a moved winner against a writer that published while the target was absent.
						await this.installCurrentRecord(target, quarantine, moved, depth + 1);
						return movedResult;
					}
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
		const stale = info.mtimeMs <= Date.now() - SESSION_SUMMARY_CACHE_TEMP_STALE_MS;
		let record: SessionSummaryCacheRecord;
		try {
			record = await this.readCacheRecord(path, undefined);
			const legacyMatch = /^(\d{16})\.json\./u.exec(name);
			if (cacheDirectoryName(record.sessionId) !== basename(directory)
				|| (legacyMatch && Date.parse(record.lastTurnAtSummary) !== Number(legacyMatch[1]))) {
				throw new Error("Quarantined cache identity is invalid");
			}
		} catch {
			if (!stale) return false;
			await rm(path, { force: true });
			return true;
		}
		const target = join(directory, CURRENT_CACHE_FILENAME);
		if (!stale) {
			const recovery = join(directory, `.${CURRENT_CACHE_FILENAME}.${randomUUID()}.tmp`);
			try {
				try {
					// Keep a stable source if the active writer removes its quarantine while we reconcile it.
					await link(path, recovery);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
					for (let attempt = 0; attempt < 100; attempt++) {
						try {
							const retained = await this.readCacheRecord(target, record.sessionId);
							if (this.retainedWriteResult(retained, record)) return true;
						} catch {
							// The active writer may still be between rename and publication.
						}
						await delay(10);
					}
					return false;
				}
				await this.installCurrentRecord(target, recovery, record);
				return true;
			} finally {
				await rm(recovery, { force: true }).catch(() => {});
			}
		}
		try {
			await this.installCurrentRecord(target, path, record);
		} finally {
			await rm(path, { force: true }).catch(() => {});
		}
		return true;
	}

	private async migrateLegacyRecord(directory: string, name: string): Promise<void> {
		const path = join(directory, name);
		const quarantine = `${path}.${randomUUID()}.quarantine`;
		try {
			await rename(path, quarantine);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		try {
			let record: SessionSummaryCacheRecord;
			try {
				record = await this.readCacheRecord(quarantine, undefined);
				const filenameTimestamp = Number(name.slice(0, 16));
				if (cacheDirectoryName(record.sessionId) !== basename(directory)
					|| Date.parse(record.lastTurnAtSummary) !== filenameTimestamp) {
					throw new Error("Legacy cache identity is invalid");
				}
			} catch {
				return;
			}
			await this.installCurrentRecord(join(directory, CURRENT_CACHE_FILENAME), quarantine, record);
		} finally {
			await rm(quarantine, { force: true }).catch(() => {});
		}
	}

	private async pruneCacheFiles(directory: string, attempt = 0): Promise<void> {
		let repairInProgress = false;
		const entries = await opendir(directory);
		for await (const entry of entries) {
			if (CACHE_QUARANTINE_PATTERN.test(entry.name) || LEGACY_QUARANTINE_PATTERN.test(entry.name)) {
				repairInProgress ||= !(await this.recoverQuarantine(directory, entry.name));
				continue;
			}
			if (LEGACY_CACHE_PATTERN.test(entry.name)) {
				await this.migrateLegacyRecord(directory, entry.name);
				continue;
			}
			if (!CACHE_TEMP_PATTERN.test(entry.name) && !LEGACY_TEMP_PATTERN.test(entry.name)) continue;
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
		}
		if (repairInProgress) {
			if (attempt >= 100) throw new Error("Session summary cache repair remained in progress");
			await delay(10);
			await this.pruneCacheFiles(directory, attempt + 1);
		}
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
