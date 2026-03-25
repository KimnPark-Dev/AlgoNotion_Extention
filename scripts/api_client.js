/**
 * solved.ac API 및 백엔드 웹훅 호출 래퍼
 */

const SOLVED_AC_BASE = 'https://solved.ac/api/v3/problem/show';

/**
 * solved.ac에서 문제 정보(한글 제목, 티어)를 가져온다.
 * @param {number|string} problemId
 * @returns {Promise<{ titleKo: string; level: number | null }>}
 */
export async function fetchSolvedAcProblem(problemId) {
  const url = `${SOLVED_AC_BASE}?problemId=${encodeURIComponent(problemId)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`solved.ac API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const titleKo = data.titleKo ?? data.title ?? '';
  const level = data.level != null ? data.level : null;

  return { titleKo, level };
}

/**
 * 백엔드 FastAPI /webhook 엔드포인트로 POST 요청을 보낸다.
 * @param {string} backendUrl - 예: "http://localhost:8000/webhook"
 * @param {object} payload - WebhookPayload 스펙에 맞는 JSON 객체
 * @returns {Promise<void>}
 */
export async function postToBackendWebhook(backendUrl, payload) {
  const url = backendUrl.replace(/\/?$/, '') + '/webhook';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend webhook failed: ${res.status} ${res.statusText} - ${text}`);
  }
}
