// Prints consultation requests, newest first.  Usage: npm run leads  (set DB_PATH to use another database)
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { AREAS } = require('../src/checklist');
const { scoreAnswers } = require('../src/checklist');

const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
let db;
try {
  db = new DatabaseSync(file, { readOnly: true });
} catch {
  console.error(`Cannot open the database: ${file}`);
  process.exit(1);
}

const TOPIC = { ...Object.fromEntries(AREAS.map((a) => [a.id, a.name])), 'it-support': 'Full office IT support' };
const TIME = { morning: 'morning', afternoon: 'afternoon', any: 'any time' };

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

if (!rows.length && !leads.length) console.log('No requests yet.');

const SOURCE = { check: 'consultation after the check', call: '10-minute call first', template: 'policy template' };
if (leads.length) console.log('── Inquiries without an account ──\n');
for (const r of leads) {
  console.log(`L${r.id} [${r.status}] ${r.created_at} · ${SOURCE[r.source] || r.source}`);
  console.log(`  ${r.company_name} · ${r.email}${r.phone ? ` · ${r.phone}` : ''}`);
  if (r.answers) {
    const s = scoreAnswers(JSON.parse(r.answers));
    console.log(`  Score ${s.overall} (${s.grade}) · Low areas: ${s.areas.filter((a) => a.score < 80).sort((a, b) => a.score - b.score).map((a) => `${a.name} ${a.score}`).join(', ') || 'none'}`);
    console.log(`  Priorities: ${s.topActions.map((a) => a.title).join(' / ') || 'none'}`);
  } else {
    console.log('  (no check results)');
  }
  console.log('');
}

if (rows.length) console.log('── Requests from signed-in users ──\n');
for (const r of rows) {
  const s = scoreAnswers(JSON.parse(r.answers));
  const topics = JSON.parse(r.topics).map((t) => TOPIC[t] || t).join(', ') || '(none selected)';
  console.log(`#${r.id} [${r.status}] ${r.created_at}`);
  console.log(`  ${r.company_name}${r.employee_count ? ` (${r.employee_count} employees)` : ''} · ${r.email}${r.phone ? ` · ${r.phone}` : ''}`);
  console.log(`  Score ${s.overall} (${s.grade}) · Preferred time: ${TIME[r.preferred_time]} · Interested in: ${topics}`);
  console.log(`  Priorities: ${s.topActions.map((a) => a.title).join(' / ') || 'none'}`);
  if (r.message) console.log(`  Message: ${r.message}`);
  console.log('');
}
