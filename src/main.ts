import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Keep a global reference of the window object to prevent garbage collection
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
  // Always open DevTools for debugging
  mainWindow.webContents.openDevTools();

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    // Dereference the window object
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (mainWindow === null) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle IPC message from renderer to list directory contents
ipcMain.on('list-directory', (event, dirPath) => {
  try {
    const files = fs.readdirSync(dirPath);
    event.reply('directory-listed', { success: true, files });
  } catch (error) {
    event.reply('directory-listed', { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});
