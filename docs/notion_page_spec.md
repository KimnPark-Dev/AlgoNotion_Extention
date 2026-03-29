# Notion 페이지 저장 스펙

Extension이 백엔드 `/analyze` 응답을 받은 뒤 Notion API를 직접 호출해 페이지를 생성합니다.
구현 위치: `scripts/notion_client.js`

---

## 사용하는 Notion API

```
POST https://api.notion.com/v1/pages
Authorization: Bearer <NOTION_TOKEN>
Notion-Version: 2022-06-28
Content-Type: application/json
```

---

## 요청 Body 구조

```json
{
  "parent": { "database_id": "<DATABASE_ID>" },
  "properties": { ... },
  "children": [ ... ]
}
```

---

## properties (DB 컬럼)

| 컬럼 | 타입 | 값 | 비고 |
|------|------|----|------|
| `이름` | title | `[{problem_id}] {title}` | 필수 |
| `플랫폼` | select | `baekjoon` / `swea` / `programmers` | 필수 |
| `언어` | select | `python` / `java` 등 | 필수 |
| `시간` | date | ISO 8601 UTC (`new Date().toISOString()`) | 필수 |
| `성능` | rich_text | `{time}ms / {memory}KB` | time·memory 있을 때만 |
| `유저` | select | 유저명 문자열 | userName 있을 때만 |

### properties 예시

```json
{
  "이름": {
    "title": [{ "type": "text", "text": { "content": "[1000] 두 수의 합" } }]
  },
  "플랫폼": {
    "select": { "name": "baekjoon" }
  },
  "언어": {
    "select": { "name": "python" }
  },
  "시간": {
    "date": { "start": "2026-03-29T11:00:00.000Z" }
  },
  "성능": {
    "rich_text": [{ "type": "text", "text": { "content": "60ms / 31120KB" } }]
  },
  "유저": {
    "select": { "name": "홍길동" }
  }
}
```

---

## children (페이지 본문 블록)

블록 순서는 아래와 같습니다.

```
[heading_2] 🤖 AI 코드 리뷰
[heading_3] 💡 접근 방식
[paragraph]  analysis.approach
[divider]
[heading_3] ⏱️ 시간 복잡도
[paragraph]  analysis.time_complexity
[divider]
[heading_3] 📦 공간 복잡도
[paragraph]  analysis.space_complexity
[divider]
[heading_3] 🔧 개선 사항
[paragraph]  analysis.improvement
[divider]
[heading_3] 🎯 다음 추천 문제
[paragraph]  analysis.next_problem
[divider]
[heading_3] 🏷️ 문제 유형
[paragraph]  analysis.tags.join(", ")
[divider]
[heading_2] 제출 코드와 모범 답안
[code]       submission_info.code  (language: meta_info.language)
[code]       analysis.better_code  (language: meta_info.language)
```

### 블록 예시

```json
[
  {
    "object": "block",
    "type": "heading_2",
    "heading_2": {
      "rich_text": [{ "type": "text", "text": { "content": "🤖 AI 코드 리뷰" } }]
    }
  },
  {
    "object": "block",
    "type": "heading_3",
    "heading_3": {
      "rich_text": [{ "type": "text", "text": { "content": "💡 접근 방식" } }]
    }
  },
  {
    "object": "block",
    "type": "paragraph",
    "paragraph": {
      "rich_text": [{ "type": "text", "text": { "content": "두 정수를 입력받아 덧셈 결과를 출력." } }]
    }
  },
  {
    "object": "block",
    "type": "divider",
    "divider": {}
  },
  {
    "object": "block",
    "type": "code",
    "code": {
      "language": "python",
      "rich_text": [{ "type": "text", "text": { "content": "a, b = map(int, input().split())\nprint(a + b)" } }]
    }
  }
]
```

---

## 주의사항: rich_text 2000자 제한

Notion API는 `rich_text` 배열의 단일 `content` 값이 **2000자를 초과하면 에러**를 반환합니다.
코드가 2000자를 넘을 경우 아래처럼 청크로 분할해야 합니다.

```js
function chunkText(text, size = 2000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function buildCodeBlock(code, language) {
  return {
    object: "block",
    type: "code",
    code: {
      language: language.toLowerCase(),
      rich_text: chunkText(code).map(chunk => ({
        type: "text",
        text: { content: chunk }
      }))
    }
  };
}
```

---

## 전체 호출 예시 (JavaScript)

```js
async function postToNotionPage({ token, databaseId, userName, payload, analysis }) {
  const { meta_info, submission_info, platform } = payload;

  const properties = {
    "이름": {
      title: [{ type: "text", text: { content: `[${meta_info.problem_id}] ${meta_info.title}` } }]
    },
    "플랫폼": { select: { name: platform } },
    "언어":   { select: { name: meta_info.language } },
    "시간":   { date:   { start: new Date().toISOString() } },
  };

  if (submission_info.time != null || submission_info.memory != null) {
    const t = submission_info.time   != null ? `${submission_info.time}ms`   : "-";
    const m = submission_info.memory != null ? `${submission_info.memory}KB` : "-";
    properties["성능"] = {
      rich_text: [{ type: "text", text: { content: `${t} / ${m}` } }]
    };
  }

  if (userName) {
    properties["유저"] = { select: { name: userName } };
  }

  const children = [
    heading2("🤖 AI 코드 리뷰"),
    heading3("💡 접근 방식"),      paragraph(analysis.approach),          divider(),
    heading3("⏱️ 시간 복잡도"),    paragraph(analysis.time_complexity),   divider(),
    heading3("📦 공간 복잡도"),    paragraph(analysis.space_complexity),  divider(),
    heading3("🔧 개선 사항"),      paragraph(analysis.improvement),       divider(),
    heading3("🎯 다음 추천 문제"), paragraph(analysis.next_problem),      divider(),
    heading3("🏷️ 문제 유형"),     paragraph(analysis.tags.join(", ")),   divider(),
    heading2("제출 코드와 모범 답안"),
    buildCodeBlock(submission_info.code,   meta_info.language),
    buildCodeBlock(analysis.better_code,   meta_info.language),
  ];

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
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

// 헬퍼 함수
const heading2  = text => ({ object:"block", type:"heading_2",  heading_2:  { rich_text:[{type:"text",text:{content:text}}] } });
const heading3  = text => ({ object:"block", type:"heading_3",  heading_3:  { rich_text:[{type:"text",text:{content:text}}] } });
const paragraph = text => ({ object:"block", type:"paragraph",  paragraph:  { rich_text:[{type:"text",text:{content:text}}] } });
const divider   = ()   => ({ object:"block", type:"divider",    divider:    {} });
```
