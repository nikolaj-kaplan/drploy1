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

      // Make sure we're on the right branch
      await executeGitCommand(`git checkout ${branch}`);
      await executeGitCommand("git pull");

      // Get current HEAD commit
      const headResult = await executeGitCommand("git rev-parse HEAD");
      const headCommit = headResult.output.trim();

      // Check if tag exists
      const tagExists = await executeGitCommand(`git tag -l ${env}`);
      let lastDeployedCommit: string | null = null;
      let status: string = "up-to-date";

      if (tagExists.output.trim()) {
        // Get commit for tag
        const tagCommitResult = await executeGitCommand(`git rev-parse ${env}`);
        lastDeployedCommit = tagCommitResult.output.trim() || null;

        // Check if there are commits between tag and HEAD
        const diffResult = await executeGitCommand(
          `git log ${env}..HEAD --oneline`
        );

        if (diffResult.output.trim()) {
          status = "pending-commits";
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

      // Make sure we're on the right branch
      await executeGitCommand("git fetch --tags --force");
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

      // Make sure we're on the right branch
      await executeGitCommand(`git checkout ${branch}`);
      await executeGitCommand("git pull");

      // Check if tag exists
      const tagExists = await executeGitCommand(`git tag -l ${env}`);

      let commits: any[] = [];

      if (tagExists.output.trim()) {
        // Get commits between tag and HEAD
        const logFormat =
          '--pretty=format:{"hash":"%h","message":"%s","author":"%an","timestamp":"%ad"}';
        const logResult = await executeGitCommand(
          `git log ${env}..HEAD ${logFormat} --date=iso`
        );

        if (logResult.output.trim()) {
          // Parse the JSON objects
          commits = logResult.output
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => {
              const jsonString = line
                // 1) quote the keys
                .replace(/([{,])(\w+):/g, '$1"$2":')
                // 2) quote unquoted values (up to the next , or })
                .replace(/:(?!")([^,}]+)(?=[,}])/g, ':"$1"');
              return jsonString;
            })
            .map((line) => JSON.parse(line));
        }
      }

      event.reply(`${env}-commits-retrieved`, commits);
    } catch (error) {
      event.reply(`${env}-commits-retrieved`, [] as any[]);
    }
  });

  // Check all environments status
  ipcMain.on("check-all-environments", async (event) => {
    try {
      // Get all environment names
      const environments = Object.keys(userSettings.environmentMappings);

      // Create an array to hold all environment statuses
      const results: EnvironmentStatus[] = [];

      // Check each environment
      for (const env of environments) {
        const branch = userSettings.environmentMappings[env];

        try {
          // Make sure we're on the right branch
          await executeGitCommand(`git checkout ${branch}`);
          await executeGitCommand("git pull");

          // Get current HEAD commit
          const headResult = await executeGitCommand("git rev-parse HEAD");
          const headCommit = headResult.output.trim();
          // Check if tag exists
          const tagExists = await executeGitCommand(`git tag -l ${env}`);

          let lastDeployedCommit: string | null = null;
          let status = "up-to-date";

          if (tagExists.output.trim()) {
            // Get commit for tag
            const tagCommitResult = await executeGitCommand(
              `git rev-parse ${env}`
            );
            lastDeployedCommit = tagCommitResult.output.trim() || null;

            // Check if there are commits between tag and HEAD
            const diffResult = await executeGitCommand(
              `git log ${env}..HEAD --oneline`
            );

            if (diffResult.output.trim()) {
              status = "pending-commits";
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

      // Create an array to hold all deployment results
      const results: DeploymentResult[] = [];

      // Check and deploy to each outdated environment
      for (const env of environments) {
        const branch = userSettings.environmentMappings[env];

        try {
          // Make sure we're on the right branch
          await executeGitCommand(`git checkout ${branch}`);
          await executeGitCommand("git pull");

          // Check if tag exists
          const tagExists = await executeGitCommand(`git tag -l ${env}`);
          let needsDeployment = false;

          if (tagExists.output.trim()) {
            // Check if there are commits between tag and HEAD
            const diffResult = await executeGitCommand(
              `git log ${env}..HEAD --oneline`
            );
            needsDeployment = diffResult.output.trim().length > 0;
          } else {
            needsDeployment = true;
          }

          if (needsDeployment) {
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
