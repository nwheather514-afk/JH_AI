// 상담 신청 목록을 최신순으로 출력한다.  사용: npm run leads  (DB_PATH로 다른 DB 지정 가능)
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { AREAS } = require('../src/checklist');
const { scoreAnswers } = require('../src/checklist');

const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
let db;
try {
  db = new DatabaseSync(file, { readOnly: true });
} catch {
  console.error(`DB를 열 수 없습니다: ${file}`);
  process.exit(1);
}

const TOPIC = { ...Object.fromEntries(AREAS.map((a) => [a.id, a.name])), 'it-support': '사무실 IT 전반 지원' };
const TIME = { morning: '오전', afternoon: '오후', any: '상관없음' };

const rows = db
  .prepare(
    `SELECT c.id, c.created_at, c.status, c.phone, c.preferred_time, c.topics, c.message,
            u.email, u.company_name, u.employee_count, a.answers
     FROM consultations c
     JOIN users u ON u.id = c.user_id
     JOIN assessments a ON a.id = c.assessment_id
     ORDER BY c.id DESC`
  )
  .all();

const leads = db
  .prepare('SELECT id, created_at, status, source, email, company_name, phone, answers FROM leads ORDER BY id DESC')
  .all();

if (!rows.length && !leads.length) console.log('상담 신청이 아직 없습니다.');

const SOURCE = { check: '점검 후 상담 신청', call: '10분 상담 먼저', template: '지침 템플릿 받기' };
if (leads.length) console.log('── 가입 없이 들어온 문의 ──\n');
for (const r of leads) {
  console.log(`L${r.id} [${r.status}] ${r.created_at} · ${SOURCE[r.source] || r.source}`);
  console.log(`  ${r.company_name} · ${r.email}${r.phone ? ` · ${r.phone}` : ''}`);
  if (r.answers) {
    const s = scoreAnswers(JSON.parse(r.answers));
    console.log(`  점수 ${s.overall}점 (${s.grade}) · 낮은 영역: ${s.areas.filter((a) => a.score < 80).sort((a, b) => a.score - b.score).map((a) => `${a.name} ${a.score}`).join(', ') || '없음'}`);
    console.log(`  우선 과제: ${s.topActions.map((a) => a.title).join(' / ') || '없음'}`);
  } else {
    console.log('  (점검 결과 없음)');
  }
  console.log('');
}

if (rows.length) console.log('── 가입 후 리포트에서 신청 ──\n');
for (const r of rows) {
  const s = scoreAnswers(JSON.parse(r.answers));
  const topics = JSON.parse(r.topics).map((t) => TOPIC[t] || t).join(', ') || '(선택 없음)';
  console.log(`#${r.id} [${r.status}] ${r.created_at}`);
  console.log(`  ${r.company_name}${r.employee_count ? ` (직원 ${r.employee_count}명)` : ''} · ${r.email}${r.phone ? ` · ${r.phone}` : ''}`);
  console.log(`  점수 ${s.overall}점 (${s.grade}) · 희망 시간 ${TIME[r.preferred_time]} · 관심: ${topics}`);
  console.log(`  우선 과제: ${s.topActions.map((a) => a.title).join(' / ') || '없음'}`);
  if (r.message) console.log(`  요청: ${r.message}`);
  console.log('');
}
