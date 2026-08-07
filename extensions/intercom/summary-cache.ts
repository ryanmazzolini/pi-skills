import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { link, lstat, mkdir, open, opendir, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseSessionSummaryCard, type SessionSummaryDisplayCard } from "./session-summary.ts";

export const SESSION_SUMMARY_CACHE_SCHEMA_VERSION = 1;
export const SESSION_SUMMARY_CACHE_MAX_BYTES = 32 * 1024;
const SESSION_SUMMARY_CACHE_TEMP_STALE_MS = 5 * 60 * 1_000;

export interface SessionSummaryCacheRecord {
	schemaVersion: typeof SESSION_SUMMARY_CACHE_SCHEMA_VERSION;
	sessionId: string;
	createdAt: string;
	lastTurnAtSummary: string;
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
		lastTurnAtSummary: canonicalTimestamp(value.lastTurnAtSummary, "lastTurnAtSummary"),
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
			let handle;
			try {
				handle = await open(join(directory, latest.name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw error;
			}
			try {
				const info = await handle.stat();
				const uid = process.getuid?.();
				if (!info.isFile() || (uid !== undefined && info.uid !== uid) || (info.mode & 0o077) !== 0) {
					throw new Error("Session summary cache record is not a private current-user regular file");
				}
				if (info.size < 1 || info.size > SESSION_SUMMARY_CACHE_MAX_BYTES) throw new Error("Session summary cache record is empty or oversized");
				const raw = await handle.readFile({ encoding: "utf8" });
				const record = parseSessionSummaryCacheRecord(JSON.parse(raw) as unknown);
				return record.sessionId === sessionId && Date.parse(record.lastTurnAtSummary) === latest.timestamp
					? record
					: undefined;
			} finally {
				await handle.close();
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
		let created = false;
		try {
			const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
			try {
				await handle.writeFile(serialized, { encoding: "utf8" });
			} finally {
				await handle.close();
			}
			try {
				await link(temporary, target);
				created = true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			}
		} finally {
			await rm(temporary, { force: true }).catch(() => {});
		}
		const newest = await this.pruneCacheFiles(directory);
		if (newest?.name !== filename) return "superseded";
		if (created) return "stored";
		const retained = await this.read(normalized.sessionId);
		if (!retained) throw new Error("Same-turn session summary cache record is unavailable");
		return Date.parse(retained.lastTurnAtSummary) > Date.parse(normalized.lastTurnAtSummary)
			? "superseded"
			: "same-turn-retained";
	}

	private async pruneCacheFiles(directory: string): Promise<{ name: string; timestamp: number } | undefined> {
		let newest: { name: string; timestamp: number } | undefined;
		const entries = await opendir(directory);
		for await (const entry of entries) {
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
