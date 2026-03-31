import { startNotionOAuth, disconnectNotion, getNotionToken } from '../scripts/oauth.js';

const NOTION_DATABASE_ID_KEY = 'algonotion_notion_database_id';
const USER_NAME_KEY = 'algonotion_user_name';
const DRAFT_DB_URL_KEY = 'algonotion_draft_db_url';
const DRAFT_USER_NAME_KEY = 'algonotion_draft_user_name';

const userNameInput = document.getElementById('user-name');
const dbUrlInput = document.getElementById('notion-db-url');
const saveBtn = document.getElementById('save-btn');
const statusEl = document.getElementById('status');
const btnConnect = document.getElementById('btn-notion-connect');
const btnDisconnect = document.getElementById('btn-notion-disconnect');
const notionStatusLabel = document.getElementById('notion-status-label');

/**
 * Notion DB 링크에서 32자리 ID를 추출한다.
 */
function extractDatabaseId(input) {
  const trimmed = input.trim();
  const rawId = trimmed.replace(/-/g, '');
  if (/^[0-9a-f]{32}$/i.test(rawId)) return rawId;

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const match = segments[i].replace(/-/g, '').match(/[0-9a-f]{32}/i);
      if (match) return match[0];
    }
  } catch {
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

function setConnectedUI(connected) {
  if (connected) {
    notionStatusLabel.textContent = '✅ Notion 연결됨';
    notionStatusLabel.className = 'connected';
    btnConnect.style.display = 'none';
    btnDisconnect.style.display = 'inline-block';
  } else {
    notionStatusLabel.textContent = '연결되지 않음';
    notionStatusLabel.className = '';
    btnConnect.style.display = 'inline-block';
    btnDisconnect.style.display = 'none';
  }
}

// 팝업 열릴 때 복원
const allKeys = [NOTION_DATABASE_ID_KEY, USER_NAME_KEY, DRAFT_DB_URL_KEY, DRAFT_USER_NAME_KEY];
chrome.storage.local.get(allKeys, async (result) => {
  userNameInput.value = result[USER_NAME_KEY] || result[DRAFT_USER_NAME_KEY] || '';

  if (result[DRAFT_DB_URL_KEY]) {
    dbUrlInput.value = result[DRAFT_DB_URL_KEY];
  } else if (result[NOTION_DATABASE_ID_KEY]) {
    dbUrlInput.placeholder = `저장됨: ${result[NOTION_DATABASE_ID_KEY].slice(0, 8)}...`;
  }

  const token = await getNotionToken();
  setConnectedUI(!!token);
});

// 임시 저장
userNameInput.addEventListener('input', () => {
  chrome.storage.local.set({ [DRAFT_USER_NAME_KEY]: userNameInput.value });
});
dbUrlInput.addEventListener('input', () => {
  chrome.storage.local.set({ [DRAFT_DB_URL_KEY]: dbUrlInput.value });
});

// Notion 연결
btnConnect.addEventListener('click', async () => {
  btnConnect.disabled = true;
  btnConnect.textContent = '연결 중...';
  try {
    await startNotionOAuth();
    setConnectedUI(true);
    showStatus('Notion 연결 완료!', 'success');
  } catch (err) {
    showStatus(`연결 실패: ${err.message}`, 'error');
  } finally {
    btnConnect.disabled = false;
    btnConnect.textContent = 'Notion 연결';
  }
});

// 연결 해제
btnDisconnect.addEventListener('click', async () => {
  await disconnectNotion();
  setConnectedUI(false);
  showStatus('연결이 해제되었습니다.');
});

// 저장
saveBtn.addEventListener('click', () => {
  const userName = userNameInput.value.trim();
  const dbInput = dbUrlInput.value.trim();

  if (!userName) {
    showStatus('사용자 이름을 입력해주세요.', 'error');
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

  chrome.storage.local.set(
    { [USER_NAME_KEY]: userName, [NOTION_DATABASE_ID_KEY]: databaseId },
    () => {
      chrome.storage.local.remove([DRAFT_USER_NAME_KEY, DRAFT_DB_URL_KEY]);
      dbUrlInput.value = '';
      dbUrlInput.placeholder = `저장됨: ${databaseId.slice(0, 8)}...`;
      showStatus('저장되었습니다.', 'success');
    }
  );
});
