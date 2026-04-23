// Content script로부터 전달되는 메시지 수신 → solved.ac 보강 → /analyze 호출 → Notion/GitHub 저장
import { fetchSolvedAcProblem, postToAnalyze } from '../scripts/api_client.js';
import { normalizeLanguage } from '../scripts/language_normalizer.js';
import { buildWebhookPayload, buildSweaWebhookPayload, buildProgrammersWebhookPayload } from '../scripts/payload_builder.js';
import { postToNotionPage } from '../scripts/notion_client.js';
import { commitSolution } from '../scripts/github_client.js';

const BACKEND_URL = 'https://algonotion.site';
const NOTION_TOKEN_KEY = 'algonotion_notion_token';
const NOTION_DATABASE_ID_KEY = 'algonotion_notion_database_id';
const USER_NAME_KEY = 'algonotion_user_name';
const GITHUB_TOKEN_KEY = 'algonotion_github_token';
const GITHUB_REPO_KEY = 'algonotion_github_repo';

/**
 * Notion + GitHub 업로드를 각각 독립적으로 실행한다.
 * - Notion 설정이 있으면 /analyze 호출 후 Notion 저장
 * - GitHub 설정이 있으면 커밋
 * - 둘 다 없으면 에러
 */
async function dispatchUpload({ analyzePayload, notionSettings, githubSettings, rawSubmission }) {
  const hasNotion = !!(notionSettings.notionToken && notionSettings.notionDatabaseId);
  const hasGithub = !!(githubSettings.githubToken && githubSettings.githubRepo);

  if (!hasNotion && !hasGithub) {
    throw new Error('Notion 또는 GitHub 중 하나는 연결해야 합니다.');
  }

  // /analyze는 Notion 본문 + GitHub Summary.md 생성에 필요
  // 두 채널 모두 필요 없는 경우는 없음 (위에서 이미 hasNotion || hasGithub 체크)
  let analysisResult = null;
  try {
    const { analysis } = await postToAnalyze(BACKEND_URL, analyzePayload);
    analysisResult = analysis;
  } catch (err) {
    console.warn('[AlgoNotion] /analyze 실패 (계속 진행):', err?.message);
  }

  const tasks = [];

  if (hasNotion) {
    tasks.push(
      postToNotionPage({
        token: notionSettings.notionToken,
        databaseId: notionSettings.notionDatabaseId,
        userName: notionSettings.userName,
        payload: analyzePayload,
        analysis: analysisResult,
      }).then(
        () => ({ target: 'notion', ok: true }),
        (err) => ({ target: 'notion', ok: false, error: err?.message || String(err) })
      )
    );
  }

  if (hasGithub) {
    tasks.push(
      commitSolution({
        token: githubSettings.githubToken,
        repo: githubSettings.githubRepo,
        platform: rawSubmission.platform,
        problemId: rawSubmission.problemId,
        title: rawSubmission.title,
        level: rawSubmission.level,
        language: rawSubmission.language,
        code: rawSubmission.code,
        time: rawSubmission.time,
        memory: rawSubmission.memory,
        tags: rawSubmission.tags || [],
        problemDetail: rawSubmission.problemDetail || null,
        analysis: analysisResult,
      }).then(
        (url) => ({ target: 'github', ok: true, url }),
        (err) => ({ target: 'github', ok: false, error: err?.message || String(err) })
      )
    );
  }

  const results = await Promise.all(tasks);
  results.forEach(r => {
    if (r.ok) console.log(`[AlgoNotion] ${r.target} 업로드 성공${r.url ? ': ' + r.url : ''}`);
    else      console.error(`[AlgoNotion] ${r.target} 업로드 실패:`, r.error);
  });

  // 하나라도 실패 시 에러로 throw (버튼 상태용)
  const failed = results.filter(r => !r.ok);
  if (failed.length === results.length) {
    throw new Error(failed.map(f => `${f.target}: ${f.error}`).join(' / '));
  }
}

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
          let titleKo = '';
          let level = null;
          let tagsKo = [];
          try {
            const solved = await fetchSolvedAcProblem(payload.problemId);
            titleKo = solved.titleKo;
            level = solved.level;
            tagsKo = solved.tagsKo || [];
          } catch (e) {
            console.warn('[AlgoNotion] solved.ac 실패 (계속 진행):', e.message);
          }

          const language = normalizeLanguage(payload.language);

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

          const [notionSettings, githubSettings] = await Promise.all([
            getNotionSettings(),
            getGitHubSettings(),
          ]);

          await dispatchUpload({
            analyzePayload,
            notionSettings,
            githubSettings,
            rawSubmission: {
              platform: 'baekjoon',
              problemId: payload.problemId,
              title: titleKo,
              level: analyzePayload.meta_info.level,
              language,
              code: payload.code,
              time: payload.time,
              memory: payload.memory,
              tags: tagsKo,
              problemDetail: payload.problemDetail || null,
            },
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

          const [notionSettings, githubSettings] = await Promise.all([
            getNotionSettings(),
            getGitHubSettings(),
          ]);

          await dispatchUpload({
            analyzePayload,
            notionSettings,
            githubSettings,
            rawSubmission: {
              platform: 'swea',
              problemId: payload.problemId,
              title: payload.title,
              level: payload.level,
              language,
              code: payload.code,
              time: payload.time,
              memory: payload.memory,
            },
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
    case 'PROGRAMMERS_AC_SUBMISSION': {
      const payload = message.payload || {};

      if (!payload.code) {
        sendResponse({ ok: false, stage: 'validation', error: 'payload has no code' });
        return false;
      }

      (async () => {
        try {
          const language = normalizeLanguage(payload.language);

          const analyzePayload = buildProgrammersWebhookPayload({
            problemId: payload.problemId,
            title: payload.title,
            level: payload.level,
            language,
            code: payload.code,
            time: payload.time,
            memory: payload.memory,
          });

          const [notionSettings, githubSettings] = await Promise.all([
            getNotionSettings(),
            getGitHubSettings(),
          ]);

          await dispatchUpload({
            analyzePayload,
            notionSettings,
            githubSettings,
            rawSubmission: {
              platform: 'programmers',
              problemId: payload.problemId,
              title: payload.title,
              level: payload.level,
              language,
              code: payload.code,
              time: payload.time,
              memory: payload.memory,
              tags: payload.tags || [],
              problemDetail: payload.problemDetail || null,
            },
          });

          console.log('[AlgoNotion] 프로그래머스 업로드 완료:', payload.problemId);
          sendResponse({ ok: true });
        } catch (err) {
          console.error('[AlgoNotion] 프로그래머스 업로드 실패:', err.message);
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

async function getGitHubSettings() {
  const st = await chrome.storage.local.get([GITHUB_TOKEN_KEY, GITHUB_REPO_KEY]);
  return {
    githubToken: (st[GITHUB_TOKEN_KEY] || '').trim() || null,
    githubRepo: (st[GITHUB_REPO_KEY] || '').trim() || null,
  };
}
