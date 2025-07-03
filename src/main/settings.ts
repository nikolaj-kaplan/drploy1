import Store from "electron-store";
import { UserSettings } from "./types";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { logMessage } from "./logger";

// Initialize electron-store for persistent storage
const store = new Store<UserSettings>({
  defaults: {
    githubToken: "",
    repositoryUrl: "",
    environmentMappings: {
      "dev-test": "develop",
      test: "release/test",
      preprod: "release/candidate",
      prod: "master",
    },
    recentCommitDays: 7, // Default to 7 days
  },
});

// Get user settings from store
export const userSettings: UserSettings = {
  githubToken: store.get("githubToken") || "",
  repositoryUrl: store.get("repositoryUrl") || "",
  environmentMappings: store.get("environmentMappings") || {
    "dev-test": "develop",
    test: "release/test",
    preprod: "release/candidate",
    prod: "master",
  },
  recentCommitDays: store.get("recentCommitDays") || 7,
};

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
  store.set("environmentMappings", settings.environmentMappings);
}

/**
 * Update a specific environment mapping
 */
export function updateEnvironmentMapping(env: string, branch: string): boolean {
  if (userSettings.environmentMappings) {
    userSettings.environmentMappings[env] = branch;
    // Save updated settings to store
    store.set("environmentMappings", userSettings.environmentMappings);
    return true;
  }
  return false;
}
