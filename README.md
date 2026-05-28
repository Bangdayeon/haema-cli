# @votra/cli

세션 간 메모리를 AI 에이전트에 제공하는 MCP 서버예요.
태스크 관리, 과거 결정 검색, 프롬프트 파일 업로드, 계정 관리 기능을 포함해요.

---

## 시작하기

### 1. 설치 & MCP 등록

```bash
npm i -g @votra/cli
votra install
```

`votra install`이 하는 것:
- Claude Desktop `claude_desktop_config.json`에 MCP 서버 등록
- `~/.claude/CLAUDE.md`에 툴 사용 가이드 추가

→ **Claude Desktop 재시작**

### 2. 로그인

Claude Desktop에서:

```
signin 툴 실행해줘
```

→ 브라우저 자동 열림 → votra 계정 로그인 → `~/.votra/auth.json` 저장

### 3. 프로젝트 작업 시작

AI 에이전트가 새 세션을 열면 `brief`를 자동 호출해요.
**프로젝트가 없으면 cwd 기준으로 자동 등록**되므로 별도 설정 불필요.

```
brief → 컨텍스트 로드 + 현황 정리
```

---

## 유저 플로우

```
설치 → votra install → Claude Desktop 재시작
                    ↓
              signin 툴로 로그인
                    ↓
           새 세션 열 때마다 brief 자동 호출
           (첫 진입 시 프로젝트 자동 등록)
                    ↓
    start_task → 구현 → finish_task
                    ↓
           필요 시 upload_prompt로
           CLAUDE.md 업로드
```

---

## MCP 툴 레퍼런스

모든 툴은 선택적으로 `cwd` 파라미터를 받아요. 여러 프로젝트를 넘나들 때 명시하면 돼요.

---

### 계정 관리

#### `signin`

votra 계정에 로그인해요. 브라우저가 자동으로 열리고 로그인 후 `~/.votra/auth.json`에 저장돼요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `appUrl` | string (선택) | votra 서버 URL (기본값 자동 사용) |

#### `whoami`

현재 로그인 상태와 계정 정보를 반환해요.

#### `signout`

`~/.votra/auth.json`을 삭제해 로그아웃해요.

---

### 프로젝트 컨텍스트

#### `brief`

세션 시작 브리핑. 프로젝트 태스크 현황, AI 추천 태스크, 행동 지침을 한번에 반환해요.
**첫 실행 시 cwd 기준으로 프로젝트를 자동 등록해요.**

```
새 대화창을 열면 반드시 brief를 먼저 호출하세요.
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `cwd` | string (선택) | 프로젝트 절대경로 |

#### `recall`

의미 유사도로 과거 결정 사항과 인사이트를 검색해요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `query` | string (필수) | 검색 쿼리 |
| `limit` | number (선택) | 최대 결과 수 (기본 10) |
| `cwd` | string (선택) | 프로젝트 절대경로 |

#### `upload_prompt`

현재 프로젝트의 `CLAUDE.md` / `AGENTS.md` / `SKILL.md`를 스캔해 votra 서버로 업로드해요.
Claude Files 탭에서 AI 정책 평가 결과를 확인할 수 있어요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `cwd` | string (필수) | 프로젝트 절대경로 |

---

### 태스크 관리

#### `start_task`

태스크를 생성하고 즉시 IN_PROGRESS로 시작해요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `title` | string (필수) | 태스크 제목 |
| `description` | string (선택) | 상세 설명 |
| `module` | string (선택) | 모듈명 (예: auth, api, ui) |
| `priority` | number (선택) | 우선순위 0-10 |
| `cwd` | string (선택) | 프로젝트 절대경로 |

#### `add_task`

태스크를 PENDING 상태로 등록해요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `title` | string (필수) | 태스크 제목 |
| `description` | string (선택) | 상세 설명 |
| `module` | string (선택) | 모듈명 |
| `priority` | number (선택) | 우선순위 0-10 |
| `cwd` | string (선택) | 프로젝트 절대경로 |

#### `update_task`

태스크 상태나 내용을 변경해요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `taskSeq` | number (필수) | 태스크 번호 (`#42` 형태) |
| `status` | string (선택) | `PENDING` \| `IN_PROGRESS` \| `DONE` \| `CANCELLED` |
| `title` | string (선택) | 새 제목 |
| `description` | string (선택) | 새 설명 |
| `module` | string (선택) | 새 모듈명 |
| `priority` | number (선택) | 새 우선순위 |

#### `finish_task`

태스크를 DONE으로 완료하고 세션 요약을 저장해요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `taskSeq` | number (필수) | 완료할 태스크 번호 |
| `summary` | string (필수) | 이번 세션 작업 요약 (2-5문장) |
| `keyDecisions` | string[] (선택) | 핵심 결정/인사이트 — recall 검색 대상 |
| `outcome` | string (선택) | 구현/변경 내용 서술 (수정 파일 경로 포함 권장) |
| `aiTool` | string (선택) | `claude` \| `cursor` \| `gemini` \| `codex` |
| `cwd` | string (선택) | 프로젝트 절대경로 |

#### `list_tasks`

태스크 목록을 조회해요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `status` | string (선택) | `PENDING` \| `IN_PROGRESS` \| `DONE` \| `CANCELLED` |
| `module` | string (선택) | 모듈 필터 |
| `cwd` | string (선택) | 프로젝트 절대경로 |

#### `log_session`

세션 종료 전 작업 요약을 저장해요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `summary` | string (필수) | 이번 세션 작업 요약 (2-5문장) |
| `aiTool` | string (선택) | `claude` \| `cursor` \| `gemini` \| `codex` |
| `cwd` | string (선택) | 프로젝트 절대경로 |

#### `load_skill`

스킬의 전체 지침을 로드해요. `brief` 응답에 나열된 스킬을 맥락에 맞게 호출하세요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `slug` | string (필수) | 스킬 슬러그 (예: `planner`, `reviewer`) |
| `cwd` | string (선택) | 프로젝트 절대경로 |

---

## 권장 워크플로우

```
세션 시작  →  brief
작업 시작  →  start_task
탐색       →  recall "관련 결정 검색"
구현
완료       →  finish_task (outcome에 수정 파일 경로 포함)
세션 종료  →  log_session
```

---

## 구조

```
src/
├─ index.ts                  진입점 (install | MCP 서버 시작)
├─ auth.ts                   ~/.votra/auth.json 읽기/쓰기
├─ mcp/
│  ├─ server.ts              MCP 서버 (stdio / HTTP transport)
│  ├─ mcpClient.ts           votra API 클라이언트
│  ├─ resolveProjectId.ts    cwd → projectId (없으면 자동 등록)
│  ├─ install.ts             Claude Desktop MCP 등록 + CLAUDE.md 주입
│  └─ tools/
│     ├─ brief.ts            세션 시작 브리핑
│     ├─ recall.ts           의미 검색
│     ├─ addTask.ts          태스크 등록
│     ├─ startTask.ts        태스크 생성 + IN_PROGRESS
│     ├─ updateTask.ts       태스크 상태/내용 변경
│     ├─ finishTask.ts       태스크 완료 + 세션 요약
│     ├─ listTasks.ts        태스크 목록 조회
│     ├─ logSession.ts       세션 요약 저장
│     ├─ loadSkill.ts        스킬 지침 로드
│     ├─ signin.ts           브라우저 OAuth 로그인
│     ├─ whoami.ts           로그인 계정 확인
│     ├─ signout.ts          로그아웃
│     └─ uploadPrompt.ts     CLAUDE.md 등 업로드
├─ discoverClaudeFiles.ts    프로젝트 내 claude files 탐색
├─ readClaudeFile.ts         파일 읽기 + mtime
└─ openBrowser.ts            OS별 브라우저 열기
```

---

## 개발

```bash
npm install
npm run typecheck    # tsc --noEmit
npm run build        # dist/ 생성 (prebuild에서 자동 정리)
```
