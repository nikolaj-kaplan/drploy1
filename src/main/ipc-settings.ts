import { ipcMain } from "electron";
import { shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import { UserSettings } from "./types";
import { logMessage } from "./logger";
import { userSettings, saveSettings, getCurrentRepoPath, updateEnvironmentMapping } from "./settings";
import { executeGitCommand } from "./git";

/**
 * Register all settings-related IPC handlers
 */
export function registerSettingsHandlers() {
  // Settings IPC handlers
  ipcMain.on("save-settings", async (event, settings: UserSettings) => {
    saveSettings(settings);
    const repoPath = getCurrentRepoPath();

    // Create directory if it doesn't exist
    if (!fs.existsSync(repoPath)) {
      try {
        fs.mkdirSync(repoPath, { recursive: true });
        logMessage(`Created repository directory: ${repoPath}`);
      } catch (error) {
        logMessage(
          `Failed to create repository directory: ${
            error instanceof Error ? error.message : String(error)
          }`,
          true
        );
      }
    }

    // Initialize the repository if it doesn't exist
    if (!fs.existsSync(path.join(repoPath, ".git"))) {
      logMessage("Repository does not exist, initializing...");
      await executeGitCommand(`git clone ${settings.repositoryUrl} ${repoPath}`);
    } else {
      logMessage("Repository already exists, fetching latest changes");
      await executeGitCommand("git fetch --tags --force", repoPath);
    }

    event.reply("settings-saved", true);
  });

  ipcMain.on("load-settings", (event) => {
    event.reply("settings-loaded", userSettings);
  });

  ipcMain.on("update-environment-mapping", (event, { env, branch }) => {
    const success = updateEnvironmentMapping(env, branch);
    event.reply("mapping-updated", success);
  });
}

/**
 * Register the IPC handler for logs from the renderer process
 */
export function registerLogHandler() {  // Handle logs from the renderer process
  ipcMain.on("log-from-renderer", (_, { message, isError }) => {
    // Just log to console without sending back to renderer to avoid duplication
    const logPrefix = isError ? "[ERROR]" : "[INFO]";
    const logMessage = `${logPrefix} ${message}`;
    console.log(logMessage);
  });
}

/**
 * Register the IPC handler for file system operations
 */
export function registerFileSystemHandlers() {
  // Handle IPC message from renderer to list directory contents
  ipcMain.on("list-directory", (event, dirPath) => {
    try {
      const files = fs.readdirSync(dirPath);
      event.reply("directory-listed", { success: true, files });
    } catch (error) {
      event.reply("directory-listed", {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

/**
 * Register the IPC handler for shell operations (opening external links)
 */
export function registerShellHandlers() {
  ipcMain.on("open-external", async (event, url: string) => {
    try {
      await shell.openExternal(url);
      event.reply("external-opened", { success: true });
    } catch (error) {
      event.reply("external-opened", {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
