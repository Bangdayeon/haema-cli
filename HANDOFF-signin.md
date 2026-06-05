# haema signin 작업 인수인계

`haema-cli` 에 브라우저 기반 로그인 (`haema signin`) 흐름을 구현했어요. CLI 쪽은 끝났고 **haema SaaS 서버 (`/Users/bibi/haema`) 구현이 남았어요**. 다른 세션에서 이어받을 때 이 문서 하나 읽으면 충분하도록 적었어요.

> **2026-05-15 업데이트** — SaaS 쪽 §4.1 / §4.2 / §4.3 모두 구현됨. §6 시작 체크리스트는 이미 끝났고, 남은 건 로컬 e2e 테스트와 배포뿐. 자세한 변경 사항은 각 절 ✅ 노트 참고.
>
> **2026-05-15 추가** — production URL `https://haema.jocodingax.ai` 확정. CLI 기본값을 그쪽으로 박아둠 (signin / uploadClient / claudeFilesClient / index.ts help / README). 이제 사용자는 인자 없이 `haema signin` 만 치면 prod 로 로그인됨. 로컬 dev 서버 붙으려면 `haema signin http://localhost:3000` 으로 명시.

---

## 1. 목적

기존 UX 의 문제: 사용자가 `upload` / `claude-files` 를 쓰려면 `HAEMA_API_URL` / `HAEMA_API_KEY` 환경변수를 손으로 세팅해야 했음.

해결: `haema signin` → 브라우저로 SaaS 로그인 → 콜백으로 토큰 받아 `~/.haema/auth.json` 저장 → 이후 명령은 그 파일에서 자동으로 URL+키 읽음.

---

## 2. 이미 완료 (CLI 쪽, `/Users/bibi/haema-cli`)

### 신규 파일
- `src/auth.ts` — `~/.haema/auth.json` (mode 0600, dir mode 0700) 읽기/쓰기. 타입:
  ```ts
  type Auth = {
    appUrl: string;       // 예: https://haema.example.com (trailing slash 없음)
    apiKey: string;
    email?: string;
    signedInAt: string;   // ISO
  };
  ```
- `src/commands/signin.ts` — 콜백 서버 + 브라우저 오픈 + 토큰 저장.
  - 포트: `5180-5189` 중 첫 가용 (또는 `--port` 고정)
  - state: `randomBytes(16).toString("hex")` (CSRF echo 검증)
  - 브라우저 자동 오픈, `--no-open` 으로 비활성화 가능

### 수정 파일
- `src/index.ts` — `signin [url]` 명령 등록 (replay 위에 배치)
- `src/uploadClient.ts` — `readUploadConfig()` async 화. 우선순위: **env > `~/.haema/auth.json` > 기본 (localhost:3000)**.
  - auth 파일이 있으면 `${auth.appUrl}/api/sessions/ingest` 로 합성
- `src/claudeFilesClient.ts` — `readClaudeFilesConfig()` async 화, 동일 우선순위. auth 파일에서 `${auth.appUrl}/api/claude-files/ingest` 합성
- `src/commands/upload.ts` — `await readUploadConfig()`
- `src/commands/claudeFiles.ts` — `await readClaudeFilesConfig()`
- `README.md` — signin 섹션 + 서버 contract 명시 + 구조 트리 업데이트

### 검증된 것
- `npm run typecheck` ✅
- `npm run build` ✅
- `haema --help` 에 signin 명령 노출 ✅

### 아직 검증 안 된 것
- 실제 end-to-end 로그인 흐름 (서버 미구현이라 불가)
- 콜백 서버가 토큰을 받아 auth.json 저장하는 동작 (단위 테스트 없음)
- 헤드리스 환경 (SSH/Codespaces) fallback (수동 토큰 붙여넣기 모드 없음)

---

## 3. CLI 동작 흐름 (참고용)

```
1. 사용자: haema signin https://haema.example.com
2. CLI: 127.0.0.1:<port>/callback 에 임시 HTTP 서버 listen
3. CLI: 브라우저로 다음 URL 오픈
       https://haema.example.com/cli/signin
         ?callback=http%3A%2F%2F127.0.0.1%3A<port>%2Fcallback
         &state=<32 hex>
4. [SaaS] 사용자 로그인 처리 (기존 로그인 화면 재사용 가능)
5. [SaaS] 사용자에게 "CLI 에 권한 부여" 동의 (선택)
6. [SaaS] API key 발급 후 302 →
       http://127.0.0.1:<port>/callback
         ?token=<api_key>
         &state=<echo>
         [&email=<user_email>]
7. CLI: state 검증 → ~/.haema/auth.json 저장 → "로그인 성공" 출력
8. CLI: 성공 페이지 HTML 응답 (브라우저 탭에 "로그인 완료" 표시)
9. CLI: 서버 close 후 exit 0
```

---

## 4. TODO — haema SaaS 서버 쪽 (`/Users/bibi/haema`)

### 4.1. API key 모델 (Prisma) ✅ 이미 존재

기존 `prisma/schema.prisma` 에 이미 `ApiKey` 모델이 있어서 그대로 사용. 실제 필드:
```prisma
model ApiKey {
  id           String    @id @default(cuid())
  name         String
  hashedSecret String    @unique  // sha256(plaintext) hex
  lastUsedAt   DateTime?
  createdAt    DateTime  @default(now())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}
```

원안 대비 차이:
- `prefix` 필드 없음 (관리 UI 만들 때 필요해지면 추가)
- `revokedAt` 없음 — 폐기는 row 삭제로 처리
- `label` 대신 `name` (필수 string)

migration 도 이미 적용된 상태라 추가 작업 없음.

### 4.2. `/cli/signin` 페이지 ✅ 구현됨

구현된 파일:
- `src/app/cli/layout.tsx` — auth 와 동일한 센터드 카드 레이아웃
- `src/app/cli/signin/page.tsx` — query 파싱, callback host 검증, 로그인 안 됨 시 `/auth/sign-in?next=...` 리다이렉트, 로그인 됨 시 승인 폼 표시
- `src/components/auth/CliApproveForm.tsx` — 승인 버튼 (거절 버튼은 추가 안 함; 사용자가 그냥 탭 닫으면 됨)
- `src/app/actions/approveCliSignin.ts` — 승인 server action
- `src/application/issueApiKeyForCli.ts` — ApiKey 발급 use case
- `src/infrastructure/auth/generateApiKeyPlaintext.ts` — `haema_` prefix + 32바이트 hex
- `src/shared/lib/isLocalhostCallback.ts` — host 검증 (127.0.0.1 / localhost / ::1)
- `src/shared/lib/safeNextPath.ts` — open redirect 방지용 next 검증
- `src/middleware.ts` — `?next=` 가 query string 까지 보존하도록 수정
- `src/app/actions/signIn.ts`, `signUp.ts`, `signInWithAxhub.ts` — `next` 파라미터 honor
- `src/components/auth/SignInForm.tsx`, `SignUpForm.tsx`, `AxhubSignInButton.tsx` — hidden `next` 필드 전달
- `src/app/auth/sign-in/page.tsx`, `sign-up/page.tsx` — searchParams 에서 `next` 읽기

원안 대비 차이:
- 토큰 인코딩: `randomBytes(32).toString("hex")` + `haema_` prefix (base64url 아님). CLI 의 `resolveUserFromApiKey` 가 어떤 인코딩이든 sha256 으로 처리하니 호환 OK.
- callback 검증: hostname 만 확인 (`/callback` pathname 강제 안 함). CLI 가 자기 path 만 listen 하므로 host 만 보면 충분하지만, defense-in-depth 가 필요하면 `isLocalhostCallback.ts` 에 pathname 체크 추가 가능.
- 거절 버튼 미구현 — 명시적 거절이 필요해지면 별도 server action 추가.
- ApiKey `name` 은 `"haema CLI"` 고정. 디바이스 별 라벨이 필요하면 폼에서 받도록 확장.

### 4.3. Bearer 인증 미들웨어 ✅ 이미 적용됨

`src/infrastructure/auth/resolveUserFromApiKey.ts` 가 이미 존재하고, 두 route 에 적용된 상태:
- `src/app/api/sessions/ingest/route.ts:36`
- `src/app/api/claude-files/ingest/route.ts:36`

동작:
1. `Authorization: Bearer <token>` 파싱
2. `sha256(token)` 을 `ApiKey.hashedSecret` 과 매치
3. 매치되면 `lastUsedAt = now()` 비동기 업데이트 후 `userId` 반환
4. 없으면 `null` → route 가 401 반환

추가 작업 없음.

### 4.4. (선택) API key 관리 UI

웹 UI 에 "내 API 키 목록" 페이지: prefix + label + lastUsedAt 표시, 폐기 버튼. 1차 릴리즈에 꼭 필요하진 않음.

---

## 5. TODO — CLI 쪽 follow-up (필요해지면)

우선순위 낮음 — 사용자가 요청하지 않은 한 손대지 말 것 (CLAUDE.md §2 "Simplicity First").

- `haema signout` — `~/.haema/auth.json` 삭제. 서버에 revoke 요청도 보내면 더 깔끔.
- `haema whoami` — auth.json 읽어서 `email` / `appUrl` 출력. 디버깅에 유용.
- 헤드리스 fallback — `haema signin --manual` 로 URL 출력만 하고 사용자가 토큰 paste. SSH/Codespaces 환경용.
- 토큰 만료/갱신 — 현재 모델은 무기한 키. 만료 도입하면 401 받았을 때 자동 재로그인 유도하는 흐름 필요.

---

## 6. 다음 세션이 처음 해야 할 일 (체크리스트)

§4.1 ~ §4.3 모두 끝났어요. 남은 건 검증과 배포뿐.

1. ~~Prisma `ApiKey` 모델 추가~~ — 이미 있음 ✅
2. ~~migration~~ — 불필요 ✅
3. ~~`/cli/signin` 페이지 + server action~~ — 구현됨 ✅
4. ~~Bearer 검증 미들웨어~~ — 이미 적용됨 ✅
5. **로컬 e2e 테스트**:
   ```bash
   # 터미널 1
   cd /Users/bibi/haema && npm run dev
   # 터미널 2
   cd /Users/bibi/haema-cli && npm run build && node dist/index.js signin http://localhost:3000
   # → 브라우저 열림 → (필요 시 로그인) → "CLI 연결 허용" → 콜백 페이지 "로그인 완료" 표시
   # → 터미널에 "로그인 성공 (email)" 출력, cat ~/.haema/auth.json 으로 확인
   # → node dist/index.js upload 가 env 없이 동작하는지 확인
   ```
6. **배포**: `/Users/bibi/haema/axhub.yaml` 참고. 배포 후 production URL 로 한 번 더 e2e.
7. **(선택) CLI 재배포**: 0.2.0 이 npm 에 publish 됐는지 확인. 변경된 게 있으면 `npm publish`.

---

## 7. 관련 파일 빠른 참조

CLI:
- `src/commands/signin.ts:30` — appUrl 결정 로직 (arg → env → 기본)
- `src/commands/signin.ts:67` — 콜백 핸들러 (state 검증 + auth.json 저장)
- `src/uploadClient.ts:25` — 설정 우선순위
- `src/claudeFilesClient.ts:27` — 설정 우선순위

서버 (구현됨, `/Users/bibi/haema`):
- `src/app/cli/signin/page.tsx` — 동의 화면 (callback host 검증 + getCurrentUser 분기)
- `src/app/cli/layout.tsx` — auth 와 동일한 카드 레이아웃
- `src/app/actions/approveCliSignin.ts` — ApiKey 발급 + 콜백 redirect
- `src/components/auth/CliApproveForm.tsx` — 승인 폼
- `src/application/issueApiKeyForCli.ts` — use case
- `src/infrastructure/auth/generateApiKeyPlaintext.ts` — `haema_` + 32B hex
- `src/infrastructure/auth/resolveUserFromApiKey.ts` — 기존 Bearer 검증 (재사용)
- `src/shared/lib/isLocalhostCallback.ts` — host whitelist
- `src/shared/lib/safeNextPath.ts` — open redirect 방어
- `src/middleware.ts` — `?next=` 에 search 보존
- `src/app/actions/{signIn,signUp,signInWithAxhub}.ts` + 관련 form/page — `next` honor
- `prisma/schema.prisma` — `ApiKey` 모델 (이미 존재)
