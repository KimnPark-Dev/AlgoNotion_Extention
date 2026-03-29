# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AlgoNotion is a Chrome extension (Manifest V3) that detects accepted submissions on Baekjoon Online Judge (백준) and SWEA (Samsung SW Expert Academy), then uploads them to a Notion database. Baekjoon submissions are enriched with problem metadata from solved.ac.

## Development Setup

No build step required. This is pure vanilla JavaScript with no npm dependencies.

To load the extension in Chrome:
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select this directory

To reload after changes: click the refresh icon on `chrome://extensions`.

## Architecture

### Data Flow

**Baekjoon**
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
        → scripts/payload_builder.js (build analyze JSON)
        → scripts/api_client.js → POST to backend (https://algonotion.site/analyze)
          → scripts/notion_client.js → POST to Notion API (api.notion.com/v1/pages)
```

**SWEA**
```
SWEA problem detail page (swexpertacademy.com/main/code/problem/problemDetail.do)
  → content/swea_content.js (DOM polling every 2s)
    → detects "Pass" rows in submission list
    → injects "Notion 업로드" buttons next to "코드보기" links
    → fetches source code from submitCodePopup.do
      (tries: .CodeMirror-code lines → textarea.value → pre.textContent)
    → chrome.runtime.sendMessage("SWEA_AC_SUBMISSION")
      → background/service_worker.js
        → scripts/language_normalizer.js (normalize SWEA language string)
        → scripts/payload_builder.js (buildSweaWebhookPayload)
        → scripts/api_client.js → POST to backend (https://algonotion.site/analyze)
          → scripts/notion_client.js → POST to Notion API (api.notion.com/v1/pages)
```

### Module Roles

- **[content/baekjoon_content.js](content/baekjoon_content.js)**: Content script. Handles all DOM interaction, button injection, source code fetching with retry logic (5 retries, exponential backoff), and deduplication via `algonotion_uploaded_ids` in `chrome.storage.local`.
- **[content/swea_content.js](content/swea_content.js)**: Content script for SWEA. Polls for "Pass" rows, injects upload buttons, fetches source code from the code view popup (with multiple fallback strategies), and deduplicates via `algonotion_swea_uploaded_ids` in `chrome.storage.local`.
- **[background/service_worker.js](background/service_worker.js)**: Service worker. Handles both `BAEKJOON_AC_SUBMISSION` and `SWEA_AC_SUBMISSION` messages — fetches metadata, calls `/analyze`, then saves to Notion directly.
- **[scripts/api_client.js](scripts/api_client.js)**: Calls solved.ac API (`fetchSolvedAcProblem`) and backend `/analyze` endpoint (`postToAnalyze`).
- **[scripts/notion_client.js](scripts/notion_client.js)**: Calls Notion API directly (`postToNotionPage`). Builds page properties and children blocks from the analyze response. Handles rich_text 2000-char chunking for code blocks.
- **[scripts/language_normalizer.js](scripts/language_normalizer.js)**: Maps raw language strings from both Baekjoon (e.g. "Python 3/수정", "C++17") and SWEA (e.g. "JAVA (OpenJDK 8)") to normalized keys.
- **[scripts/payload_builder.js](scripts/payload_builder.js)**: Constructs `/analyze` request JSON. `buildWebhookPayload` converts solved.ac tier levels (1–30) to strings (Bronze V → Ruby I). `buildSweaWebhookPayload` sets level/memory/time to null.
- **[options/options.js](options/options.js)**: Extracts Notion Database ID from various URL formats. Saves to `chrome.storage.local`.

### Chrome Storage Keys

| Key | Purpose |
|-----|---------|
| `algonotion_notion_token` | Notion Integration secret (used by notion_client.js directly) |
| `algonotion_notion_database_id` | Target Notion database ID |
| `algonotion_user_name` | User display name written to the `유저` select property |
| `algonotion_uploaded_ids` | Array of already-uploaded Baekjoon submission IDs (deduplication) |
| `algonotion_swea_uploaded_ids` | Array of already-uploaded SWEA contestHistoryIds (deduplication) |

### Network Rules

[rules.json](rules.json) contains a declarative net request rule that modifies headers on XHR requests from acmicpc.net, setting `sec-fetch-dest: document` and `sec-fetch-mode: navigate` to allow source code downloads.

## Branch & Commit Conventions

- `main` — production (no direct pushes)
- `develop` — integration branch
- `feat/xxx` — feature branches
- `fix/xxx` — bugfix branches

Commit message prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`

PR target: `develop` branch (not `main` directly).
