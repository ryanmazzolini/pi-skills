import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nextCronOccurrence, previousCronOccurrence } from "./schedule.mjs";

function localDate(year, month, day, hour, minute) {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function localParts(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getDay()];
}

test("finds the next and previous host-local cron occurrence", () => {
  const next = nextCronOccurrence("30 17 * * 1-5", { after: localDate(2026, 7, 25, 9, 12) });
  assert.deepEqual(localParts(next), [2026, 7, 27, 17, 30, 1]);

  const previous = previousCronOccurrence("30 17 * * 1-5", { atOrBefore: localDate(2026, 7, 27, 23, 0) });
  assert.deepEqual(localParts(previous), [2026, 7, 27, 17, 30, 1]);
});

test("supports lists, ranges, steps, Sunday 7, and cron day-of-month/day-of-week OR", () => {
  const stepped = nextCronOccurrence("*/15 8-9 * * 1,3,5", { after: localDate(2026, 7, 27, 8, 1) });
  assert.deepEqual(localParts(stepped), [2026, 7, 27, 8, 15, 1]);

  const sunday = nextCronOccurrence("0 9 * * 7", { after: localDate(2026, 7, 25, 10, 0) });
  assert.deepEqual(localParts(sunday), [2026, 7, 26, 9, 0, 0]);

  const eitherDay = nextCronOccurrence("0 9 1 * 1", { after: localDate(2026, 9, 2, 10, 0) });
  assert.deepEqual(localParts(eitherDay), [2026, 9, 7, 9, 0, 1]);
});

test("returns undefined when no occurrence exists inside the search bound", () => {
  const result = nextCronOccurrence("0 9 31 2 *", {
    after: localDate(2026, 1, 1, 0, 0),
    maxMinutes: 366 * 24 * 60,
  });
  assert.equal(result, undefined);
});

test("searches epoch minutes across skipped and repeated daylight-saving times", () => {
  const moduleUrl = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "schedule.mjs")).href;
  const script = `
    import { nextCronOccurrence } from ${JSON.stringify(moduleUrl)};
    const spring = nextCronOccurrence("30 2 * * *", { after: new Date("2026-03-08T01:59:00-05:00") });
    const fall = nextCronOccurrence("30 1 * * *", { after: new Date("2026-11-01T05:45:00Z") });
    process.stdout.write(JSON.stringify([spring.toISOString(), fall.toISOString()]));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    encoding: "utf8",
    env: { ...process.env, TZ: "America/New_York" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ["2026-03-09T06:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
});
