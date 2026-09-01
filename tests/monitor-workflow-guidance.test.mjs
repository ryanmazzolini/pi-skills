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
    /after updating an existing PR, also pass `notifyExistingFeedback: false`/,
  );
  assert.match(
    codeReview,
    /call `monitor_github_pr` with its canonical URL and `notifyExistingFeedback: false` when the tool is available/,
  );
  assert.match(codeReview, /records existing feedback without triggering another turn/);
  assert.match(codeReview, /register each open GitHub pull request in review order until the tool reports its session limit/);
  assert.match(codeReview, /Continue the review and identify any pull request that remains unmonitored/);
  assert.match(codeReview, /does not publish GitHub changes/);
});
