# AI 보안 자가진단 (AI Security Check)

IT 인력이 없어도 10분이면 회사의 AI 보안 수준을 점검하고, 이번 달 먼저 할 일 3가지를 받고, 관리 서비스 상담으로 이어지는 웹 서비스입니다.

> **언어:** 고객에게 보이는 모든 화면과 문구는 영어입니다. 이전 한국어 버전(서버 저장 방식 포함)은 `archive-ko/`에 보관되어 있고 배포·테스트에는 포함되지 않습니다.

## 동작 방식

```
브라우저 ──(공개 키)──▶ Supabase  (가입·로그인, 진단 저장, 상담 신청, 방문자 문의)
   ▲
   └── Node 서버: 정적 파일(public/), /config.js(공개 키), /api/site, /api/service 만 제공
```

- **서버에는 비밀값이 없습니다.** DB 비밀번호도, service_role/secret 키도 쓰지 않습니다. 브라우저가 Supabase에 직접 접속하며, 접근 제한은 DB의 RLS·권한·제약·트리거가 맡습니다.
- 공개 키(`sb_publishable_…`)와 프로젝트 주소는 `src/supabase-config.json`에 있습니다. 공개 키는 브라우저에 노출되도록 설계된 값이라 저장소에 있어도 됩니다. (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` 환경변수로 덮어쓸 수 있습니다.)
- 점수 계산(`public/checklist.js`)은 Node 테스트와 브라우저가 같은 파일을 씁니다.

## 실행

Node 24가 필요합니다.

    npm install
    npm start        # http://localhost:3000  (PORT=4000 npm start 로 포트 변경)
    npm test         # 점수 규칙, 정적 서버·보안 헤더, 화면 동작(jsdom + 가짜 Supabase), 비밀값 검사

- `/` 소개 페이지: 가입 없이 20문항을 풀고 점수를 확인하고, 상담 신청·10분 상담·지침 템플릿 신청 가능
- `/app.html` 점검 앱: 가입·로그인, 진단 기록, 리포트(점수·영역별 점수·우선 할 일 3가지·이전 대비 변화), 상담 신청
- 푸터의 회사 정보: `COMPANY_NAME`, `CONTACT_EMAIL`, `CONTACT_PHONE` 환경변수 (`.env.example` 참고)

## Supabase

테이블은 `public.aicheck_*` 3개이며 스키마는 `supabase/migrations/…sql`입니다. 같은 프로젝트의 다른 앱(`public.expenses`)과 섞이지 않도록 접두사를 붙였습니다.

| 테이블 | 누가 | 무엇을 |
|---|---|---|
| `aicheck_leads` | 방문자·로그인 사용자 | **쓰기만** 가능(읽기·수정·삭제 불가). 상담 신청 / 10분 상담 / 템플릿 신청 |
| `aicheck_assessments` | 로그인 사용자 | **본인 것만** 읽기·쓰기. 답변은 20개 키·값 0/1/2 인 것만 저장 |
| `aicheck_consultations` | 로그인 사용자 | 본인 진단에 대해서만 쓰기, 본인 것만 읽기. 진단당 1건 |

보호 장치(모두 DB 안에 있고, 마이그레이션 적용 시 역할을 바꿔 가며 검증했습니다):

- 모든 테이블 RLS 켬. 컬럼 단위 권한으로 클라이언트가 정하면 안 되는 값(`user_id`, `status`, `client_ip`, `created_at`)은 보낼 수 없음
- `aicheck_leads` 트리거: 이메일 소문자화, **IP당 시간당 5건 제한**, 같은 이메일·같은 경로는 하루 1건만 저장(화면에는 성공으로 표시)
- CHECK 제약: 이메일·전화 형식, 길이, 경로 값, 동의 필수

### 상담 신청 확인

Supabase 대시보드 → SQL Editor에서 `supabase/queries/leads.sql`을 실행하거나 Table Editor에서 `aicheck_leads`를 엽니다. (소유자 세션만 읽을 수 있습니다.)

### 대시보드에서 직접 설정해야 하는 것 (API/도구로 바꿀 수 없음)

1. **이메일 인증(Confirm email):** 지금 켜져 있습니다. 켜져 있으면 새 가입자가 메일의 링크를 눌러야 로그인할 수 있고(화면에서 안내함), Supabase 기본 메일은 시간당 발송 수가 매우 적어 가입이 몰리면 막힙니다. Authentication → Sign In / Providers → Email에서 끄거나, Authentication → SMTP Settings에서 자체 메일 서버를 연결하세요.
2. **Site URL / Redirect URLs:** Authentication → URL Configuration에 실제 배포 주소(예: `https://내도메인`)와 `https://내도메인/app.html`을 추가하세요. 안 하면 확인 메일 링크가 엉뚱한 주소로 갑니다.
3. **사용자 풀 공유:** Supabase 로그인 사용자는 프로젝트 단위로 공유됩니다. 다른 앱(`expenses`)의 사용자와 이 서비스의 가입자가 같은 `auth.users`에 섞입니다. 각 앱의 테이블은 RLS로 본인 행만 보이므로 데이터는 섞이지 않지만, 앱 사용자 목록은 하나입니다.

## Vercel 배포

- `vercel.json`: 서비스 하나(`app`)가 모든 경로를 받습니다. 진입점은 루트 `server.js`, 서비스 간 호출이 없어 bindings는 없습니다.
- `.vercelignore`: `archive-ko/`, `test/`, `supabase/` 등은 올리지 않습니다.
- 필요한 환경변수는 선택 사항(`COMPANY_NAME` 등)뿐입니다. DB 연결 문자열이나 키를 넣을 필요가 없습니다.
- 리전: Supabase 프로젝트가 도쿄(ap-northeast-1)입니다. 브라우저가 Supabase에 직접 접속하므로, 미국 고객은 저장·로그인 때 도쿄까지 왕복합니다. 고객이 대부분 미국이면 미국 리전의 새 프로젝트를 검토하세요.

## 점수 규칙

답변 예=2, 일부=1, 아니오=0. 영역 점수 = Σ(질문 가중치×답변) ÷ Σ(질문 가중치×2) × 100. 종합 점수는 4개 영역의 평균(동일 가중).
등급: A 80+ (낮음) / B 60+ (보통) / C 40+ (높음) / D 그 미만 (매우 높음).
Top 3는 (질문 가중치 × 부족분)이 큰 순서, 동점이면 쉬운 것 먼저입니다.

## 마케팅 흐름과 문구 수정

| 경로 | 위치 | 저장 |
|---|---|---|
| 점검 후 상담 신청 | 소개 페이지 점검 결과 화면 | 이메일·회사·연락처 + 점검 답변 → `aicheck_leads` (source=check) |
| 10분 상담 먼저 | 소개 페이지 맨 아래 | `aicheck_leads` (source=call) |
| 지침 템플릿 받기 | 소개 페이지 중간 (`/ai-policy-template.html`) | 이메일 → `aicheck_leads` (source=template) |
| 가입 후 상담 신청 | 리포트 화면 | `aicheck_consultations` |

- 서비스 이름·약속·항목·전/후 비교·사이버보안 6가지·경영자 질문·업종·평점 자리·상담 문구는 `src/service.js` 한 곳에서 수정합니다. 실제 후기·수상 이력이 생기면 `testimonials`, `credentials`, `rating`에 넣으세요(비어 있으면 섹션이 숨겨집니다).
- 소개 페이지의 나머지 문구는 `public/index.html`, 지침 템플릿은 `public/ai-policy-template.html`에 있습니다.

## 구조

- `public/` 화면: `index.html`+`landing.js`(소개), `app.html`+`app.js`(점검 앱), `checklist.js`(질문·점수 규칙), `supabase-client.js`, `vendor/supabase.js`(supabase-js UMD, `npm run vendor`로 갱신)
- `src/server.js` 정적 서버·보안 헤더(CSP는 자기 자신과 Supabase 주소만 허용), `src/service.js` 서비스 문구, `src/supabase-config.json`
- `server.js` Vercel 진입점, `supabase/` 마이그레이션과 조회 SQL, `test/` 테스트
