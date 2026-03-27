/**
 * 백준/브라우저에서 얻은 언어 문자열을 백엔드/Notion 규격(소문자 키)으로 통일한다.
 */

/** 언어 표기 → 소문자 키 매핑 (정규화된 키: python, java, cpp 등) */
const LANGUAGE_MAP = {
  'python': 'python',
  'python 3': 'python',
  'python3': 'python',
  'py': 'python',
  'java': 'java',
  'java 11': 'java',
  'java 17': 'java',
  'java8': 'java',
  'java 8': 'java',
  'javascript': 'javascript',
  'js': 'javascript',
  'node.js': 'javascript',
  'typescript': 'typescript',
  'ts': 'typescript',
  'c': 'c',
  'c++': 'cpp',
  'cpp': 'cpp',
  'C++17': 'cpp',
  'C++14': 'cpp',
  'c++20': 'cpp',
  'kotlin': 'kotlin',
  'go': 'go',
  'golang': 'go',
  'rust': 'rust',
  'ruby': 'ruby',
  'swift': 'swift',
  'scala': 'scala',
  'php': 'php',
  'r': 'r',
  'd': 'd',
  'text': 'text',
  // SWEA 언어 표기
  'c (gcc-10.5)': 'c',
  'c++14 (gcc-10.5)': 'cpp',
  'java (openjdk 8)': 'java',
  'python 3.7 (pypy 7.3.9)': 'python',
};

/**
 * 정규화용: 앞뒤 공백 제거, 연속 공백을 하나로, 슬래시 뒤 제거(예: "Python 3 / 수정" → "Python 3")
 * @param {string} raw
 * @returns {string}
 */
function normalizeRaw(raw) {
  return (raw || '')
    .replace(/\s*\/\s*.*$/, '') // "Python 3 / 수정" → "Python 3"
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * 언어 문자열을 백엔드가 인식하는 소문자 키로 변환한다.
 * @param {string} rawLanguage - 예: "Python 3 / 수정", "Java 11"
 * @returns {string} - 예: "python", "java"
 */
export function normalizeLanguage(rawLanguage) {
  const key = normalizeRaw(rawLanguage);
  if (!key) return 'text';

  if (LANGUAGE_MAP[key] !== undefined) {
    return LANGUAGE_MAP[key];
  }

  // 부분 매칭: "python 3.10" → python
  for (const [pattern, value] of Object.entries(LANGUAGE_MAP)) {
    if (key.startsWith(pattern) || key.includes(pattern)) {
      return value;
    }
  }

  return key; // 알 수 없는 언어는 소문자화한 원본 반환
}
