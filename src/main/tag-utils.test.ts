/**
 * Unit tests for tag-utils.ts and deploy-logic.ts
 * Run with:  npm test
 */
import { strict as assert } from "assert";
import { test } from "node:test";
import { formatDeployTimestamp, buildDeployTag, parseEnvFromRef } from "./tag-utils";
import { performDeploy, parseLatestTagFromOutput } from "./deploy-logic";

// ── formatDeployTimestamp ────────────────────────────────────────────────────

test("formatDeployTimestamp: strips colon from time part", () => {
  assert.equal(
    formatDeployTimestamp(new Date("2026-07-13T10:34:00.000Z")),
    "2026-07-13T1034Z"
  );
});

test("formatDeployTimestamp: midnight", () => {
  assert.equal(
    formatDeployTimestamp(new Date("2026-07-13T00:00:00.000Z")),
    "2026-07-13T0000Z"
  );
});

test("formatDeployTimestamp: end of day", () => {
  assert.equal(
    formatDeployTimestamp(new Date("2026-12-31T23:59:00.000Z")),
    "2026-12-31T2359Z"
  );
});

test("formatDeployTimestamp: single-digit hours and minutes stay zero-padded", () => {
  assert.equal(
    formatDeployTimestamp(new Date("2026-01-01T09:05:00.000Z")),
    "2026-01-01T0905Z"
  );
});

test("formatDeployTimestamp: result matches expected tag pattern", () => {
  const result = formatDeployTimestamp(new Date("2026-07-13T10:34:00.000Z"));
  assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{4}Z$/);
});

// ── buildDeployTag ───────────────────────────────────────────────────────────

test("buildDeployTag: combines env and timestamp with slash", () => {
  assert.equal(buildDeployTag("prod", "2026-07-13T1034Z"), "prod/2026-07-13T1034Z");
});

test("buildDeployTag: works with hyphenated env names", () => {
  assert.equal(buildDeployTag("dev-test", "2026-07-13T1034Z"), "dev-test/2026-07-13T1034Z");
  assert.equal(
    buildDeployTag("traffic-test", "2026-07-13T1034Z"),
    "traffic-test/2026-07-13T1034Z"
  );
});

// ── parseEnvFromRef ──────────────────────────────────────────────────────────

const ENVS = ["prod", "test", "preprod", "training", "dev-test", "traffic-test"];

test("parseEnvFromRef: old flat tag — exact match", () => {
  assert.equal(parseEnvFromRef("prod", ENVS), "prod");
  assert.equal(parseEnvFromRef("test", ENVS), "test");
  assert.equal(parseEnvFromRef("dev-test", ENVS), "dev-test");
  assert.equal(parseEnvFromRef("traffic-test", ENVS), "traffic-test");
});

test("parseEnvFromRef: new timestamped tag — extracts env prefix", () => {
  assert.equal(parseEnvFromRef("prod/2026-07-13T1034Z", ENVS), "prod");
  assert.equal(parseEnvFromRef("test/2026-06-25T0630Z", ENVS), "test");
  assert.equal(parseEnvFromRef("dev-test/2026-07-06T1130Z", ENVS), "dev-test");
  assert.equal(parseEnvFromRef("preprod/2026-06-22T0950Z", ENVS), "preprod");
  assert.equal(parseEnvFromRef("traffic-test/2026-06-23T1325Z", ENVS), "traffic-test");
  assert.equal(parseEnvFromRef("training/2026-07-08T0736Z", ENVS), "training");
});

test("parseEnvFromRef: case-insensitive", () => {
  assert.equal(parseEnvFromRef("PROD", ENVS), "prod");
  assert.equal(parseEnvFromRef("PROD/2026-07-13T1034Z", ENVS), "prod");
  assert.equal(parseEnvFromRef("DEV-TEST/2026-07-13T1034Z", ENVS), "dev-test");
});

test("parseEnvFromRef: unknown ref returns null", () => {
  assert.equal(parseEnvFromRef("sandbox/2026-07-13T1034Z", ENVS), null);
  assert.equal(parseEnvFromRef("main", ENVS), null);
  assert.equal(parseEnvFromRef("", ENVS), null);
  assert.equal(parseEnvFromRef("feature/my-branch", ENVS), null);
});

test("parseEnvFromRef: preprod does not match prod prefix", () => {
  // "preprod/..." must resolve to "preprod", never to "prod"
  assert.equal(parseEnvFromRef("preprod/2026-07-13T1034Z", ENVS), "preprod");
});

test("parseEnvFromRef: prod prefix does not match preprod", () => {
  // "prod/..." must resolve to "prod", never to "preprod"
  assert.equal(parseEnvFromRef("prod/2026-07-13T1034Z", ENVS), "prod");
  assert.notEqual(parseEnvFromRef("prod/2026-07-13T1034Z", ENVS), "preprod");
});

test("parseEnvFromRef: empty env list returns null", () => {
  assert.equal(parseEnvFromRef("prod/2026-07-13T1034Z", []), null);
});

// ── round-trip: build then parse ────────────────────────────────────────────

test("round-trip: buildDeployTag output is parseable by parseEnvFromRef", () => {
  for (const env of ENVS) {
    const tag = buildDeployTag(env, formatDeployTimestamp(new Date("2026-07-13T10:34:00.000Z")));
    assert.equal(parseEnvFromRef(tag, ENVS), env, `round-trip failed for ${env}`);
  }
});

// ── parseLatestTagFromOutput ─────────────────────────────────────────────────

test("parseLatestTagFromOutput: returns first line (newest tag)", () => {
  const output = "prod/2026-07-13T1034Z\nprod/2026-07-10T0609Z\nprod/2026-06-24T0756Z\n";
  assert.equal(parseLatestTagFromOutput(output), "prod/2026-07-13T1034Z");
});

test("parseLatestTagFromOutput: returns null for empty output", () => {
  assert.equal(parseLatestTagFromOutput(""), null);
  assert.equal(parseLatestTagFromOutput("   \n  "), null);
});

test("parseLatestTagFromOutput: handles single tag", () => {
  assert.equal(parseLatestTagFromOutput("prod/2026-07-08T0734Z\n"), "prod/2026-07-08T0734Z");
});

// ── performDeploy ────────────────────────────────────────────────────────────

const FIXED_DATE = new Date("2026-07-13T10:34:00.000Z");
const FIXED_TS   = "2026-07-13T1034Z";
const REMOTE_SHA = "d6b60946c629775f8065c86faae15643cd8f86d0";

/** Build a mock git executor that returns the remote SHA for rev-parse and success for everything else. */
function makeMockGit(overrides: Record<string, { success: boolean; output: string; error?: string }> = {}) {
  const log: string[] = [];
  const exec = async (cmd: string) => {
    log.push(cmd);
    for (const [pattern, result] of Object.entries(overrides)) {
      if (cmd.includes(pattern)) return result;
    }
    if (cmd.startsWith("git rev-parse origin/")) {
      return { success: true, output: `${REMOTE_SHA}\n` };
    }
    return { success: true, output: "" };
  };
  return { exec, log };
}

// ── The original bug: stale local HEAD ──────────────────────────────────────
// Before the fix, the handler did: git checkout <branch> && git pull
// then tagged whatever HEAD was locally — which could be stale if pull failed.
// After the fix: git rev-parse origin/<branch> is used directly.

test("performDeploy: resolves origin/<branch> — never runs git checkout or git pull", async () => {
  const { exec, log } = makeMockGit();
  await performDeploy("prod", "main", exec, FIXED_DATE);

  assert.ok(log.some(c => c === `git rev-parse origin/main`),
    "must resolve origin/main");
  assert.ok(!log.some(c => c.includes("git checkout")),
    "must NOT run git checkout (stale-HEAD bug)");
  assert.ok(!log.some(c => c === "git pull"),
    "must NOT run git pull (stale-HEAD bug)");
});

test("performDeploy: tag is created pointing at the remote SHA, not an implicit HEAD", async () => {
  const { exec, log } = makeMockGit();
  await performDeploy("prod", "main", exec, FIXED_DATE);

  const tagCmd = log.find(c => c.startsWith("git tag -a"));
  assert.ok(tagCmd, "must create a tag");
  assert.ok(tagCmd!.includes(REMOTE_SHA),
    `tag command must reference the remote SHA (${REMOTE_SHA}), got: ${tagCmd}`);
});

test("performDeploy: tag name matches YYYY-MM-DDTHHMZ format", async () => {
  let pushedTag = "";
  const { exec } = makeMockGit();
  const wrappedExec = async (cmd: string) => {
    const result = await exec(cmd);
    if (cmd.startsWith("git push origin")) {
      const m = cmd.match(/"([^"]+)"/);
      if (m) pushedTag = m[1];
    }
    return result;
  };
  await performDeploy("prod", "main", wrappedExec, FIXED_DATE);

  assert.equal(pushedTag, `prod/${FIXED_TS}`);
  assert.match(pushedTag, /^prod\/\d{4}-\d{2}-\d{2}T\d{4}Z$/);
});

test("performDeploy: returns the new tag name", async () => {
  const { exec } = makeMockGit();
  const result = await performDeploy("dev-test", "release/9.4.0", exec, FIXED_DATE);
  assert.equal(result, `dev-test/${FIXED_TS}`);
});

// ── Error propagation (the second bug: push failure was silently ignored) ───

test("performDeploy: throws when rev-parse fails — does not proceed with stale data", async () => {
  const { exec } = makeMockGit({ "git rev-parse origin/": { success: false, output: "", error: "unknown ref" } });
  await assert.rejects(
    () => performDeploy("prod", "main", exec, FIXED_DATE),
    /Failed to resolve HEAD of origin\/main/
  );
});

test("performDeploy: throws when rev-parse returns empty output", async () => {
  const { exec } = makeMockGit({ "git rev-parse origin/": { success: true, output: "" } });
  await assert.rejects(
    () => performDeploy("prod", "main", exec, FIXED_DATE),
    /Failed to resolve HEAD/
  );
});

test("performDeploy: throws when tag creation fails", async () => {
  const { exec } = makeMockGit({ "git tag -a": { success: false, output: "", error: "already exists" } });
  await assert.rejects(
    () => performDeploy("prod", "main", exec, FIXED_DATE),
    /Failed to create tag/
  );
});

test("performDeploy: throws when push fails — does not silently succeed", async () => {
  const { exec } = makeMockGit({ "git push origin": { success: false, output: "", error: "remote rejected" } });
  await assert.rejects(
    () => performDeploy("prod", "main", exec, FIXED_DATE),
    /Failed to push tag.*remote rejected/
  );
});

test("performDeploy: does not push if tag creation fails", async () => {
  const pushed: string[] = [];
  const { exec: base } = makeMockGit({ "git tag -a": { success: false, output: "", error: "exists" } });
  const exec = async (cmd: string) => {
    if (cmd.startsWith("git push")) pushed.push(cmd);
    return base(cmd);
  };
  await assert.rejects(() => performDeploy("prod", "main", exec, FIXED_DATE));
  assert.equal(pushed.length, 0, "must not push when tag creation fails");
});
