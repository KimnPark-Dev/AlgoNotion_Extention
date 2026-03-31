# AlgoNotion Extension

백준(BOJ)과 SWEA(Samsung SW Expert Academy)에서 정답 제출 시 코드를 수집해 Notion 데이터베이스에 저장하는 Chrome 확장입니다.

## 초기 설정 방법

확장 아이콘을 클릭하면 설정 팝업이 열립니다.

---

### 1. Notion 연결

팝업 상단의 **Notion 연결** 버튼을 클릭하면 Notion 인증 화면이 열립니다.  
워크스페이스를 선택하고 **접근 허용**을 클릭하면 자동으로 연결됩니다.

---

### 2. Notion Database 링크 가져오기

**① Notion에서 저장할 데이터베이스 페이지 열기**

![DB 1단계](manual/HowToGetDB_url_1.png)

**② 사이드바에서 데이터베이스에 마우스 오버 후 `...` 클릭**

![DB 2단계](manual/HowToGetDB_url_2.png)

**③ `링크 복사` 클릭**

![DB 3단계](manual/HowToGetDB_url_3.png)

**④ 팝업의 `Notion Database 링크` 입력란에 붙여넣기 → `저장`**

![DB 4단계](manual/HowToGetDB_url_4.png)

---

### 3. 사용자 이름 입력

팝업의 `사용자 이름` 입력란에 Notion에 기록될 이름을 입력하고 **저장**을 클릭합니다.

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

## 폴더 구조

```
extension/
├── manifest.json               # Manifest V3 설정
├── rules.json                  # declarativeNetRequest 규칙
├── assets/                     # 아이콘 (16/48/128px)
├── background/
│   └── service_worker.js       # 메시지 수신 → solved.ac → /analyze → Notion 저장
├── content/
│   ├── baekjoon_content.js     # 백준 채점 현황 감지 + 업로드 버튼 주입
│   └── swea_content.js         # SWEA 제출 결과 감지 + 업로드 버튼 주입
├── options/
│   ├── options.html            # 설정 페이지 UI
│   └── options.js              # 설정 저장/불러오기
└── scripts/
    ├── api_client.js           # solved.ac / 백엔드 API 호출
    ├── language_normalizer.js  # 언어명 정규화 (백준 + SWEA)
    ├── notion_client.js        # Notion API 직접 호출 (페이지 생성)
    ├── oauth.js                # Notion OAuth 흐름 (연결/해제/토큰 조회)
    └── payload_builder.js      # /analyze 페이로드 조립 (백준 + SWEA)
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
3. **맞았습니다!!** 옆 **Notion 업로드** 버튼 클릭
4. Notion 데이터베이스에 자동 저장

### SWEA

1. SWEA에서 문제 풀이 후 제출
2. 문제 상세 페이지의 제출 결과 목록에서 **Pass** 행 확인
3. "코드보기" 옆 **Notion 업로드** 버튼 클릭
4. Notion 데이터베이스에 자동 저장

## 기여

[CONTRIBUTING.md](./CONTRIBUTING.md) 참고
