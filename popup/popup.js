const NOTION_TOKEN_KEY = 'algonotion_notion_token';
const NOTION_DATABASE_ID_KEY = 'algonotion_notion_database_id';
const USER_NAME_KEY = 'algonotion_user_name';

// 팝업이 닫혀도 입력 중인 값을 유지하기 위한 임시 저장 키
const DRAFT_TOKEN_KEY = 'algonotion_draft_token';
const DRAFT_DB_URL_KEY = 'algonotion_draft_db_url';
const DRAFT_USER_NAME_KEY = 'algonotion_draft_user_name';

const userNameInput = document.getElementById('user-name');
const tokenInput = document.getElementById('notion-token');
const dbUrlInput = document.getElementById('notion-db-url');
const saveBtn = document.getElementById('save-btn');
const statusEl = document.getElementById('status');

/**
 * Notion DB 링크에서 32자리 ID를 추출한다.
 * 지원 형식:
 *   https://www.notion.so/workspace/Title-{id}
 *   https://www.notion.so/{id}
 *   https://www.notion.so/workspace/{id}?v=...
 */
function extractDatabaseId(input) {
  const trimmed = input.trim();

  // 이미 32자리 hex이거나 UUID 형식이면 그대로 사용
  const rawId = trimmed.replace(/-/g, '');
  if (/^[0-9a-f]{32}$/i.test(rawId)) {
    return rawId;
  }

  // URL에서 마지막 path segment의 끝 32자리 hex 추출
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      // Title-{id} 형식: 마지막 32자리
      const match = seg.replace(/-/g, '').match(/[0-9a-f]{32}/i);
      if (match) return match[0];
    }
  } catch {
    // URL 파싱 실패 시 그냥 regex로 찾기
    const match = trimmed.replace(/-/g, '').match(/[0-9a-f]{32}/i);
    if (match) return match[0];
  }

  return null;
}

function showStatus(message, type = 'normal') {
  statusEl.textContent = message;
  statusEl.className = type;
  if (type !== 'error') {
    setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 2000);
  }
}

// 팝업 열릴 때: 확정 저장값 → 없으면 임시 저장값 순으로 복원
const allKeys = [NOTION_TOKEN_KEY, NOTION_DATABASE_ID_KEY, USER_NAME_KEY, DRAFT_TOKEN_KEY, DRAFT_DB_URL_KEY, DRAFT_USER_NAME_KEY];
chrome.storage.local.get(allKeys, (result) => {
  userNameInput.value = result[USER_NAME_KEY] || result[DRAFT_USER_NAME_KEY] || '';
  tokenInput.value = result[NOTION_TOKEN_KEY] || result[DRAFT_TOKEN_KEY] || '';

  if (result[DRAFT_DB_URL_KEY]) {
    dbUrlInput.value = result[DRAFT_DB_URL_KEY];
  } else if (result[NOTION_DATABASE_ID_KEY]) {
    dbUrlInput.placeholder = `저장됨: ${result[NOTION_DATABASE_ID_KEY].slice(0, 8)}...`;
  }
});

// 입력할 때마다 임시 저장 (팝업이 닫혀도 유지)
userNameInput.addEventListener('input', () => {
  chrome.storage.local.set({ [DRAFT_USER_NAME_KEY]: userNameInput.value });
});
tokenInput.addEventListener('input', () => {
  chrome.storage.local.set({ [DRAFT_TOKEN_KEY]: tokenInput.value });
});
dbUrlInput.addEventListener('input', () => {
  chrome.storage.local.set({ [DRAFT_DB_URL_KEY]: dbUrlInput.value });
});

saveBtn.addEventListener('click', () => {
  const userName = userNameInput.value.trim();
  const token = tokenInput.value.trim();
  const dbInput = dbUrlInput.value.trim();

  if (!userName) {
    showStatus('사용자 이름을 입력해주세요.', 'error');
    return;
  }

  if (!token) {
    showStatus('Notion Token을 입력해주세요.', 'error');
    return;
  }

  if (!dbInput) {
    showStatus('Notion Database 링크를 입력해주세요.', 'error');
    return;
  }

  const databaseId = extractDatabaseId(dbInput);
  if (!databaseId) {
    showStatus('올바른 Notion 링크 또는 ID를 입력해주세요.', 'error');
    return;
  }

  // 확정 저장 후 임시 저장값 삭제
  chrome.storage.local.set(
    { [USER_NAME_KEY]: userName, [NOTION_TOKEN_KEY]: token, [NOTION_DATABASE_ID_KEY]: databaseId },
    () => {
      chrome.storage.local.remove([DRAFT_USER_NAME_KEY, DRAFT_TOKEN_KEY, DRAFT_DB_URL_KEY]);
      dbUrlInput.value = '';
      dbUrlInput.placeholder = `저장됨: ${databaseId.slice(0, 8)}...`;
      showStatus('저장되었습니다.', 'success');
    }
  );
});
