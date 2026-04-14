/**
 * Notion API 직접 호출 — 페이지 생성
 */

const NOTION_API_URL = 'https://api.notion.com/v1/pages';
const NOTION_VERSION = '2022-06-28';

/**
 * rich_text content 2000자 제한에 맞춰 청크로 분할한다.
 */
function chunkText(text, size = 2000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function richText(text) {
  return chunkText(text || '').map(chunk => ({ type: 'text', text: { content: chunk } }));
}

function heading2(text) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: richText(text) } };
}

function heading3(text) {
  return { object: 'block', type: 'heading_3', heading_3: { rich_text: richText(text) } };
}

function paragraph(text) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: richText(text) } };
}

function divider() {
  return { object: 'block', type: 'divider', divider: {} };
}

// 내부 언어 키 → Notion API 허용 언어값 매핑
const NOTION_LANGUAGE_MAP = {
  'cpp':  'c++',
  'text': 'plain text',
};

function toNotionLanguage(lang) {
  const l = (lang || '').toLowerCase();
  return NOTION_LANGUAGE_MAP[l] || l || 'plain text';
}

function codeBlock(code, language) {
  return {
    object: 'block',
    type: 'code',
    code: {
      language: toNotionLanguage(language),
      rich_text: chunkText(code || '').map(chunk => ({ type: 'text', text: { content: chunk } })),
    },
  };
}

/**
 * Notion 데이터베이스에 분석 결과 페이지를 생성한다.
 * @param {object} options
 * @param {string} options.token       - Notion Integration secret
 * @param {string} options.databaseId - 대상 DB ID
 * @param {string} options.userName   - 유저명 (선택)
 * @param {object} options.payload    - buildWebhookPayload / buildSweaWebhookPayload 결과
 * @param {object} options.analysis   - 백엔드 /analyze 응답의 analysis 객체
 */
export async function postToNotionPage({ token, databaseId, userName, payload, analysis }) {
  const { meta_info, submission_info, platform } = payload;

  const properties = {
    '이름': {
      title: [{ type: 'text', text: { content: `[${meta_info.problem_id}] ${meta_info.title}` } }],
    },
    '플랫폼': { select: { name: platform } },
    '언어':   { select: { name: meta_info.language } },
    '시간':   { date:   { start: new Date().toISOString() } },
  };

  if (submission_info.time != null || submission_info.memory != null) {
    const t = submission_info.time   != null ? `${submission_info.time}ms`   : '-';
    const m = submission_info.memory != null ? `${submission_info.memory}KB` : '-';
    properties['성능'] = {
      rich_text: [{ type: 'text', text: { content: `${t} / ${m}` } }],
    };
  }

  if (userName) {
    properties['유저'] = { select: { name: userName } };
  }

  if (meta_info.level != null) {
    properties['티어'] = { select: { name: String(meta_info.level) } };
  }

  if (Array.isArray(analysis.tags) && analysis.tags.length > 0) {
    properties['유형'] = {
      multi_select: analysis.tags.map(tag => ({ name: tag })),
    };
  }

  const children = [
    heading2('🤖 AI 코드 리뷰'),
    heading3('💡 접근 방식'),      paragraph(analysis.approach),          divider(),
    heading3('⏱️ 시간 복잡도'),    paragraph(analysis.time_complexity),   divider(),
    heading3('📦 공간 복잡도'),    paragraph(analysis.space_complexity),  divider(),
    heading3('🔧 개선 사항'),      paragraph(analysis.improvement),       divider(),
    heading3('🎯 다음 추천 문제'), paragraph(analysis.next_problem),      divider(),
    heading2('제출 코드와 모범 답안'),
    codeBlock(submission_info.code,  meta_info.language),
    codeBlock(analysis.better_code,  meta_info.language),
  ];

  const res = await fetch(NOTION_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
      children,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Notion API error: ${err.message}`);
  }

  return res.json();
}