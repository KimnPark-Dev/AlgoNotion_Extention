# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AlgoNotion is a Chrome extension (Manifest V3) that detects accepted submissions on Baekjoon Online Judge (백준) and uploads them to a Notion database. It enriches submissions with problem metadata from solved.ac.

## Development Setup

No build step required. This is pure vanilla JavaScript with no npm dependencies.

To load the extension in Chrome:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory

To reload after changes: click the refresh icon on `chrome://extensions`.

## Architecture

### Data Flow

```
Baekjoon status page (acmicpc.net/status)
  → content/baekjoon_content.js (DOM polling every 2s)
    → detects "맞았습니다!!" (Accepted) rows
    → injects "Notion 업로드" buttons
    → fetches source code from acmicpc.net/source/download/{submissionId}
    → chrome.runtime.sendMessage("BAEKJOON_AC_SUBMISSION")
      → background/service_worker.js
        → solved.ac API (problem title + tier)
        → scripts/language_normalizer.js (normalize language string)
        → scripts/payload_builder.js (build webhook JSON)
        → scripts/api_client.js → POST to backend (http://43.201.46.22:8000/webhook)
          → Backend calls Notion API
```

### Module Roles

- **[content/baekjoon_content.js](content/baekjoon_content.js)**: Content script. Handles all DOM interaction, button injection, source code fetching with retry logic (5 retries, exponential backoff), and deduplication via `algonotion_uploaded_ids` in `chrome.storage.local`.
- **[background/service_worker.js](background/service_worker.js)**: Service worker. Orchestrates the upload pipeline — fetches metadata, builds payload, POSTs to backend.
- **[scripts/api_client.js](scripts/api_client.js)**: Calls solved.ac API and backend webhook.
- **[scripts/language_normalizer.js](scripts/language_normalizer.js)**: Maps raw Baekjoon language strings (e.g. "Python 3/수정", "C++17") to normalized keys.
- **[scripts/payload_builder.js](scripts/payload_builder.js)**: Constructs the webhook JSON. Converts solved.ac numeric tier levels (1–30) to tier name strings (Bronze V → Ruby I).
- **[options/options.js](options/options.js)**: Extracts Notion Database ID from various URL formats. Saves to `chrome.storage.local`.

### Chrome Storage Keys

| Key | Purpose |
|-----|---------|
| `algonotion_notion_token` | Notion Integration secret |
| `algonotion_notion_database_id` | Target Notion database ID |
| `algonotion_uploaded_ids` | Array of already-uploaded submission IDs (deduplication) |

### Network Rules

[rules.json](rules.json) contains a declarative net request rule that modifies headers on XHR requests from acmicpc.net, setting `sec-fetch-dest: document` and `sec-fetch-mode: navigate` to allow source code downloads.

## Branch & Commit Conventions

- `main` — production (no direct pushes)
- `develop` — integration branch
- `feat/xxx` — feature branches
- `fix/xxx` — bugfix branches

Commit message prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`

PR target: `develop` branch (not `main` directly).
