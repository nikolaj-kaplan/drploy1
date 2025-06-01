import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getCurrentRepoPath } from "./settings";
import { logMessage } from "./logger";
import { QueuedCommand, CommandResult } from "./types";

// Global command queue and processing flag
const gitCommandQueue: QueuedCommand[] = [];
let isProcessingQueue = false;

/**
 * Process the next command in the queue
 */
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
        const lines = stdout.split("\n").filter((line) => line.trim());
        if (lines.length <= 1) logMessage(`Command output: ${stdout}`);
        else
          logMessage(
            `Command output:\n${lines.map((x) => "   " + x).join("\n")}`
          );
        resolve({ success: true, output: stdout });
      }

      // Process the next command after a small delay to prevent rapid consecutive executions
      isProcessingQueue = false;
      setTimeout(() => processGitCommandQueue(), 100);
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logMessage(`Exception executing command: ${errorMsg}`, true);
    resolve({ success: false, output: "", error: errorMsg });
    isProcessingQueue = false;
    setTimeout(() => processGitCommandQueue(), 100);
  }
}

/**
 * Execute a Git command and return the result
 */
export function executeGitCommand(
  command: string,
  cwd: string = getCurrentRepoPath()
): Promise<CommandResult> {
  return new Promise((resolve) => {
    gitCommandQueue.push({ command, cwd, resolve });
    processGitCommandQueue();
  });
}
