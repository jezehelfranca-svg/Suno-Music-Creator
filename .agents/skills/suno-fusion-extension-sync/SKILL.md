---
name: Suno Fusion Extension Sync
description: Complete workflow for synchronizing newly generated AI bands and fusions from the Genre-Fusion-Lab and Fictional-Bands repositories into the Suno Fusion Chrome & Edge Extension and Web Studio. Ingests band markdown profiles, updates the creations database (1,500+ bands) with creation date/time tracking, highlights new entries (🆕 NEW · Date/Time), indexes 1,561+ instruments across 11 categories, runs pre-flight syntax checks, compiles the extension package, updates C:\Documents\suno-fusion-extension.zip, and executes production builds. Trigger when the user wants to update the extension, sync new genre fusion lab bands, track new entries with date and time, rebuild the creation database, update instruments, package suno-fusion-extension.zip, run a daily update, or reload the Suno extension in Microsoft Edge or Chrome.
---

# Suno Fusion Extension & Database Sync Workflow

Automates the complete synchronization pipeline: **pull fusions -> parse profiles -> timestamp & flag new entries -> rebuild creations DB -> re-index instruments & taxonomy -> verify JS syntax -> package Chrome & Edge extension ZIP -> build production web app -> deploy artifacts**.

### 🆕 Date & Time Tracking for New Entries
Every loaded entry now includes:
- **`createdAt`**: Exact ISO 8601 generation timestamp (e.g. `2026-09-28T14:03:56.970Z`).
- **`formattedDate`**: Human-readable date and time (e.g. `Sep 28, 2026 11:03 PM`).
- **`shortDate`**: Compact label for dropdowns and badges (e.g. `Sep 28 11:03 PM`).
- **`isNew`**: Automatically flags entries generated in the last 7 days (`🆕 NEW`).
- **New Entries Group in Dropdowns**: A dedicated `✨ NEWLY ADDED ENTRIES` optgroup appears at the top of the Studio Creations dropdown, listing newest fusions first with their timestamp.
- **Library Cards & Web Studio**: Display green `🆕 Sep 28, 11:03 PM` badges on every recent card so you instantly recognize new additions.

---

## Quick Start (One Command)

To run the entire end-to-end sync and build pipeline:

```powershell
node "C:\Documents\suno-fusion-extension\scripts\sync-and-build.js"
```
Or via npm inside `C:\Documents\suno-fusion-extension`:
```powershell
npm run sync
```

### Fast Extension-Only Sync (Skips Vite web build)
When only updating the Chrome/Edge Extension database and packaging `suno-fusion-extension.zip`:
```powershell
node "C:\Documents\suno-fusion-extension\scripts\sync-and-build.js" --skip-web
```
Or:
```powershell
npm run sync:fast
```

### Sync & Launch Microsoft Edge
Runs the sync pipeline and automatically launches Edge directly to `edge://extensions`:
```powershell
node "C:\Documents\suno-fusion-extension\scripts\sync-and-build.js" --edge
```
Or:
```powershell
npm run sync:edge
```

### Remote Git Pull + Sync
Pull the latest commits from both `Fictional-Bands` and `Genre-Fusion-Lab` before syncing:
```powershell
node "C:\Documents\suno-fusion-extension\scripts\sync-and-build.js" --pull
```
Or:
```powershell
npm run sync:pull
```

---

## Microsoft Edge Reloading Guide

You have two simple ways to reload the Suno Fusion extension in Microsoft Edge:

### Method A: Instant 1-Click Reload in Edge Side Panel (Fastest!)
The extension features a dedicated **↻ Reload** button built directly into the header bar of both the Side Panel and Popup.
1. Open the **Suno Fusion Side Panel** in Edge.
2. In the top header bar (next to `↗ Open Suno`), click the **`↻ Reload`** button.
3. The extension immediately:
   - Queries and automatically refreshes all open `suno.com` tabs.
   - Calls `chrome.runtime.reload()`, updating the extension in place with the latest database and code.

### Method B: Via Microsoft Edge Extensions Manager
1. In Microsoft Edge, open: `edge://extensions/` (or run `npm run sync:edge`).
2. Ensure **Developer mode** toggle in the left sidebar menu is turned **ON**.
3. Under *Installed extensions*, locate **Suno Fusion - Studio & AutoFill Sidekick**.
4. Click the **↻ (Reload)** button on the extension card.
5. Switch to your Suno tab (`https://suno.com/create`) and press **F5** to reload.

---

## What the Pipeline Does

The orchestrator (`scripts/sync-and-build.js`) executes across 8 standardized phases:

```
Step 1: Remote Sync (Optional --pull)
  • Pulls latest git commits from Fictional-Bands & Genre-Fusion-Lab

Step 2: Ingest & Rebuild Creations Database with Timestamps
  • Ingests Markdown profiles (1,500+ band profiles)
  • Extracts file mtimes and embedded ISO dates
  • Annotates each entry with createdAt, formattedDate, shortDate, isNew
  • Generates src/data/creations.json, extension/data/creations.json, metadata.json

Step 3: Validate Instruments & Genre Taxonomy
  • Verifies 1,561+ instruments catalog (11 categories)
  • Validates 374 genres taxonomy (98 coined, 8.6M fusions)

Step 4: Pre-flight Integrity & Syntax Gate
  • Runs node -c on content.js, popup.js, background.js

Step 5: Package Extension Bundle (ZIP)
  • Bundles extension/ directory into a production ZIP
  • Synchronizes manifest.json
  • Writes public/suno-fusion-extension.zip and C:\Documents\suno-fusion-extension.zip

Step 6: Web Application Build (Optional --skip-web)
  • Compiles Vite production bundle & Node server

Step 7: Edge Browser Launch (Optional --edge)
  • Opens edge://extensions in Microsoft Edge

Step 8: Verification & Reporting
  • Reports total bands ingested, new entries count, sync timestamp
```

---

## Directory & File Locations

| Component | Path | Description |
|---|---|---|
| Extension Project | `C:\Documents\suno-fusion-extension` | Main workspace & extension source |
| Fictional Bands | `D:\Applications\Fictional-Bands` | Generated band profiles repository |
| Genre Fusion Lab | `D:\Applications\Genre-Fusion-Lab` | AI fusion generator engine |
| Creations DB | `C:\Documents\suno-fusion-extension\src\data\creations.json` | Web app creations database with dates |
| Extension DB | `C:\Documents\suno-fusion-extension\extension\data\creations.json` | Extension JSON database with dates |
| Extension Script DB | `C:\Documents\suno-fusion-extension\extension\data\creations.js` | `window.SUNO_CREATIONS_DATABASE` + `METADATA` |
| Instruments DB | `C:\Documents\suno-fusion-extension\extension\data\instruments.js` | 1,561 instruments catalog |
| Packaged ZIP (Public) | `C:\Documents\suno-fusion-extension\public\suno-fusion-extension.zip` | Web download endpoint |
| Packaged ZIP (Root) | `C:\Documents\suno-fusion-extension.zip` | Direct user install archive |