import { BrowserWindow } from "electron";
import * as path from "path";
import { setMainWindow } from "./logger";

// Keep a global reference of the window object to prevent garbage collection
let mainWindow: BrowserWindow | null = null;

/**
 * Create the main application window
 */
export function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: false, // Disable developer tools
    },
  });
  
  // Maximize the window
  mainWindow.maximize();
  
  // Show the window after it's ready
  mainWindow.show();
  
  // Load the index.html of the app built by Webpack
  mainWindow.loadFile(path.join(__dirname, "index.html")); 
  
  // Remove the development DevTools opening
  // Developer tools are now disabled via webPreferences.devTools: false

  // Emitted when the window is closed
  mainWindow.on("closed", () => {
    // Dereference the window object
    mainWindow = null;
    setMainWindow(null);
  });
  
  // Set the main window for logging
  setMainWindow(mainWindow);
  
  return mainWindow;
}

/**
 * Get the current main window
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
