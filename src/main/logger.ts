import { BrowserWindow } from "electron";

let mainWindow: BrowserWindow | null = null;

/**
 * Set the main window reference for logging
 */
export function setMainWindow(window: BrowserWindow | null) {
  mainWindow = window;
}

/**
 * Logger for application events and errors
 */
export function logMessage(message: string, isError: boolean = false) {
  const logPrefix = isError ? "[ERROR]" : "[INFO]";
  const logMessage = `${logPrefix} ${message}`;

  console.log(logMessage);

  // Send log message to renderer process if main window exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("log-message", {
      message: logMessage,
      isError,
    });
  }
}
