# Graider RC1 Start Here

Graider is a macOS desktop app for faculty using GitHub-based course
assignments. It opens a local course repository folder, shows course and
assignment readiness, previews repository setup, dispatches grading workflows,
tracks grading status, and renders faculty reports.

## What You Need

- `Graider.app`
- GitHub authentication through GitHub CLI
- A local course repository folder with `course.yml` at the root

## What You Do Not Need

- Node.js or npm
- Vite or Electron development mode
- A separate external Graider CLI install

## Setup

1. Open Terminal and run this once:

   ```bash
   gh auth login
   ```

2. Launch `Graider.app`.
3. Confirm the dashboard shows `GitHub authentication: Connected`.
4. Open your local course repository folder.
5. Use the workflow:

   ```text
   Dashboard
   -> Assignment Detail
   -> Apply Preview / Confirm Apply
   -> Grade Dispatch Preview / Confirm Grade Dispatch
   -> Grade Status
   -> Faculty Report
   ```

If a private GitHub link opens as a 404 page, sign into GitHub in your browser
with the same account used for `gh auth login`.
