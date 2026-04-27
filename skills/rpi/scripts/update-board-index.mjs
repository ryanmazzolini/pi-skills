#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const STATUSES = "backlog -> ready -> in-progress -> review -> done\nblocked";

function usage() {
	console.error("Usage: node skills/rpi/scripts/update-board-index.mjs path/to/workflow-dir");
}

function parseFrontmatter(content, filePath) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) {
		throw new Error(`${filePath} is missing YAML frontmatter`);
	}

	const metadata = {};
	for (const line of match[1].split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const separator = trimmed.indexOf(":");
		if (separator === -1) {
			continue;
		}

		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1).trim();
		metadata[key] = stripInlineComment(value);
	}

	return metadata;
}

function stripInlineComment(value) {
	let inSingleQuote = false;
	let inDoubleQuote = false;

	for (let index = 0; index < value.length; index += 1) {
		const character = value[index];
		const previous = value[index - 1];

		if (character === "'" && !inDoubleQuote) {
			inSingleQuote = !inSingleQuote;
		}
		if (character === '"' && !inSingleQuote && previous !== "\\") {
			inDoubleQuote = !inDoubleQuote;
		}
		if (character === "#" && !inSingleQuote && !inDoubleQuote && /\s/.test(previous ?? " ")) {
			return value.slice(0, index).trim();
		}
	}

	return value.trim();
}

function extractWhy(content) {
	const whyHeader = content.match(/^## Why\s*$/m);
	if (!whyHeader || whyHeader.index === undefined) {
		return "";
	}

	const afterHeader = content.slice(whyHeader.index + whyHeader[0].length);
	const nextHeader = afterHeader.match(/^##\s+/m);
	const section = nextHeader && nextHeader.index !== undefined ? afterHeader.slice(0, nextHeader.index) : afterHeader;
	const paragraph = section
		.split(/\r?\n\s*\r?\n/)
		.map((block) => block.replace(/\s+/g, " ").trim())
		.find(Boolean);
	return paragraph ?? "";
}

function tableEscape(value) {
	return String(value ?? "")
		.replace(/\r?\n/g, " ")
		.replace(/\|/g, "\\|")
		.trim();
}

function sortCards(left, right) {
	return left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: "base" });
}

async function loadCards(cardsDir) {
	const entries = await readdir(cardsDir, { withFileTypes: true });
	const markdownFiles = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort();

	const cards = [];
	for (const fileName of markdownFiles) {
		const filePath = join(cardsDir, fileName);
		const content = await readFile(filePath, "utf8");
		const metadata = parseFrontmatter(content, filePath);
		const id = metadata.id || fileName.replace(/\.md$/, "");
		cards.push({
			id,
			status: metadata.status ?? "",
			type: metadata.type ?? "",
			priority: metadata.priority ?? "",
			blockedBy: metadata.blocked_by ?? "[]",
			title: metadata.title ?? fileName.replace(/\.md$/, ""),
			why: extractWhy(content),
		});
	}

	return cards.sort(sortCards);
}

function renderIndex(cards) {
	const rows = cards.map(
		(card) =>
			`| ${tableEscape(card.id)} | ${tableEscape(card.status)} | ${tableEscape(card.type)} | ${tableEscape(card.priority)} | ${tableEscape(card.blockedBy)} | ${tableEscape(card.title)} | ${tableEscape(card.why)} |`,
	);

	return `# Board\n\n## Statuses\n${STATUSES}\n\n## Cards\n\n| ID | Status | Type | Priority | Blocked by | Title | Why |\n|----|--------|------|----------|------------|-------|-----|\n${rows.join("\n")}\n`;
}

async function main() {
	const workflowArg = process.argv[2];
	if (!workflowArg) {
		usage();
		process.exitCode = 1;
		return;
	}

	const workflowDir = resolve(process.cwd(), workflowArg);
	const cardsDir = join(workflowDir, "board", "cards");
	const indexPath = join(workflowDir, "board", "index.md");
	const cards = await loadCards(cardsDir);
	await writeFile(indexPath, renderIndex(cards), "utf8");
	console.log(`Updated ${relative(process.cwd(), indexPath)} with ${cards.length} card(s).`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
