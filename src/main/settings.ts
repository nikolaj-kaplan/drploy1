import Store from "electron-store";
import { UserSettings } from "./types";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as https from "https";
import { logMessage } from "./logger";

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
