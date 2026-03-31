/**
 * Notion OAuth 흐름
 *
 * 흐름:
 *  1. launchWebAuthFlow → Notion 인가 화면
 *  2. Notion → 백엔드 /oauth/callback?code=...&state=<extensionId>
 *  3. 백엔드가 code 교환 → access_token 획득
 *  4. 백엔드가 https://<extensionId>.chromiumapp.org/?access_token=... 로 리다이렉트
 *  5. launchWebAuthFlow가 해당 URL을 캡처해 반환
 *  6. 토큰을 chrome.storage.local에 저장
 */

const NOTION_CLIENT_ID = '334d872b-594c-81f3-9d03-0037eca2dfde'; // OAuth-0에서 받은 client_id로 교체
const BACKEND_URL = 'https://algonotion.site';
const NOTION_TOKEN_KEY = 'algonotion_notion_token';

/**
 * Notion OAuth를 시작하고 access_token을 storage에 저장한다.
 * @returns {Promise<string>} access_token
 */
export async function startNotionOAuth() {
  const extensionId = chrome.runtime.id;
  const redirectUri = `${BACKEND_URL}/oauth/callback`;

  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', NOTION_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('owner', 'user');
  authUrl.searchParams.set('state', extensionId);

  // launchWebAuthFlow: chromiumapp.org 로 리다이렉트되면 자동으로 캡처
  const resultUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true,
  });

  const url = new URL(resultUrl);
  const token = url.searchParams.get('access_token');
  if (!token) {
    throw new Error('Notion 인증 실패: access_token이 없습니다.');
  }

  await chrome.storage.local.set({ [NOTION_TOKEN_KEY]: token });
  return token;
}

/**
 * 저장된 Notion 토큰을 삭제한다.
 */
export async function disconnectNotion() {
  await chrome.storage.local.remove(NOTION_TOKEN_KEY);
}

/**
 * 저장된 Notion 토큰을 반환한다. 없으면 null.
 * @returns {Promise<string|null>}
 */
export async function getNotionToken() {
  const result = await chrome.storage.local.get(NOTION_TOKEN_KEY);
  const token = (result[NOTION_TOKEN_KEY] || '').trim();
  return token || null;
}
