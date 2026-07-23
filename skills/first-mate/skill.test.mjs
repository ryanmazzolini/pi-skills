import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skill = readFileSync(fileURLToPath(new URL("./SKILL.md", import.meta.url)), "utf8");
const startup = skill.match(/## Start or recover\n([\s\S]*?)\n## Validate request evidence/)?.[1] ?? "";

test("First Mate startup is argument-free and discovers every readable profile through the absolute helper", () => {
  assert.doesNotMatch(skill, /^argument-hint:/m);
  assert.match(startup, /argument-free invocation `\/skill:first-mate`/);
  assert.match(startup, /workflow-profile\.mjs" profiles/);
  assert.doesNotMatch(startup, /profile --profile|<profile>|selected profile/);
  assert.match(startup, /sorted canonical profiles/);
  assert.match(startup, /unavailable profile names as explicit limitations/);
});

test("First Mate publishes its capability-gated role and takes one passive full-ID peer snapshot", () => {
  assert.equal((startup.match(/`intercom` `status`/g) ?? []).length, 1);
  assert.equal((startup.match(/`intercom` `role`/g) ?? []).length, 1);
  assert.equal((startup.match(/`intercom` `list`/g) ?? []).length, 1);
  assert.match(startup, /waits for the initial connection attempt/);
  assert.match(startup, /current session ID to equal the role-acknowledged ID/);
  assert.match(startup, /First Mate IDs to contain that exact ID/);
  assert.match(startup, /If either check fails, stop and require `\/skill:first-mate` again/);
  assert.match(startup, /exclude the confirmed current broker session ID/);
  assert.match(startup, /preserve every full broker session ID/);
  assert.match(startup, /report all of their full IDs as duplicate First Mates/);
  assert.match(startup, /Do not tail or message a peer during startup/);
  assert.match(startup, /Then remain idle/);
});

test("First Mate requires reinvocation after every role-invalidating lifecycle edge", () => {
  for (const edge of ["Tree navigation", "compaction", "reload", "resume", "session replacement", "broker disconnect", "shutdown"]) {
    assert.match(startup, new RegExp(edge, "i"));
  }
  assert.match(startup, /require `\/skill:first-mate` again/);
  assert.match(startup, /never republish from remembered state/);
  assert.match(startup, /not private per recipient/);
});
