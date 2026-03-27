// SWEA(Samsung SW Expert Academy) 문제 상세 페이지 감지 및 Notion 업로드 버튼 주입

const UPLOADED_IDS_KEY = 'algonotion_swea_uploaded_ids';
const POLL_INTERVAL_MS = 2000;
const AC_RESULT_TEXT = 'Pass';

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

// ─── Page info extraction ─────────────────────────────────────────────────────

/**
 * 현재 URL에서 contestProbId를 추출한다.
 * e.g. problemDetail.do?contestProbId=AV5PoOKKAPIDFAUq
 */
function getContestProbIdFromUrl() {
  return new URLSearchParams(window.location.search).get('contestProbId') || '';
}

/**
 * "문제 풀이" 영역의 Language 드롭다운에서 선택된 언어를 반환한다.
 * e.g. "JAVA (OpenJDK 8)" → selectedOptions[0].text
 */
function getLanguageFromPage() {
  // SWEA 언어 select: 문제 풀이 섹션 내 select 또는 id/name으로 탐색
  const selectors = [
    'select[name="language"]',
    'select[id="language"]',
    '.editor-header select',
    '.code-editor select',
    'select',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      return (el.selectedOptions?.[0]?.text || el.value || '').trim();
    }
  }
  return '';
}

/**
 * 페이지 제목 영역에서 문제 번호와 제목을 추출한다.
 * e.g. "1949. [모의 SW 역량테스트] 등산로 조성"
 */
function getProblemInfoFromPage() {
  const headings = document.querySelectorAll('h2, h3, .problem-title, .title');
  for (const el of headings) {
    const text = (el.textContent || '').trim();
    const match = text.match(/^(\d+)\.\s*(.+)$/);
    if (match) {
      return { problemId: match[1], title: match[2].trim() };
    }
  }
  return { problemId: '', title: document.title || '' };
}

// ─── pop_code parsing ─────────────────────────────────────────────────────────

/**
 * onclick 속성에서 pop_code 인자를 추출한다.
 * pop_code('contestProbId', 'contestHistoryId', 'submitIndex')
 */
function parsePopCode(onclickStr) {
  if (!onclickStr) return null;
  const match = onclickStr.match(
    /pop_code\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]?(\w+)['"]?\s*\)/
  );
  if (!match) return null;
  return {
    contestProbId: match[1],
    contestHistoryId: match[2],
    submitIndex: match[3],
  };
}

// ─── Source code fetch ────────────────────────────────────────────────────────

/**
 * submitCodePopup.do 페이지를 fetch해 CodeMirror에서 소스코드를 추출한다.
 */
async function fetchSweaSourceCode(contestProbId, contestHistoryId, submitIndex) {
  const url =
    `https://swexpertacademy.com/main/solvingProblem/submitCodePopup.do` +
    `?contestProbId=${encodeURIComponent(contestProbId)}` +
    `&contestHistoryId=${encodeURIComponent(contestHistoryId)}` +
    `&submitIndex=${encodeURIComponent(submitIndex)}`;

  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error(`소스코드 팝업 요청 실패: ${res.status}`);

  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // 1) CodeMirror가 JS 없이도 렌더된 경우
  const codeEl = doc.querySelector('.CodeMirror-code');
  if (codeEl) {
    const lines = codeEl.querySelectorAll('.CodeMirror-line');
    if (lines.length) {
      return Array.from(lines)
        .map((line) => line.textContent.replace(/\u200b/g, ''))
        .join('\n');
    }
  }

  // 2) CodeMirror 원본 textarea (JS 미실행 환경)
  const textarea = doc.querySelector('textarea.code, textarea#code, textarea[name="code"], textarea');
  if (textarea?.value?.trim()) {
    return textarea.value;
  }

  // 3) <pre> 또는 <code> 블록
  const pre = doc.querySelector('pre');
  if (pre?.textContent?.trim()) {
    return pre.textContent;
  }

  // 4) 디버깅용: 응답 HTML 일부를 콘솔에 출력
  console.warn('[AlgoNotion] 소스코드 파싱 실패. 팝업 HTML (앞 2000자):', html.slice(0, 2000));
  throw new Error('소스코드를 찾을 수 없습니다.');
}

// ─── Message to background ────────────────────────────────────────────────────

function sendSubmissionMessageAsync(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'SWEA_AC_SUBMISSION', payload }, (response) => {
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

// ─── Upload button ────────────────────────────────────────────────────────────

function createUploadButton(contestHistoryId, getMetaFn) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'algonotion-swea-upload-btn';
  btn.style.cssText =
    'display:block;margin-top:4px;padding:2px 8px;font-size:12px;cursor:pointer;' +
    'border:1px solid #1565c0;border-radius:4px;background:#fff;color:#1565c0;width:100%;';

  const syncUI = () => {
    const state = getState(contestHistoryId);
    if (state === 'uploading') {
      btn.disabled = true;
      btn.textContent = '업로드 중...';
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
    if (getState(contestHistoryId) === 'uploading') return;

    setState(contestHistoryId, 'uploading');
    syncUI();

    try {
      const { contestProbId, submitIndex, problemId, title, level, language } = getMetaFn();
      const code = await fetchSweaSourceCode(contestProbId, contestHistoryId, submitIndex);

      await sendSubmissionMessageAsync({
        problemId,
        contestProbId,
        title,
        level,
        language,
        code,
        time: null,
        memory: null,
      });

      processedIds.add(String(contestHistoryId));
      await saveUploadedId(contestHistoryId);
      setState(contestHistoryId, 'done');
      syncUI();
    } catch (err) {
      console.error('[AlgoNotion] SWEA 업로드 실패:', contestHistoryId, err?.message);
      setState(contestHistoryId, 'failed');
      syncUI();
    }
  });

  syncUI();
  return btn;
}

// ─── Polling ──────────────────────────────────────────────────────────────────

/**
 * 페이지 내 모든 "코드보기" 링크를 순회한다.
 * - 해당 행의 결과 셀에 "Pass" 텍스트가 있는 경우만 처리
 * - 아직 버튼이 없으면 주입
 */
function pollCodeViewButtons() {
  const codeViewLinks = document.querySelectorAll('a[onclick*="pop_code"]');

  codeViewLinks.forEach((link) => {
    const parsed = parsePopCode(link.getAttribute('onclick'));
    if (!parsed) return;

    const { contestProbId, contestHistoryId, submitIndex } = parsed;

    // 이미 처리된 경우 건너뜀
    if (link.parentElement?.querySelector('.algonotion-swea-upload-btn')) return;

    // 같은 셀(td) 또는 부모 행(tr)에서 "Pass" 확인
    const td = link.closest('td');
    const tr = link.closest('tr');
    const resultText = td?.textContent || tr?.textContent || '';
    if (!resultText.includes(AC_RESULT_TEXT)) return;

    const { problemId, title } = getProblemInfoFromPage();
    const urlContestProbId = getContestProbIdFromUrl() || contestProbId;

    if (processedIds.has(String(contestHistoryId))) {
      setState(contestHistoryId, 'done');
    }

    const getMetaFn = () => ({
      contestProbId: urlContestProbId,
      submitIndex,
      problemId,
      title,
      level: null,
      language: getLanguageFromPage(),
    });

    const btn = createUploadButton(contestHistoryId, getMetaFn);
    link.insertAdjacentElement('afterend', btn);
  });
}

function startPolling() {
  if (pollingIntervalId !== null) return;
  pollCodeViewButtons();
  pollingIntervalId = window.setInterval(pollCodeViewButtons, POLL_INTERVAL_MS);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (window.location.hostname === 'swexpertacademy.com') {
  loadUploadedIds().then(() => startPolling());
}
