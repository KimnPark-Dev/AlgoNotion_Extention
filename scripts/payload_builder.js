const LEVEL_TIER_NAMES = [
  'Unrated', 'Bronze V', 'Bronze IV', 'Bronze III', 'Bronze II', 'Bronze I',
  'Silver V', 'Silver IV', 'Silver III', 'Silver II', 'Silver I',
  'Gold V', 'Gold IV', 'Gold III', 'Gold II', 'Gold I',
  'Platinum V', 'Platinum IV', 'Platinum III', 'Platinum II', 'Platinum I',
  'Diamond V', 'Diamond IV', 'Diamond III', 'Diamond II', 'Diamond I',
  'Ruby V', 'Ruby IV', 'Ruby III', 'Ruby II', 'Ruby I',
];

function levelToTierName(level) {
  if (level == null || level < 0 || level > 30) return null;
  return LEVEL_TIER_NAMES[level] || null;
}

export function buildWebhookPayload({
  platform = 'baekjoon',
  problemId,
  title = '',
  level = null,
  language,
  code,
  time = null,
  memory = null,
  notionToken = '',
  notionDatabaseId = '',
  userName = '',
}) {
  const link = `https://www.acmicpc.net/problem/${problemId}`;
  const tierName = typeof level === 'number' ? levelToTierName(level) : level;

  return {
    platform,
    meta_info: {
      title: title || `문제 ${problemId}`,
      problem_id: String(problemId),
      link,
      level: tierName != null ? String(tierName) : null,
      language,
    },
    submission_info: {
      code,
      memory: memory != null ? Number(memory) : null,
      time: time != null ? Number(time) : null,
    },
    notion_settings: {
      token: notionToken,
      database_id: notionDatabaseId,
      user_name: userName,
    },
  };
}

export function buildSweaWebhookPayload({
  problemId,
  contestProbId = '',
  title = '',
  level = null,
  language,
  code,
  time = null,
  memory = null,
  notionToken = '',
  notionDatabaseId = '',
  userName = '',
}) {
  const link = contestProbId
    ? `https://swexpertacademy.com/main/code/problem/problemDetail.do?contestProbId=${contestProbId}`
    : `https://swexpertacademy.com/main/code/problem/problemDetail.do?contestProbId=${problemId}`;

  return {
    platform: 'swea',
    meta_info: {
      title: title || `문제 ${problemId}`,
      problem_id: String(problemId),
      link,
      level: level != null ? String(level) : null,
      language,
    },
    submission_info: {
      code,
      memory: memory != null ? Number(memory) : null,
      time: time != null ? Number(time) : null,
    },
    notion_settings: {
      token: notionToken,
      database_id: notionDatabaseId,
      user_name: userName,
    },
  };
}
