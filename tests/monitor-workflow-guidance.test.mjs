import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const COMMIT_PR_SKILL = new URL("../skills/commit/commit-pr/SKILL.md", import.meta.url);
const CODE_REVIEW_SKILL = new URL("../skills/review/code-review/SKILL.md", import.meta.url);

test("PR creation and review workflows register available monitors", async () => {
  const [commitPr, codeReview] = await Promise.all([
    readFile(COMMIT_PR_SKILL, "utf8"),
    readFile(CODE_REVIEW_SKILL, "utf8"),
  ]);

  assert.match(
    commitPr,
    /After a successful create or update, call `monitor_github_pr` with the canonical PR URL when the tool is available/,
  );
  assert.match(
    codeReview,
    /Before returning a review of an open GitHub pull request, call `monitor_github_pr` with its canonical URL when the tool is available/,
  );
  assert.match(codeReview, /register each open GitHub pull request in review order until the tool reports its session limit/);
  assert.match(codeReview, /Continue the review and identify any pull request that remains unmonitored/);
  assert.match(codeReview, /does not publish GitHub changes/);
});
