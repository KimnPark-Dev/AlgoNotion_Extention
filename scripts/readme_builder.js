/**
 * GitHub 레포용 README.md / Summary.md 생성
 */

const PLATFORM_KO = {
  baekjoon:    '백준',
  swea:        'SWEA',
  programmers: '프로그래머스',
};

const PLATFORM_LINK = {
  baekjoon:    (id) => `https://www.acmicpc.net/problem/${id}`,
  swea:        (id) => `https://swexpertacademy.com/main/code/problem/problemDetail.do?contestProbId=${id}`,
  programmers: (id) => `https://school.programmers.co.kr/learn/courses/30/lessons/${id}`,
};

function formatDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * README.md 본문 생성
 * @param {object} opts
 * @param {string} opts.platform   - baekjoon | swea | programmers
 * @param {string} opts.problemId
 * @param {string} opts.title
 * @param {string} opts.level      - "Gold IV" / "Lv.2" / "D3"
 * @param {string} opts.language
 * @param {number|null} opts.time   - ms
 * @param {number|null} opts.memory - KB
 * @param {string[]} opts.tags
 * @param {{description: string, input: string, output: string}|null} opts.problemDetail
 * @returns {string}
 */
export function buildReadme({ platform, problemId, title, level, language, time, memory, tags = [], problemDetail = null }) {
  const platformKo = PLATFORM_KO[platform] || platform;
  const link = PLATFORM_LINK[platform] ? PLATFORM_LINK[platform](problemId) : '';
  const tierLabel = level ? `[${level}] ` : '';
  const dateStr = formatDate();

  let md = `# ${tierLabel}${title} - ${problemId}\n\n`;
  if (link) md += `[문제 링크](${link})\n\n`;

  md += `### 플랫폼\n\n${platformKo}\n\n`;

  // 성능 요약 — 둘 다 있을 때만 섹션 생성 (둘 중 하나만 있어도 OK)
  if (memory != null || time != null) {
    md += `### 성능 요약\n\n`;
    const parts = [];
    if (memory != null) parts.push(`메모리: ${memory} KB`);
    if (time != null)   parts.push(`시간: ${time} ms`);
    md += parts.join(', ') + '\n\n';
  }

  // 분류 — 태그 있을 때만
  if (tags && tags.length) {
    md += `### 분류\n\n${tags.join(', ')}\n\n`;
  }

  if (language) md += `### 언어\n\n${language}\n\n`;

  md += `### 제출 일자\n\n${dateStr}\n\n`;

  if (problemDetail) {
    if (problemDetail.description) {
      md += `### 문제 설명\n\n${problemDetail.description}\n\n`;
    }
    if (problemDetail.input) {
      md += `### 입력\n\n${problemDetail.input}\n\n`;
    }
    if (problemDetail.output) {
      md += `### 출력\n\n${problemDetail.output}\n\n`;
    }
  }

  return md;
}

/**
 * Summary.md — LLM 분석 결과
 * @param {object} analysis - /analyze 응답
 * @param {string} language - 코드블록 태그용
 */
export function buildSummary(analysis, language = '') {
  if (!analysis) return '';

  let md = `# 🤖 AI 분석\n\n`;

  if (analysis.approach) {
    md += `## 💡 접근 방식\n\n${analysis.approach}\n\n`;
  }
  if (analysis.time_complexity) {
    md += `## ⏱️ 시간 복잡도\n\n${analysis.time_complexity}\n\n`;
  }
  if (analysis.space_complexity) {
    md += `## 📦 공간 복잡도\n\n${analysis.space_complexity}\n\n`;
  }
  if (analysis.improvement) {
    md += `## 🔧 개선 사항\n\n${analysis.improvement}\n\n`;
  }
  if (analysis.next_problem) {
    md += `## 🎯 다음 추천 문제\n\n${analysis.next_problem}\n\n`;
  }
  if (Array.isArray(analysis.tags) && analysis.tags.length) {
    md += `## 🏷️ 태그\n\n${analysis.tags.join(', ')}\n\n`;
  }
  if (analysis.better_code) {
    md += `## ✨ 모범 답안\n\n\`\`\`${language}\n${analysis.better_code}\n\`\`\`\n`;
  }

  return md;
}
