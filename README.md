# @votra/cli

`votra` 세션 jsonl을 로컬에서 검사/리플레이하고 서버로 업로드하는 CLI.
세션 간 메모리를 AI 도구에 제공하는 MCP 서버도 포함해요.

## 설치

```bash
npm install -g @votra/cli
```

개발 환경에서 로컬 빌드로 사용:

```bash
cd votra-cli
npm install
npm link          # 전역에서 votra 명령으로 사용
```

또는 빌드 후 직접:

```bash
npm run build
node dist/index.js inspect
```

---

## CLI 명령어

### `votra signin [url]`

브라우저로 votra SaaS에 로그인하고 자격증명을 `~/.votra/auth.json`에 저장해요. 이후 `upload` / `claude-files`가 환경변수 없이 동작해요.

```bash
votra signin                            # 기본 URL (https://votra.jocodingax.ai)
votra signin http://localhost:3000      # 로컬 dev 서버에 로그인
votra signin --no-open                  # 브라우저 자동 열기 비활성 (URL만 출력)
votra signin --port 5180                # 콜백 서버 포트 고정
```

`VOTRA_APP_URL` 환경변수로도 기본 URL을 덮어쓸 수 있어요.

**동작 흐름:**

1. CLI가 `127.0.0.1:<port>/callback`에 임시 서버를 띄움
2. `<saas>/cli/signin?callback=...&state=...`으로 브라우저 오픈
3. SaaS가 로그인 후 콜백으로 `token=<api_key>&state=<state>&email=<email>` 리다이렉트
4. CLI가 토큰을 `~/.votra/auth.json`에 저장 후 종료

**자격증명 파일** (`~/.votra/auth.json`, mode 0600):
```json
{
  "appUrl": "https://votra.example.com",
  "apiKey": "...",
  "email": "user@example.com",
  "signedInAt": "2026-05-15T..."
}
```

---

### `votra whoami`

현재 로그인된 계정 정보를 출력해요.

```bash
votra whoami
# 계정:   user@example.com
# 서버:   https://votra.jocodingax.ai
# 로그인: 2026-05-15T...
# 저장:   /Users/.../.votra/auth.json
```

로그인 상태가 아니면 오류 메시지와 함께 종료해요.

---

### `votra signout`

저장된 자격증명 파일(`~/.votra/auth.json`)을 삭제해 로그아웃해요.

```bash
votra signout
```

이미 로그아웃 상태면 메시지만 출력하고 정상 종료해요.

---

### `votra inspect [file]`

raw event / token usage / type 분포를 확인해요.

```bash
votra inspect                        # 최근 세션 자동 탐색
votra inspect ./session.jsonl        # 직접 지정
votra inspect --type assistant       # type 필터
votra inspect --raw --limit 5        # raw JSON 라인 출력
```

| 옵션 | 설명 |
|------|------|
| `--type <type>` | 특정 type만 필터링 |
| `--raw` | raw event JSON 라인 출력 |
| `--limit <n>` | raw 출력 시 최대 라인 수 |

---

### `votra replay [file]`

로컬 jsonl → event timeline → static replay HTML 생성.

```bash
votra replay                                  # 최근 세션 자동 탐색, ./replay.html 생성
votra replay session.jsonl                    # 특정 파일
votra replay --out report.html                # 출력 경로 지정
votra replay --watch                          # 파일 append 감지해 HTML 자동 재생성
votra replay --project                        # 현재 cwd의 모든 세션 합쳐 렌더
votra replay --project /Users/bibi/votra      # 특정 cwd의 모든 세션
votra replay --project --watch                # 새 세션도 자동 추종
votra replay --serve                          # 로컬 서버 + 브라우저 자동 리로드 (watch 함축)
votra replay --serve 5180                     # 포트 지정
votra replay --project --serve --no-open      # 브라우저 자동 열기 비활성
```

| 옵션 | 설명 |
|------|------|
| `-o, --out <path>` | 출력 HTML 경로 (기본 `replay.html`) |
| `-w, --watch` | 파일 변경 감지해 HTML 자동 재생성 |
| `-p, --project [path]` | 프로젝트 폴더 전체 세션 합산 렌더 (생략 시 현재 cwd) |
| `-s, --serve [port]` | 로컬 서버 + 브라우저 자동 리로드 (기본 포트 5179) |
| `--no-open` | `--serve` 시 브라우저 자동 열기 비활성 |

생성된 HTML은 self-contained (CSS 인라인, JS 없음). `--serve` 켜면 `127.0.0.1:5179`에 띄우고 파일 변경 시 브라우저가 자동 reload돼요. `--watch`만 쓰면 디스크 HTML만 갱신되니 브라우저는 수동 새로고침.

---

### `votra upload [file]`

세션을 votra 서버로 incremental 업로드해요. 같은 세션이 자라면 **새 이벤트만 diff 전송**해요.

`--project` 모드에서는 세션 jsonl 외에 `CLAUDE.md` / `AGENTS.md` / `SKILL.md`도 자동으로 함께 업로드해요.

```bash
votra upload                                  # 최근 세션, 1회 전송
votra upload --watch                          # 변경 감지해 새 이벤트만 계속 전송
votra upload --project --watch                # 프로젝트 전체 세션 (새 세션 포함) 실시간 동기화
votra upload --project --no-claude-files      # CLAUDE.md 등 자동 업로드 비활성
```

| 옵션 | 설명 |
|------|------|
| `-w, --watch` | 파일 변경 감지해 새 이벤트만 incremental 전송 |
| `-p, --project [path]` | 프로젝트 폴더 전체 세션 업로드 (생략 시 현재 cwd) |
| `--no-claude-files` | project 모드의 CLAUDE.md 등 자동 업로드 비활성 |

**환경변수** (선택 — `votra signin`으로 대체 가능)

| 변수 | 설명 |
|------|------|
| `VOTRA_API_URL` | POST 엔드포인트 (기본 `https://votra.jocodingax.ai/api/sessions/ingest`) |
| `VOTRA_API_KEY` | `Authorization: Bearer ...` 헤더로 첨부 |

env가 비어 있으면 `~/.votra/auth.json`의 `appUrl` + `apiKey`를 사용해요.

**서버 contract (POST body):**
```json
{
  "source": "/Users/bibi/.claude/projects/-Users-bibi-votra",
  "sessions": [
    {
      "id": "<uuid>",
      "title": "...",
      "startedAt": "2026-...",
      "endedAt": "2026-...",
      "events": []
    }
  ]
}
```

서버가 2xx를 반환하면 OK. 5xx/4xx 또는 fetch 실패 시 stderr에 로그만 찍고 watcher는 살아있어요. **서버 복구 후 다음 변경 때 누락분 + 신규분이 자동 함께 전송**돼요.

---

### `votra claude-files`

현재 프로젝트의 `CLAUDE.md` / `AGENTS.md` / `SKILL.md`를 스캔해 votra 서버로 업로드해요.

```bash
votra claude-files                          # 현재 cwd 기준 스캔
votra claude-files --project /path/to/repo  # 특정 디렉토리 기준 스캔
```

| 환경변수 | 설명 |
|------|------|
| `VOTRA_CLAUDE_FILES_URL` | 전용 엔드포인트 (미설정 시 `VOTRA_API_URL` 또는 기본값) |
| `VOTRA_API_KEY` | `Authorization: Bearer ...` 헤더 |

---

### 세션 자동 탐색 (공통)

`[file]` 인자를 생략하면 `~/.claude/projects/<encoded-cwd>/`에서 가장 최근 `*.jsonl`을 찾아요. 현재 cwd 매칭 폴더가 없으면 전체 projects에서 가장 최근 파일로 fallback.

`--project` 모드는 매칭 폴더 전체의 모든 jsonl을 합쳐 처리해요.

---

## MCP 서버 (votra-memory)

세션 간 메모리를 AI 도구(Claude Code, Cursor, Gemini CLI, Codex CLI)에 제공하는 MCP 서버예요. 태스크 관리, 과거 결정 검색, 세션 로깅 기능을 포함해요.

### `votra mcp install [tools]`

AI 도구에 MCP 서버를 자동 등록해요. MCP 서버 설정 파일과 워크플로우 지시문을 함께 주입해요.

```bash
votra mcp install                    # Claude Code에 설치 (기본)
votra mcp install claude             # Claude Code만
votra mcp install cursor             # Cursor만
votra mcp install gemini             # Gemini CLI만
votra mcp install codex              # Codex CLI만
votra mcp install claude,cursor      # 여러 도구 동시 설치
votra mcp install all                # 지원하는 모든 도구에 설치
```

도구별로 수정하는 파일:

| 도구 | MCP 설정 파일 | 워크플로우 지시문 파일 |
|------|-------------|-------------------|
| Claude Code | `~/.claude.json` | `~/.claude/CLAUDE.md` |
| Cursor | `~/.cursor/mcp.json` | `~/.cursor/rules/votra.mdc` |
| Gemini CLI | `~/.gemini/settings.json` | `~/.gemini/GEMINI.md` |
| Codex CLI | `~/.codex/config.yaml` | `~/.codex/AGENTS.md` |

이미 설치된 경우 `command` 경로가 변경됐을 때만 업데이트하고 그 외엔 건너뛰어요.

---

### `votra mcp start`

MCP 서버를 직접 실행해요. 주로 AI 도구가 자동으로 호출해요.

```bash
votra mcp start                      # HTTP transport (기본 포트 5200)
votra mcp start --stdio              # stdio transport (Claude Code 기본 연결 방식)
votra mcp start --port 5201          # HTTP 포트 지정
votra mcp start --cwd /path/to/proj  # 기준 프로젝트 경로 지정
```

| 옵션 | 설명 |
|------|------|
| `--stdio` | stdio transport (AI 도구가 프로세스로 직접 실행할 때) |
| `--port <n>` | HTTP transport 포트 (기본 5200) |
| `--cwd <path>` | 기준 프로젝트 경로 (기본: 현재 디렉토리) |

---

### MCP 툴 레퍼런스

MCP 서버가 연결된 AI 도구에서 아래 툴을 사용할 수 있어요.

모든 툴은 선택적으로 `cwd` 파라미터를 받아요. 여러 프로젝트를 넘나들 때 명시하면 돼요.

---

#### `brief`

세션 시작 브리핑. 현재 프로젝트의 태스크 현황, AI 추천 태스크, 행동 지침을 한번에 반환해요.

```
새 대화창을 열면 반드시 brief를 먼저 호출하세요.
```

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `cwd` | string (선택) | 프로젝트 절대경로 |

---

#### `recall`

의미 유사도로 과거 세션의 결정 사항과 인사이트를 검색해요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `query` | string (필수) | 검색 쿼리 |
| `limit` | number (선택) | 최대 결과 수 (기본 10, 최대 50) |
| `cwd` | string (선택) | 프로젝트 절대경로 |

---

#### `add_task`

새 태스크를 추가해요. 코드 작업 전에 반드시 먼저 호출하세요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `title` | string (필수) | 태스크 제목 |
| `description` | string (선택) | 상세 설명 |
| `module` | string (선택) | 모듈명 (예: auth, api, ui) |
| `priority` | number (선택) | 우선순위 0-10 (기본 0) |
| `cwd` | string (선택) | 프로젝트 절대경로 |

---

#### `start_task`

태스크를 생성하고 즉시 IN_PROGRESS로 시작해요. `add_task` + `update_task(IN_PROGRESS)` 두 번 호출을 하나로 줄여요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `title` | string (필수) | 태스크 제목 |
| `description` | string (선택) | 상세 설명 |
| `module` | string (선택) | 모듈명 |
| `priority` | number (선택) | 우선순위 0-10 |
| `cwd` | string (선택) | 프로젝트 절대경로 |

---

#### `update_task`

태스크 상태나 내용을 업데이트해요. `taskSeq`는 `list_tasks`나 `brief`에서 표시되는 `#번호`예요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `taskSeq` | number (필수) | 태스크 번호 |
| `status` | string (선택) | `PENDING` \| `IN_PROGRESS` \| `DONE` \| `CANCELLED` |
| `title` | string (선택) | 새 제목 |
| `description` | string (선택) | 새 설명 |
| `module` | string (선택) | 새 모듈명 |
| `priority` | number (선택) | 새 우선순위 |

---

#### `finish_task`

태스크를 DONE으로 완료하고 세션 요약을 저장해요. `update_task(DONE)` + `log_session` 두 번 호출을 하나로 줄여요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `taskSeq` | number (필수) | 완료할 태스크 번호 |
| `summary` | string (필수) | 이번 세션 작업 요약 (2-5문장) |
| `aiTool` | string (선택) | `claude` \| `cursor` \| `gemini` \| `codex` |
| `keyDecisions` | string[] (선택) | 핵심 결정/인사이트 목록 — recall 검색 대상 |
| `outcome` | string (선택) | 구현/변경 내용 자유 서술 (수정한 파일 경로 포함 권장) |
| `cwd` | string (선택) | 프로젝트 절대경로 |

---

#### `list_tasks`

태스크 목록을 조회해요. 상태와 모듈로 필터링 가능.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `status` | string (선택) | `PENDING` \| `IN_PROGRESS` \| `DONE` \| `CANCELLED` |
| `module` | string (선택) | 모듈 필터 |
| `cwd` | string (선택) | 프로젝트 절대경로 |

---

#### `log_session`

세션 종료 전 작업 요약을 저장해요. 웹에서 세션 카드로 확인할 수 있어요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `summary` | string (필수) | 이번 세션 작업 요약 (2-5문장) |
| `aiTool` | string (선택) | `claude` \| `cursor` \| `gemini` \| `codex` |
| `cwd` | string (선택) | 프로젝트 절대경로 |

---

#### `load_skill`

상황에 맞는 스킬의 전체 지침을 로드해요. `brief` 응답에 listed된 스킬을 맥락에 맞게 호출하세요.

| 파라미터 | 타입 | 설명 |
|---------|------|------|
| `slug` | string (필수) | 스킬 슬러그 (예: `planner`, `reviewer`) |
| `cwd` | string (선택) | 프로젝트 절대경로 |

---

### MCP 권장 워크플로우

```
1. 세션 시작 → brief 호출
2. 작업 요청 → start_task로 태스크 등록 + 시작
3. recall로 관련 과거 결정 검색
4. 구현
5. finish_task로 완료 (outcome에 수정 파일 경로 포함)
6. 세션 종료 전 log_session 호출
```

---

## 개발

```bash
npm run dev -- inspect              # tsx로 직접 실행
npm run typecheck                   # tsc --noEmit
npm run build                       # dist/ 생성
```

---

## 구조

```
src/
├─ index.ts               CLI 진입점 (commander)
├─ auth.ts                ~/.votra/auth.json 읽기/쓰기
├─ commands/
│  ├─ signin.ts           브라우저 OAuth-ish 콜백 로그인
│  ├─ whoami.ts           로그인 계정 정보 출력
│  ├─ signout.ts          자격증명 파일 삭제
│  ├─ inspect.ts          type 분포 + token usage + raw/filter
│  ├─ replay.ts           file/project + watch + serve 라우팅
│  ├─ upload.ts           incremental + watch + 자동 백로그
│  ├─ claudeFiles.ts      CLAUDE.md/AGENTS.md/SKILL.md 스캔 + 업로드
│  └─ mcp.ts              MCP 서버 start/install 라우팅
├─ mcp/
│  ├─ server.ts           MCP 서버 (stdio / HTTP transport)
│  ├─ mcpClient.ts        votra API 클라이언트 설정 로드
│  ├─ resolveProjectId.ts cwd → projectId 조회/초기화
│  └─ tools/
│     ├─ brief.ts         세션 시작 브리핑
│     ├─ recall.ts        의미 검색
│     ├─ addTask.ts       태스크 등록
│     ├─ startTask.ts     태스크 생성 + IN_PROGRESS
│     ├─ updateTask.ts    태스크 상태/내용 변경
│     ├─ finishTask.ts    태스크 완료 + 세션 요약
│     ├─ listTasks.ts     태스크 목록 조회
│     ├─ logSession.ts    세션 요약 저장
│     └─ loadSkill.ts     스킬 지침 로드
├─ findSession.ts         최근 jsonl 자동 탐색
├─ resolveSession.ts      인자 → 파일 경로
├─ resolveProjectDir.ts   인자/cwd → 프로젝트 디렉토리
├─ parseLine.ts           한 줄 → RawEvent | null
├─ parseJsonl.ts          파일 → RawEvent[]
├─ groupBySessionId.ts    events → Map<sessionId, events>
├─ buildSession.ts        events → Session (title + timestamps)
├─ extractTitle.ts        ai-title / summary / 첫 user text 순
├─ loadSessions.ts        파일 → Session[]
├─ loadProjectSessions.ts 디렉토리 → Session[] (모든 jsonl 합침)
├─ extractTimeline.ts     Session → TimelineItem[]
├─ renderReplay.ts        TimelineItem[] → static HTML
├─ liveReloadScript.ts    HTML에 polling 스크립트 주입
├─ serveHtml.ts           localhost http 서버 + 버전 stamp
├─ openBrowser.ts         OS별 브라우저 열기
├─ uploadClient.ts        diff + POST (incremental commit 모델)
├─ claudeFilesClient.ts   CLAUDE.md 등 POST 클라이언트
├─ discoverClaudeFiles.ts 프로젝트 내 claude files 탐색
├─ readClaudeFile.ts      파일 읽기 + mtime
├─ watchFile.ts           단일 파일 polling watch
├─ watchDir.ts            디렉토리 polling watch (새 파일 + append)
└─ types.ts               RawEvent / Session / TimelineItem 등
```
