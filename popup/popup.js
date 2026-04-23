import { startNotionOAuth, disconnectNotion, getNotionToken, fetchNotionDatabases } from '../scripts/oauth.js';
import { startGitHubOAuth, disconnectGitHub, getGitHubToken, fetchGitHubRepos, getGitHubRepo, saveGitHubRepo, createGitHubRepo } from '../scripts/github_oauth.js';

const NOTION_DATABASE_ID_KEY = 'algonotion_notion_database_id';
const USER_NAME_KEY = 'algonotion_user_name';

const btnGithubConnect    = document.getElementById('btn-github-connect');
const btnGithubDisconnect = document.getElementById('btn-github-disconnect');
const githubStatusLabel   = document.getElementById('github-status-label');
const githubRepoArea      = document.getElementById('github-repo-area');
const githubRepoSelect    = document.getElementById('github-repo-select');
const btnRefreshRepo      = document.getElementById('btn-refresh-repo');
const repoSelectHint      = document.getElementById('repo-select-hint');
const newRepoNameInput    = document.getElementById('new-repo-name');
const newRepoPrivateInput = document.getElementById('new-repo-private');
const btnCreateRepo       = document.getElementById('btn-create-repo');

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

// ─── GitHub ───────────────────────────────────────────────────────────────────

function setGitHubConnectedUI(connected) {
  if (connected) {
    githubStatusLabel.textContent = '✅ GitHub 연결됨';
    githubStatusLabel.className = 'connected';
    btnGithubConnect.style.display = 'none';
    btnGithubDisconnect.style.display = 'inline-block';
    githubRepoArea.style.display = 'block';
  } else {
    githubStatusLabel.textContent = 'GitHub 연결 안 됨';
    githubStatusLabel.className = '';
    btnGithubConnect.style.display = 'inline-block';
    btnGithubDisconnect.style.display = 'none';
    githubRepoArea.style.display = 'none';
  }
}

async function loadGitHubRepos() {
  const token = await getGitHubToken();
  if (!token) return;

  githubRepoSelect.disabled = true;
  btnRefreshRepo.disabled = true;
  if (repoSelectHint) repoSelectHint.textContent = '불러오는 중...';

  try {
    const repos = await fetchGitHubRepos(token);

    while (githubRepoSelect.options.length > 1) githubRepoSelect.remove(1);

    if (repos.length === 0) {
      if (repoSelectHint) repoSelectHint.textContent = '접근 가능한 레포가 없습니다.';
      return;
    }

    repos.forEach(repo => {
      const option = document.createElement('option');
      option.value = repo.fullName;
      // owner/repo 중 repo 이름만 표시 + 🔒는 비공개 표시
      const repoShort = repo.fullName.split('/').slice(1).join('/') || repo.fullName;
      option.textContent = repoShort + (repo.private ? ' 🔒' : '');
      option.title = repo.fullName;  // hover 시 full name
      githubRepoSelect.appendChild(option);
    });

    const savedRepo = await getGitHubRepo();
    if (savedRepo) githubRepoSelect.value = savedRepo;

    if (repoSelectHint) repoSelectHint.textContent = `${repos.length}개`;
  } catch (err) {
    if (repoSelectHint) repoSelectHint.textContent = `로드 실패: ${err.message}`;
  } finally {
    githubRepoSelect.disabled = false;
    btnRefreshRepo.disabled = false;
  }
}

// 팝업 열릴 때 GitHub 상태 복원
(async () => {
  const token = await getGitHubToken();
  setGitHubConnectedUI(!!token);
  if (token) await loadGitHubRepos();
})();

btnGithubConnect.addEventListener('click', async () => {
  btnGithubConnect.disabled = true;
  btnGithubConnect.textContent = '연결 중...';
  try {
    await startGitHubOAuth();
    setGitHubConnectedUI(true);
    showStatus('GitHub 연결 완료!', 'success');
    await loadGitHubRepos();
  } catch (err) {
    showStatus(`연결 실패: ${err.message}`, 'error');
  } finally {
    btnGithubConnect.disabled = false;
    btnGithubConnect.textContent = 'GitHub 연결';
  }
});

btnGithubDisconnect.addEventListener('click', async () => {
  await disconnectGitHub();
  setGitHubConnectedUI(false);
  showStatus('GitHub 연결이 해제되었습니다.');
});

btnRefreshRepo.addEventListener('click', loadGitHubRepos);

githubRepoSelect.addEventListener('change', async () => {
  const repo = githubRepoSelect.value;
  if (!repo) return;
  await saveGitHubRepo(repo);
  showStatus('레포지토리가 저장되었습니다.', 'success');
});

btnCreateRepo.addEventListener('click', async () => {
  const name = newRepoNameInput.value.trim();
  if (!name) {
    showStatus('레포 이름을 입력해주세요.', 'error');
    return;
  }
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    showStatus('이름에는 영문/숫자/./-/_만 사용할 수 있어요.', 'error');
    return;
  }

  const token = await getGitHubToken();
  if (!token) {
    showStatus('먼저 GitHub에 연결해주세요.', 'error');
    return;
  }

  btnCreateRepo.disabled = true;
  btnCreateRepo.textContent = '생성 중...';

  try {
    const { fullName } = await createGitHubRepo(token, name, newRepoPrivateInput.checked);
    await saveGitHubRepo(fullName);
    await loadGitHubRepos();
    githubRepoSelect.value = fullName;
    newRepoNameInput.value = '';
    showStatus(`레포 생성 완료: ${fullName}`, 'success');
  } catch (err) {
    showStatus(`생성 실패: ${err.message}`, 'error');
  } finally {
    btnCreateRepo.disabled = false;
    btnCreateRepo.textContent = '+ 생성';
  }
});
