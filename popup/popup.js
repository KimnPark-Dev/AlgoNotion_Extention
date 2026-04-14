import { startNotionOAuth, disconnectNotion, getNotionToken, fetchNotionDatabases } from '../scripts/oauth.js';

const NOTION_DATABASE_ID_KEY = 'algonotion_notion_database_id';
const USER_NAME_KEY = 'algonotion_user_name';

const userNameInput = document.getElementById('user-name');
const statusEl = document.getElementById('status');
const btnConnect = document.getElementById('btn-notion-connect');
const btnDisconnect = document.getElementById('btn-notion-disconnect');
const notionStatusLabel = document.getElementById('notion-status-label');
const dbSelectArea = document.getElementById('db-select-area');
const dbSelect = document.getElementById('notion-db-select');
const btnRefreshDb = document.getElementById('btn-refresh-db');
const dbSelectHint = document.getElementById('db-select-hint');

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
    if (dbSelectArea) dbSelectArea.style.display = 'block';
  } else {
    notionStatusLabel.textContent = '연결되지 않음';
    notionStatusLabel.className = '';
    btnConnect.style.display = 'inline-block';
    btnDisconnect.style.display = 'none';
    if (dbSelectArea) dbSelectArea.style.display = 'none';
  }
}

async function loadDatabases() {
  if (!dbSelect) return;

  const token = await getNotionToken();
  if (!token) return;

  dbSelect.disabled = true;
  if (btnRefreshDb) btnRefreshDb.disabled = true;
  if (dbSelectHint) dbSelectHint.textContent = '불러오는 중...';

  try {
    const databases = await fetchNotionDatabases(token);

    while (dbSelect.options.length > 1) {
      dbSelect.remove(1);
    }

    if (databases.length === 0) {
      if (dbSelectHint) dbSelectHint.textContent = '접근 가능한 데이터베이스가 없습니다.';
      return;
    }

    databases.forEach(db => {
      const option = document.createElement('option');
      option.value = db.id;
      option.textContent = db.title;
      dbSelect.appendChild(option);
    });

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

    if (dbSelectHint) dbSelectHint.textContent = `${databases.length}개`;
  } catch (err) {
    console.error('[AlgoNotion] DB 목록 로드 실패:', err.message);
    if (dbSelectHint) dbSelectHint.textContent = `로드 실패: ${err.message}`;
  } finally {
    dbSelect.disabled = false;
    if (btnRefreshDb) btnRefreshDb.disabled = false;
  }
}

// 팝업 열릴 때 복원
chrome.storage.local.get([USER_NAME_KEY], async (result) => {
  userNameInput.value = result[USER_NAME_KEY] || '';

  const token = await getNotionToken();
  setConnectedUI(!!token);

  if (token) {
    await loadDatabases();
  }
});

// Notion 연결
btnConnect.addEventListener('click', async () => {
  btnConnect.disabled = true;
  btnConnect.textContent = '연결 중...';
  try {
    await startNotionOAuth();
    setConnectedUI(true);
    showStatus('Notion 연결 완료!', 'success');
    await loadDatabases();
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

// 새로고침
btnRefreshDb.addEventListener('click', loadDatabases);

// DB 선택 시 자동 저장
dbSelect.addEventListener('change', () => {
  const databaseId = dbSelect.value;
  if (!databaseId) return;

  chrome.storage.local.set(
    { [USER_NAME_KEY]: userNameInput.value.trim(), [NOTION_DATABASE_ID_KEY]: databaseId },
    () => showStatus('저장되었습니다.', 'success')
  );
});

// 사용자 이름 포커스 벗어나면 저장
userNameInput.addEventListener('blur', () => {
  chrome.storage.local.set({ [USER_NAME_KEY]: userNameInput.value.trim() });
});
