import Store from "electron-store";
import { ActionRunSummary, EnvironmentDeploySummary, UserSettings } from "./types";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as https from "https";
import { logMessage } from "./logger";
import { parseEnvFromRef } from "./tag-utils";

const CENTRAL_MAPPING_REPO = "drdk/umbraco-deploy-mapping";
const CENTRAL_MAPPING_FILE_PATH = "environment-mappings.json";

// Initialize electron-store for persistent storage
const store = new Store<UserSettings>({
  defaults: {
    githubToken: "",
    repositoryUrl: "",
    environmentMappings: {},
    recentCommitDays: 7, // Default to 7 days
  },
});

// Get user settings from store
export const userSettings: UserSettings = {
  githubToken: store.get("githubToken") || "",
  repositoryUrl: store.get("repositoryUrl") || "",
  environmentMappings: {},
  recentCommitDays: store.get("recentCommitDays") || 7,
};

function toGitHubApiPath(repoWithOwner: string, filePath: string): string {
  return `/repos/${repoWithOwner}/contents/${filePath}`;
}

interface GitHubWorkflowRun {
  id: number;
  run_number: number;
  name: string;
  display_title: string;
  path?: string;
  event: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_branch: string | null;
  head_sha: string | null;
  created_at: string;
  run_started_at: string | null;
  updated_at: string;
}

interface GitHubWorkflowRunsResponse {
  workflow_runs?: GitHubWorkflowRun[];
}

const DEFAULT_DEPLOY_SUMMARY_LIMIT = 40;
const DEPLOY_RUNTIME_SAMPLE_SIZE = 5;

function normalizeWorkflowPath(workflowPath: string | undefined): string | null {
  if (!workflowPath) {
    return null;
  }

  return workflowPath.split("@")[0]?.trim() || null;
}

function globPatternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${escaped}$`, "i");
}

function extractTagPatternsFromWorkflow(workflowContent: string): string[] {
  const lines = workflowContent.split(/\r?\n/);
  const patterns: string[] = [];
  let insidePushBlock = false;
  let pushIndent = -1;
  let insideTagsBlock = false;
  let tagsIndent = -1;

  for (const line of lines) {
    const trimmedLine = line.trim();
    const indent = line.length - line.trimStart().length;

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    if (insideTagsBlock) {
      if (indent <= tagsIndent && !trimmedLine.startsWith("- ")) {
        insideTagsBlock = false;
      } else if (trimmedLine.startsWith("- ")) {
        patterns.push(trimmedLine.slice(2).trim().replace(/^['"]|['"]$/g, ""));
        continue;
      }
    }

    if (insidePushBlock && indent <= pushIndent && !trimmedLine.startsWith("push:")) {
      insidePushBlock = false;
      insideTagsBlock = false;
    }

    if (trimmedLine.startsWith("push:")) {
      insidePushBlock = true;
      pushIndent = indent;
      insideTagsBlock = false;
      continue;
    }

    if (insidePushBlock && trimmedLine.startsWith("tags:")) {
      insideTagsBlock = true;
      tagsIndent = indent;
    }
  }

  return patterns;
}

function getTagTriggeredWorkflowPaths(mappings: Record<string, string>): Set<string> {
  const workflowsDir = path.join(getCurrentRepoPath(), ".github", "workflows");
  if (!fs.existsSync(workflowsDir)) {
    return new Set<string>();
  }

  const environmentNames = Object.keys(mappings);
  if (environmentNames.length === 0) {
    return new Set<string>();
  }

  const workflowPaths = new Set<string>();
  const workflowFiles = fs
    .readdirSync(workflowsDir)
    .filter((fileName) => fileName.endsWith(".yml") || fileName.endsWith(".yaml"));

  for (const workflowFile of workflowFiles) {
    const absolutePath = path.join(workflowsDir, workflowFile);
    const workflowContent = fs.readFileSync(absolutePath, "utf-8");
    const tagPatterns = extractTagPatternsFromWorkflow(workflowContent);

    const matchesDeploymentTag = environmentNames.some((environmentName) =>
      tagPatterns.some((pattern) => 
        globPatternToRegex(pattern).test(environmentName) ||
        pattern.startsWith(`${environmentName}/`)
      )
    );

    if (matchesDeploymentTag) {
      workflowPaths.add(`.github/workflows/${workflowFile}`);
    }
  }

  return workflowPaths;
}

function callGitHubApi(
  token: string,
  requestPath: string,
  method: "GET" | "PUT",
  body?: string
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dr-ploy",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    };

    if (body) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const finalPath =
      method === "GET"
        ? `${requestPath}${requestPath.includes("?") ? "&" : "?"}_ts=${Date.now()}`
        : requestPath;

    const req = https.request(
      {
        hostname: "api.github.com",
        path: finalPath,
        method,
        headers,
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: responseBody,
          });
        });
      }
    );

    req.on("error", (error) => reject(error));

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

export function getRepositorySlugFromUrl(repoUrl: string): string {
  const trimmedUrl = repoUrl.trim();
  if (!trimmedUrl) {
    throw new Error("Repository URL is required");
  }

  if (trimmedUrl.startsWith("git@github.com:")) {
    return trimmedUrl
      .replace("git@github.com:", "")
      .replace(/\.git$/, "")
      .trim();
  }

  const parsedUrl = new URL(trimmedUrl);
  if (parsedUrl.hostname !== "github.com") {
    throw new Error("Only github.com repositories are supported for Actions tracking");
  }

  const parts = parsedUrl.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Repository URL must include owner and repository name");
  }

  return `${parts[0]}/${parts[1].replace(/\.git$/, "")}`;
}

function inferEnvironmentFromRun(
  run: GitHubWorkflowRun,
  mappings: Record<string, string>
): string | null {
  const normalizedEnvironments = Object.keys(mappings).map((env) => ({
    raw: env,
    normalized: env.toLowerCase(),
  }));
  const normalizedBranches = Object.entries(mappings).map(([env, branch]) => ({
    env,
    normalizedBranch: branch.toLowerCase(),
  }));

  const normalizedHeadBranch = run.head_branch?.toLowerCase();
  if (normalizedHeadBranch) {
    // Match by tag ref — handles both old flat ("prod") and new timestamped ("prod/2026-07-13T1034Z")
    const envFromRef = parseEnvFromRef(normalizedHeadBranch, Object.keys(mappings));
    if (envFromRef) {
      return envFromRef;
    }

    // Match by branch name (PR-triggered runs where head_branch is a branch, not a tag)
    const branchMatch = normalizedBranches.find(
      ({ normalizedBranch }) => normalizedBranch === normalizedHeadBranch
    );
    if (branchMatch) {
      return branchMatch.env;
    }
  }

  const searchableText = `${run.name} ${run.display_title}`.toLowerCase();
  const textMatch = normalizedEnvironments.find(({ normalized }) =>
    searchableText.includes(normalized)
  );

  return textMatch?.raw ?? null;
}

function toActionRunSummary(
  run: GitHubWorkflowRun,
  mappings: Record<string, string>
): ActionRunSummary {
  const startedAt = run.run_started_at || run.created_at;
  const completedAt = run.status === "completed" ? run.updated_at : null;
  const startedTimestamp = Date.parse(startedAt);
  const endedTimestamp = Date.parse(completedAt || run.updated_at);
  const hasValidDuration = !Number.isNaN(startedTimestamp) && !Number.isNaN(endedTimestamp);

  return {
    id: run.id,
    runNumber: run.run_number,
    workflowName: run.name,
    displayTitle: run.display_title,
    event: run.event,
    status: run.status,
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    environment: inferEnvironmentFromRun(run, mappings),
    createdAt: run.created_at,
    startedAt,
    updatedAt: run.updated_at,
    completedAt,
    durationSeconds: hasValidDuration
      ? Math.max(0, Math.round((endedTimestamp - startedTimestamp) / 1000))
      : null,
    isActive: run.status !== "completed",
  };
}

function isTagTriggeredDeploymentRun(
  run: GitHubWorkflowRun,
  mappings: Record<string, string>,
  tagTriggeredWorkflowPaths: Set<string>
): boolean {
  if (run.event !== "push") {
    return false;
  }

  const inferredEnvironment = inferEnvironmentFromRun(run, mappings);
  if (!inferredEnvironment) {
    return false;
  }

  if (tagTriggeredWorkflowPaths.size === 0) {
    return true;
  }

  const normalizedWorkflowPath = normalizeWorkflowPath(run.path);
  if (!normalizedWorkflowPath) {
    return true;
  }

  return tagTriggeredWorkflowPaths.has(normalizedWorkflowPath);
}

export async function getRecentActionRuns(limit = 20): Promise<ActionRunSummary[]> {
  const token = userSettings.githubToken;
  if (!token) {
    throw new Error("GitHub token is required to load workflow runs");
  }

  const repoSlug = getRepositorySlugFromUrl(userSettings.repositoryUrl);
  let mappings = userSettings.environmentMappings;
  if (Object.keys(mappings).length === 0) {
    try {
      mappings = await loadEnvironmentMappingsFromCentralRepo();
    } catch {
      mappings = {};
    }
  }
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const response = await callGitHubApi(
    token,
    `/repos/${repoSlug}/actions/runs?per_page=${safeLimit}`,
    "GET"
  );

  if (response.statusCode !== 200) {
    throw new Error(
      `GitHub Actions API responded with status ${response.statusCode}: ${response.body.slice(0, 300)}`
    );
  }

  const payload = JSON.parse(response.body) as GitHubWorkflowRunsResponse;
  const runs = payload.workflow_runs || [];
  const tagTriggeredWorkflowPaths = getTagTriggeredWorkflowPaths(mappings);

  return runs
    .filter((run) => isTagTriggeredDeploymentRun(run, mappings, tagTriggeredWorkflowPaths))
    .map((run) => toActionRunSummary(run, mappings));
}

function getMedianDurationSeconds(durations: number[]): number | null {
  if (durations.length === 0) {
    return null;
  }

  const sortedDurations = [...durations].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedDurations.length / 2);

  if (sortedDurations.length % 2 === 1) {
    return sortedDurations[middleIndex];
  }

  return Math.round(
    (sortedDurations[middleIndex - 1] + sortedDurations[middleIndex]) / 2
  );
}

export async function getEnvironmentDeploySummaries(
  limit = DEFAULT_DEPLOY_SUMMARY_LIMIT
): Promise<EnvironmentDeploySummary[]> {
  let mappings = userSettings.environmentMappings;
  if (Object.keys(mappings).length === 0) {
    try {
      mappings = await loadEnvironmentMappingsFromCentralRepo();
    } catch {
      mappings = {};
    }
  }

  const actionRuns = await getRecentActionRuns(limit);
  const environments = Object.keys(mappings).sort((left, right) => left.localeCompare(right));

  return environments.map((environmentName) => {
    const environmentRuns = actionRuns.filter((run) => run.environment === environmentName);
    const latestRun = environmentRuns[0] ?? null;
    const successfulRuns = environmentRuns.filter(
      (run) => run.conclusion === "success" && run.durationSeconds != null
    );
    const sampledDurations = successfulRuns
      .slice(0, DEPLOY_RUNTIME_SAMPLE_SIZE)
      .map((run) => run.durationSeconds as number);
    const lastSuccessfulRun = successfulRuns[0] ?? null;

    return {
      environment: environmentName,
      latestRun,
      estimatedDurationSeconds: getMedianDurationSeconds(sampledDurations),
      successfulSampleSize: sampledDurations.length,
      lastSuccessfulAt: lastSuccessfulRun?.completedAt || null,
    };
  });
}

function sanitizeEnvironmentMappings(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const input = value as Record<string, unknown>;
  const result: Record<string, string> = {};

  for (const [env, branch] of Object.entries(input)) {
    if (typeof env === "string" && typeof branch === "string") {
      const normalizedEnv = env.trim();
      const normalizedBranch = branch.trim();
      if (normalizedEnv && normalizedBranch) {
        result[normalizedEnv] = normalizedBranch;
      }
    }
  }

  return result;
}

export async function loadEnvironmentMappingsFromCentralRepo(): Promise<Record<string, string>> {
  const token = userSettings.githubToken;
  if (!token) {
    throw new Error("GitHub token is required to load central environment mappings");
  }

  try {
    const requestPath = toGitHubApiPath(CENTRAL_MAPPING_REPO, CENTRAL_MAPPING_FILE_PATH);
    const response = await callGitHubApi(token, requestPath, "GET");

    if (response.statusCode === 404) {
      throw new Error("Central mapping file not found in mapping repository");
    }

    if (response.statusCode !== 200) {
      throw new Error(
        `GitHub API responded with status ${response.statusCode}: ${response.body.slice(0, 300)}`
      );
    }

    const payload = JSON.parse(response.body) as { content?: string; encoding?: string };
    if (!payload.content || payload.encoding !== "base64") {
      throw new Error("Unexpected mapping file payload from GitHub API");
    }

    const decoded = Buffer.from(payload.content, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    const validated = sanitizeEnvironmentMappings(parsed);
    if (Object.keys(validated).length === 0) {
      throw new Error("Central mapping file is empty or invalid");
    }

    userSettings.environmentMappings = validated;

    logMessage(
      `Loaded environment mappings from central repository (${Object.keys(validated).join(", ")})`
    );
    return validated;
  } catch (error) {
    logMessage(
      `Failed to load central environment mappings: ${
        error instanceof Error ? error.message : String(error)
      }`,
      true
    );
    throw error;
  }
}

export async function saveEnvironmentMappingsToCentralRepo(
  mappings: Record<string, string>
): Promise<void> {
  const token = userSettings.githubToken;
  if (!token) {
    throw new Error("GitHub token is required to save central environment mappings");
  }

  const sanitizedMappings = sanitizeEnvironmentMappings(mappings);
  if (Object.keys(sanitizedMappings).length === 0) {
    throw new Error("Cannot save empty environment mappings to central repository");
  }

  const requestPath = toGitHubApiPath(CENTRAL_MAPPING_REPO, CENTRAL_MAPPING_FILE_PATH);

  let sha: string | undefined;
  const existing = await callGitHubApi(token, requestPath, "GET");
  if (existing.statusCode === 200) {
    const existingPayload = JSON.parse(existing.body) as { sha?: string };
    sha = existingPayload.sha;
  } else if (existing.statusCode !== 404) {
    throw new Error(`Unable to read central mapping file: ${existing.statusCode}`);
  }

  const content = `${JSON.stringify(sanitizedMappings, null, 2)}\n`;
  const payload = {
    message: `Update environment mappings from DR Deploy (${new Date().toISOString()})`,
    content: Buffer.from(content, "utf-8").toString("base64"),
    ...(sha ? { sha } : {}),
  };

  const saveResponse = await callGitHubApi(
    token,
    requestPath,
    "PUT",
    JSON.stringify(payload)
  );

  if (saveResponse.statusCode !== 200 && saveResponse.statusCode !== 201) {
    throw new Error(`Unable to save central mapping file: ${saveResponse.statusCode}`);
  }

  userSettings.environmentMappings = sanitizedMappings;
  logMessage("Saved environment mappings to central repository");
}

/**
 * Function to get the repository path for a specific repository URL
 */
export function getRepoPath(repoUrl: string): string {
  // Extract a unique name from the repository URL
  // We'll use the last part of the URL (repo name) and add a hash of the full URL
  const urlObj = new URL(repoUrl);
  const pathParts = urlObj.pathname.split("/").filter((p) => p);

  // Get the repository name (last part of the path)
  const repoName =
    pathParts.length > 0
      ? pathParts[pathParts.length - 1].replace(/\.git$/, "")
      : "default-repo";

  // Create a simple hash of the URL for uniqueness
  const hash = Buffer.from(repoUrl)
    .toString("base64")
    .replace(/[/+=]/g, "")
    .substring(0, 8);

  return path.join(
    os.homedir(),
    ".git-deployer",
    "repositories",
    `${repoName}-${hash}`
  );
}

/**
 * Gets the actual repository path for the current settings
 */
export function getCurrentRepoPath(): string {
  if (!userSettings.repositoryUrl) {
    // If no repository URL is set, return a default path that we can create
    return path.join(
      os.homedir(),
      ".git-deployer",
      "repositories",
      "default-repo"
    );
  }
  return getRepoPath(userSettings.repositoryUrl);
}

/**
 * Ensure the base repository directory structure exists
 */
export function ensureBaseRepoDir(): void {
  const baseRepoDir = path.join(os.homedir(), ".git-deployer", "repositories");
  if (!fs.existsSync(baseRepoDir)) {
    try {
      fs.mkdirSync(baseRepoDir, { recursive: true });
      logMessage(`Created base repository directory: ${baseRepoDir}`);
    } catch (error) {
      logMessage(
        `Failed to create base repository directory: ${
          error instanceof Error ? error.message : String(error)
        }`,
        true
      );
    }
  }
}

/**
 * Save settings to electron-store
 */
export function saveSettings(settings: UserSettings): void {
  // Update our in-memory settings
  Object.assign(userSettings, settings);
  
  // Save settings to store for persistence
  store.set("githubToken", settings.githubToken);
  store.set("repositoryUrl", settings.repositoryUrl);
}

/**
 * Update a specific environment mapping
 */
export function updateEnvironmentMapping(env: string, branch: string): boolean {
  userSettings.environmentMappings = userSettings.environmentMappings || {};
  userSettings.environmentMappings[env] = branch;
  return true;
}
