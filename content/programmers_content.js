// 프로그래머스(school.programmers.co.kr) 코딩 테스트 페이지 감지 및 Notion 업로드 버튼 주입

const UPLOADED_IDS_KEY = 'algonotion_programmers_uploaded_ids';
const DEV_ALLOW_REUPLOAD_KEY = 'algonotion_dev_allow_reupload';

const processedIds = new Set();
const buttonStateMap = new Map();
let devAllowReupload = false;

// ─── Storage ──────────────────────────────────────────────────────────────────

async function loadUploadedIds() {
  const st = await chrome.storage.local.get([UPLOADED_IDS_KEY, DEV_ALLOW_REUPLOAD_KEY]);
  devAllowReupload = !!st[DEV_ALLOW_REUPLOAD_KEY];
  if (devAllowReupload) {
    console.log('[AlgoNotion] 🔓 프로그래머스 dev mode: 재업로드 허용');
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

// ─── Submission ID ────────────────────────────────────────────────────────────

/**
 * data-lesson-id attribute를 1순위로, URL 파싱을 fallback으로 사용한다.
 */
function getLessonId() {
  const lessonEl = document.querySelector('[data-lesson-id]');
  if (lessonEl) {
    const id = lessonEl.getAttribute('data-lesson-id');
    if (id) return id;
  }
  const match = window.location.pathname.match(/lessons\/(\d+)/);
  return match ? match[1] : window.location.pathname.replace(/\W+/g, '_');
}

// ─── Metadata extraction ──────────────────────────────────────────────────────

/**
 * 문제 제목을 추출한다.
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
  return document.title.replace(/\s*\|.*$/, '').trim() || '';
}

/**
 * 문제 레벨을 추출한다. e.g. "Lv.2"
 * data-challenge-level attribute를 1순위로, DOM 텍스트 파싱을 fallback으로 사용한다.
 */
function getProblemLevel() {
  const lessonEl = document.querySelector('[data-challenge-level]');
  if (lessonEl) {
    const level = lessonEl.getAttribute('data-challenge-level');
    if (level != null && level !== '') return `Lv.${level}`;
  }
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
  const bodyText = document.body.textContent || '';
  const m = bodyText.match(/Lv\.?\s*(\d)/i);
  return m ? `Lv.${m[1]}` : null;
}

/**
 * 선택된 언어를 추출한다.
 * 1순위: div#tour7 > button (BaekjoonHub 검증 선택자)
 * 2순위: language 관련 <select>
 * 3순위: 커스텀 드롭다운
 * "text" 같은 오염값은 제외한다.
 */
function getSelectedLanguage() {
  const INVALID_VALUES = new Set(['text', 'button', 'submit', 'reset', '']);

  const tour7Btn = document.querySelector('div#tour7 > button');
  if (tour7Btn) {
    const text = (tour7Btn.textContent || '').trim();
    if (text && !INVALID_VALUES.has(text.toLowerCase())) return text;
  }

  const selectSelectors = [
    'select[class*="language"]',
    'select[name="language"]',
    'select[id*="language"]',
    '.editor-header select',
  ];
  for (const sel of selectSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.selectedOptions?.[0]?.text || '').trim();
      if (text && !INVALID_VALUES.has(text.toLowerCase())) return text;
    }
  }

  const customSelected = document.querySelector(
    '[class*="selected-language"], [class*="language-selected"], [class*="select-language"] [class*="selected"]'
  );
  if (customSelected) {
    const text = (customSelected.textContent || '').trim();
    if (text && !INVALID_VALUES.has(text.toLowerCase())) return text;
  }

  return '';
}

// ─── Problem detail extraction ────────────────────────────────────────────────

/**
 * 문제 본문(설명/제한사항/입출력 예)을 HTML 그대로 추출한다.
 * 프로그래머스는 보통 #tour1 또는 .guide-section 안에 전체가 한 덩어리로 있음.
 * @returns {{description: string, input: string, output: string}|null}
 */
function getProblemDetail() {
  const selectors = [
    'div.guide-section .markdown',
    '.guide-section',
    '#tour1',
    '.problem_cont',
    '.challenge-detail',
    'section.algorithm-problem-contents',
    'div[class*="guide"]',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const html = (el.innerHTML || '').trim();
    if (html.length > 200) {
      return { description: html, input: '', output: '' };
    }
  }
  return null;
}

/**
 * 문제 분류 태그 추출 (breadcrumb 또는 문제 카테고리 영역).
 * e.g. "해시", "완전탐색", "DP"
 * @returns {string[]}
 */
function getProblemTags() {
  const tags = new Set();

  // Breadcrumb에서 중간 항목 (e.g. "코딩테스트 연습 > 해시 > 완주하지 못한 선수")
  const breadcrumbs = document.querySelectorAll(
    'nav[aria-label="breadcrumb"] a, .breadcrumb a, ol.breadcrumb li a, nav.breadcrumb a'
  );
  breadcrumbs.forEach((el) => {
    const t = (el.textContent || '').trim();
    if (t && t !== '코딩테스트 연습' && t !== '홈' && !/^lv\.?\d/i.test(t) && t.length < 20) {
      tags.add(t);
    }
  });

  return Array.from(tags);
}

// ─── Performance extraction ───────────────────────────────────────────────────

/**
 * 채점 결과 테이블의 td.result.passed 셀에서 runtime/memory를 추출한다.
 * "통과 (0.01ms, 9.21MB)" 형식 파싱. 여러 테스트케이스 중 runtime 최댓값 기준 선택.
 * 결과가 없으면 null 반환.
 */
function getSubmissionPerformance() {
  const cells = [...document.querySelectorAll('td.result.passed')];
  if (!cells.length) return { time: null, memory: null };

  const parsed = cells
    .map((td) => td.innerText || td.textContent || '')
    .map((text) => text.replace(/[^., 0-9a-zA-Z]/g, '').trim())
    .map((text) => text.split(', '))
    .filter((parts) => parts.length >= 2)
    .map(([t, m]) => ({ t: t.trim(), m: m.trim() }));

  if (!parsed.length) return { time: null, memory: null };

  const best = parsed.reduce((acc, cur) => {
    return parseFloat(cur.t) > parseFloat(acc.t) ? cur : acc;
  }, parsed[0]);

  // ms → µs (×1000), e.g. "0.02ms" → 20
  const parseTime = (str) => {
    const num = parseFloat(str);
    if (isNaN(num)) return null;
    return Math.round(num * 1000);
  };

  // MB → KB (×1024), GB → KB (×1024²), KB → KB
  const parseMemory = (str) => {
    const num = parseFloat(str);
    if (isNaN(num)) return null;
    const s = str.toLowerCase();
    if (s.includes('gb')) return Math.round(num * 1024 * 1024);
    if (s.includes('mb')) return Math.round(num * 1024);
    return Math.round(num);
  };

  return {
    time: parseTime(best.t),
    memory: parseMemory(best.m),
  };
}

// ─── Code extraction (Monaco Editor) ─────────────────────────────────────────

/**
 * MAIN world에서 실행 중인 programmers_monaco_bridge.js와 window 이벤트로 통신해
 * Monaco editor의 코드 값을 가져온다.
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
 */
function getCodeFromDom() {
  const viewLines = document.querySelectorAll('.view-lines .view-line');
  if (viewLines.length) {
    return Array.from(viewLines).map((l) => l.textContent).join('\n');
  }

  const cmLines = document.querySelectorAll('.CodeMirror-line');
  if (cmLines.length) {
    return Array.from(cmLines)
      .map((l) => l.textContent.replace(/\u200b/g, ''))
      .join('\n');
  }

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

// ─── Modal button injection ───────────────────────────────────────────────────

/**
 * "정답입니다!" 모달의 .modal-footer에 Notion 업로드 버튼을 주입한다.
 * "다른 사람의 풀이 보기" 버튼(.btn-primary) 앞에 삽입.
 */
function injectButtonIntoModal(modalContent) {
  if (modalContent.querySelector('.algonotion-pg-upload-btn')) return;

  const footer = modalContent.querySelector('.modal-footer');
  if (!footer) return;

  const closeBtn = footer.querySelector('.btn-light, [data-dismiss="modal"]');
  if (!closeBtn) return;

  const lessonId = getLessonId();
  const alreadyUploaded = processedIds.has(lessonId);

  const btn = document.createElement('a');
  btn.href = '#';
  btn.className = 'btn algonotion-pg-upload-btn';

  const syncUI = (state) => {
    if (state === 'uploading') {
      btn.textContent = '업로드 중...';
      btn.style.cssText = 'cursor:not-allowed;color:#888;border-color:#888;pointer-events:none;';
    } else if (state === 'done') {
      btn.textContent = '업로드 완료';
      btn.style.cssText = 'cursor:default;color:#2e7d32;border-color:#2e7d32;pointer-events:none;';
    } else if (state === 'failed') {
      btn.textContent = '다시 업로드';
      btn.style.cssText = 'cursor:pointer;color:#c62828;border-color:#c62828;';
    } else {
      btn.textContent = 'Notion 업로드';
      btn.style.cssText = 'cursor:pointer;color:#1565c0;border-color:#1565c0;';
    }
  };

  const initialState = alreadyUploaded ? 'done' : getState(lessonId);
  syncUI(initialState);

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (getState(lessonId) === 'uploading') return;
    if (processedIds.has(lessonId)) return;

    setState(lessonId, 'uploading');
    syncUI('uploading');

    try {
      const title = getProblemTitle();
      const level = getProblemLevel();
      const language = getSelectedLanguage();
      const { time, memory } = getSubmissionPerformance();
      const problemDetail = getProblemDetail();
      const tags = getProblemTags();

      let code = await getCodeFromMonaco();
      if (!code.trim()) code = getCodeFromDom();
      if (!code.trim()) {
        throw new Error('소스코드를 추출할 수 없습니다. 에디터에 코드가 있는지 확인해 주세요.');
      }

      await sendSubmissionMessageAsync({
        problemId: lessonId,
        title,
        level,
        language,
        code,
        time,
        memory,
        tags,
        problemDetail,
      });

      if (!devAllowReupload) processedIds.add(lessonId);
      await saveUploadedId(lessonId);
      const finalState = devAllowReupload ? 'idle' : 'done';
      setState(lessonId, finalState);
      syncUI(finalState);
    } catch (err) {
      console.error('[AlgoNotion] 프로그래머스 업로드 실패:', err?.message);
      setState(lessonId, 'failed');
      syncUI('failed');
    }
  });

  closeBtn.insertAdjacentElement('beforebegin', btn);
}

// ─── Modal observer ───────────────────────────────────────────────────────────

/**
 * MutationObserver로 "정답입니다!" 모달 출현을 감지한다.
 * .modal-title 텍스트가 "정답입니다!"인 경우에만 버튼을 주입한다.
 */
function observeResultModal() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // 모달 자체가 추가된 경우
        const modalContent = node.classList?.contains('modal-content')
          ? node
          : node.querySelector?.('.modal-content');

        if (!modalContent) continue;

        const titleEl = modalContent.querySelector('.modal-title');
        if (!titleEl) continue;

        const titleText = (titleEl.textContent || '').trim();
        if (titleText === '정답입니다!') {
          injectButtonIntoModal(modalContent);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

if (
  window.location.hostname.includes('programmers.co.kr') &&
  window.location.pathname.includes('/learn/')
) {
  loadUploadedIds().then(() => observeResultModal());
}
