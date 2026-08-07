import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseSessionSummaryCard, type SessionSummaryDisplayCard } from "./session-summary.ts";

export const SESSION_SUMMARY_CACHE_SCHEMA_VERSION = 1;
export const SESSION_SUMMARY_CACHE_MAX_BYTES = 32 * 1024;

export interface SessionSummaryCacheRecord {
	schemaVersion: typeof SESSION_SUMMARY_CACHE_SCHEMA_VERSION;
	sessionId: string;
	createdAt: string;
	lastTurnAtSummary: string;
	card: SessionSummaryDisplayCard;
}

export interface SessionSummaryCache {
	read(sessionId: string): Promise<SessionSummaryCacheRecord | undefined>;
	write(record: SessionSummaryCacheRecord): Promise<void>;
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

function cacheFilename(sessionId: string): string {
	return `${createHash("sha256").update(sessionId).digest("hex")}.json`;
}

export class FileSessionSummaryCache implements SessionSummaryCache {
	private readonly rootDir: string;

	constructor(rootDir: string) {
		this.rootDir = rootDir;
	}

	async read(sessionId: string): Promise<SessionSummaryCacheRecord | undefined> {
		const path = join(this.rootDir, cacheFilename(sessionId));
		let handle;
		try {
			handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
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
			return record.sessionId === sessionId ? record : undefined;
		} finally {
			await handle.close();
		}
	}

	async write(record: SessionSummaryCacheRecord): Promise<void> {
		const normalized = parseSessionSummaryCacheRecord(record);
		const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
		if (Buffer.byteLength(serialized, "utf8") > SESSION_SUMMARY_CACHE_MAX_BYTES) {
			throw new Error("Session summary cache record is oversized");
		}
		await this.ensureRoot();
		const target = join(this.rootDir, cacheFilename(normalized.sessionId));
		const temporary = join(this.rootDir, `.${cacheFilename(normalized.sessionId)}.${randomUUID()}.tmp`);
		try {
			const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
			try {
				await handle.writeFile(serialized, { encoding: "utf8" });
			} finally {
				await handle.close();
			}
			await rename(temporary, target);
		} finally {
			await rm(temporary, { force: true }).catch(() => {});
		}
	}

	private async ensureRoot(): Promise<void> {
		await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
		const info = await lstat(this.rootDir);
		const uid = process.getuid?.();
		if (!info.isDirectory() || info.isSymbolicLink() || (uid !== undefined && info.uid !== uid) || (info.mode & 0o077) !== 0) {
			throw new Error("Session summary cache directory is not a private current-user real directory");
		}
	}
}
