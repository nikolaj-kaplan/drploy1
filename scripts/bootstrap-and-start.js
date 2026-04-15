#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function printHeader() {
  console.log("===========================================");
  console.log("   DR Deploy - Auto Update and Start");
  console.log("===========================================");
  console.log("");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: true,
  });

  return {
    status: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error,
  };
}

function fail(message, details) {
  console.error(message);
  if (details) {
    console.error(details);
  }
  process.exit(1);
}

function hasUpdates(gitPullOutput) {
  return !/Already up[ -]to[ -]date\.?/i.test(gitPullOutput);
}

function main() {
  printHeader();

  console.log("Pulling latest changes from git...");
  const pullResult = run("git", ["pull"], { capture: true });
  const pullOutput = `${pullResult.stdout}${pullResult.stderr}`;

  if (pullResult.error) {
    fail("ERROR: Failed to execute git pull.", String(pullResult.error));
  }

  if (pullResult.status !== 0) {
    fail("ERROR: Failed to pull from git. Please check your git setup.", pullOutput.trim());
  }

  let skipNpm = true;
  if (hasUpdates(pullOutput)) {
    console.log("Updates found. Running npm install...");
    skipNpm = false;
  } else {
    console.log("No updates found. Skipping npm install.");
  }

  if (!fs.existsSync(path.join(process.cwd(), "node_modules"))) {
    console.log("Dependencies not found - node_modules is missing. Running npm install...");
    skipNpm = false;
  }

  console.log("");
  if (!skipNpm) {
    console.log("Installing/updating dependencies...");
    const hasPnpm = run("pnpm", ["--version"], { capture: true }).status === 0;
    const pkgManager = hasPnpm ? "pnpm" : "npm";
    const installArgs = hasPnpm ? ["install"] : ["install", "--no-package-lock"];
    const installResult = run(pkgManager, installArgs, { capture: true });
    if (installResult.stdout) process.stdout.write(installResult.stdout);
    if (installResult.stderr) process.stderr.write(installResult.stderr);
    if (installResult.error || installResult.status !== 0) {
      fail("ERROR: Failed to install dependencies.", installResult.error ? String(installResult.error) : "");
    }
  } else {
    console.log("Skipping npm install - no updates were pulled.");
  }

  console.log("");
  console.log("Starting the application...");
  const startResult = run("npm", ["start"]);

  if (startResult.error) {
    fail("ERROR: Failed to start the application.", String(startResult.error));
  }

  process.exit(startResult.status);
}

main();
