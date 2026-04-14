import { startNotionOAuth, disconnectNotion, getNotionToken, fetchNotionDatabases } from '../scripts/oauth.js';

const NOTION_DATABASE_ID_KEY = 'algonotion_notion_database_id';
const USER_NAME_KEY = 'algonotion_user_name';

const userNameInput = document.getElementById('user-name');
const saveButton = document.getElementById('save-button');
const statusLabel = document.getElementById('status');
const btnConnect = document.getElementById('btn-notion-connect');
const btnDisconnect = document.getElementById('btn-notion-disconnect');
const notionStatusLabel = document.getElementById('notion-status-label');
const dbSelectArea = document.getElementById('db-select-area');
const dbSelect = document.getElementById('notion-db-select');
const btnRefreshDb = document.getElementById('btn-refresh-db');
const dbSelectHint = document.getElementById('db-select-hint');

function showStatus(message, type = 'normal') {
  if (!statusLabel) return;
  statusLabel.textContent = message;
  statusLabel.className = type;
  if (type !== 'error') {
    window.setTimeout(() => {
      statusLabel.textContent = '';
      statusLabel.className = '';
    }, 2000);
  }
}

function setConnectedUI(connected) {
  if (connected) {
    notionStatusLabel.textContent = '✅ Notion 연결됨';
    notionStatusLabel.className = 'connected-label';
    btnConnect.style.display = 'none';
    btnDisconnect.style.display = 'inline-block';
    if (dbSelectArea) dbSelectArea.style.display = 'block';
  } else {
    notionStatusLabel.textContent = '연결되지 않음';
    notionStatusLabel.className = 'disconnected-label';
    btnConnect.style.display = 'inline-block';
    btnDisconnect.style.display = 'none';
    if (dbSelectArea) dbSelectArea.style.display = 'none';
  }
}

/**
 * Notion API에서 데이터베이스 목록을 가져와 드롭다운에 채운다.
 * 기존에 저장된 DB ID가 있으면 해당 항목을 선택 상태로 표시한다.
 */
async function loadDatabases() {
  if (!dbSelect) return;

  const token = await getNotionToken();
  if (!token) return;

  dbSelect.disabled = true;
  if (btnRefreshDb) btnRefreshDb.disabled = true;
  if (dbSelectHint) dbSelectHint.textContent = '데이터베이스 목록을 불러오는 중...';

  try {
    const databases = await fetchNotionDatabases(token);

    // 기존 옵션 초기화 (placeholder 제외)
    while (dbSelect.options.length > 1) {
      dbSelect.remove(1);
    }

    if (databases.length === 0) {
      if (dbSelectHint) dbSelectHint.textContent = '접근 가능한 데이터베이스가 없습니다. AlgoNotion 통합을 Notion 페이지에 연결해주세요.';
      dbSelect.disabled = false;
      if (btnRefreshDb) btnRefreshDb.disabled = false;
      return;
    }

    databases.forEach(db => {
      const option = document.createElement('option');
      option.value = db.id;
      option.textContent = db.title;
      dbSelect.appendChild(option);
    });

    // 저장된 DB ID와 일치하는 항목 선택
    const { [NOTION_DATABASE_ID_KEY]: savedId } = await chrome.storage.local.get(NOTION_DATABASE_ID_KEY);
    if (savedId) {
      const normalizedSaved = savedId.replace(/-/g, '');
      for (const opt of dbSelect.options) {
        if (opt.value === normalizedSaved) {
          dbSelect.value = opt.value;
          break;
        }
      }
    }

    if (dbSelectHint) dbSelectHint.textContent = `${databases.length}개의 데이터베이스를 찾았습니다.`;
  } catch (err) {
    console.error('[AlgoNotion] DB 목록 로드 실패:', err.message);
    if (dbSelectHint) dbSelectHint.textContent = `목록 로드 실패: ${err.message}`;
  } finally {
    dbSelect.disabled = false;
    if (btnRefreshDb) btnRefreshDb.disabled = false;
  }
}

async function restoreOptions() {
  const result = await chrome.storage.local.get([USER_NAME_KEY]);

  if (userNameInput && typeof result[USER_NAME_KEY] === 'string') {
    userNameInput.value = result[USER_NAME_KEY];
  }

  const token = await getNotionToken();
  setConnectedUI(!!token);

  if (token) {
    await loadDatabases();
  }
}

async function saveOptions() {
  const userName = userNameInput ? userNameInput.value.trim() : '';
  const databaseId = dbSelect ? dbSelect.value : '';

  if (!databaseId) {
    showStatus('데이터베이스를 선택해주세요.');
    return;
  }

  await chrome.storage.local.set({
    [USER_NAME_KEY]: userName,
    [NOTION_DATABASE_ID_KEY]: databaseId,
  });

  showStatus('설정이 저장되었습니다.', 'success');
}

if (btnConnect) {
  btnConnect.addEventListener('click', async () => {
    btnConnect.disabled = true;
    btnConnect.textContent = '연결 중...';
    try {
      await startNotionOAuth();
      setConnectedUI(true);
      showStatus('Notion 연결 완료!', 'success');
      await loadDatabases();
    } catch (err) {
      console.error('[AlgoNotion] OAuth 실패:', err.message);
      showStatus(`연결 실패: ${err.message}`, 'error');
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

// 새로고침 버튼
if (btnRefreshDb) {
  btnRefreshDb.addEventListener('click', loadDatabases);
}

if (saveButton) {
  saveButton.addEventListener('click', saveOptions);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', restoreOptions);
} else {
  restoreOptions();
}
