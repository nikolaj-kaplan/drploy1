/**
 * Core deploy logic, extracted from the ipcMain handlers so it can be
 * unit-tested without a real git repo or Electron runtime.
 *
 * All git I/O goes through the injected `executeGit` function, which lets
 * tests substitute a mock and inspect every command that was (or wasn't) run.
 */
import { formatDeployTimestamp, buildDeployTag } from "./tag-utils";

export type GitExecutor = (
  cmd: string
) => Promise<{ success: boolean; output: string; error?: string }>;

/**
 * Deploy `env` by:
 *   1. Resolving the remote branch tip directly (`git rev-parse origin/<branch>`)
 *   2. Creating a new annotated tag at that SHA
 *   3. Pushing the tag
 *
 * Returns the new tag name (e.g. "prod/2026-07-13T1034Z").
 * Throws on any git failure.
 *
 * Key invariant: the function NEVER runs `git checkout` or `git pull`.
 * The SHA is read from the remote ref, so it cannot be stale.
 */
export async function performDeploy(
  env: string,
  branch: string,
  executeGit: GitExecutor,
  now: Date = new Date()
): Promise<string> {
  // Resolve the remote HEAD directly — never touches local checkout
  const headResult = await executeGit(`git rev-parse origin/${branch}`);
  if (!headResult.success || !headResult.output.trim()) {
    throw new Error(
      `Failed to resolve HEAD of origin/${branch}: ${headResult.error ?? "empty output"}`
    );
  }
  const headSha = headResult.output.trim();

  // Build immutable tag name
  const ts = formatDeployTimestamp(now);
  const newTag = buildDeployTag(env, ts);

  // Create annotated tag pointing at the remote SHA
  const tagResult = await executeGit(
    `git tag -a "${newTag}" ${headSha} -m "Deploy to ${env} on ${ts}"`
  );
  if (!tagResult.success) {
    throw new Error(`Failed to create tag: ${tagResult.error}`);
  }

  // Push — no force flag needed, the tag is unique
  const pushResult = await executeGit(`git push origin "${newTag}"`);
  if (!pushResult.success) {
    throw new Error(`Failed to push tag: ${pushResult.error}`);
  }

  return newTag;
}

/**
 * Parse the output of `git tag -l "<env>/*" --sort=-version:refname`
 * and return the first (newest) tag, or null if there are none.
 */
export function parseLatestTagFromOutput(gitOutput: string): string | null {
  const first = gitOutput.trim().split("\n")[0];
  return first || null;
}
