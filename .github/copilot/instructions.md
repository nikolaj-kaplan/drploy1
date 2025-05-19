# Copilot Instructions

When writing code or terminal commands:

1. Use PowerShell syntax for terminal commands
2. Do not use `&&` in PowerShell commands; instead use separate commands or PowerShell-specific syntax like semicolons
3. Make sure all commands are compatible with Windows environment
4. Always double-check if files and folders already exist before creating new ones
5. Use appropriate tools to inspect the workspace before suggesting to create new files

# Application Description (User Perspective)

## 1. Startup and Authentication

- On first launch, the application prompts the user to enter a **GitHub Personal Access Token (PAT)**.
- The user is asked to input the **HTTPS URL** of the repository to work with.
- After submitting, the application **clones the repository** to a local folder.

---

## 2. Main View: Environment Overview

Displays a table with the following columns per environment:

- **Environment name** (e.g., `dev-test`, `test`, `preprod`, `prod`)
- **Mapped branch name** (e.g., `release/mp6`)
- **Status indicator**:
  - Green if environment is up to date
  - Red if there are pending commits
- **Last deployed commit** (tag currently applied)
- **Current HEAD commit** of the mapped branch
- **Actions**:
  - `Details` button — opens a view with commit details
  - `Deploy` button — deploys the latest commit by tagging it

---

## 3. Get Status

- Clicking “Get Status” retrieves all commits between the currently deployed tag and the latest HEAD of the mapped branch.
- If there are commits not yet deployed, the status icon turns red.
- Status can be checked per environment or across all environments at once.

---

## 4. Details View

Clicking “Details” for an environment shows:

- List of all pending commits (those that would be deployed)
- Each commit includes:
  - Commit message
  - Commit hash
  - Author
  - Timestamp

---

## 5. Deploy to Environment

- Clicking “Deploy” applies a Git tag using the environment name (e.g., `prod`) to the current HEAD of the mapped branch.
- The tag is pushed to the remote.
- After deployment, the UI updates to reflect the new status.
- Note that the tag needs to be deleted and the recreated, since the same tag string is used for each deploy.

---

## 6. Batch Operations

- A button to **check status for all environments** at once.
- A button to **deploy all out-of-date environments** in a single click.

---

## 7. Branch-to-Environment Mapping

- A settings view allows the user to manage which branch is mapped to each environment.
- Mappings can be edited and saved persistently.

---

## 8. PAT and Repo Management

- The user can reset or update:
  - GitHub Personal Access Token (PAT)
  - Repository URL
- These settings are accessible from a settings or preferences menu.

---

## 9. Visual Feedback

- Git operations (clone, status, deploy) show live output in a **log panel**.
- The UI displays success, error, or warning messages with:
  - Icons
  - Colors
  - Toast notifications
