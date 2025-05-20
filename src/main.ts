import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as os from 'os';
import Store from 'electron-store';
import { log } from 'console';

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

// Command queue for serializing Git operations
interface QueuedCommand {
  command: string;
  cwd: string;
  resolve: (value: { success: boolean; output: string; error?: string }) => void;
}

// Global command queue and processing flag
const gitCommandQueue: QueuedCommand[] = [];
let isProcessingQueue = false;

// Process the next command in the queue
async function processGitCommandQueue() {
  if (isProcessingQueue || gitCommandQueue.length === 0) {
    return;
  }
  
  isProcessingQueue = true;
  const { command, cwd, resolve } = gitCommandQueue.shift()!;
  
  logMessage(`Executing command: ${cwd}>${command}`);
  
  try {
    child_process.exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        const errorMsg = stderr || error.message;
        logMessage(`Command failed: ${errorMsg}`, true);
        resolve({ success: false, output: stdout, error: errorMsg });
      } else {
        logMessage(`Command succeeded: ${command}`);
        const lines = stdout.split('\n').filter(line => line.trim());
        if(lines.length <= 1) logMessage(`Command output: ${stdout}`);
        else logMessage(`Command output:\n${lines.map(x => "   " + x).join('\n')}`);
        resolve({ success: true, output: stdout });
      }
      
      // Process the next command after a small delay to prevent rapid consecutive executions
      isProcessingQueue = false;
      setTimeout(() => processGitCommandQueue(), 100);
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logMessage(`Exception executing command: ${errorMsg}`, true);
    resolve({ success: false, output: '', error: errorMsg });
    isProcessingQueue = false;
    setTimeout(() => processGitCommandQueue(), 100);
  }
}

// Logger for application events and errors
function logMessage(message: string, isError: boolean = false) {
  //const timestamp = new Date().toISOString();
  const logPrefix = isError ? '[ERROR]' : '[INFO]';
  const logMessage = `${logPrefix} ${message}`;
  
  console.log(logMessage);
  
  // Send log message to renderer process if main window exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log-message', {
      message: logMessage,
      isError
    });
  }
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

// Function to get the repository path for a specific repository URL
function getRepoPath(repoUrl: string): string {
  // Extract a unique name from the repository URL
  // We'll use the last part of the URL (repo name) and add a hash of the full URL
  const urlObj = new URL(repoUrl);
  const pathParts = urlObj.pathname.split('/').filter(p => p);
  
  // Get the repository name (last part of the path)
  const repoName = pathParts.length > 0 ? 
    pathParts[pathParts.length - 1].replace(/\.git$/, '') : 
    'default-repo';
  
  // Create a simple hash of the URL for uniqueness
  const hash = Buffer.from(repoUrl).toString('base64')
    .replace(/[/+=]/g, '').substring(0, 8);
  
  return path.join(os.homedir(), '.git-deployer', 'repositories', `${repoName}-${hash}`);
}

// Gets the actual repository path for the current settings
function getCurrentRepoPath(): string {
  if (!userSettings.repositoryUrl) {
    // If no repository URL is set, return a default path that we can create
    return path.join(os.homedir(), '.git-deployer', 'repositories', 'default-repo');
  }
  return getRepoPath(userSettings.repositoryUrl);
}

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
  logMessage('Application starting up');
  createWindow();

  // Ensure the base repository directory structure exists
  const baseRepoDir = path.join(os.homedir(), '.git-deployer', 'repositories');
  if (!fs.existsSync(baseRepoDir)) {
    try {
      fs.mkdirSync(baseRepoDir, { recursive: true });
      logMessage(`Created base repository directory: ${baseRepoDir}`);
    } catch (error) {
      logMessage(`Failed to create base repository directory: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  app.on('activate', () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (mainWindow === null) {
      logMessage('Re-creating application window');
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
function executeGitCommand(command: string, cwd: string = getCurrentRepoPath()): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    gitCommandQueue.push({ command, cwd, resolve });
    processGitCommandQueue();
  });
}

// Handle repository initialization
ipcMain.on('initialize-repository', async (event, { token, url }) => {
  try {
    logMessage(`Initializing repository: ${url}`);
    
    userSettings.githubToken = token;
    userSettings.repositoryUrl = url;
    
    // Save individual settings to electron-store
    store.set('githubToken', token);
    store.set('repositoryUrl', url);
    
    // Get the repository path for the current URL
    const repoPath = getCurrentRepoPath();
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(repoPath)) {
      logMessage(`Creating repository directory: ${repoPath}`);
      fs.mkdirSync(repoPath, { recursive: true });
    }
    
    // Check if repo exists already
    const isRepo = fs.existsSync(path.join(repoPath, '.git'));
    
    let result;
    if (isRepo) {
      logMessage('Repository already exists, fetching latest changes');
      // Fetch latest changes
      await executeGitCommand('git fetch --tags --force');
      result = await executeGitCommand('git fetch --all');
    } else {
      logMessage('Cloning repository for the first time');
      // Clone the repository
      const authUrl = url.replace('https://', `https://${token}@`);
      result = await executeGitCommand(`git clone ${authUrl} .`);
    }
    
    if (result.success) {
      logMessage('Repository initialization completed successfully');
    } else {
      logMessage(`Repository initialization failed: ${result.error}`, true);
    }
    
    event.reply('repo-initialized', result);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logMessage(`Exception during repository initialization: ${errorMsg}`, true);
    
    event.reply('repo-initialized', { 
      success: false, 
      output: '', 
      error: errorMsg
    });
  }
});

// Check environment status
ipcMain.on('check-environment-status', async (event, env) => {
  try {
    const branch = userSettings.environmentMappings[env];
    
    // Make sure we're on the right branch
    await executeGitCommand(`git checkout ${branch}`);
    await executeGitCommand('git pull');
    
    // Get current HEAD commit
    const headResult = await executeGitCommand('git rev-parse HEAD');
    const headCommit = headResult.output.trim();
    
    // Check if tag exists
    const tagExists = await executeGitCommand(`git tag -l ${env}`);
      let lastDeployedCommit: string | null = null;
    let status: string = 'up-to-date';
    
    if (tagExists.output.trim()) {
      // Get commit for tag
      const tagCommitResult = await executeGitCommand(`git rev-parse ${env}`);
      lastDeployedCommit = tagCommitResult.output.trim() || null;
      
      // Check if there are commits between tag and HEAD
      const diffResult = await executeGitCommand(`git log ${env}..HEAD --oneline`);
      
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
    await executeGitCommand(`git checkout ${branch}`);
    await executeGitCommand('git pull');
    
    // Delete existing tag if it exists
    const tagExists = await executeGitCommand(`git tag -l ${env}`);
    if (tagExists.output.trim()) {
      await executeGitCommand(`git tag -d ${env}`);
      await executeGitCommand(`git push origin :refs/tags/${env}`);
    }
    
    // Create new tag
    await executeGitCommand(`git tag -a ${env} -m "Deployed to ${env} on ${new Date().toISOString()}"`);
    
    // Push tag
    const pushResult = await executeGitCommand(`git push origin ${env}`);
    
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
    await executeGitCommand(`git checkout ${branch}`);
    await executeGitCommand('git pull');
    
    // Check if tag exists
    const tagExists = await executeGitCommand(`git tag -l ${env}`);
    
    let commits: any[] = [];
    
    if (tagExists.output.trim()) {
      // Get commits between tag and HEAD
      const logFormat = '--pretty=format:{"hash":"%h","message":"%s","author":"%an","timestamp":"%ad"}';
      const logResult = await executeGitCommand(`git log ${env}..HEAD ${logFormat} --date=iso`);
      
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
ipcMain.on('save-settings', async (event, settings: UserSettings) => {
  userSettings = settings;
  // Save settings to store for persistence
  store.set('githubToken', settings.githubToken);
  store.set('repositoryUrl', settings.repositoryUrl);
  store.set('environmentMappings', settings.environmentMappings);
  const repoPath = getCurrentRepoPath();

  // Create directory if it doesn't exist
  if (!fs.existsSync(repoPath)) {
    try {
      fs.mkdirSync(repoPath, { recursive: true });
      logMessage(`Created repository directory: ${repoPath}`);
    } catch (error) {
      logMessage(`Failed to create repository directory: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  // Initialize the repository if it doesn't exist
  if (!fs.existsSync(path.join(repoPath, '.git'))) {
    logMessage('Repository does not exist, initializing...');
    await executeGitCommand(`git clone ${settings.repositoryUrl} ${repoPath}`);
  } else {
    logMessage('Repository already exists, fetching latest changes');
    await executeGitCommand('git fetch --tags --force', repoPath);
  }

  event.reply('settings-saved', true);
});

ipcMain.on('load-settings', (event) => {
  event.reply('settings-loaded', userSettings);
});

ipcMain.on('update-environment-mapping', (event, { env, branch }) => {
  if (userSettings.environmentMappings) {
    userSettings.environmentMappings[env] = branch;
    // Save updated settings to store
    store.set('environmentMappings', userSettings.environmentMappings);
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
        await executeGitCommand(`git checkout ${branch}`);
        await executeGitCommand('git pull');
        
        // Get current HEAD commit
        const headResult = await executeGitCommand('git rev-parse HEAD');
        const headCommit = headResult.output.trim();
          // Check if tag exists
        const tagExists = await executeGitCommand(`git tag -l ${env}`);
        
        let lastDeployedCommit: string | null = null;
        let status = 'up-to-date';
        
        if (tagExists.output.trim()) {
          // Get commit for tag
          const tagCommitResult = await executeGitCommand(`git rev-parse ${env}`);
          lastDeployedCommit = tagCommitResult.output.trim() || null;
          
          // Check if there are commits between tag and HEAD
          const diffResult = await executeGitCommand(`git log ${env}..HEAD --oneline`);
          
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
        await executeGitCommand(`git checkout ${branch}`);
        await executeGitCommand('git pull');
        
        // Check if tag exists
        const tagExists = await executeGitCommand(`git tag -l ${env}`);
        let needsDeployment = false;
        
        if (tagExists.output.trim()) {
          // Check if there are commits between tag and HEAD
          const diffResult = await executeGitCommand(`git log ${env}..HEAD --oneline`);
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
          await executeGitCommand(`git tag -a ${env} -m "Deployed to ${env} on ${new Date().toISOString()}"`);
          
          // Push tag
          const pushResult = await executeGitCommand(`git push origin ${env}`);
          
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

// Handle logs from the renderer process
ipcMain.on('log-from-renderer', (_, { message, isError }) => {
  // Just use our standard logging function
  logMessage(message, isError);
});
