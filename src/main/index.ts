import { app } from "electron";
import { createWindow } from "./window";
import { logMessage } from "./logger";
import { ensureBaseRepoDir } from "./settings";
import { registerGitHandlers } from "./ipc-git";
import { registerSettingsHandlers, registerLogHandler, registerFileSystemHandlers, registerShellHandlers } from "./ipc-settings";

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  logMessage("Application starting up");
  
  // Create the main application window
  createWindow();
  
  // Ensure the base repository directory structure exists
  ensureBaseRepoDir();
  
  // Register all IPC handlers
  registerGitHandlers();
  registerSettingsHandlers();
  registerLogHandler();
  registerFileSystemHandlers();
  registerShellHandlers();

  app.on("activate", () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (!createWindow()) {
      logMessage("Re-creating application window");
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
