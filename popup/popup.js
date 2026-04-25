import { startNotionOAuth, disconnectNotion, getNotionToken, fetchNotionDatabases } from '../scripts/oauth.js';
import { startGitHubOAuth, disconnectGitHub, getGitHubToken, fetchGitHubRepos, getGitHubRepo, getGitHubRepoMeta, saveGitHubRepo, createGitHubRepo } from '../scripts/github_oauth.js';

const NOTION_DATABASE_ID_KEY = 'algonotion_notion_database_id';
const USER_NAME_KEY = 'algonotion_user_name';

const btnGithubConnect    = document.getElementById('btn-github-connect');
const btnGithubDisconnect = document.getElementById('btn-github-disconnect');
const githubStatusLabel   = document.getElementById('github-status-label');
const githubRepoArea      = document.getElementById('github-repo-area');
const githubRepoTrigger   = document.getElementById('github-repo-trigger');
const githubRepoLabel     = document.getElementById('github-repo-label');
const githubRepoMenu      = document.getElementById('github-repo-menu');
const btnRefreshRepo      = document.getElementById('btn-refresh-repo');
const repoSelectHint      = document.getElementById('repo-select-hint');
const repoCreateArea      = document.getElementById('repo-create-area');
const newRepoNameInput    = document.getElementById('new-repo-name');
const newRepoPrivateInput = document.getElementById('new-repo-private');
const btnCreateRepo       = document.getElementById('btn-create-repo');

// 커스텀 드롭다운 내부 상태
const repoOptions = [];  // [{fullName, private}]
let selectedRepoFullName = null;

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

// ─── 커스텀 드롭다운 헬퍼 ────────────────────────────────────────────────────

function shortRepoName(fullName) {
  return fullName.split('/').slice(1).join('/') || fullName;
}

function renderRepoLabel() {
  if (!selectedRepoFullName) {
    githubRepoLabel.textContent = '-- 선택하세요 --';
    githubRepoLabel.classList.add('placeholder');
    if (repoCreateArea) repoCreateArea.style.display = 'block';
    return;
  }
  const selected = repoOptions.find(o => o.fullName === selectedRepoFullName);
  const text = shortRepoName(selectedRepoFullName) + (selected?.private ? ' 🔒' : '');
  githubRepoLabel.textContent = text;
  githubRepoLabel.title = selectedRepoFullName;
  githubRepoLabel.classList.remove('placeholder');
  // 이미 레포를 선택했으면 생성 영역 숨김
  if (repoCreateArea) repoCreateArea.style.display = 'none';
}

function renderRepoMenu() {
  githubRepoMenu.innerHTML = '';

  if (repoOptions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'custom-select-option empty';
    empty.textContent = '레포가 없습니다';
    githubRepoMenu.appendChild(empty);
    return;
  }

  repoOptions.forEach(repo => {
    const el = document.createElement('div');
    el.className = 'custom-select-option';
    if (repo.fullName === selectedRepoFullName) el.classList.add('selected');
    el.textContent = shortRepoName(repo.fullName) + (repo.private ? ' 🔒' : '');
    el.title = repo.fullName;
    el.addEventListener('click', async () => {
      selectedRepoFullName = repo.fullName;
      renderRepoLabel();
      closeRepoMenu();
      await saveGitHubRepo(repo.fullName, repo.private);
      showStatus('레포지토리가 저장되었습니다.', 'success');
    });
    githubRepoMenu.appendChild(el);
  });
}

function openRepoMenu() {
  githubRepoMenu.classList.add('open');
  githubRepoTrigger.classList.add('open');
  document.body.classList.add('repo-menu-open');
}

function closeRepoMenu() {
  githubRepoMenu.classList.remove('open');
  githubRepoTrigger.classList.remove('open');
  document.body.classList.remove('repo-menu-open');
}

// 외부 클릭 시 닫기
document.addEventListener('click', (e) => {
  if (!githubRepoTrigger.contains(e.target) && !githubRepoMenu.contains(e.target)) {
    closeRepoMenu();
  }
});

githubRepoTrigger.addEventListener('click', () => {
  if (githubRepoTrigger.disabled) return;
  if (githubRepoMenu.classList.contains('open')) closeRepoMenu();
  else openRepoMenu();
});

// ─── 레포 목록 로드 ─────────────────────────────────────────────────────────

async function loadGitHubRepos() {
  const token = await getGitHubToken();
  if (!token) return;

  githubRepoTrigger.disabled = true;
  btnRefreshRepo.disabled = true;
  if (repoSelectHint) repoSelectHint.textContent = '불러오는 중...';

  const savedMeta = await getGitHubRepoMeta();
  const currentValue = selectedRepoFullName || savedMeta.fullName || '';

  try {
    const repos = await fetchGitHubRepos(token);

    // 상태 초기화 + API 응답 반영
    repoOptions.length = 0;
    repos.forEach(r => repoOptions.push({ fullName: r.fullName, private: r.private }));

    // API에 없지만 저장된 레포(방금 만든 레포 등)는 최상단에 고정
    const apiHasCurrent = repos.some(r => r.fullName === currentValue);
    if (currentValue && !apiHasCurrent) {
      repoOptions.unshift({ fullName: currentValue, private: savedMeta.private });
    }

    if (currentValue) selectedRepoFullName = currentValue;

    renderRepoMenu();
    renderRepoLabel();

    if (repoSelectHint) {
      repoSelectHint.textContent = repos.length === 0 ? '접근 가능한 레포가 없습니다.' : `${repos.length}개`;
    }
  } catch (err) {
    if (repoSelectHint) repoSelectHint.textContent = `로드 실패: ${err.message}`;
  } finally {
    githubRepoTrigger.disabled = false;
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
    const { fullName, private: isPrivate } = await createGitHubRepo(token, name, newRepoPrivateInput.checked);
    await saveGitHubRepo(fullName, isPrivate);

    // 방금 만든 레포를 드롭다운 "맨 위"에 고정 + 자동 선택
    const existingIdx = repoOptions.findIndex(o => o.fullName === fullName);
    if (existingIdx >= 0) repoOptions.splice(existingIdx, 1);
    repoOptions.unshift({ fullName, private: isPrivate });

    selectedRepoFullName = fullName;
    renderRepoMenu();
    renderRepoLabel();

    newRepoNameInput.value = '';
    newRepoPrivateInput.checked = false;
    showStatus(`레포 생성 완료: ${fullName}`, 'success');
  } catch (err) {
    showStatus(`생성 실패: ${err.message}`, 'error');
  } finally {
    btnCreateRepo.disabled = false;
    btnCreateRepo.textContent = '+ 생성';
  }
});
