# AI 보안 자가진단

IT 부서가 없는 중소기업 사장님이 20개 질문에 답하면 AI 보안 점수·영역별 점수·이번 달 우선 할 일 Top 3·이전 진단 대비 변화를 보여주는 웹 서비스입니다. 스펙: `deep-interview-ai-security-checkup.md`

## 실행

Node 22.5 이상이 필요합니다(내장 SQLite 사용, 설치할 패키지 없음).

    npm start        # http://localhost:3000  (PORT=4000 npm start 로 포트 변경)
    npm test         # 점수 규칙과 API 테스트

- `/` 서비스 소개 페이지: 가입 없이 20문항을 풀고 점수를 바로 확인 (`POST /api/preview`, 저장 안 함)
- 결과 화면에서 가입하면 답변이 브라우저 sessionStorage로 넘어가 저장되고, 우선 할 일 3가지가 담긴 전체 리포트가 열립니다
- `/app.html` 점검 앱(가입·질문·리포트·상담 신청)
- DB 파일: `data/app.db` (`DB_PATH`로 변경 가능, git 제외)
- HTTPS 뒤에서 배포할 때는 `COOKIE_SECURE=1`을 설정하세요.
- 소개 페이지 푸터에 표시할 회사 정보: `COMPANY_NAME`, `CONTACT_EMAIL`, `CONTACT_PHONE` 환경변수 (비우면 표시 안 함)

    COMPANY_NAME="회사명" CONTACT_EMAIL=hello@example.com npm start

## 마케팅 흐름과 문구 수정

점검 → 관리 서비스 상담으로 이어지도록 구성되어 있습니다. 들어오는 경로는 네 가지입니다.

| 경로 | 위치 | 저장 |
|---|---|---|
| 점검 후 상담 신청 | 소개 페이지 점검 결과 화면 | 이메일·회사·연락처 + 점검 답변(점수 계산용) |
| 10분 상담 먼저 | 소개 페이지 맨 아래 | 이메일·회사·연락처 |
| 지침 템플릿 받기 | 소개 페이지 중간 (`/ai-policy-template.html`) | 이메일(회사 이름 선택) |
| 가입 후 상담 신청 | 리포트 화면 | 계정에 연결된 신청 |

- 관리 서비스 이름·한 문장 약속(`promise`)·항목과 "무엇이 달라지는가"(`outcome`)·도입 전/후 비교(`transform`)·서비스 구성·상담 문구·템플릿 경로는 `src/service.js` 한 곳에서 수정합니다.
- 소개 페이지의 나머지 설득 문구(첫 화면 훅, 장면 3가지, 금지·방치·관리 비교, 걱정 해소 Q&A)는 `public/index.html`에 있습니다.
- 실제 고객 후기·수상 이력이 생기면 `src/service.js`의 `testimonials`, `credentials`에 넣으세요. 비어 있으면 해당 섹션은 숨겨집니다.
- 지침 템플릿 내용은 `public/ai-policy-template.html`에서 고칩니다.

## 상담 신청(리드) 확인

리포트 화면에서 신청한 상담은 DB에 저장됩니다. 점수, 우선 과제, 관심 주제와 함께 최신순으로 봅니다.

    npm run leads

## 구조

- `src/checklist.js` 질문·권고·점수 규칙 (질문을 고치면 `VERSION`을 올리세요)
- `src/server.js` 가입/로그인/진단/리포트 API와 정적 파일 서버
- `src/db.js` SQLite 스키마
- `public/index.html` 소개 페이지(`landing.css`, `landing.js`), `public/app.html` 점검 앱(`app.js`, `style.css`)
- `scripts/leads.js` 상담 신청 목록 출력

## 점수 규칙

답변 예=2, 일부=1, 아니오=0. 영역 점수 = Σ(질문 가중치×답변) ÷ Σ(질문 가중치×2) × 100. 종합 점수는 4개 영역의 평균(동일 가중).
등급: A 80+ (낮음) / B 60+ (보통) / C 40+ (높음) / D 그 미만 (매우 높음).
Top 3는 (질문 가중치 × 부족분)이 큰 순서, 동점이면 쉬운 것 먼저입니다.
