// DOM 선택자: 테이블만 고정하고, 컬럼 인덱스는 헤더 파싱으로 동적 결정
const STATUS_TABLE_SELECTOR = "#status-table";
const TABLE_BODY_ROW_SELECTOR = "tbody tr";

// 헤더 텍스트 → 컬럼 키 매핑 (공백/대소문자 무시하고 매칭)
const HEADER_KEYS = {
  "제출 번호": "submissionId",
  문제: "problemId",
  결과: "result",
  메모리: "memory",
  시간: "time",
  언어: "language",
  아이디: "userId",
};

const AC_TEXT_KEYWORD = "맞았습니다!!";
const AC_CLASS_NAME = "ac";

const SOURCE_FETCH_MAX_RETRIES = 5;
const SOURCE_FETCH_RETRY_DELAYS_MS = [1000, 1500, 2500, 4000, 6000];

const UPLOADED_IDS_KEY = 'algonotion_uploaded_ids';
const DEV_ALLOW_REUPLOAD_KEY = 'algonotion_dev_allow_reupload';

const processedSubmissionIds = new Set();
const uploadButtonStateBySubmissionId = new Map();
let pollingIntervalId = null;
let devAllowReupload = false;

async function loadUploadedIds() {
  const st = await chrome.storage.local.get([UPLOADED_IDS_KEY, DEV_ALLOW_REUPLOAD_KEY]);
  devAllowReupload = !!st[DEV_ALLOW_REUPLOAD_KEY];
  if (devAllowReupload) {
    console.log('[AlgoNotion] 🔓 dev mode: 재업로드 허용');
    return;
  }
  const ids = st[UPLOADED_IDS_KEY] || [];
  ids.forEach((id) => {
    processedSubmissionIds.add(id);
    setUploadButtonState(id, 'done');
  });
}

async function saveUploadedId(submissionId) {
  if (devAllowReupload) return;
  const st = await chrome.storage.local.get(UPLOADED_IDS_KEY);
  const ids = st[UPLOADED_IDS_KEY] || [];
  if (!ids.includes(submissionId)) {
    ids.push(submissionId);
    await chrome.storage.local.set({ [UPLOADED_IDS_KEY]: ids });
  }
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * 테이블의 첫 번째 행(thead tr 또는 tbody의 첫 행)에서 헤더 텍스트를 읽어
 * '제출 번호', '문제', '결과', '메모리', '시간', '언어'의 컬럼 인덱스(1-based) 맵을 반환한다.
 * @param {HTMLTableElement} table
 * @returns {Record<string, number> | null} { submissionId: 1, problemId: 3, ... } 또는 null
 */
function parseTableHeader(table) {
  const theadRow = table.querySelector("thead tr");
  const headerRow = theadRow || table.querySelector("tbody tr");
  if (!headerRow) return null;

  const cells = headerRow.querySelectorAll("th, td");
  const indexMap = {};

  for (let i = 0; i < cells.length; i++) {
    const text = (cells[i].textContent || "").trim();
    for (const [headerLabel, key] of Object.entries(HEADER_KEYS)) {
      if (text === headerLabel) {
        indexMap[key] = i; // 0-based 인덱스로 저장 (querySelectorAll 결과와 일치)
        break;
      }
    }
  }

  const required = [
    "submissionId",
    "problemId",
    "result",
    "memory",
    "time",
    "language",
  ];
  const hasAll = required.every((k) => indexMap[k] !== undefined);
  return hasAll ? indexMap : null;
}

/**
 * 숫자만 추출한다. "128 MB" → 128, "12 ms" → 12
 * @param {string} raw
 * @returns {number}
 */
function extractNumber(raw) {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  const num = parseInt(digits, 10);
  return Number.isNaN(num) ? 0 : num;
}

function isBaekjoonStatusPage() {
  return (
    window.location.hostname === "www.acmicpc.net" &&
    window.location.pathname.startsWith("/status")
  );
}

function isBaekjoonSubmitPage() {
  return (
    window.location.hostname === "www.acmicpc.net" &&
    window.location.pathname.startsWith("/submit/")
  );
}

function extractTextFromElement(el) {
  if (!el) return "";
  if ("value" in el && typeof el.value === "string") {
    return el.value;
  }
  return (el.textContent || "").trim();
}

function extractCodeFromCodeMirror(root) {
  if (!root) return "";
  const lines = root.querySelectorAll(".CodeMirror-line, .cm-line");
  if (!lines.length) return "";
  return Array.from(lines)
    .map((line) => line.textContent || "")
    .join("\n")
    .trim();
}

function extractCodeFromAce(root) {
  if (!root) return "";
  const lines = root.querySelectorAll(".ace_line");
  if (!lines.length) return "";
  return Array.from(lines)
    .map((line) => line.textContent || "")
    .join("\n")
    .trim();
}

function extractSubmitPageCodeFromDocument(root = document) {
  const directSelectors = [
    "textarea#source",
    "textarea[name='source']",
    "#source",
    "pre.prettyprint",
    "pre code",
    ".source-code",
  ];

  for (const selector of directSelectors) {
    const el = root.querySelector(selector);
    const text = extractTextFromElement(el);
    if (text.trim()) {
      return text;
    }
  }

  const codeMirrorRoot = root.querySelector(".CodeMirror");
  const codeMirrorText = extractCodeFromCodeMirror(codeMirrorRoot);
  if (codeMirrorText) {
    return codeMirrorText;
  }

  const aceRoot = root.querySelector(".ace_editor");
  const aceText = extractCodeFromAce(aceRoot);
  if (aceText) {
    return aceText;
  }

  return "";
}

function extractSubmitPageCode() {
  return extractSubmitPageCodeFromDocument(document);
}

function extractSubmitPageMeta() {
  const match = window.location.pathname.match(/^\/submit\/(\d+)\/(\d+)/);
  if (!match) return null;

  const [, problemId, submissionId] = match;
  const languageSelect =
    document.querySelector("select#language") ||
    document.querySelector("select[name='language']");
  const selectedLanguage =
    languageSelect?.selectedOptions?.[0]?.textContent ||
    languageSelect?.value ||
    "";

  return {
    submissionId,
    problemId,
    language: selectedLanguage.trim(),
    time: null,
    memory: null,
  };
}

/**
 * 백준 문제 페이지에서 문제 설명/입력/출력을 HTML 그대로 추출한다.
 * BaekjoonHub 방식과 동일하게 innerHTML을 사용 — GitHub 마크다운이 HTML 태그를 그대로 렌더링.
 * @param {string} problemId
 * @returns {Promise<{description: string, input: string, output: string} | null>}
 */
async function fetchProblemDetail(problemId) {
  try {
    const res = await fetch(`https://www.acmicpc.net/problem/${problemId}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const pick = (id) => {
      const el = doc.querySelector(`#${id}`);
      return el ? (el.innerHTML || '').trim() : '';
    };

    return {
      description: pick('problem_description'),
      input: pick('problem_input'),
      output: pick('problem_output'),
    };
  } catch (err) {
    console.warn('[AlgoNotion] 문제 상세 fetch 실패:', err?.message);
    return null;
  }
}

async function fetchSourceCodeFromSubmitPage(problemId, submissionId) {
  const url = `https://www.acmicpc.net/submit/${problemId}/${submissionId}`;

  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });
  const html = await res.text();

  if (!res.ok) {
    throw new Error(`Submit page fetch failed: ${res.status}`);
  }

  const parsed = new DOMParser().parseFromString(html, "text/html");
  const code = extractSubmitPageCodeFromDocument(parsed);

  if (!code.trim()) {
    throw new Error("Submit page fallback returned an empty code body");
  }

  return code;
}

function sendSubmissionMessage(meta, code) {
  const payload = { ...meta, code };
  chrome.runtime.sendMessage({
    type: "BAEKJOON_AC_SUBMISSION",
    payload,
  });
}

function sendSubmissionMessageAsync(meta, code) {
  return new Promise((resolve, reject) => {
    const payload = { ...meta, code };

    chrome.runtime.sendMessage(
      {
        type: "BAEKJOON_AC_SUBMISSION",
        payload,
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!response?.ok) {
          reject(new Error(response?.error || "Unknown background error"));
          return;
        }

        resolve(response);
      },
    );
  });
}

function getUploadButtonState(submissionId) {
  return uploadButtonStateBySubmissionId.get(submissionId) || "idle";
}

function setUploadButtonState(submissionId, state) {
  uploadButtonStateBySubmissionId.set(submissionId, state);
}

function ensureUploadButton(row, meta, colMap) {
  const cells = row.querySelectorAll("td");
  const resultCell = cells[colMap.result];
  if (!resultCell) return;
  if (resultCell.querySelector(".algonotion-upload-btn")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "algonotion-upload-btn";
  button.textContent = "업로드";
  button.style.marginLeft = "8px";
  button.style.padding = "2px 8px";
  button.style.fontSize = "12px";
  button.style.cursor = "pointer";
  button.style.border = "1px solid #2b6cb0";
  button.style.borderRadius = "4px";
  button.style.background = "#fff";
  button.style.color = "#2b6cb0";

  const syncButtonUI = () => {
    const state = getUploadButtonState(meta.submissionId);
    if (state === "uploading") {
      button.disabled = true;
      button.textContent = "업로드 중...";
      return;
    }
    if (state === "done") {
      button.disabled = true;
      button.textContent = "업로드 완료";
      button.style.borderColor = "#2f855a";
      button.style.color = "#2f855a";
      return;
    }
    if (state === "failed") {
      button.disabled = false;
      button.textContent = "다시 업로드";
      button.style.borderColor = "#c53030";
      button.style.color = "#c53030";
      return;
    }

    button.disabled = false;
    button.textContent = "업로드";
    button.style.borderColor = "#2b6cb0";
    button.style.color = "#2b6cb0";
  };

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (getUploadButtonState(meta.submissionId) === "uploading") return;

    try {
      setUploadButtonState(meta.submissionId, "uploading");
      syncButtonUI();

      let code;
      try {
        code = await fetchSourceCodeFromSubmitPage(meta.problemId, meta.submissionId);
      } catch {
        code = await fetchSourceCode(meta.submissionId);
      }

      // 문제 상세 페이지 HTML 파싱 (실패해도 업로드는 계속)
      const problemDetail = await fetchProblemDetail(meta.problemId);

      await sendSubmissionMessageAsync({ ...meta, problemDetail }, code);
      if (!devAllowReupload) processedSubmissionIds.add(meta.submissionId);
      await saveUploadedId(meta.submissionId);
      setUploadButtonState(meta.submissionId, devAllowReupload ? "idle" : "done");
      syncButtonUI();
    } catch (err) {
      console.error("[AlgoNotion] upload failed:", meta.submissionId, err?.message);
      setUploadButtonState(meta.submissionId, "failed");
      syncButtonUI();
    }
  });

  resultCell.appendChild(button);
  syncButtonUI();
}

function processSubmitPage() {
  const meta = extractSubmitPageMeta();
  if (!meta) return;
}

function isRowAccepted(row, colMap) {
  const idx = colMap.result;
  const cells = row.querySelectorAll("td");
  const resultCell = cells[idx];
  if (!resultCell) return false;

  const text = (resultCell.textContent || "").trim();
  const hasAcText = text.includes(AC_TEXT_KEYWORD);
  const hasAcClass = resultCell.classList.contains(AC_CLASS_NAME);
  if (hasAcText || hasAcClass) return true;

  // 부분 점수 문제: "100점" 형태로 표시되는 경우 점수 ≥ 40이면 허용
  const scoreMatch = text.match(/^(\d+)점$/);
  if (scoreMatch) {
    return parseInt(scoreMatch[1], 10) >= 40;
  }

  return false;
}

/**
 * 현재 로그인한 사용자 ID를 반환한다.
 * 1) URL 쿼리 ?user_id=xxx 우선
 * 2) 없으면 BOJ 상단 nav의 로그인 링크에서 추출
 * @returns {string | null}
 */
function getCurrentUser() {
  const params = new URLSearchParams(window.location.search);
  const userIdParam = params.get('user_id');
  if (userIdParam && userIdParam.trim()) return userIdParam.trim();

  // BOJ nav: <a href="/user/username"> 형태로 존재
  const navLink = document.querySelector('a[href^="/user/"]');
  if (navLink) {
    const match = navLink.getAttribute('href').match(/^\/user\/(.+)/);
    if (match) return match[1].trim();
  }

  return null;
}

function isRowFromCurrentUser(row, colMap) {
  const currentUser = getCurrentUser();
  if (!currentUser) return true; // 판별 불가 시 모두 허용

  const idx = colMap?.userId;
  if (idx === undefined) return true; // 컬럼 없으면 허용

  const cells = row.querySelectorAll('td');
  const userCell = cells[idx];
  if (!userCell) return true;

  const rowUser = (userCell.textContent || '').trim();
  return rowUser === currentUser;
}

/**
 * 한 행에서 메타데이터 추출. colMap은 0-based 인덱스 맵.
 */
function extractSubmissionMeta(row, colMap) {
  const cells = row.querySelectorAll("td");
  if (!cells.length) return null;

  const get = (key) => {
    const i = colMap[key];
    return i !== undefined ? (cells[i].textContent || "").trim() : "";
  };

  const submissionId = get("submissionId");
  const problemId = get("problemId");
  const language = get("language");
  const timeRaw = get("time");
  const memoryRaw = get("memory");

  if (!submissionId || !problemId || !language) return null;

  const time = extractNumber(timeRaw);
  const memory = extractNumber(memoryRaw);

  return {
    submissionId,
    problemId,
    language,
    time,
    memory,
  };
}

/**
 * submissionId로 소스 코드를 다운로드한다.
 * @param {string} submissionId
 * @returns {Promise<string>}
 */
async function fetchSourceCode(submissionId) {
  const url = `https://www.acmicpc.net/source/download/${submissionId}`;
  let lastError = null;

  for (let attempt = 1; attempt <= SOURCE_FETCH_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
      });
      const text = await res.text();
      const trimmed = text.trim();
      const contentType = res.headers.get("content-type");
      const isHtmlResponse =
        contentType?.includes("text/html") ||
        /^<!doctype html/i.test(trimmed) ||
        /^<html/i.test(trimmed);

      if (!res.ok) {
        throw new Error(`Source download failed: ${res.status}`);
      }

      if (!trimmed) {
        throw new Error("Source download returned an empty body");
      }

      if (isHtmlResponse) {
        throw new Error("Source download returned HTML instead of source code");
      }

      return text;
    } catch (err) {
      lastError = err;

      if (attempt < SOURCE_FETCH_MAX_RETRIES) {
        await sleep(SOURCE_FETCH_RETRY_DELAYS_MS[attempt - 1] ?? 3000);
      }
    }
  }

  throw lastError || new Error("Source fetch failed for an unknown reason");
}

/**
 * 채점 현황 테이블을 순회하며 새로운 AC 제출을 발견하면
 * 소스 코드를 다운로드한 뒤 meta에 합쳐 background로 전송한다.
 */
function pollStatusTable() {
  const table = document.querySelector(STATUS_TABLE_SELECTOR);
  if (!table) return;

  const colMap = parseTableHeader(table);
  if (!colMap) {
    return;
  }

  const rows = table.querySelectorAll(TABLE_BODY_ROW_SELECTOR);
  // 헤더가 tbody 첫 행일 수 있으므로, th가 있는 행은 스킵
  rows.forEach((row) => {
    if (row.querySelector("th")) return; // 헤더 행 스킵
    if (!isRowFromCurrentUser(row, colMap)) return;
    if (!isRowAccepted(row, colMap)) return;

    const meta = extractSubmissionMeta(row, colMap);
    if (!meta) return;
    ensureUploadButton(row, meta, colMap);
  });
}

function startPolling() {
  if (pollingIntervalId !== null) return;
  pollingIntervalId = window.setInterval(pollStatusTable, 2000);
}

if (isBaekjoonStatusPage()) {
  loadUploadedIds().then(() => startPolling());
} else if (isBaekjoonSubmitPage()) {
  processSubmitPage();
}
