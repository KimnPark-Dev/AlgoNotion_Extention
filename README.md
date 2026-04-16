# AlgoNotion Extension

백준(BOJ), SWEA(Samsung SW Expert Academy), 프로그래머스(Programmers)에서 정답 제출 시 코드를 수집해 Notion 데이터베이스에 저장하는 Chrome 확장입니다.

## 초기 설정 방법

확장 아이콘을 클릭하면 설정 팝업이 열립니다.

---

### 1. Notion 연결

팝업 상단의 **Notion 연결** 버튼을 클릭하면 Notion 인증 화면이 열립니다.  
워크스페이스를 선택하고 **접근 허용**을 클릭하면 자동으로 연결됩니다.

> 첫 연결 직후에는 데이터베이스 목록이 나타나기까지 수 초가 걸릴 수 있습니다.  
> 목록이 비어 있다면 **↻ 새로고침** 버튼을 눌러주세요.

---

### 2. 데이터베이스 선택

Notion 연결이 완료되면 접근 가능한 데이터베이스 목록이 드롭다운으로 자동 표시됩니다.  
저장할 데이터베이스를 선택하세요.

---

### 3. 사용자 이름 입력

`사용자 이름` 입력란에 Notion에 기록될 이름을 입력합니다.  
입력란에서 포커스가 벗어나는 순간 자동 저장됩니다. (입력하지 않아도 무방합니다)

---

## 동작 방식

### 백준 (Baekjoon)

1. 채점 현황 페이지(`acmicpc.net/status`)를 폴링하며 **맞았습니다!!** 행을 감지
2. 해당 제출의 소스 코드를 다운로드
3. [solved.ac](https://solved.ac) API로 문제 제목·티어 보강
4. 백엔드 서버(`/analyze`)로 전송 → AI 분석 후 Notion에 저장

### SWEA (Samsung SW Expert Academy)

1. 문제 상세 페이지(`swexpertacademy.com/main/code/problem/problemDetail.do`)를 폴링
2. 제출 목록에서 **Pass** 결과 행의 "코드보기" 버튼 옆에 "Notion 업로드" 버튼 주입
3. 버튼 클릭 시 `submitCodePopup.do` 페이지에서 소스코드 추출
4. 백엔드 서버(`/analyze`)로 전송 → AI 분석 후 Notion에 저장

> SWEA는 난이도·메모리·시간 정보를 제공하지 않아 해당 필드는 빈 값으로 저장됩니다.

### 프로그래머스 (Programmers)

1. 문제 풀이 페이지(`school.programmers.co.kr/learn/`)에서 **MutationObserver**로 "정답입니다!" 모달 감지
2. 모달 footer에 **Notion 업로드** 버튼 자동 주입 (정답 시에만 활성화)
3. Monaco Editor 코드를 MAIN world 브릿지(`programmers_monaco_bridge.js`)로 추출
4. 백엔드 서버(`/analyze`)로 전송 → AI 분석 후 Notion에 저장

> 코드 실행("코드 실행" 버튼) 후 정답 제출 시 로컬 테스트 결과의 최대 실행시간·메모리가 함께 저장됩니다.  
> 코드 실행 없이 제출한 경우 해당 필드는 빈 값으로 저장됩니다.

## 폴더 구조

```
extension/
├── manifest.json               # Manifest V3 설정
├── rules.json                  # declarativeNetRequest 규칙
├── assets/                     # 아이콘 (16/48/128px)
├── background/
│   └── service_worker.js       # 메시지 수신 → solved.ac → /analyze → Notion 저장
├── content/
│   ├── baekjoon_content.js         # 백준 채점 현황 감지 + 업로드 버튼 주입
│   ├── swea_content.js             # SWEA 제출 결과 감지 + 업로드 버튼 주입
│   ├── programmers_content.js      # 프로그래머스 정답 모달 감지 + 업로드 버튼 주입
│   └── programmers_monaco_bridge.js # MAIN world Monaco 에디터 코드 추출 브릿지
├── options/
│   ├── options.html            # 설정 페이지 UI
│   └── options.js              # 설정 저장/불러오기
├── popup/
│   ├── popup.html              # 팝업 UI
│   └── popup.js                # 팝업 동작
└── scripts/
    ├── api_client.js           # solved.ac / 백엔드 API 호출
    ├── language_normalizer.js  # 언어명 정규화 (백준 + SWEA + 프로그래머스)
    ├── notion_client.js        # Notion API 직접 호출 (페이지 생성)
    ├── oauth.js                # Notion OAuth 흐름 (연결/해제/토큰 조회/DB 목록 조회)
    └── payload_builder.js      # /analyze 페이로드 조립 (백준 + SWEA + 프로그래머스)
```

## 설치 방법

1. 이 레포 클론 또는 ZIP 다운로드
2. Chrome 주소창에 `chrome://extensions` 입력
3. **개발자 모드** 활성화
4. **압축해제된 확장 프로그램을 로드합니다** 클릭 → 폴더 선택

## 사용법

### 백준

1. 백준에서 문제 제출
2. 채점 현황 페이지(`acmicpc.net/status`)로 이동
3. **맞았습니다!!** 또는 **부분 점수(40점 이상)** 행 옆 **Notion 업로드** 버튼 클릭
4. Notion 데이터베이스에 자동 저장

### SWEA

1. SWEA에서 문제 풀이 후 제출
2. 문제 상세 페이지의 제출 결과 목록에서 **Pass** 행 확인
3. "코드보기" 옆 **Notion 업로드** 버튼 클릭
4. Notion 데이터베이스에 자동 저장

### 프로그래머스

1. 프로그래머스에서 문제 풀이 후 **제출 후 채점하기** 클릭
2. **정답입니다!** 모달이 뜨면 **Notion 업로드** 버튼 클릭
3. Notion 데이터베이스에 자동 저장

## 업데이트 이력

### v2.5.0
- **프로그래머스 플랫폼 지원 추가** — `school.programmers.co.kr` 정답 제출을 Notion에 자동 저장
  - "정답입니다!" 모달 감지(MutationObserver) 후 버튼 주입 — 정답 시에만 활성화되어 오남용 방지
  - Monaco Editor 코드 추출을 위한 MAIN world 브릿지(`programmers_monaco_bridge.js`) 구현 (CSP 우회)
  - `data-lesson-id` / `data-challenge-level` attribute 기반 문제 ID·레벨 추출 (URL 파싱 대비 안정성 향상)
  - `div#tour7 > button` 선택자로 언어 추출 — 기존 방식의 `"text"` 오염값 버그 수정
  - 로컬 테스트 결과(`td.result.passed`)에서 최대 실행시간·메모리 자동 추출 (µs / KB 단위 정수 변환)
  - `language_normalizer.js`에 프로그래머스 언어 표기 추가 (`python3`, `c++14`, `c++17`, `mysql`, `oracle`)

### v2.4.3
- **백준 부분 점수 업로드 지원** — 결과가 "N점" 형태로 표시되는 부분 점수 문제에서 **40점 이상**이면 Notion 업로드 버튼 활성화
- **Chrome Web Store 검색 노출 개선** — `short_name` 추가, description 한국어 병기, 아이콘 16/48/128px 모두 등록

### v2.4.2
- **저장 버튼 제거** — 팝업·설정 페이지 모두 저장 버튼 없이 자동 저장으로 변경
  - 데이터베이스 드롭다운에서 항목을 선택하면 즉시 저장
  - 사용자 이름 입력 후 포커스가 벗어나면 자동 저장
  - 사용자 이름 미입력 시에도 정상 동작 (Notion `유저` 컬럼 빈 값으로 저장)

### v2.4.1
- **SWEA 보일러플레이트 주석 자동 제거** — 업로드 시 SWEA 기본 제공 주석(입출력 예제, 알고리즘 구현 안내 등)을 언어별로 자동 제거
  - Python: `'''...'''` 예제 블록, `# ///` 구분선, `#import sys` / `#sys.stdin` 제거
  - C++: `////` 구분선, `//` 예제 주석 블록, `/* */` 안내 블록, `//freopen` 제거
  - Java: `////` 구분선, `//` 예제 주석 블록, `/* */` 안내 블록, `//System.setIn` 제거
- **Notion 코드 블록 언어 오류 수정** — C++ 제출 시 `cpp` → `c++` 변환으로 Notion API 422 오류 해결
- **Notion "티어" 컬럼 저장** — 백준(Bronze V · Gold III 등) 및 SWEA(D1~D6) 난이도를 "티어" select 컬럼에 자동 저장

### v2.4
- **DB 드롭다운 추가** — Notion 연결 후 접근 가능한 데이터베이스 목록을 자동으로 불러와 드롭다운으로 선택 가능
- **UI 전면 리디자인** — 흰 배경 + 퍼플(`#7c3aed`) 포인트 컬러로 아이콘 브랜드와 통일
- Database ID 직접 입력 필드 제거 (드롭다운으로 대체)
- Notion 템플릿 가져오기 버튼 제거
- 연결 직후 데이터베이스 목록 로딩 안내 문구 추가

### v2.3.1
- 설정 페이지에서 Notion DB 링크 자동 추출 기능 개선

### v2.3
- 팝업에 **Notion 템플릿 가져오기** 버튼 추가

### v2.2
- Notion OAuth 연결/해제 기능 추가 (Integration 토큰 없이 워크스페이스 직접 연결)

### v2.1
- 백엔드 `/analyze` 엔드포인트로 전환 및 Notion API 직접 호출 방식으로 리팩토링

## 기여

[CONTRIBUTING.md](./CONTRIBUTING.md) 참고
