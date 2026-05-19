# votra-cli ↔ SaaS 동작 확인 가이드

CLI 가 실제로 votra 서버에 데이터를 보내고 DB 에 들어가는지 직접 검증하는 시나리오. 위에서 아래로 순서대로 따라가요.

---

## 0. 사전 준비

터미널 두 개 필요해요. 편의상 **A / B** 로 부를게요.

- **A**: votra Next.js 서버
- **B**: CLI 실행

CLI 실행 방식은 세 가지 — 본인 편한 쪽:

| 방식 | 명령 |
|---|---|
| npm 전역 설치 | `npm i -g @votra/cli` 후 `votra <cmd>` |
| 일회성 npx | `npx -p @votra/cli votra <cmd>` |
| 로컬 소스 | `cd /Users/bibi/votra-cli && npm run dev -- <cmd>` |

이 가이드는 `npx -p @votra/cli votra <cmd>` 형태로 적어요.

---

## 1. votra dev 서버 띄우기 (터미널 A)

```bash
cd /Users/bibi/votra
npm run dev
```

출력 마지막에 다음 같은 줄이 떠요:

```
   - Local:   http://localhost:3000
 ✓ Ready in 2.4s
```

포트가 3000 이 이미 쓰이고 있으면 3002 / 3003 등으로 잡혀요. **출력에 뜬 포트를 기억하세요.** 아래 모든 명령은 이 포트를 씁니다.

---

## 2. 환경변수 설정 (터미널 B)

```bash
export VOTRA_API_URL=http://localhost:3000/api/sessions/ingest
export VOTRA_API_KEY=vt_97f2bef211a6f08ae01d386085b25f02503728441b2d99db9d9b3dd3ae31707f
```

- 포트가 3000 아니면 URL 의 `3000` 자리 바꿔요
- `VOTRA_API_KEY` 위 값은 **dev DB 한정** 으로 이전에 발급한 거예요. 키 안 먹으면 새로 발급 (아래 2-A 참고)

### 2-A. 키 새로 발급해야 한다면

```bash
cd /Users/bibi/votra
# 1) 기존 user id 확인
node --env-file=.env -e 'import("@prisma/client").then(async ({PrismaClient})=>{const p=new PrismaClient();console.log(await p.user.findMany({select:{id:true,email:true}}));await p.$disconnect()})'

# 2) 위 출력 중 본인 id 로 키 발급
node --env-file=.env scripts/create-api-key.mjs --user <userId> --name "my test"

# 3) 출력 평문 키를 터미널 B 의 VOTRA_API_KEY 로 export
```

---

## 3. `inspect` — 서버 불필요, 로컬 jsonl 분석

```bash
npx -p @votra/cli votra inspect
```

**기대 출력**:
```
(자동 탐색) /Users/bibi/.claude/projects/-Users-bibi/<uuid>.jsonl
총 이벤트: 84 (필터 후 84)

[type 분포]
  user                 35
  assistant            44
  ...

[token 사용량]
  input              84
  output             23,696
  cache_creation     77,356
  cache_read         1,859,135
```

추가 옵션 (선택):
```bash
npx -p @votra/cli votra inspect --type assistant      # 특정 type 만
npx -p @votra/cli votra inspect --raw --limit 3       # raw JSON 3줄
```

---

## 4. `replay` — 서버 불필요, static HTML 생성

```bash
npx -p @votra/cli votra replay --out /tmp/replay.html
open /tmp/replay.html
```

**기대**: 브라우저에서 PROMPT / ASSISTANT / TOOL_CALL / FILE_EDIT / ERROR 가 색깔 badge 로 분리된 타임라인이 보임. 한국어 콘텐츠 정상.

---

## 5. `replay --serve` — 로컬 서버 + 자동 리로드

```bash
npx -p @votra/cli votra replay --serve
```

**기대**:
- 콘솔: `로컬 서버: http://127.0.0.1:5179/`
- 브라우저 자동으로 열림
- 진행 중 Claude Code 가 jsonl 에 append 하면 **1초 이내 브라우저 자동 새로고침**

Ctrl+C 로 종료.

---

## 6. `upload` — 1회 전송 (★ SaaS 연동 핵심)

```bash
npx -p @votra/cli votra upload
```

**기대 출력 (첫 실행)**:
```
업로드 대상: http://localhost:3000/api/sessions/ingest
Authorization: Bearer ***
소스: /Users/bibi/.claude/projects/.../<uuid>.jsonl
업로드 OK · 세션 1개 / 새 이벤트 N개
```

**같은 명령 한 번 더** (dedup 확인):
```bash
npx -p @votra/cli votra upload
```

이번엔 다음이 떠야 함:
```
변경 없음 (세션 1개 동기화 됨)
```

CLI 의 in-memory sent count + 서버의 externalUuid 유니크 제약이 둘 다 작동해서 이중으로 안전해요.

---

## 7. `upload --watch` — 실시간 incremental 전송

```bash
npx -p @votra/cli votra upload --watch
```

**기대 (시작 시)**:
```
업로드 OK · 세션 1개 / 새 이벤트 N개

(watch) /Users/bibi/.claude/projects/.../<uuid>.jsonl 감지 중... Ctrl+C 로 종료
```

이 상태로 두고 **별도 터미널 (C)** 에서 Claude Code 를 열어 뭔가 작업하면, watch 가 jsonl append 를 감지해서 자동으로:

```
[10:23:45] 업로드 OK · 세션 1개 / 새 이벤트 3개
```

가 떠요. 즉 diff 만 incremental 로 전송.

### 7-A. (선택) 서버 다운 → 복구 시나리오

`upload --watch` 켜둔 채로:

1. **터미널 A** 의 `npm run dev` 를 Ctrl+C 로 죽임
2. 별도로 jsonl 에 한 줄 echo (또는 Claude Code 로 작업)
3. **터미널 B**: `[xx:xx:xx] 업로드 실패: fetch failed` 로그 — 하지만 watcher 는 계속 살아있음
4. 터미널 A 다시 `npm run dev`
5. 다음 변경 발생 시 **누락분 + 신규** 한 번에 전송됨

---

## 8. DB 검증 (최종 확인)

**옵션 A — prisma studio (GUI)**:
```bash
cd /Users/bibi/votra
npx prisma studio
```
브라우저에서 Project / Session / Event 테이블 직접 보기. 행 개수 증가 확인.

**옵션 B — node 한 줄 카운트**:
```bash
cd /Users/bibi/votra
node --env-file=.env -e 'import("@prisma/client").then(async ({PrismaClient})=>{const p=new PrismaClient();console.log({projects:await p.project.count(),sessions:await p.session.count(),events:await p.event.count(),totalTokens:(await p.sessionTokenUsage.aggregate({_sum:{totalTokens:true}}))._sum.totalTokens});await p.$disconnect()})'
```

**기대**: `{ projects, sessions, events, totalTokens }` 모두 0 보다 큼.

**옵션 C — votra 대시보드**: `http://localhost:3000` 접속 → 본인 프로젝트의 세션 detail 페이지에서 새 이벤트 보임.

---

## 9. 자주 만나는 에러

| 에러 | 원인 | 해결 |
|---|---|---|
| `npm error 404 @votra/cli` | npm install 실패 | 인터넷 / 로그인 상태 확인 |
| `401 API 키가 없거나 유효하지 않아요` | `VOTRA_API_KEY` 미설정/오타 | `echo $VOTRA_API_KEY` 확인 후 export 다시 |
| `401` (키 있는데도) | dev DB reset 으로 키가 날아감 | §2-A 로 새로 발급 |
| `ECONNREFUSED 127.0.0.1:3000` | votra dev server 다운 | 터미널 A 에서 `npm run dev` |
| `404 Not Found` + HTML 응답 | votra 가 다른 포트로 떴음 | 터미널 A 출력의 실제 포트로 `VOTRA_API_URL` 수정 |
| `세션 파일을 찾지 못했어요` | 이 cwd 에서 Claude Code 실행 이력 없음 | 다른 cwd 에서 시도 또는 `votra upload ./path.jsonl` 처럼 직접 지정 |

---

## 한 줄 요약

성공 신호 세 개만 확인하면 끝:
1. `votra upload` → `업로드 OK · 새 이벤트 N개`
2. 같은 명령 2회차 → `변경 없음` (dedup 동작)
3. DB 카운트 — `events: N`
