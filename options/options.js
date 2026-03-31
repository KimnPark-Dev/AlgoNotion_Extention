import { startNotionOAuth, disconnectNotion, getNotionToken } from '../scripts/oauth.js';

const NOTION_DATABASE_ID_KEY = 'algonotion_notion_database_id';
const USER_NAME_KEY = 'algonotion_user_name';

const userNameInput = document.getElementById('user-name');
const notionDatabaseIdInput = document.getElementById('notion-database-id');
const saveButton = document.getElementById('save-button');
const statusLabel = document.getElementById('status');
const btnConnect = document.getElementById('btn-notion-connect');
const btnDisconnect = document.getElementById('btn-notion-disconnect');
const notionStatusLabel = document.getElementById('notion-status-label');

function showStatus(message) {
  if (!statusLabel) return;
  statusLabel.textContent = message;
  window.setTimeout(() => {
    statusLabel.textContent = '';
  }, 2000);
}

function setConnectedUI(connected) {
  if (connected) {
    notionStatusLabel.textContent = '✅ Notion 연결됨';
    notionStatusLabel.className = 'connected-label';
    btnConnect.style.display = 'none';
    btnDisconnect.style.display = 'inline-block';
  } else {
    notionStatusLabel.textContent = '연결되지 않음';
    notionStatusLabel.className = 'disconnected-label';
    btnConnect.style.display = 'inline-block';
    btnDisconnect.style.display = 'none';
  }
}

async function restoreOptions() {
  const result = await chrome.storage.local.get([USER_NAME_KEY, NOTION_DATABASE_ID_KEY]);

  if (userNameInput && typeof result[USER_NAME_KEY] === 'string') {
    userNameInput.value = result[USER_NAME_KEY];
  }
  if (notionDatabaseIdInput && typeof result[NOTION_DATABASE_ID_KEY] === 'string') {
    notionDatabaseIdInput.value = result[NOTION_DATABASE_ID_KEY];
  }

  const token = await getNotionToken();
  setConnectedUI(!!token);
}

async function saveOptions() {
  const userName = userNameInput ? userNameInput.value.trim() : '';
  const notionDatabaseId = notionDatabaseIdInput ? notionDatabaseIdInput.value.trim() : '';

  await chrome.storage.local.set({
    [USER_NAME_KEY]: userName,
    [NOTION_DATABASE_ID_KEY]: notionDatabaseId,
  });

  showStatus('설정이 저장되었습니다.');
}

if (btnConnect) {
  btnConnect.addEventListener('click', async () => {
    btnConnect.disabled = true;
    btnConnect.textContent = '연결 중...';
    try {
      await startNotionOAuth();
      setConnectedUI(true);
      showStatus('Notion 연결 완료!');
    } catch (err) {
      console.error('[AlgoNotion] OAuth 실패:', err.message);
      showStatus(`연결 실패: ${err.message}`);
    } finally {
      btnConnect.disabled = false;
      btnConnect.textContent = 'Notion으로 로그인';
    }
  });
}

if (btnDisconnect) {
  btnDisconnect.addEventListener('click', async () => {
    await disconnectNotion();
    setConnectedUI(false);
    showStatus('연결이 해제되었습니다.');
  });
}

if (saveButton) {
  saveButton.addEventListener('click', saveOptions);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', restoreOptions);
} else {
  restoreOptions();
}
