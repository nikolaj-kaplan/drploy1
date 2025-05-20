import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as os from 'os';
import Store from 'electron-store';

// Define the schema for our settings
interface UserSettings {
  githubToken: string;
  repositoryUrl: string;
  environmentMappings: {
    [key: string]: string;
  };
}

// Define interfaces for our environment status and deployment tracking
interface EnvironmentStatus {
  name: string;
  branch: string;
  status: string;
  lastDeployedCommit: string | null;
  currentHeadCommit: string | null;
  error?: string;
}

interface DeploymentResult {
  name: string;
  deployed: boolean;
  output?: string;
  error?: string;
}

// Initialize electron-store for persistent storage
const store = new Store<UserSettings>({
  defaults: {
    githubToken: '',
    repositoryUrl: '',
    environmentMappings: {
      'dev-test': 'develop',
      'test': 'release/test',
      'preprod': 'release/candidate',
      'prod': 'master'
    }
  }
});

// Get user settings from store using store.get() as separate calls since store.get() with no args doesn't exist in the type
let userSettings: UserSettings = {
  githubToken: store.get('githubToken') || '',
  repositoryUrl: store.get('repositoryUrl') || '',
  environmentMappings: store.get('environmentMappings') || {
    'dev-test': 'develop',
    'test': 'release/test',
    'preprod': 'release/candidate',
    'prod': 'master'
  }
};

// Local repository path
let repoPath = path.join(os.homedir(), '.git-deployer', 'repository');

// Keep a global reference of the window object to prevent garbage collection
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  // Create the browser window  
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  // Load the index.html of the app built by Webpack
  mainWindow.loadFile(path.join(__dirname, 'index.html'));  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

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

// Execute a Git command and return the result
function executeGitCommand(command: string, cwd: string = repoPath): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    child_process.exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, output: stdout, error: stderr || error.message });
      } else {
        resolve({ success: true, output: stdout });
      }
    });
  });
}

// Handle repository initialization
ipcMain.on('initialize-repository', async (event, { token, url }) => {
  try {
    userSettings.githubToken = token;
    userSettings.repositoryUrl = url;
    
    // Save individual settings to electron-store
    (store as any).set('githubToken', token);
    (store as any).set('repositoryUrl', url);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(repoPath)) {
      fs.mkdirSync(repoPath, { recursive: true });
    }
    
    // Check if repo exists already
    const isRepo = fs.existsSync(path.join(repoPath, '.git'));
    
    let result;
    if (isRepo) {
      // Fetch latest changes
      result = await executeGitCommand('git fetch --all', repoPath);
    } else {
      // Clone the repository
      const authUrl = url.replace('https://', `https://${token}@`);
      result = await executeGitCommand(`git clone ${authUrl} .`, repoPath);
    }
    
    event.reply('repo-initialized', result);
  } catch (error) {
    event.reply('repo-initialized', { 
      success: false, 
      output: '', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Check environment status
ipcMain.on('check-environment-status', async (event, env) => {
  try {
    const branch = userSettings.environmentMappings[env];
    
    // Make sure we're on the right branch
    await executeGitCommand(`git checkout ${branch}`, repoPath);
    await executeGitCommand('git pull', repoPath);
    
    // Get current HEAD commit
    const headResult = await executeGitCommand('git rev-parse HEAD', repoPath);
    const headCommit = headResult.output.trim();
    
    // Check if tag exists
    const tagExists = await executeGitCommand(`git tag -l ${env}`, repoPath);
      let lastDeployedCommit: string | null = null;
    let status: string = 'up-to-date';
    
    if (tagExists.output.trim()) {
      // Get commit for tag
      const tagCommitResult = await executeGitCommand(`git rev-parse ${env}`, repoPath);
      lastDeployedCommit = tagCommitResult.output.trim() || null;
      
      // Check if there are commits between tag and HEAD
      const diffResult = await executeGitCommand(`git log ${env}..HEAD --oneline`, repoPath);
      
      if (diffResult.output.trim()) {
        status = 'pending-commits';
      }
    } else {
      status = 'pending-commits';
    }
    
    event.reply(`${env}-status-checked`, { 
      success: true, 
      output: JSON.stringify({
        name: env,
        branch,
        status,
        lastDeployedCommit,
        currentHeadCommit: headCommit
      })
    });
  } catch (error) {
    event.reply(`${env}-status-checked`, { 
      success: false, 
      output: '', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Deploy to environment
ipcMain.on('deploy-to-environment', async (event, env) => {
  try {
    const branch = userSettings.environmentMappings[env];
    
    // Make sure we're on the right branch
    await executeGitCommand(`git checkout ${branch}`, repoPath);
    await executeGitCommand('git pull', repoPath);
    
    // Delete existing tag if it exists
    const tagExists = await executeGitCommand(`git tag -l ${env}`, repoPath);
    if (tagExists.output.trim()) {
      await executeGitCommand(`git tag -d ${env}`, repoPath);
      await executeGitCommand(`git push origin :refs/tags/${env}`, repoPath);
    }
    
    // Create new tag
    await executeGitCommand(`git tag -a ${env} -m "Deployed to ${env} on ${new Date().toISOString()}"`, repoPath);
    
    // Push tag
    const pushResult = await executeGitCommand(`git push origin ${env}`, repoPath);
    
    event.reply(`${env}-deployed`, { 
      success: true, 
      output: pushResult.output
    });
  } catch (error) {
    event.reply(`${env}-deployed`, { 
      success: false, 
      output: '', 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Get commits between tag and HEAD
ipcMain.on('get-commits-between-tag-and-head', async (event, env) => {
  try {
    const branch = userSettings.environmentMappings[env];
    
    // Make sure we're on the right branch
    await executeGitCommand(`git checkout ${branch}`, repoPath);
    await executeGitCommand('git pull', repoPath);
    
    // Check if tag exists
    const tagExists = await executeGitCommand(`git tag -l ${env}`, repoPath);
    
    let commits: any[] = [];
    
    if (tagExists.output.trim()) {
      // Get commits between tag and HEAD
      const logFormat = '--pretty=format:{"hash":"%h","message":"%s","author":"%an","timestamp":"%ad"}';
      const logResult = await executeGitCommand(`git log ${env}..HEAD ${logFormat} --date=iso`, repoPath);
      
      if (logResult.output.trim()) {
        // Parse the JSON objects
        commits = logResult.output
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
      }
    }
    
    event.reply(`${env}-commits-retrieved`, commits);
  } catch (error) {
    event.reply(`${env}-commits-retrieved`, [] as any[]);
  }
});

// Settings IPC handlers
ipcMain.on('save-settings', (event, settings: UserSettings) => {
  userSettings = settings;
  // Save settings to store for persistence
  (store as any).set('githubToken', settings.githubToken);
  (store as any).set('repositoryUrl', settings.repositoryUrl);
  (store as any).set('environmentMappings', settings.environmentMappings);
  event.reply('settings-saved', true);
});

ipcMain.on('load-settings', (event) => {
  event.reply('settings-loaded', userSettings);
});

ipcMain.on('update-environment-mapping', (event, { env, branch }) => {
  if (userSettings.environmentMappings) {
    userSettings.environmentMappings[env] = branch;
    // Save updated settings to store
    (store as any).set('environmentMappings', userSettings.environmentMappings);
    event.reply('mapping-updated', true);
  } else {
    event.reply('mapping-updated', false);
  }
});

// Check all environments status
ipcMain.on('check-all-environments', async (event) => {
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
        await executeGitCommand(`git checkout ${branch}`, repoPath);
        await executeGitCommand('git pull', repoPath);
        
        // Get current HEAD commit
        const headResult = await executeGitCommand('git rev-parse HEAD', repoPath);
        const headCommit = headResult.output.trim();
          // Check if tag exists
        const tagExists = await executeGitCommand(`git tag -l ${env}`, repoPath);
        
        let lastDeployedCommit: string | null = null;
        let status = 'up-to-date';
        
        if (tagExists.output.trim()) {
          // Get commit for tag
          const tagCommitResult = await executeGitCommand(`git rev-parse ${env}`, repoPath);
          lastDeployedCommit = tagCommitResult.output.trim() || null;
          
          // Check if there are commits between tag and HEAD
          const diffResult = await executeGitCommand(`git log ${env}..HEAD --oneline`, repoPath);
          
          if (diffResult.output.trim()) {
            status = 'pending-commits';
          }
        } else {
          status = 'pending-commits';
        }
        
        results.push({
          name: env,
          branch,
          status,
          lastDeployedCommit,
          currentHeadCommit: headCommit
        });
      } catch (error) {
        results.push({
          name: env,
          branch,
          status: 'error',
          lastDeployedCommit: null,
          currentHeadCommit: null,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    event.reply('all-environments-checked', { 
      success: true, 
      environments: results 
    });
  } catch (error) {
    event.reply('all-environments-checked', { 
      success: false, 
      environments: [], 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

// Deploy all outdated environments
ipcMain.on('deploy-all-outdated', async (event) => {
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
        await executeGitCommand(`git checkout ${branch}`, repoPath);
        await executeGitCommand('git pull', repoPath);
        
        // Check if tag exists
        const tagExists = await executeGitCommand(`git tag -l ${env}`, repoPath);
        let needsDeployment = false;
        
        if (tagExists.output.trim()) {
          // Check if there are commits between tag and HEAD
          const diffResult = await executeGitCommand(`git log ${env}..HEAD --oneline`, repoPath);
          needsDeployment = diffResult.output.trim().length > 0;
        } else {
          needsDeployment = true;
        }
        
        if (needsDeployment) {
          // Delete existing tag if it exists
          if (tagExists.output.trim()) {
            await executeGitCommand(`git tag -d ${env}`, repoPath);
            await executeGitCommand(`git push origin :refs/tags/${env}`, repoPath);
          }
          
          // Create new tag
          await executeGitCommand(`git tag -a ${env} -m "Deployed to ${env} on ${new Date().toISOString()}"`, repoPath);
          
          // Push tag
          const pushResult = await executeGitCommand(`git push origin ${env}`, repoPath);
          
          results.push({
            name: env,
            deployed: true,
            output: pushResult.output
          });
        } else {
          results.push({
            name: env,
            deployed: false,
            output: 'Environment is already up to date.'
          });
        }
      } catch (error) {
        results.push({
          name: env,
          deployed: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    event.reply('all-outdated-deployed', { 
      success: true, 
      deployments: results 
    });
  } catch (error) {
    event.reply('all-outdated-deployed', { 
      success: false, 
      deployments: [], 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});
