// LeetCode(leetcode.com) 정답 제출 감지 및 업로드 버튼 주입
// Accepted 결과 탭이 나타나면 Analysis 버튼 옆에 업로드 버튼을 삽입한다.

const UPLOADED_IDS_KEY = 'algonotion_leetcode_uploaded_ids';
const DEV_ALLOW_REUPLOAD_KEY = 'algonotion_dev_allow_reupload';

const processedIds = new Set();
const buttonStateMap = new Map();
let devAllowReupload = false;

// ─── Storage ──────────────────────────────────────────────────────────────────

async function loadUploadedIds() {
  const st = await chrome.storage.local.get([UPLOADED_IDS_KEY, DEV_ALLOW_REUPLOAD_KEY]);
  devAllowReupload = !!st[DEV_ALLOW_REUPLOAD_KEY];
  if (devAllowReupload) {
    console.log('[AlgoNotion] 🔓 LeetCode dev mode: 재업로드 허용');
    return;
  }
  (st[UPLOADED_IDS_KEY] || []).forEach(id => processedIds.add(String(id)));
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

function getState(id) { return buttonStateMap.get(String(id)) || 'idle'; }
function setState(id, state) { buttonStateMap.set(String(id), state); }

// ─── Metadata extraction ──────────────────────────────────────────────────────

function getProblemSlug() {
  const m = window.location.pathname.match(/\/problems\/([\w-]+)/);
  return m ? m[1] : null;
}

function getProblemTitle() {
  const el = document.querySelector('[data-cy="question-title"]');
  if (el) return el.textContent.trim();

  // SPA 환경에서 렌더링 완료 전 fallback: slug를 제목으로 변환
  const slug = getProblemSlug();
  if (slug) return slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  return '';
}

function getDifficulty() {
  for (const el of document.querySelectorAll('span, div')) {
    if (el.children.length === 0 && ['Easy', 'Medium', 'Hard'].includes(el.textContent.trim())) {
      return el.textContent.trim();
    }
  }
  return null;
}

function getLanguage() {
  for (const btn of document.querySelectorAll('button[aria-haspopup="dialog"]')) {
    for (const node of btn.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        return node.textContent.trim();
      }
    }
  }
  return '';
}

function getRuntimeMemory() {
  // spans 순서: [runtime값, runtime%, memory값, memory%]
  const spans = document.querySelectorAll('span.text-lg.font-semibold.text-sd-foreground');
  return {
    runtime: spans[0]?.textContent?.trim() || null,
    memory:  spans[2]?.textContent?.trim() || null,
  };
}

// ─── Code extraction (Monaco bridge) ─────────────────────────────────────────

function getCodeFromEditor() {
  return new Promise(resolve => {
    const handler = e => {
      window.removeEventListener('algonotion-code-response', handler);
      resolve(e.detail || '');
    };
    window.addEventListener('algonotion-code-response', handler);
    window.dispatchEvent(new CustomEvent('algonotion-request-code'));
    setTimeout(() => {
      window.removeEventListener('algonotion-code-response', handler);
      resolve('');
    }, 2000);
  });
}

// ─── Button UI ────────────────────────────────────────────────────────────────

function syncButtonUI(btn, slug) {
  const state = getState(slug);
  const alreadyDone = !devAllowReupload && processedIds.has(String(slug));

  if (state === 'uploading') {
    btn.disabled = true;
    btn.textContent = '업로드 중...';
    btn.style.background = '#1d4ed8';
    btn.style.opacity = '0.7';
  } else if (state === 'done' || (state === 'idle' && alreadyDone)) {
    btn.disabled = true;
    btn.textContent = '업로드 완료';
    btn.style.background = '#16a34a';
    btn.style.opacity = '1';
  } else if (state === 'failed') {
    btn.disabled = false;
    btn.textContent = '다시 업로드';
    btn.style.background = '#dc2626';
    btn.style.opacity = '1';
  } else {
    btn.disabled = false;
    btn.textContent = '업로드';
    btn.style.background = '#2563eb';
    btn.style.opacity = '1';
  }
}

// ─── Button injection ─────────────────────────────────────────────────────────

function findButtonByText(text) {
  for (const btn of document.querySelectorAll('button')) {
    // Analysis 스타일: 텍스트가 <span> 안에 있는 경우
    for (const span of btn.querySelectorAll('span')) {
      if (span.textContent.trim() === text) return btn;
    }
    // Solution 스타일: 텍스트가 버튼의 직접 텍스트 노드인 경우
    for (const node of btn.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === text) return btn;
    }
  }
  return null;
}

function injectUploadButton(analysisBtn) {
  const slug = getProblemSlug();
  if (!slug) return;
  if (analysisBtn.parentElement?.querySelector('.algonotion-lc-btn')) return;

  const solutionBtn = findButtonByText('Solution');
  const anchor = solutionBtn ?? analysisBtn;

  const btn = document.createElement('button');
  btn.className = 'algonotion-lc-btn';
  btn.style.cssText = [
    'display:inline-flex', 'align-items:center', 'justify-content:center',
    'height:32px', 'padding:0 14px', 'margin-left:8px',
    'border:none', 'border-radius:6px', 'font-size:13px', 'font-weight:500',
    'color:#fff', 'cursor:pointer', 'transition:opacity .15s',
  ].join(';');

  syncButtonUI(btn, slug);

  btn.addEventListener('click', async () => {
    if (btn.disabled) return;

    setState(slug, 'uploading');
    syncButtonUI(btn, slug);

    try {
      const code = await getCodeFromEditor();
      if (!code) throw new Error('코드를 가져오지 못했습니다.');

      const { runtime, memory } = getRuntimeMemory();

      const response = await chrome.runtime.sendMessage({
        type: 'LEETCODE_AC_SUBMISSION',
        payload: {
          problemId: slug,
          title: getProblemTitle(),
          level: getDifficulty(),
          language: getLanguage(),
          code,
          time: runtime,
          memory,
        },
      });

      if (response?.ok) {
        setState(slug, 'done');
        await saveUploadedId(slug);
      } else {
        throw new Error(response?.error || '업로드 실패');
      }
    } catch (err) {
      console.error('[AlgoNotion] LeetCode 업로드 실패:', err.message);
      setState(slug, 'failed');
    }

    syncButtonUI(btn, slug);
  });

  anchor.insertAdjacentElement('afterend', btn);
}

// ─── Result detection (MutationObserver) ─────────────────────────────────────

let observer = null;
let debounceTimer = null;
let lastUrl = location.href;

function tryInject() {
  const resultEl = document.querySelector('[data-e2e-locator="submission-result"]');
  if (!resultEl || resultEl.textContent.trim() !== 'Accepted') return;

  const analysisBtn = findButtonByText('Analysis');
  if (!analysisBtn) return;

  if (analysisBtn.parentElement?.querySelector('.algonotion-lc-btn')) return;

  // Disconnect before injecting: prevents React reconciliation conflicts
  // caused by the observer firing during its own DOM insertion.
  observer?.disconnect();
  observer = null;

  injectUploadButton(analysisBtn);

  // Resume watching for the next submission (SPA navigation or retry).
  setTimeout(startObserving, 1000);
}

function onMutation() {
  // SPA navigation: URL changed → reset state for the new page.
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    clearTimeout(debounceTimer);
    return;
  }
  // Debounce: run tryInject only after mutations settle (300 ms).
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(tryInject, 300);
}

function startObserving() {
  if (observer) return;
  lastUrl = location.href;
  observer = new MutationObserver(onMutation);
  observer.observe(document.body, { childList: true, subtree: true });
}

async function init() {
  await loadUploadedIds();
  tryInject();
  startObserving();
}

init();
