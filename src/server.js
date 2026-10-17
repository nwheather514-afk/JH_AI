const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openDb } = require('./db');
const checklist = require('./checklist');
const { SERVICE } = require('./service');

const DISCLAIMER =
  'This report is a self-assessment based on general principles of public security frameworks (NIST AI RMF, NIST CSF) and is not legal or security advice. ' +
  'Confirm actual legal obligations and security measures with an attorney or security professional. Scores are calculated from your answers and do not guarantee your actual security posture.';

const SESSION_DAYS = 14;
const COOKIE = 'sid';
const MAX_BODY = 100 * 1024;

const LEAD_SOURCES = ['check', 'call', 'template'];
const CONSULT_TOPICS = ['tools', 'data', 'access', 'incident', 'it-support'];
const CONSULT_TIMES = ['morning', 'afternoon', 'any'];

function createApp({
  dbFile = ':memory:',
  publicDir = path.join(__dirname, '..', 'public'),
  secureCookie = false,
  site = { companyName: process.env.COMPANY_NAME, contactEmail: process.env.CONTACT_EMAIL, contactPhone: process.env.CONTACT_PHONE },
} = {}) {
  const db = openDb(dbFile);
  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    insertUser: db.prepare('INSERT INTO users (email, pw_salt, pw_hash, company_name, employee_count) VALUES (?,?,?,?,?)'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)'),
    sessionUser: db.prepare(
      'SELECT u.id, u.email, u.company_name, u.employee_count FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'
    ),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    insertAssessment: db.prepare('INSERT INTO assessments (user_id, checklist_version, answers) VALUES (?,?,?)'),
    listAssessments: db.prepare('SELECT id, checklist_version, answers, created_at FROM assessments WHERE user_id = ? ORDER BY id DESC'),
    oneAssessment: db.prepare('SELECT id, checklist_version, answers, created_at FROM assessments WHERE id = ? AND user_id = ?'),
    insertConsultation: db.prepare(
      'INSERT INTO consultations (user_id, assessment_id, phone, preferred_time, topics, message, consent_at) VALUES (?,?,?,?,?,?,?)'
    ),
    consultationForAssessment: db.prepare('SELECT id, created_at FROM consultations WHERE user_id = ? AND assessment_id = ? ORDER BY id DESC LIMIT 1'),
    insertLead: db.prepare('INSERT INTO leads (email, company_name, phone, answers, checklist_version, source, consent_at) VALUES (?,?,?,?,?,?,?)'),
    recentLead: db.prepare("SELECT id FROM leads WHERE email = ? AND source = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') LIMIT 1"),
    prevAssessment: db.prepare('SELECT id, checklist_version, answers, created_at FROM assessments WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT 1'),
  };

  // ── 비밀번호·세션 ──
  const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

  function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const maxAge = SESSION_DAYS * 24 * 3600;
    q.insertSession.run(sha(token), userId, Date.now() + maxAge * 1000);
    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureCookie ? '; Secure' : ''}`
    );
  }

  function cookieToken(req) {
    const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
    return m ? m[1] : null;
  }

  function currentUser(req) {
    const t = cookieToken(req);
    if (!t) return null;
    return q.sessionUser.get(sha(t), Date.now()) || null;
  }

  // 로그인 시도 제한: 이메일+IP 기준 15분에 10회
  const attempts = new Map();
  function tooManyAttempts(key) {
    const now = Date.now();
    const rec = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
    attempts.set(key, rec);
    return rec.length >= 10;
  }
  const noteAttempt = (key) => attempts.get(key).push(Date.now());

  const leadHits = new Map();
  function leadLimited(ip) {
    const now = Date.now();
    const rec = (leadHits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
    leadHits.set(ip, rec);
    if (rec.length >= 5) return true;
    rec.push(now);
    return false;
  }

  // ── 응답 도우미 ──
  function send(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  }
  const fail = (res, status, message) => send(res, status, { error: message });

  function readJson(req) {
    return new Promise((resolve, reject) => {
      if (!/^application\/json/i.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('A JSON request is required.'), { status: 415 }));
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(Object.assign(new Error('The request is too large.'), { status: 413 }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          reject(Object.assign(new Error('Invalid JSON.'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  // ── 리포트 만들기 ──
  function buildReport(row, prevRow, userId) {
    const result = checklist.scoreAnswers(JSON.parse(row.answers));
    const prev = prevRow ? checklist.scoreAnswers(JSON.parse(prevRow.answers)) : null;
    const consult = q.consultationForAssessment.get(userId, row.id);
    return {
      id: row.id,
      consultationRequestedAt: consult ? consult.created_at : null,
      createdAt: row.created_at,
      checklistVersion: row.checklist_version,
      ...result,
      comparison: prev ? { previousId: prevRow.id, previousCreatedAt: prevRow.created_at, ...checklist.compare(result, prev) } : null,
      disclaimer: DISCLAIMER,
    };
  }

  const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

  // ── 라우팅 ──
  async function api(req, res, url) {
    const { pathname } = url;
    const method = req.method;

    if (method === 'GET' && pathname === '/api/checklist') {
      return send(res, 200, {
        version: checklist.VERSION,
        answers: checklist.ANSWER_LABELS,
        areas: checklist.AREAS.map((a) => ({
          id: a.id,
          name: a.name,
          questions: checklist.QUESTIONS.filter((x) => x.area === a.id).map((x) => ({ id: x.id, text: x.text })),
        })),
      });
    }

    if (method === 'GET' && pathname === '/api/site') {
      return send(res, 200, { companyName: site.companyName || '', contactEmail: site.contactEmail || '', contactPhone: site.contactPhone || '' });
    }

    if (method === 'GET' && pathname === '/api/service') {
      return send(res, 200, SERVICE);
    }

    // 가입 없는 문의. source: check(점검 결과 화면에서 상담 신청, 답변 필수) / call(10분 상담 먼저) / template(지침 템플릿 받기)
    if (method === 'POST' && pathname === '/api/leads') {
      const b = await readJson(req);
      const source = b.source === undefined ? 'check' : b.source;
      if (!LEAD_SOURCES.includes(source)) return fail(res, 400, 'Invalid request.');
      if (b.consent !== true) return fail(res, 400, 'Please agree to be contacted so we can process your request.');
      const email = String(b.email || '').trim().toLowerCase();
      const company = String(b.companyName || '').trim();
      const phone = String(b.phone || '').trim();
      if (!EMAIL_RE.test(email)) return fail(res, 400, 'Please enter a valid email address.');
      if (company.length > 100 || (source !== 'template' && !company)) return fail(res, 400, 'Please enter your company name (up to 100 characters).');
      if (phone && !/^[0-9+()\-\s]{7,30}$/.test(phone)) return fail(res, 400, 'Please enter a valid phone number.');
      let answers = null;
      if (source === 'check') {
        const err = checklist.validateAnswers(b.answers);
        if (err) return fail(res, 400, err);
        answers = JSON.stringify(Object.fromEntries(checklist.QUESTIONS.map((x) => [x.id, b.answers[x.id]])));
      }
      if (leadLimited(req.socket.remoteAddress)) return fail(res, 429, 'Too many requests. Please try again in a little while.');
      // 같은 이메일·같은 경로로 하루에 여러 번 눌러도 담당자에게는 한 건만 쌓인다. 응답은 동일하게 성공으로 돌려준다.
      if (!q.recentLead.get(email, source)) {
        q.insertLead.run(email, company || '(not provided)', phone || null, answers, answers ? checklist.VERSION : null, source, new Date().toISOString());
      }
      return send(res, 201, { ok: true });
    }

    // 가입 전 미리보기: 저장하지 않고 점수만 계산한다. 우선 할 일 Top 3는 가입 후 리포트에서만 제공한다.
    if (method === 'POST' && pathname === '/api/preview') {
      const b = await readJson(req);
      const err = checklist.validateAnswers(b.answers);
      if (err) return fail(res, 400, err);
      const { overall, grade, label, areas } = checklist.scoreAnswers(b.answers);
      return send(res, 200, { overall, grade, label, areas: areas.map(({ id, name, score, grade: g, label: l }) => ({ id, name, score, grade: g, label: l })) });
    }

    if (method === 'POST' && pathname === '/api/signup') {
      const b = await readJson(req);
      const email = String(b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      const company = String(b.companyName || '').trim();
      let employees = b.employeeCount === '' || b.employeeCount == null ? null : Number(b.employeeCount);
      if (!EMAIL_RE.test(email)) return fail(res, 400, 'Please enter a valid email address.');
      if (password.length < 8 || password.length > 200) return fail(res, 400, 'Password must be at least 8 characters.');
      if (!company || company.length > 100) return fail(res, 400, 'Please enter your company name (up to 100 characters).');
      if (employees !== null && (!Number.isInteger(employees) || employees < 1 || employees > 500)) return fail(res, 400, 'Employee count must be a number from 1 to 500.');
      if (q.userByEmail.get(email)) return fail(res, 409, 'That email is already registered.');
      const salt = crypto.randomBytes(16).toString('hex');
      const info = q.insertUser.run(email, salt, hashPw(password, salt), company, employees);
      startSession(res, Number(info.lastInsertRowid));
      return send(res, 201, { email, companyName: company, employeeCount: employees });
    }

    if (method === 'POST' && pathname === '/api/login') {
      const b = await readJson(req);
      const email = String(b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      const key = `${req.socket.remoteAddress}|${email}`;
      if (tooManyAttempts(key)) return fail(res, 429, 'Too many sign-in attempts. Please try again in 15 minutes.');
      const user = q.userByEmail.get(email);
      // 계정 유무를 드러내지 않도록 없는 계정도 같은 비용으로 해시를 계산한다.
      const salt = user ? user.pw_salt : '00'.repeat(16);
      const got = Buffer.from(hashPw(password.slice(0, 200), salt), 'hex');
      const want = Buffer.from(user ? user.pw_hash : '00'.repeat(64), 'hex');
      if (!user || !crypto.timingSafeEqual(got, want)) {
        noteAttempt(key);
        return fail(res, 401, 'Incorrect email or password.');
      }
      q.purgeSessions.run(Date.now());
      startSession(res, user.id);
      return send(res, 200, { email: user.email, companyName: user.company_name, employeeCount: user.employee_count });
    }

    if (method === 'POST' && pathname === '/api/logout') {
      const t = cookieToken(req);
      if (t) q.deleteSession.run(sha(t));
      res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
      return send(res, 200, { ok: true });
    }

    // 이후 경로는 로그인 필요
    const user = currentUser(req);
    if (pathname === '/api/me' && method === 'GET') {
      if (!user) return fail(res, 401, 'Please sign in.');
      return send(res, 200, { email: user.email, companyName: user.company_name, employeeCount: user.employee_count });
    }
    if (!pathname.startsWith('/api/assessments') && pathname !== '/api/consultations') return fail(res, 404, 'Not found.');
    if (!user) return fail(res, 401, 'Please sign in.');

    if (method === 'POST' && pathname === '/api/consultations') {
      const b = await readJson(req);
      if (b.consent !== true) return fail(res, 400, 'Please agree to be contacted so we can process your request.');
      const assessmentId = Number(b.assessmentId);
      if (!Number.isInteger(assessmentId) || !q.oneAssessment.get(assessmentId, user.id)) return fail(res, 404, 'Assessment not found.');
      if (q.consultationForAssessment.get(user.id, assessmentId)) return fail(res, 409, 'You have already requested a consultation for this assessment. We will be in touch soon.');
      const topics = Array.isArray(b.topics) ? [...new Set(b.topics)] : [];
      if (topics.length > CONSULT_TOPICS.length || !topics.every((t) => CONSULT_TOPICS.includes(t))) return fail(res, 400, 'Invalid consultation topic.');
      if (!CONSULT_TIMES.includes(b.preferredTime)) return fail(res, 400, 'Please choose a preferred time to be contacted.');
      const phone = String(b.phone || '').trim();
      if (phone && !/^[0-9+()\-\s]{7,30}$/.test(phone)) return fail(res, 400, 'Please enter a valid phone number.');
      const message = String(b.message || '').trim();
      if (message.length > 1000) return fail(res, 400, 'Please keep your message to 1,000 characters or fewer.');
      q.insertConsultation.run(user.id, assessmentId, phone || null, b.preferredTime, JSON.stringify(topics), message || null, new Date().toISOString());
      return send(res, 201, { ok: true });
    }

    if (method === 'POST' && pathname === '/api/assessments') {
      const b = await readJson(req);
      const err = checklist.validateAnswers(b.answers);
      if (err) return fail(res, 400, err);
      const clean = Object.fromEntries(checklist.QUESTIONS.map((x) => [x.id, b.answers[x.id]]));
      const info = q.insertAssessment.run(user.id, checklist.VERSION, JSON.stringify(clean));
      const id = Number(info.lastInsertRowid);
      return send(res, 201, buildReport(q.oneAssessment.get(id, user.id), q.prevAssessment.get(user.id, id), user.id));
    }

    if (method === 'GET' && pathname === '/api/assessments') {
      const rows = q.listAssessments.all(user.id);
      return send(
        res,
        200,
        rows.map((r) => {
          const s = checklist.scoreAnswers(JSON.parse(r.answers));
          return { id: r.id, createdAt: r.created_at, overall: s.overall, grade: s.grade, label: s.label, areas: s.areas.map((a) => ({ id: a.id, name: a.name, score: a.score })) };
        })
      );
    }

    const m = pathname.match(/^\/api\/assessments\/(\d+)$/);
    if (method === 'GET' && m) {
      const id = Number(m[1]);
      const row = q.oneAssessment.get(id, user.id); // 본인 것만 조회된다
      if (!row) return fail(res, 404, 'Assessment not found.');
      return send(res, 200, buildReport(row, q.prevAssessment.get(user.id, id), user.id));
    }

    return fail(res, 404, 'Not found.');
  }

  const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  const root = path.resolve(publicDir);

  function serveStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed.');
    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      return fail(res, 400, 'Bad request.');
    }
    if (rel === '/') rel = '/index.html';
    const file = path.resolve(root, '.' + rel);
    if (file !== root && !file.startsWith(root + path.sep)) return fail(res, 403, 'Forbidden.');
    fs.readFile(file, (err, buf) => {
      if (err) return fail(res, 404, 'Not found.');
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else serveStatic(req, res, url);
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e.status) return fail(res, e.status, e.message);
      console.error(e);
      fail(res, 500, 'Server error.');
    }
  });

  return { server, db };
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { server } = createApp({
    dbFile: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db'),
    secureCookie: process.env.COOKIE_SECURE === '1',
  });
  server.listen(port, '127.0.0.1', () => console.log(`AI Security Check: http://localhost:${port}`));
}
