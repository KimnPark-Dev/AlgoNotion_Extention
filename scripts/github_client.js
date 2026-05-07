/**
 * GitHub REST API — 알고리즘 풀이 파일 커밋
 *
 * Git 저수준 API 5단계 흐름 (다중 파일 지원):
 *  1. GET  /git/ref/heads/{branch}    → 현재 HEAD commit SHA
 *  2. POST /git/blobs                 → 파일마다 blob 생성 (base64)
 *  3. POST /git/trees                 → 모든 파일 포함한 트리 생성
 *  4. POST /git/commits               → 커밋 생성
 *  5. PATCH /git/refs/heads/{branch}  → 브랜치 포인터 업데이트
 */

import { buildReadme, buildSummary } from './readme_builder.js';

const GITHUB_API = 'https://api.github.com';

function encodeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

const LANGUAGE_EXT = {
  python:      'py',
  python3:     'py',
  java:        'java',
  javascript:  'js',
  typescript:  'ts',
  cpp:         'cpp',
  c:           'c',
  kotlin:      'kt',
  swift:       'swift',
  go:          'go',
  rust:        'rs',
  ruby:        'rb',
  scala:       'scala',
};

function getExtension(language) {
  return LANGUAGE_EXT[(language || '').toLowerCase()] || 'txt';
}

const PLATFORM_DIR = {
  baekjoon:    '백준',
  swea:        'SWEA',
  programmers: '프로그래머스',
};

/**
 * BaekjoonHub 폴더 규칙에 맞춘 레벨 변환.
 * - baekjoon: 디테일 티어("Gold IV") → 메이저("Gold"). 첫 단어만 사용.
 * - programmers: "Lv.2" / "Lv. 2" / "level2" → 숫자만("2").
 * - swea: 그대로(D6, Unrated 등).
 */
function toFolderLevel(platform, level) {
  const raw = (level || '').toString().trim();
  if (!raw) return 'Unrated';

  if (platform === 'baekjoon') {
    return raw.split(/\s+/)[0];
  }
  if (platform === 'programmers') {
    const m = raw.match(/\d+/);
    return m ? m[0] : raw;
  }
  return raw;
}

/**
 * BaekjoonHub 스타일 경로: 백준/Gold/1260. DFS와 BFS
 */
function buildFolder(platform, level, problemId, title) {
  const platformDir = PLATFORM_DIR[platform] || platform;
  const levelDir = sanitize(toFolderLevel(platform, level));
  const safeTitle = sanitize(title || '');
  return `${platformDir}/${levelDir}/${problemId}. ${safeTitle}`;
}

/**
 * 파일 시스템/GitHub 경로에 쓸 수 없는 문자를 전각 문자로 치환한다.
 * BaekjoonHub 방식 — 문자 의미 보존하면서 경로 안전성 확보.
 * e.g. "0/1 Knapsack" → "0／1 Knapsack"
 */
function sanitize(text) {
  return String(text)
    .replace(/\\/g, '＼')
    .replace(/\//g, '／')
    .replace(/:/g, '：')
    .replace(/\*/g, '＊')
    .replace(/\?/g, '？')
    .replace(/"/g, '＂')
    .replace(/</g, '＜')
    .replace(/>/g, '＞')
    .replace(/\|/g, '｜')
    .trim();
}

function buildCommitMessage({ platform, problemId, title, level, time, memory }) {
  const platformLabel = PLATFORM_DIR[platform] || platform;
  let msg = `[${level || '?'}] Title: ${title}, Time: ${time != null ? `${time} ms` : '-'}, Memory: ${memory != null ? `${memory} KB` : '-'} -${platformLabel}`;
  return msg;
}

async function githubFetch(path, token, method = 'GET', body = null) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API ${res.status} ${path}`);
  }
  return res.json();
}

/**
 * 풀이 관련 여러 파일을 한 커밋에 올린다 (README.md, 코드, Summary.md).
 *
 * @param {object} options
 * @param {string} options.token
 * @param {string} options.repo            - "owner/repo"
 * @param {string} options.platform
 * @param {string} options.problemId
 * @param {string} options.title
 * @param {string} options.level
 * @param {string} options.language
 * @param {string} options.code
 * @param {number|null} options.time
 * @param {number|null} options.memory
 * @param {string[]} [options.tags]
 * @param {object|null} [options.problemDetail]  - { description, input, output }
 * @param {object|null} [options.analysis]       - /analyze 응답 결과
 * @param {string} [options.branch]
 * @returns {Promise<string>}  커밋 HTML URL
 */
export async function commitSolution({
  token, repo, platform, problemId, title, level, language, code,
  time, memory, tags = [], problemDetail = null, analysis = null,
  branch = 'main',
}) {
  const [owner, repoName] = repo.split('/');
  const folder = buildFolder(platform, level, problemId, title);
  const codeFileName = `${sanitize(title)}.${getExtension(language)}`;

  // 1) 커밋할 파일 목록 구성
  const files = [];

  const readmeContent = buildReadme({
    platform, problemId, title, level, language, time, memory, tags, problemDetail,
  });
  files.push({ path: `${folder}/README.md`, content: readmeContent });

  files.push({ path: `${folder}/${codeFileName}`, content: code });

  if (analysis) {
    const summaryContent = buildSummary(analysis, language);
    if (summaryContent) {
      files.push({ path: `${folder}/Summary.md`, content: summaryContent });
    }
  }

  // 2) 현재 브랜치 HEAD SHA
  const refData = await githubFetch(`/repos/${owner}/${repoName}/git/ref/heads/${branch}`, token);
  const parentSha = refData.object.sha;

  // 3) 각 파일 blob 생성
  const blobs = await Promise.all(
    files.map(f =>
      githubFetch(`/repos/${owner}/${repoName}/git/blobs`, token, 'POST', {
        content: encodeBase64(f.content),
        encoding: 'base64',
      })
    )
  );

  // 4) 트리 생성 (모든 파일 포함)
  const treeData = await githubFetch(`/repos/${owner}/${repoName}/git/trees`, token, 'POST', {
    base_tree: parentSha,
    tree: files.map((f, i) => ({
      path: f.path,
      mode: '100644',
      type: 'blob',
      sha: blobs[i].sha,
    })),
  });

  // 5) 커밋
  const commitData = await githubFetch(`/repos/${owner}/${repoName}/git/commits`, token, 'POST', {
    message: buildCommitMessage({ platform, problemId, title, level, time, memory }),
    tree: treeData.sha,
    parents: [parentSha],
  });

  // 6) 브랜치 업데이트
  await githubFetch(`/repos/${owner}/${repoName}/git/refs/heads/${branch}`, token, 'PATCH', {
    sha: commitData.sha,
  });

  return commitData.html_url;
}
