// Content script로부터 전달되는 메시지 수신 → solved.ac 보강 → /analyze 호출 → Notion 저장
import { fetchSolvedAcProblem, postToAnalyze } from '../scripts/api_client.js';
import { normalizeLanguage } from '../scripts/language_normalizer.js';
import { buildWebhookPayload, buildSweaWebhookPayload } from '../scripts/payload_builder.js';
import { postToNotionPage } from '../scripts/notion_client.js';

const BACKEND_URL = 'https://algonotion.site';
const NOTION_TOKEN_KEY = 'algonotion_notion_token';
const NOTION_DATABASE_ID_KEY = 'algonotion_notion_database_id';
const USER_NAME_KEY = 'algonotion_user_name';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case 'BAEKJOON_AC_SUBMISSION': {
      const payload = message.payload || {};

      if (!payload.code) {
        sendResponse({ ok: false, stage: 'validation', error: 'payload has no code' });
        return false;
      }

      (async () => {
        try {
          // 1) solved.ac에서 문제 제목·티어 조회
          let titleKo = '';
          let level = null;
          try {
            const solved = await fetchSolvedAcProblem(payload.problemId);
            titleKo = solved.titleKo;
            level = solved.level;
          } catch (e) {
            console.warn('[AlgoNotion] solved.ac 실패 (계속 진행):', e.message);
          }

          // 2) 언어 정규화
          const language = normalizeLanguage(payload.language);

          const notionSettings = await getNotionSettings();
          if (!notionSettings.notionToken || !notionSettings.notionDatabaseId) {
            throw new Error('Notion settings are missing. Configure token and database ID in the extension options.');
          }

          // 3) /analyze 페이로드 조립 (notion_settings 제외)
          const analyzePayload = buildWebhookPayload({
            platform: 'baekjoon',
            problemId: payload.problemId,
            title: titleKo,
            level,
            language,
            code: payload.code,
            time: payload.time,
            memory: payload.memory,
          });

          // 4) 백엔드 /analyze 호출 → AI 분석 결과 수신
          const { analysis } = await postToAnalyze(BACKEND_URL, analyzePayload);

          // 5) Notion 페이지 직접 생성
          await postToNotionPage({
            token: notionSettings.notionToken,
            databaseId: notionSettings.notionDatabaseId,
            userName: notionSettings.userName,
            payload: analyzePayload,
            analysis,
          });

          console.log('[AlgoNotion] 업로드 완료:', payload.problemId, payload.submissionId);
          sendResponse({ ok: true });
        } catch (err) {
          console.error('[AlgoNotion] 업로드 실패:', err.message);
          sendResponse({
            ok: false,
            stage: 'background',
            error: err?.message || String(err),
          });
        }
      })();

      return true;
    }
    case 'SWEA_AC_SUBMISSION': {
      const payload = message.payload || {};

      if (!payload.code) {
        sendResponse({ ok: false, stage: 'validation', error: 'payload has no code' });
        return false;
      }

      (async () => {
        try {
          const language = normalizeLanguage(payload.language);
          const notionSettings = await getNotionSettings();
          if (!notionSettings.notionToken || !notionSettings.notionDatabaseId) {
            throw new Error('Notion settings are missing. Configure token and database ID in the extension options.');
          }

          // /analyze 페이로드 조립 (notion_settings 제외)
          const analyzePayload = buildSweaWebhookPayload({
            problemId: payload.problemId,
            contestProbId: payload.contestProbId,
            title: payload.title,
            level: payload.level,
            language,
            code: payload.code,
            time: payload.time,
            memory: payload.memory,
          });

          // 백엔드 /analyze 호출 → AI 분석 결과 수신
          const { analysis } = await postToAnalyze(BACKEND_URL, analyzePayload);

          // Notion 페이지 직접 생성
          await postToNotionPage({
            token: notionSettings.notionToken,
            databaseId: notionSettings.notionDatabaseId,
            userName: notionSettings.userName,
            payload: analyzePayload,
            analysis,
          });

          console.log('[AlgoNotion] SWEA 업로드 완료:', payload.problemId);
          sendResponse({ ok: true });
        } catch (err) {
          console.error('[AlgoNotion] SWEA 업로드 실패:', err.message);
          sendResponse({
            ok: false,
            stage: 'background',
            error: err?.message || String(err),
          });
        }
      })();

      return true;
    }
    default:
      break;
  }
  return false;
});

async function getNotionSettings() {
  const st = await chrome.storage.local.get([NOTION_TOKEN_KEY, NOTION_DATABASE_ID_KEY, USER_NAME_KEY]);
  return {
    notionToken: (st[NOTION_TOKEN_KEY] || '').trim(),
    notionDatabaseId: (st[NOTION_DATABASE_ID_KEY] || '').trim(),
    userName: (st[USER_NAME_KEY] || '').trim(),
  };
}