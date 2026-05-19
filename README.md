# @votra/cli

`../votra` 프로젝트에 세션 데이터를 실시간 연동하기 위한 CLI. Claude Code 가 만든 `*.jsonl` 세션 로그를 로컬에서 검사하고, 리플레이하고, 서버로 업로드해요.

## 설치 (개발)

```bash
cd votra-cli
npm install
npm link          # 전역에서 `votra` 명령으로 사용
```

또는 빌드 후 사용:

```bash
npm run build
node dist/index.js inspect
```

## 명령어

### `votra signin [url]`

브라우저로 votra SaaS 에 로그인하고 자격증명을 `~/.votra/auth.json` 에 저장. 이후 `upload` / `claude-files` 가 환경변수 없이도 동작해요.

```bash
votra signin                            # 기본 URL (https://votra.jocodingax.ai)
votra signin http://localhost:3000      # 로컬 dev 서버에 로그인
votra signin --no-open                  # 브라우저 자동 열기 비활성 (URL 만 출력)
votra signin --port 5180                # 콜백 서버 포트 고정
```

`VOTRA_APP_URL` env 로도 기본 URL 을 덮어쓸 수 있어요.

흐름: CLI 가 `127.0.0.1:<port>/callback` 에 임시 서버를 띄우고 `<saas>/cli/signin?callback=...&state=...` 로 브라우저를 열어요. SaaS 가 로그인 처리 후 콜백으로 `token=<api_key>&state=<state>[&email=<email>]` 을 붙여 리다이렉트하면 CLI 가 토큰을 저장하고 종료.

**서버 측 contract** (`<appUrl>/cli/signin`):
- query: `callback` (절대 URL, `http://127.0.0.1:*/callback` 만 허용 권장), `state` (echo 필수, CSRF 방어)
- 로그인 성공 시 302: `<callback>?token=<api_key>&state=<state>&email=<email>`

**자격증명 파일** (`~/.votra/auth.json`, mode 0600):
```jsonc
{
  "appUrl": "https://votra.example.com",
  "apiKey": "...",
  "email": "user@example.com",
  "signedInAt": "2026-05-15T..."
}
```

`upload` / `claude-files` 의 URL 해석 우선순위: `VOTRA_API_URL` / `VOTRA_API_KEY` (env) > `~/.votra/auth.json` > 기본 (localhost).

### `votra inspect [file]`

raw event / token usage / type 분포 확인.

```bash
votra inspect                        # 최근 세션 자동 탐색
votra inspect ./session.jsonl        # 직접 지정
votra inspect --type assistant       # type 필터
votra inspect --raw --limit 5        # raw JSON 라인 출력
```

### `votra replay [file]`

로컬 jsonl → event timeline → static replay HTML 생성.

```bash
votra replay                                  # 최근 세션 자동 탐색, ./replay.html 생성
votra replay session.jsonl                    # 특정 파일
votra replay --out report.html
votra replay --watch                          # 파일 append 감지해 HTML 자동 재생성
votra replay --project                        # 현재 cwd 의 모든 세션 합쳐 렌더
votra replay --project /Users/bibi/votra      # 특정 cwd 의 모든 세션
votra replay --project --watch                # 새 세션도 자동 추종
votra replay --serve                          # 로컬 서버 + 브라우저 자동 리로드 (watch 함축)
votra replay --serve 5180                     # 포트 지정
votra replay --project --serve --no-open      # 브라우저 자동 열기 비활성
```

생성된 HTML 은 self-contained (CSS 인라인, JS 없음). `--serve` 켜면 `127.0.0.1:5179` 에 띄우고 파일 변경 시 브라우저가 자동 reload 돼요. `--watch` 만 쓰면 디스크 HTML 만 갱신되니 브라우저는 수동 새로고침.

### `votra upload [file]`

세션을 votra 서버로 incremental 업로드. 같은 세션이 자라면 **새 이벤트만 diff 전송**.

```bash
votra upload                                  # 최근 세션, 1회 전송
votra upload --watch                          # 변경 감지해 새 이벤트만 계속 전송
votra upload --project --watch                # 프로젝트 전체 세션 (새 세션 포함) 실시간 동기화
```

**환경변수** (선택 — `votra signin` 으로 대체 가능)
- `VOTRA_API_URL` — POST 엔드포인트 (기본 `https://votra.jocodingax.ai/api/sessions/ingest`)
- `VOTRA_API_KEY` — 있으면 `Authorization: Bearer ...` 헤더로 첨부

env 가 비어 있으면 `~/.votra/auth.json` 의 `appUrl` + `apiKey` 를 사용해요.

**서버 측 contract**

CLI 는 다음 JSON 을 POST 해요:

```jsonc
{
  "source": "/Users/bibi/.claude/projects/-Users-bibi-votra",  // 파일 또는 디렉토리
  "sessions": [
    {
      "id": "<uuid>",
      "title": "...",
      "startedAt": "2026-...",
      "endedAt": "2026-...",
      "events": [ /* 이 호출의 새 이벤트들만 (이전 호출 이후 append 분) */ ]
    }
  ]
}
```

서버는 2xx 응답이면 OK. 5xx/4xx 또는 fetch 실패 시 CLI 는 stderr 에 로그만 찍고 watcher 는 살아있어요. **서버 복구 후 다음 변경 때 누락분 + 신규분이 자동 함께 전송** 돼요 (성공한 경우만 commit).

### `votra inspect` / 모든 명령 공통: 세션 자동 탐색

`[file]` 인자를 생략하면 `~/.claude/projects/<encoded-cwd>/` 에서 가장 최근 `*.jsonl` 을 찾아요. 현재 cwd 매칭 폴더가 없으면 전체 projects 에서 가장 최근 파일로 fallback.

`--project` 모드는 매칭 폴더 전체의 모든 jsonl 을 합쳐 처리해요.

## 개발

```bash
npm run dev -- inspect              # tsx 로 직접 실행
npm run typecheck                   # tsc --noEmit
npm run build                       # dist/ 생성
```

## 구조

```
src/
├─ index.ts               CLI 진입점 (commander)
├─ auth.ts                ~/.votra/auth.json 읽기/쓰기
├─ commands/
│  ├─ signin.ts           ✓ 브라우저 OAuth-ish 콜백 로그인
│  ├─ inspect.ts          ✓ type 분포 + token usage + raw/filter
│  ├─ replay.ts           ✓ file/project + watch + serve 라우팅
│  └─ upload.ts           ✓ incremental + watch + 자동 백로그
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
├─ liveReloadScript.ts    HTML 에 polling 스크립트 주입
├─ serveHtml.ts           localhost http 서버 + 버전 stamp
├─ openBrowser.ts         OS 별 브라우저 열기
├─ uploadClient.ts        diff + POST (incremental commit 모델)
├─ watchFile.ts           단일 파일 polling watch
├─ watchDir.ts            디렉토리 polling watch (새 파일 + append)
└─ types.ts               RawEvent / Session / TimelineItem 등
```

`types.ts` / `parseLine.ts` / `buildSession.ts` / `extractTitle.ts` / `groupBySessionId.ts` 는 `../votra/src/domain/session/` 과 동일한 구조예요 (의도적 복사, deps 0). 향후 shared 패키지로 추출 가능.
