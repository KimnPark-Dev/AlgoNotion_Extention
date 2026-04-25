// SWEA(Samsung SW Expert Academy) 문제 상세 페이지 감지 및 Notion 업로드 버튼 주입

const UPLOADED_IDS_KEY = 'algonotion_swea_uploaded_ids';
const DEV_ALLOW_REUPLOAD_KEY = 'algonotion_dev_allow_reupload';
const POLL_INTERVAL_MS = 2000;
const AC_RESULT_TEXT = 'Pass';

const processedIds = new Set();
const buttonStateMap = new Map();
let pollingIntervalId = null;
let devAllowReupload = false;

// ─── Storage ──────────────────────────────────────────────────────────────────

async function loadUploadedIds() {
  const st = await chrome.storage.local.get([UPLOADED_IDS_KEY, DEV_ALLOW_REUPLOAD_KEY]);
  devAllowReupload = !!st[DEV_ALLOW_REUPLOAD_KEY];
  if (devAllowReupload) {
    console.log('[AlgoNotion] 🔓 SWEA dev mode: 재업로드 허용');
    return;
  }
  const ids = st[UPLOADED_IDS_KEY] || [];
  ids.forEach((id) => processedIds.add(String(id)));
}

async function saveUploadedId(id) {
  if (devAllowReupload) return;
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

/**
 * /main/code/problem/problemDetail.do 페이지를 fetch해서 배지를 파싱한다.
 * 이 페이지에만 배지가 서버-렌더링되어 있음.
 * @param {string} contestProbId
 * @returns {Promise<string|null>}  "D3" 형태
 */
async function fetchSweaBadge(contestProbId) {
  if (!contestProbId) return null;
  try {
    const res = await fetch(
      `/main/code/problem/problemDetail.do?contestProbId=${encodeURIComponent(contestProbId)}`,
      { credentials: 'include', cache: 'no-store' }
    );
    if (!res.ok) return null;
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const badge = doc.querySelector('.problem_box .badge, .problem_title .badge, span.badge');
    const text = (badge?.textContent || '').trim();
    return /^(D\d|B형|A형|S형|K\d)/i.test(text) ? text : null;
  } catch (err) {
    console.warn('[AlgoNotion] SWEA problemDetail.do fetch 실패:', err?.message);
    return null;
  }
}

/**
 * 문제 페이지의 난이도 배지(D1~D6, B형 등)를 추출한다.
 * 여러 선택자를 순회하면서 D숫자 / 형태 패턴에 맞는 텍스트를 찾는다.
 */
function getLevelFromPage() {
  const selectors = [
    'div.problem_box > p.problem_title > span.badge',
    'p.problem_title span.badge',
    'div.problem_box span.badge',
    '.problem_title .badge',
    'span.badge',
  ];
  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      const text = (el.textContent || '').trim();
      if (/^(D\d|B형|A형|S형|K\d)/i.test(text)) return text;
    }
  }

  // Fallback: 문서 전체 텍스트에서 D1~D9 패턴 검색 (주의: 오인식 가능)
  const all = document.body?.textContent || '';
  const m = all.match(/\b(D[1-9])\b/);
  if (m) return m[1];

  // 디버그: 문제 영역 HTML 출력
  const box = document.querySelector('div.problem_box, .problem_title, .problem-header');
  if (box) {
    console.log('[AlgoNotion] SWEA 레벨 추출 실패 - problem box HTML (앞 1500자):', box.outerHTML.slice(0, 1500));
  }
  return null;
}

/**
 * 제출 이력 행(tr)에서 실행시간과 메모리를 파싱한다.
 * - 메모리: "13,636 KB" / "1.2 MB" → KB로 정규화
 * - 시간: "12 ms" / "0.02 s" → ms로 정규화
 *
 * 1) 테이블 헤더로 컬럼 인덱스 매핑 시도
 * 2) 실패 시 모든 셀 정규식 스캔으로 fallback
 *
 * @param {HTMLElement} tr
 * @returns {{time: number|null, memory: number|null}}
 */
function extractPerformanceFromRow(tr) {
  if (!tr) return { time: null, memory: null };

  const cells = tr.querySelectorAll('td');
  if (!cells.length) return { time: null, memory: null };

  let time = null;
  let memory = null;

  // 1) 헤더 기반 매핑
  const table = tr.closest('table');
  const headerCells = table?.querySelectorAll('thead tr th, thead tr td');
  if (headerCells?.length) {
    let memIdx = -1;
    let timeIdx = -1;
    headerCells.forEach((h, i) => {
      const t = (h.textContent || '').trim();
      if (/메모리|Memory/i.test(t)) memIdx = i;
      if (/실행시간|시간|Time/i.test(t)) timeIdx = i;
    });

    if (memIdx >= 0 && cells[memIdx]) {
      const m = (cells[memIdx].textContent || '').match(/([\d,]+(?:\.\d+)?)\s*(KB|MB|byte)/i);
      if (m) {
        const num = parseFloat(m[1].replace(/,/g, ''));
        memory = m[2].toUpperCase() === 'MB' ? Math.round(num * 1024) : Math.round(num);
      }
    }
    if (timeIdx >= 0 && cells[timeIdx]) {
      const t = (cells[timeIdx].textContent || '').trim();
      const ms = t.match(/([\d,]+(?:\.\d+)?)\s*ms/i);
      const sec = t.match(/([\d,]+(?:\.\d+)?)\s*s\b/i);
      if (ms) time = Math.round(parseFloat(ms[1].replace(/,/g, '')));
      else if (sec) time = Math.round(parseFloat(sec[1].replace(/,/g, '')) * 1000);
    }
  }

  // 2) Fallback: 모든 셀 스캔 (앵커 없이 유연한 매칭)
  if (memory == null || time == null) {
    cells.forEach((cell) => {
      const text = (cell.textContent || '').trim();
      // 헤더 잔상 같은 짧은 키워드는 스킵
      if (/^(메모리|시간|실행시간|Memory|Time)$/i.test(text)) return;

      if (memory == null) {
        const m = text.match(/([\d,]+(?:\.\d+)?)\s*(KB|MB)\b/i);
        if (m) {
          const num = parseFloat(m[1].replace(/,/g, ''));
          memory = m[2].toUpperCase() === 'MB' ? Math.round(num * 1024) : Math.round(num);
        }
      }
      if (time == null) {
        const ms = text.match(/([\d,]+(?:\.\d+)?)\s*ms\b/i);
        if (ms) time = Math.round(parseFloat(ms[1].replace(/,/g, '')));
      }
    });
  }

  if (memory == null || time == null) {
    console.log('[AlgoNotion] SWEA 성능 추출 실패. row HTML:', tr.outerHTML.slice(0, 500));
  }

  return { time, memory };
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

// ─── Boilerplate stripping ────────────────────────────────────────────────────

/**
 * SWEA 기본 제공 주석 블록을 제거한다.
 * - Python: '''...''' 삼중따옴표 블록 + #import sys / #sys.stdin 라인
 * - Java/C++: /* ... *\/ 블록 주석 + //freopen / //System.setIn 라인
 */
function stripSweaBoilerplate(code, language) {
  const lang = (language || '').toLowerCase();
  if (lang.includes('python')) return _stripPython(code);
  if (lang.includes('java')) return _stripBlockComment(code);
  if (lang.includes('c++') || lang.includes('cpp') || /^c\b/.test(lang)) return _stripBlockComment(code);
  return code;
}

function _stripPython(code) {
  // 1) SWEA 키워드를 포함한 '''...''' 블록 제거
  //    - 입출력 예제 블록: "정수형 변수", "입력 받는 예제", "출력하는 예제" 등
  //    - input.txt 안내 블록, 알고리즘 구현 안내 블록
  let result = code.replace(/'''[\s\S]*?'''/g, (m) =>
    /표준 입력|표준 출력|input\.txt|read only|sys\.stdin|정수형 변수|실수형 변수|문자열 변수|입력 받는 예제|출력하는 예제|알고리즘 구현/.test(m) ? '' : m
  );

  // 2) # ///.../// 구분선 제거 (Python은 # 뒤에 / 연속)
  result = result.replace(/^#\s*\/{10,}\s*$/gm, '');

  // 3) SWEA 전용 한 줄 주석 + 주석처리된 sys import 제거
  result = result
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (/^#\s*(기본 제공코드|아래 표준 입출력|표준 입력 예제|표준 출력 예제|여러개의 테스트 케이스가 주어지므로)/.test(t)) return false;
      if (/^#\s*import sys$/.test(t)) return false;
      if (/^#\s*sys\.stdin\s*=\s*open/.test(t)) return false;
      return true;
    })
    .join('\n');

  // 4) 연속 빈 줄 최대 1줄로 축소
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

// Java / C++ 공통 (SWEA 패턴 동일)
function _stripBlockComment(code) {
  let result = code;

  // 1) ////.../// 구분선 제거 (20개 이상의 / 로만 이루어진 줄)
  result = result.replace(/^\/{20,}\s*$/gm, '');

  // 2) SWEA 키워드를 포함한 /* ... */ 블록 제거
  result = result.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    /기본 제공코드|표준 입력|표준 출력|input\.txt|freopen|알고리즘 구현|테스트 케이스|표준입력|클래스명이 Solution|스캐너를 만들어/.test(m) ? '' : m
  );

  // 3) SWEA 키워드를 포함한 연속 // 주석 블록 전체 제거
  //    (// 기본 제공코드, // 표준 입력 예제, // 표준 출력 예제 등이 포함된 블록)
  const SWEA_BLOCK_KEYWORDS = /기본 제공코드|표준 입력 예제|표준 출력 예제/;
  const lines = result.split('\n');
  const output = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith('//')) {
      // 연속된 // 줄을 하나의 블록으로 수집
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith('//')) {
        block.push(lines[i]);
        i++;
      }
      // SWEA 키워드가 없는 블록만 유지 (사용자 직접 작성 주석 보존)
      if (!SWEA_BLOCK_KEYWORDS.test(block.join('\n'))) {
        output.push(...block);
      }
    } else {
      output.push(lines[i]);
      i++;
    }
  }
  result = output.join('\n');

  // 4) 주석처리된 stdin 리다이렉트 단독 줄 제거
  result = result.split('\n').filter((line) => {
    const t = line.trim();
    if (/^\/\/\s*freopen\s*\(/.test(t)) return false;
    if (/^\/\/\s*System\.setIn/.test(t)) return false;
    return true;
  }).join('\n');

  // 5) 연속 빈 줄 최대 1줄로 축소
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Source code fetch ────────────────────────────────────────────────────────

/**
 * submitCodePopup.do 문서에서 메모리/시간 정보를 정규식으로 추출한다.
 */
function extractPerformanceFromPopup(doc, htmlRaw) {
  const bodyText = doc.body?.textContent || '';
  const scan = (text) => {
    let time = null;
    let memory = null;
    const memMatch = text.match(/(?:메모리|Memory)\s*[:：]?\s*([\d,]+(?:\.\d+)?)\s*(KB|MB)/i);
    if (memMatch) {
      const num = parseFloat(memMatch[1].replace(/,/g, ''));
      memory = memMatch[2].toUpperCase() === 'MB' ? Math.round(num * 1024) : Math.round(num);
    }
    const tMatch = text.match(/(?:실행시간|시간|Time)\s*[:：]?\s*([\d,]+(?:\.\d+)?)\s*(ms|s)\b/i);
    if (tMatch) {
      const num = parseFloat(tMatch[1].replace(/,/g, ''));
      time = tMatch[2].toLowerCase() === 's' ? Math.round(num * 1000) : Math.round(num);
    }
    return { time, memory };
  };
  const first = scan(bodyText);
  if (first.time != null && first.memory != null) return first;
  const second = scan(htmlRaw || '');
  return {
    time: first.time ?? second.time,
    memory: first.memory ?? second.memory,
  };
}

/**
 * submitCodePopup.do 페이지에서 소스코드 + 실행시간/메모리를 함께 추출한다.
 * @returns {Promise<{code: string, time: number|null, memory: number|null}>}
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

  const { time, memory } = extractPerformanceFromPopup(doc, html);
  if (time == null && memory == null) {
    console.log('[AlgoNotion] SWEA 팝업 성능 추출 실패. body 텍스트 앞 500자:', (doc.body?.textContent || '').slice(0, 500));
  }

  // 1) CodeMirror가 JS 없이도 렌더된 경우
  const codeEl = doc.querySelector('.CodeMirror-code');
  if (codeEl) {
    const lines = codeEl.querySelectorAll('.CodeMirror-line');
    if (lines.length) {
      const code = Array.from(lines)
        .map((line) => line.textContent.replace(/\u200b/g, ''))
        .join('\n');
      return { code, time, memory };
    }
  }

  // 2) CodeMirror 원본 textarea (JS 미실행 환경)
  const textarea = doc.querySelector('textarea.code, textarea#code, textarea[name="code"], textarea');
  if (textarea?.value?.trim()) {
    return { code: textarea.value, time, memory };
  }

  // 3) <pre> 또는 <code> 블록
  const pre = doc.querySelector('pre');
  if (pre?.textContent?.trim()) {
    return { code: pre.textContent, time, memory };
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
      const { contestProbId, submitIndex, problemId, title, level, language, time: rowTime, memory: rowMemory } = getMetaFn();

      // DOM에 배지 없으면 problemDetail.do fetch로 보완
      const finalLevel = level || (await fetchSweaBadge(contestProbId));

      const { code: rawCode, time: popupTime, memory: popupMemory } = await fetchSweaSourceCode(contestProbId, contestHistoryId, submitIndex);
      const code = stripSweaBoilerplate(rawCode, language);

      await sendSubmissionMessageAsync({
        problemId,
        contestProbId,
        title,
        level: finalLevel,
        language,
        code,
        time: popupTime ?? rowTime,
        memory: popupMemory ?? rowMemory,
      });

      if (!devAllowReupload) processedIds.add(String(contestHistoryId));
      await saveUploadedId(contestHistoryId);
      setState(contestHistoryId, devAllowReupload ? 'idle' : 'done');
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

    const { time: rowTime, memory: rowMemory } = extractPerformanceFromRow(tr);
    const levelFromPage = getLevelFromPage();
    if (!levelFromPage) {
      console.log('[AlgoNotion] SWEA 레벨 추출 실패 - 셀렉터 확인 필요');
    }

    const getMetaFn = () => ({
      contestProbId: urlContestProbId,
      submitIndex,
      problemId,
      title,
      level: levelFromPage,
      language: getLanguageFromPage(),
      time: rowTime,
      memory: rowMemory,
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
