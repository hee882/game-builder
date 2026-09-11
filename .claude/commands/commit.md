---
description: 변경사항을 검토하고 의미 단위로 커밋
allowed-tools: Bash(git:*)
argument-hint: [커밋 메시지 (생략 시 자동 생성)]
---

# 커밋 생성

## 1단계: 현재 상태 확인

```bash
git status
git diff HEAD
git log --oneline -5
```

## 2단계: 변경 내용 분석

- 변경이 **여러 관심사**에 걸쳐 있으면 나누어 커밋한다
- `.env`, 시크릿, 빌드 산출물이 섞여 있으면 **중단하고 알린다**
- `$1`이 주어졌으면 그것을 메시지로 쓰고, 없으면 diff에서 생성한다

## 3단계: 커밋

메시지 형식 (Conventional Commits):

```
<type>: <한 줄 요약>

<왜 이 변경이 필요했는지>
```

`type`: `feat` | `fix` | `refactor` | `docs` | `chore` | `test`

## 4단계: 결과 보고

커밋 해시와 한 줄 요약을 출력한다. **푸시는 하지 않는다** — 사용자가 명시적으로 요청할 때만.

## 금지

- ❌ `git add -A`로 무분별하게 담지 않는다 — 파일을 확인하고 담는다
- ❌ `--no-verify`로 훅을 건너뛰지 않는다
- ❌ 기존 커밋을 `--amend`하지 않는다 (사용자 요청 시에만)
