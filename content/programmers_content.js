// 프로그래머스(school.programmers.co.kr) 코딩 테스트 페이지 감지 및 Notion 업로드 버튼 주입

const UPLOADED_IDS_KEY = 'algonotion_programmers_uploaded_ids';
const POLL_INTERVAL_MS = 2000;

const processedIds = new Set();
const buttonStateMap = new Map();
let pollingIntervalId = null;

// ─── Storage ──────────────────────────────────────────────────────────────────

async function loadUploadedIds() {
  const st = await chrome.storage.local.get(UPLOADED_IDS_KEY);
  const ids = st[UPLOADED_IDS_KEY] || [];
  ids.forEach((id) => processedIds.add(String(id)));
}

async function saveUploadedId(id) {
  const st = await chrome.storage.local.get(UPLOADED_IDS_KEY);
  const ids = st[UPLOADED_IDS_KEY] || [];
  if (!ids.includes(String(id))) {
    ids.push(String(id));
    await chrome.storage.local.set({ [UPLOADED_IDS_KEY]: ids });
  }
}

// ─── Button state ─────────────────────────────────────────────────────────────

function getState(id) {
  return buttonStateMap.get(String(id)) || 'idle';
}

function setState(id, state) {
  buttonStateMap.set(String(id), state);
}

// ─── Submission ID ────────────────────────────────────────────────────────────

/**
 * URL의 lessons/{lessonId}를 기준으로 고유 ID를 만든다.
 * 같은 문제는 같은 ID → 이미 업로드한 문제는 '완료' 표시.
 */
function getLessonId() {
  const match = window.location.pathname.match(/lessons\/(\d+)/);
  return match ? match[1] : window.location.pathname.replace(/\W+/g, '_');
}

// ─── Metadata extraction ──────────────────────────────────────────────────────

/**
 * 문제 제목을 추출한다.
 * 프로그래머스 문제 페이지: <h1> 또는 .challenge-title 등
 */
function getProblemTitle() {
  const candidates = [
    'h1.challenge-title',
    '.challenge-title',
    'h1.title',
    'div[class*="title"] h1',
    'h1',
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.textContent || '').trim();
      if (text) return text;
    }
  }
  // 탭 타이틀에서 추출 ("문제명 | 프로그래머스")
  return document.title.replace(/\s*\|.*$/, '').trim() || '';
}

/**
 * 문제 레벨을 추출한다. e.g. "Lv.2"
 */
function getProblemLevel() {
  const candidates = [
    '[class*="level"]',
    '[class*="badge"]',
    'span.level',
    '.lv',
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.textContent || '').trim();
      const m = text.match(/Lv\.?\s*(\d)/i);
      if (m) return `Lv.${m[1]}`;
    }
  }
  // 페이지 전체 텍스트에서 최초 Lv.X 패턴 검색
  const bodyText = document.body.textContent || '';
  const m = bodyText.match(/Lv\.?\s*(\d)/i);
  return m ? `Lv.${m[1]}` : null;
}

/**
 * 선택된 언어를 추출한다.
 * 프로그래머스는 커스텀 드롭다운 또는 <select> 사용.
 */
function getSelectedLanguage() {
  // 1) <select> 방식
  const selectors = [
    'select[class*="language"]',
    'select[name="language"]',
    'select[id*="language"]',
    '.editor-header select',
    'select',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.selectedOptions?.[0]?.text || el.value || '').trim();
      if (text) return text;
    }
  }

  // 2) 커스텀 드롭다운 방식 (현재 선택된 항목 텍스트)
  const customSelected = document.querySelector(
    '[class*="selected-language"], [class*="language-selected"], [class*="select-language"] [class*="selected"]'
  );
  if (customSelected) {
    return (customSelected.textContent || '').trim();
  }

  return '';
}

// ─── Code extraction (Monaco Editor) ─────────────────────────────────────────

/**
 * MAIN world에서 실행 중인 programmers_monaco_bridge.js와 window 이벤트로 통신해
 * Monaco editor의 코드 값을 가져온다.
 * (CSP로 inline script 삽입이 차단되므로, 별도 MAIN world 스크립트를 사용)
 */
function getCodeFromMonaco() {
  return new Promise((resolve) => {
    const handler = (e) => resolve(e.detail || '');
    window.addEventListener('algonotion-code-response', handler, { once: true });
    window.dispatchEvent(new CustomEvent('algonotion-request-code'));
    setTimeout(() => resolve(''), 3000);
  });
}

/**
 * DOM 기반 폴백: Monaco의 .view-lines 또는 CodeMirror 라인에서 텍스트 추출.
 * JS가 실행되지 않은 정적 DOM에서 Monaco 텍스트를 읽는 방법.
 * (렌더링된 텍스트라 불완전할 수 있음 — Monaco 주입이 실패했을 때만 사용)
 */
function getCodeFromDom() {
  // Monaco view-lines
  const viewLines = document.querySelectorAll('.view-lines .view-line');
  if (viewLines.length) {
    return Array.from(viewLines)
      .map((l) => l.textContent)
      .join('\n');
  }

  // CodeMirror (혹시 구버전 에디터)
  const cmLines = document.querySelectorAll('.CodeMirror-line');
  if (cmLines.length) {
    return Array.from(cmLines)
      .map((l) => l.textContent.replace(/\u200b/g, ''))
      .join('\n');
  }

  // textarea 폴백
  const textarea = document.querySelector('textarea.code, textarea#code, textarea[name="code"]');
  if (textarea?.value?.trim()) return textarea.value;

  return '';
}

// ─── Message to background ────────────────────────────────────────────────────

function sendSubmissionMessageAsync(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'PROGRAMMERS_AC_SUBMISSION', payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || 'Unknown background error'));
        return;
      }
      resolve(response);
    });
  });
}

// ─── Upload button injection ──────────────────────────────────────────────────

/**
 * "제출 후 채점하기" 버튼 옆에 "Notion 업로드" 버튼을 주입한다.
 * 버튼이 이미 있으면 스킵.
 */
function injectUploadButton() {
  if (document.querySelector('.algonotion-pg-upload-btn')) return;

  // "제출 후 채점하기" 버튼 탐색
  const submitBtn = findSubmitButton();
  if (!submitBtn) return;

  const lessonId = getLessonId();

  if (processedIds.has(lessonId)) {
    setState(lessonId, 'done');
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'algonotion-pg-upload-btn';
  btn.style.cssText =
    'padding:6px 14px;font-size:13px;font-weight:500;cursor:pointer;' +
    'border:1px solid #1565c0;border-radius:4px;background:#fff;color:#1565c0;' +
    'margin-left:8px;vertical-align:middle;white-space:nowrap;';

  const syncUI = () => {
    const state = getState(lessonId);
    if (state === 'uploading') {
      btn.disabled = true;
      btn.textContent = '업로드 중...';
      btn.style.borderColor = '#1565c0';
      btn.style.color = '#1565c0';
    } else if (state === 'done') {
      btn.disabled = true;
      btn.textContent = '업로드 완료';
      btn.style.borderColor = '#2e7d32';
      btn.style.color = '#2e7d32';
    } else if (state === 'failed') {
      btn.disabled = false;
      btn.textContent = '다시 업로드';
      btn.style.borderColor = '#c62828';
      btn.style.color = '#c62828';
    } else {
      btn.disabled = false;
      btn.textContent = 'Notion 업로드';
      btn.style.borderColor = '#1565c0';
      btn.style.color = '#1565c0';
    }
  };

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (getState(lessonId) === 'uploading') return;

    setState(lessonId, 'uploading');
    syncUI();

    try {
      const title = getProblemTitle();
      const level = getProblemLevel();
      const language = getSelectedLanguage();

      // Monaco 주입 먼저, 실패하면 DOM 폴백
      let code = await getCodeFromMonaco();
      if (!code.trim()) {
        code = getCodeFromDom();
      }
      if (!code.trim()) {
        throw new Error('소스코드를 추출할 수 없습니다. 에디터에 코드가 있는지 확인해 주세요.');
      }

      await sendSubmissionMessageAsync({
        problemId: lessonId,
        title,
        level,
        language,
        code,
        time: null,
        memory: null,
      });

      processedIds.add(lessonId);
      await saveUploadedId(lessonId);
      setState(lessonId, 'done');
      syncUI();
    } catch (err) {
      console.error('[AlgoNotion] 프로그래머스 업로드 실패:', err?.message);
      setState(lessonId, 'failed');
      syncUI();
    }
  });

  syncUI();
  submitBtn.insertAdjacentElement('afterend', btn);
}

/**
 * "제출 후 채점하기" 버튼을 탐색한다.
 * 프로그래머스 DOM에 맞게 여러 선택자를 시도.
 */
function findSubmitButton() {
  // 텍스트 기반 탐색이 가장 안정적
  const allButtons = document.querySelectorAll('button, [role="button"]');
  for (const btn of allButtons) {
    const text = (btn.textContent || '').trim();
    if (text === '제출 후 채점하기' || text.includes('제출 후 채점')) {
      return btn;
    }
  }
  return null;
}

// ─── Polling ──────────────────────────────────────────────────────────────────

function poll() {
  injectUploadButton();
}

function startPolling() {
  if (pollingIntervalId !== null) return;
  poll();
  pollingIntervalId = window.setInterval(poll, POLL_INTERVAL_MS);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (
  window.location.hostname.includes('programmers.co.kr') &&
  window.location.pathname.includes('/learn/')
) {
  loadUploadedIds().then(() => startPolling());
}
