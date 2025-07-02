import { ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { executeGitCommand } from "./git";
import { userSettings, getCurrentRepoPath, saveSettings, updateEnvironmentMapping } from "./settings";
import { logMessage } from "./logger";
import { EnvironmentStatus, DeploymentResult, UserSettings } from "./types";

/**
 * Register all Git-related IPC handlers
 */
export function registerGitHandlers() {
  // Handle repository initialization
  ipcMain.on("initialize-repository", async (event, { token, url }) => {
    try {
      logMessage(`Initializing repository: ${url}`);

      // Update settings
      saveSettings({
        ...userSettings,
        githubToken: token,
        repositoryUrl: url
      });

      // Get the repository path for the current URL
      const repoPath = getCurrentRepoPath();

      // Create directory if it doesn't exist
      if (!fs.existsSync(repoPath)) {
        logMessage(`Creating repository directory: ${repoPath}`);
        fs.mkdirSync(repoPath, { recursive: true });
      }

      // Check if repo exists already
      const isRepo = fs.existsSync(path.join(repoPath, ".git"));

      let result;
      if (isRepo) {
        logMessage("Repository already exists, fetching latest changes");
        // Fetch latest changes
        await executeGitCommand("git fetch --tags --force");
        result = await executeGitCommand("git fetch --all");
      } else {
        logMessage("Cloning repository for the first time");
        // Clone the repository
        const authUrl = url.replace("https://", `https://${token}@`);
        result = await executeGitCommand(`git clone ${authUrl} .`);
      }

      if (result.success) {
        logMessage("Repository initialization completed successfully");
      } else {
        logMessage(`Repository initialization failed: ${result.error}`, true);
      }

      event.reply("repo-initialized", result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logMessage(`Exception during repository initialization: ${errorMsg}`, true);

      event.reply("repo-initialized", {
        success: false,
        output: "",
        error: errorMsg,
      });
    }
  });

  // Check environment status
  ipcMain.on("check-environment-status", async (event, env) => {
    try {
      const branch = userSettings.environmentMappings[env];

      // Single fetch operation for all remotes and tags
      await executeGitCommand("git fetch --all --tags --force");

      // Get current HEAD commit of the remote branch (no checkout needed)
      const headResult = await executeGitCommand(`git rev-parse origin/${branch}`);
      const headCommit = headResult.output.trim();

      // Check if tag exists
      const tagExists = await executeGitCommand(`git tag -l ${env}`);
      let lastDeployedCommit: string | null = null;
      let status: string = "up-to-date";      if (tagExists.output.trim()) {        // Get commit for tag
        const tagCommitResult = await executeGitCommand(`git rev-parse ${env}^^{commit}`);
        lastDeployedCommit = tagCommitResult.output.trim() || null;

        // Check if there are commits between tag and remote HEAD (use count for efficiency)
        const diffResult = await executeGitCommand(
          `git rev-list --count ${env}^^{commit}..origin/${branch}`
        );

        const commitCount = parseInt(diffResult.output.trim()) || 0;
        if (commitCount > 0) {
          status = "pending-commits";
        } else {
          // Check if tag is ahead of remote HEAD (environment deployed from newer commit)
          const reverseResult = await executeGitCommand(
            `git rev-list --count origin/${branch}..${env}^^{commit}`
          );
          
          const reverseCount = parseInt(reverseResult.output.trim()) || 0;
          if (reverseCount > 0) {
            status = "ahead-of-branch";
          }
        }
      } else {
        status = "pending-commits";
      }

      event.reply(`${env}-status-checked`, {
        success: true,
        output: JSON.stringify({
          name: env,
          branch,
          status,
          lastDeployedCommit,
          currentHeadCommit: headCommit,
        }),
      });
    } catch (error) {
      event.reply(`${env}-status-checked`, {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Deploy to environment
  ipcMain.on("deploy-to-environment", async (event, env) => {
    try {
      const branch = userSettings.environmentMappings[env];

      // Fetch latest data and checkout branch
      await executeGitCommand("git fetch --all --tags --force");
      await executeGitCommand(`git checkout ${branch}`);
      await executeGitCommand("git pull");

      // Delete existing tag if it exists
      const tagExists = await executeGitCommand(`git tag -l ${env}`);
      if (tagExists.output.trim()) {
        await executeGitCommand(`git tag -d ${env}`);
        await executeGitCommand(`git push origin :refs/tags/${env}`);
      }

      // Create new tag
      await executeGitCommand(
        `git tag -a ${env} -m "Deployed to ${env} on ${new Date().toISOString()}"`
      );

      // Push tag
      const pushResult = await executeGitCommand(`git push origin ${env}`);

      event.reply(`${env}-deployed`, {
        success: true,
        output: pushResult.output,
      });
    } catch (error) {
      event.reply(`${env}-deployed`, {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get commits between tag and HEAD
  ipcMain.on("get-commits-between-tag-and-head", async (event, env) => {
    try {
      const branch = userSettings.environmentMappings[env];

      // Fetch latest data
      await executeGitCommand("git fetch --all --tags --force");

      // Check if tag exists
      const tagExists = await executeGitCommand(`git tag -l ${env}`);

      let commits: any[] = [];

      if (tagExists.output.trim()) {        // Get commits between tag and remote HEAD (no checkout needed)
        // Use separate format strings for each field to avoid JSON parsing issues
        const logResult = await executeGitCommand(
          `git log ${env}^^{commit}..origin/${branch} --pretty=format:%H%n%h%n%s%n%an%n%ad%n--COMMIT-- --date=iso`
        );

        if (logResult.output.trim()) {
          // Split the output by the commit delimiter and process each commit
          const commitChunks = logResult.output.split('--COMMIT--').filter(chunk => chunk.trim());
          
          commits = commitChunks.map(chunk => {
            try {
              const lines = chunk.trim().split('\n');
              if (lines.length >= 5) {
                return {
                  fullHash: lines[0].trim(),
                  hash: lines[1].trim(),
                  message: lines[2].trim(),
                  author: lines[3].trim(),
                  timestamp: lines[4].trim()
                };
              } else {
                throw new Error(`Invalid commit chunk format: ${chunk}`);
              }
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : String(err);
              logMessage(`Error parsing commit: ${errorMessage}`, true);
              return {
                hash: "unknown",
                message: `Error parsing commit`,
                author: "unknown",
                timestamp: new Date().toISOString()
              };
            }
          });
        }
      }

      event.reply(`${env}-commits-retrieved`, commits);
    } catch (error) {
      logMessage(`Error retrieving commits for ${env}: ${error}`, true);
      event.reply(`${env}-commits-retrieved`, [] as any[]);
    }
  });

  // Check all environments status
  ipcMain.on("check-all-environments", async (event) => {
    try {
      // Get all environment names
      const environments = Object.keys(userSettings.environmentMappings);

      // Single fetch operation for all remotes and tags at the beginning
      await executeGitCommand("git fetch --all --tags --force");

      // Create an array to hold all environment statuses
      const results: EnvironmentStatus[] = [];

      // Check each environment
      for (const env of environments) {
        const branch = userSettings.environmentMappings[env];

        try {
          // Get current HEAD commit of the remote branch (no checkout needed)
          const headResult = await executeGitCommand(`git rev-parse origin/${branch}`);
          const headCommit = headResult.output.trim();
          
          // Check if tag exists
          const tagExists = await executeGitCommand(`git tag -l ${env}`);

          let lastDeployedCommit: string | null = null;
          let status = "up-to-date";          if (tagExists.output.trim()) {            // Get commit for tag
            const tagCommitResult = await executeGitCommand(
              `git rev-parse ${env}^^{commit}`
            );
            lastDeployedCommit = tagCommitResult.output.trim() || null;

            // Check if there are commits between tag and remote HEAD (use count for efficiency)
            const diffResult = await executeGitCommand(
              `git rev-list --count ${env}^^{commit}..origin/${branch}`
            );

            const commitCount = parseInt(diffResult.output.trim()) || 0;
            if (commitCount > 0) {
              status = "pending-commits";
            } else {
              // Check if tag is ahead of remote HEAD (environment deployed from newer commit)
              const reverseResult = await executeGitCommand(
                `git rev-list --count origin/${branch}..${env}^^{commit}`
              );
              
              const reverseCount = parseInt(reverseResult.output.trim()) || 0;
              if (reverseCount > 0) {
                status = "ahead-of-branch";
              }
            }
          } else {
            status = "pending-commits";
          }

          results.push({
            name: env,
            branch,
            status,
            lastDeployedCommit,
            currentHeadCommit: headCommit,
          });
        } catch (error) {
          results.push({
            name: env,
            branch,
            status: "error",
            lastDeployedCommit: null,
            currentHeadCommit: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      event.reply("all-environments-checked", {
        success: true,
        environments: results,
      });
    } catch (error) {
      event.reply("all-environments-checked", {
        success: false,
        environments: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Deploy all outdated environments
  ipcMain.on("deploy-all-outdated", async (event) => {
    try {
      // Get all environment names
      const environments = Object.keys(userSettings.environmentMappings);

      // Single fetch operation at the beginning
      await executeGitCommand("git fetch --all --tags --force");

      // Create an array to hold all deployment results
      const results: DeploymentResult[] = [];

      // Check and deploy to each outdated environment
      for (const env of environments) {
        const branch = userSettings.environmentMappings[env];

        try {
          // Check if tag exists (without switching branches first)
          const tagExists = await executeGitCommand(`git tag -l ${env}`);
          let needsDeployment = false;          if (tagExists.output.trim()) {
            // Check if there are commits between tag and remote HEAD (use count for efficiency)
            const diffResult = await executeGitCommand(
              `git rev-list --count ${env}^^{commit}..origin/${branch}`
            );
            const commitCount = parseInt(diffResult.output.trim()) || 0;
            needsDeployment = commitCount > 0;
          } else {
            needsDeployment = true;
          }

          if (needsDeployment) {
            // Now switch to branch only if deployment is needed
            await executeGitCommand(`git checkout ${branch}`);
            await executeGitCommand("git pull");

            // Delete existing tag if it exists
            if (tagExists.output.trim()) {
              await executeGitCommand(`git tag -d ${env}`);
              await executeGitCommand(`git push origin :refs/tags/${env}`);
            }

            // Create new tag
            await executeGitCommand(
              `git tag -a ${env} -m "Deployed to ${env} on ${new Date().toISOString()}"`
            );

            // Push tag
            const pushResult = await executeGitCommand(`git push origin ${env}`);

            results.push({
              name: env,
              deployed: true,
              output: pushResult.output,
            });
          } else {
            results.push({
              name: env,
              deployed: false,
              output: "Environment is already up to date.",
            });
          }
        } catch (error) {
          results.push({
            name: env,
            deployed: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      event.reply("all-outdated-deployed", {
        success: true,
        deployments: results,
      });
    } catch (error) {
      event.reply("all-outdated-deployed", {
        success: false,
        deployments: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
