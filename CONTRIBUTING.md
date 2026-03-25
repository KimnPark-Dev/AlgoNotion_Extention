# Contributing

## 브랜치 전략

```
main       ← 배포용 (직접 push 금지)
develop    ← 개발 통합 브랜치
feat/xxx   ← 기능 개발
fix/xxx    ← 버그 수정
```

## 작업 흐름

1. `develop` 에서 브랜치 생성
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feat/기능명
   ```

2. 작업 후 커밋
   ```bash
   git commit -m "feat: 기능 설명"
   ```

3. `develop` 으로 PR 생성

4. 리뷰 후 머지, `main` 은 배포 시에만 머지

## 커밋 메시지 규칙

| 타입 | 설명 |
|------|------|
| feat | 새 기능 |
| fix | 버그 수정 |
| refactor | 리팩토링 |
| docs | 문서 수정 |
| chore | 기타 |
