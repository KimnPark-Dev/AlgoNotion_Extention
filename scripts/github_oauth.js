/**
 * GitHub OAuth 흐름
 *
 * 흐름:
 *  1. launchWebAuthFlow → GitHub 인가 화면
 *  2. GitHub → 백엔드 /oauth/github/callback?code=...&state=<extensionId>
 *  3. 백엔드가 code 교환 → access_token 획득
 *  4. 백엔드가 https://<extensionId>.chromiumapp.org/?access_token=... 로 리다이렉트
 *  5. launchWebAuthFlow가 해당 URL을 캡처해 반환
 *  6. 토큰을 chrome.storage.local에 저장
 */

const GITHUB_CLIENT_ID = 'Ov23lirjWKjWDkn481WD';  // GitHub OAuth App Client ID (BE .env의 GITHUB_CLIENT_SECRET과 쌍)
const BACKEND_URL = 'https://algonotion.site';
const GITHUB_TOKEN_KEY = 'algonotion_github_token';
const GITHUB_REPO_KEY = 'algonotion_github_repo';

export async function startGitHubOAuth() {
  const extensionId = chrome.runtime.id;
  const redirectUri = `${BACKEND_URL}/oauth/github/callback`;

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'repo');
  authUrl.searchParams.set('state', extensionId);

  const resultUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });

  const url = new URL(resultUrl);
  const token = url.searchParams.get('access_token');
  if (!token) {
    throw new Error('GitHub 인증 실패: access_token이 없습니다.');
  }

  await chrome.storage.local.set({ [GITHUB_TOKEN_KEY]: token });
  return token;
}

export async function disconnectGitHub() {
  await chrome.storage.local.remove([GITHUB_TOKEN_KEY, GITHUB_REPO_KEY]);
}

export async function getGitHubToken() {
  const result = await chrome.storage.local.get(GITHUB_TOKEN_KEY);
  const token = (result[GITHUB_TOKEN_KEY] || '').trim();
  return token || null;
}

/**
 * 인증된 유저가 접근 가능한 레포 목록 조회 (본인 소유 + 권한 있는 레포)
 * @param {string} token
 * @returns {Promise<Array<{fullName: string, private: boolean}>>}
 */
export async function fetchGitHubRepos(token) {
  const res = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner', {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API ${res.status}`);
  }

  const data = await res.json();
  return data.map(repo => ({
    fullName: repo.full_name,   // "owner/repo-name"
    private: repo.private,
  }));
}

export async function getGitHubRepo() {
  const result = await chrome.storage.local.get(GITHUB_REPO_KEY);
  return (result[GITHUB_REPO_KEY] || '').trim() || null;
}

export async function saveGitHubRepo(fullName) {
  await chrome.storage.local.set({ [GITHUB_REPO_KEY]: fullName });
}

/**
 * 레포 자동 생성. auto_init: true 로 초기 커밋을 만들어 바로 커밋 가능한 상태로 둔다.
 * @param {string} token
 * @param {string} name       - 레포 이름 (e.g., "algorithm-solutions")
 * @param {boolean} isPrivate - 비공개 여부
 * @returns {Promise<{fullName: string}>}
 */
export async function createGitHubRepo(token, name, isPrivate = false) {
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      description: 'Auto-uploaded by AlgoNotion',
      private: isPrivate,
      auto_init: true,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API ${res.status}`);
  }

  const data = await res.json();
  return { fullName: data.full_name };
}
