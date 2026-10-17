// 화면(app.js, landing.js) 동작 테스트. 가상 브라우저(jsdom)에서 실제 스크립트를 실행하고,
// Supabase 대신 같은 모양의 가짜 저장소를 붙인다. 로그인 정보를 어디에도 보내지 않으며,
// 실제 DB 의 RLS·권한은 마이그레이션 검증(역할 전환 SQL)에서 따로 확인했다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { SERVICE } = require('../src/service');
const checklist = require('../public/checklist');

const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
const allAnswers = (v) => Object.fromEntries(checklist.QUESTIONS.map((q) => [q.id, v]));

// ── 가짜 Supabase: 이 앱이 쓰는 부분만 같은 모양으로 구현 ──
// 다른 realm(jsdom)의 객체를 값으로 복사한다. 실제 Supabase 는 JSON 으로 직렬화해 저장하므로 같은 동작이다.
const plain = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function makeFakeSb({ confirmRequired = true } = {}) {
  const state = { sentColumns: {}, session: null, users: new Map(), assessments: [], consultations: [], leads: [], leadError: null, expireSession: false, nextId: 1, confirmRequired };
  const handlers = [];
  const mkSession = (email) => ({ user: { id: `u-${email}`, email, user_metadata: state.users.get(email).meta } });
  const denied = { status: 401, message: 'JWT expired' };

  class Query {
    constructor(table) { this.table = table; this.filters = []; this.mode = null; this.wantsRow = false; this.op = 'select'; }
    select() { this.wantsRow = true; return this; }
    order(col, { ascending } = {}) { this.ord = { col, asc: ascending !== false }; return this; }
    eq(col, val) { this.filters.push([col, val]); return this; }
    insert(row) { this.op = 'insert'; this.row = row; return this; }
    single() { this.mode = 'single'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
    run() {
      const t = this.table;
      if (t === 'aicheck_leads') {
        if (this.op !== 'insert') return { data: null, error: { status: 401, message: 'permission denied for table aicheck_leads' } };
        if (state.leadError) return { data: null, error: { message: state.leadError } };
        state.leads.push(plain(this.row));
        return { data: null, error: null };
      }
      if (!state.session || state.expireSession) return { data: null, error: denied };
      const uid = state.session.user.id;
      if (t === 'aicheck_assessments') {
        if (this.op === 'insert') {
          if (checklist.validateAnswers(this.row.answers)) return { data: null, error: { code: '23514', message: 'check violation' } };
          const rec = { id: state.nextId++, user_id: uid, checklist_version: this.row.checklist_version, answers: plain(this.row.answers), created_at: new Date(Date.UTC(2026, 9, 17, 8, state.nextId)).toISOString() };
          state.assessments.push(rec);
          return { data: this.wantsRow ? { id: rec.id } : null, error: null };
        }
        const rows = state.assessments.filter((a) => a.user_id === uid).sort((a, b) => (this.ord && !this.ord.asc ? b.id - a.id : a.id - b.id));
        return { data: rows, error: null };
      }
      if (t === 'aicheck_consultations') {
        if (this.op === 'insert') {
          const mine = state.assessments.some((a) => a.id === this.row.assessment_id && a.user_id === uid);
          if (!mine) return { data: null, error: { code: '42501', message: 'row-level security' } };
          if (state.consultations.some((c) => c.user_id === uid && c.assessment_id === this.row.assessment_id)) return { data: null, error: { code: '23505', message: 'duplicate' } };
          state.sentColumns.consultations = Object.keys(this.row);
          state.consultations.push({ ...plain(this.row), user_id: uid, id: state.nextId++, created_at: '2026-10-17T09:00:00.000Z' });
          return { data: null, error: null };
        }
        const rows = state.consultations.filter((c) => c.user_id === uid && this.filters.every(([k, v]) => c[k] === v));
        return { data: this.mode === 'maybe' ? rows[0] || null : rows, error: null };
      }
      return { data: null, error: { message: 'unknown table' } };
    }
  }

  const sb = {
    state,
    auth: {
      async getSession() { return { data: { session: state.session } }; },
      async signUp({ email, password, options }) {
        if (state.users.has(email)) return { data: {}, error: { message: 'User already registered' } };
        state.users.set(email, { password, confirmed: !state.confirmRequired, meta: options.data });
        if (!state.confirmRequired) state.session = mkSession(email);
        return { data: { session: state.session, user: { email } }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = state.users.get(email);
        if (!u || u.password !== password) return { data: {}, error: { message: 'Invalid login credentials' } };
        if (!u.confirmed) return { data: {}, error: { message: 'Email not confirmed' } };
        state.session = mkSession(email);
        return { data: { session: state.session }, error: null };
      },
      async signOut() { state.session = null; handlers.forEach((h) => h('SIGNED_OUT')); return { error: null }; },
      onAuthStateChange(cb) { handlers.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from: (table) => new Query(table),
  };
  return sb;
}

async function waitFor(fn, what, ms = 2000) {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

function loadPage(htmlFile, scriptFiles, sb, hash = '') {
  const dom = new JSDOM(pub(htmlFile).replace(/<script[^>]*><\/script>/g, ''), {
    url: `http://localhost/${htmlFile === 'index.html' ? '' : htmlFile}${hash}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.APP_CONFIG = { supabaseUrl: 'https://x.supabase.co', supabaseKey: 'sb_publishable_test' };
  window.sb = sb;
  window.fetch = async (url) => {
    if (url === '/api/service') return { ok: true, json: async () => SERVICE };
    if (url === '/api/site') return { ok: true, json: async () => ({ companyName: '', contactEmail: '', contactPhone: '' }) };
    return { ok: false, json: async () => ({}) };
  };
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  for (const f of scriptFiles) window.eval(pub(f));
  return window;
}

const $ = (w, sel) => w.document.querySelector(sel);
const $$ = (w, sel) => [...w.document.querySelectorAll(sel)];
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
const submitForm = (w, form) => form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
function fill(w, id, value) {
  const el = w.document.getElementById(id);
  el.value = value;
  return el;
}
function answerAll(w, values = {}) {
  const names = [...new Set($$(w, 'input[type=radio]').map((i) => i.name))];
  for (const n of names) {
    const radio = $(w, `input[name="${n}"][value="${values[n] ?? 2}"]`);
    radio.checked = true;
    radio.dispatchEvent(new w.Event('change', { bubbles: true }));
  }
  return names.length;
}
async function signIn(w, email = 'owner@shop.com', pw = 'a-long-test-pass') {
  fill(w, 'email', email);
  fill(w, 'pw', pw);
  submitForm(w, $(w, 'form'));
}

// ── 앱: 가입 · 이메일 확인 · 로그인 ──
test('로그인 전에는 로그인 화면, #/signup 이면 가입 탭이 열린다', async () => {
  const w = loadPage('app.html', ['checklist.js', 'app.js'], makeFakeSb());
  await waitFor(() => $(w, 'h1'), 'login view');
  assert.equal($(w, 'h1').textContent, 'The 10-minute AI security check');
  assert.deepEqual(plain($$(w, 'label').map((l) => l.textContent)), ['Email', 'Password']);
  const w2 = loadPage('app.html', ['checklist.js', 'app.js'], makeFakeSb(), '#/signup');
  await waitFor(() => $$(w2, 'label').length === 4, 'signup form');
  assert.ok($$(w2, 'label').some((l) => l.textContent === 'Company name'));
});

test('이메일 인증이 켜져 있으면 가입 후 "Check your email"을 보여주고, 인증 전 로그인은 안내 문구로 막힌다', async () => {
  const sb = makeFakeSb({ confirmRequired: true });
  const w = loadPage('app.html', ['checklist.js', 'app.js'], sb, '#/signup');
  await waitFor(() => $$(w, 'label').length === 4, 'signup form');
  fill(w, 'email', 'Owner@Shop.com');
  fill(w, 'pw', 'a-long-test-pass');
  fill(w, 'company', 'Shop Co');
  fill(w, 'emp', '12');
  submitForm(w, $(w, 'form'));
  await waitFor(() => $(w, 'h1')?.textContent === 'Check your email', 'check-email view');
  assert.match($(w, '.card').textContent, /owner@shop\.com/);
  assert.equal(sb.state.session, null);
  assert.deepEqual(plain(sb.state.users.get('owner@shop.com').meta), { company_name: 'Shop Co', employee_count: 12 });

  click($(w, '.card button')); // Go to sign in
  await waitFor(() => $$(w, 'label').length === 2, 'login form');
  await signIn(w);
  await waitFor(() => $(w, '.error')?.textContent, 'unconfirmed message');
  assert.match($(w, '.error').textContent, /confirm your email/i);
});

test('인증 후 로그인하면 홈이 열리고, 틀린 비밀번호는 오류 문구를 보여준다', async () => {
  const sb = makeFakeSb({ confirmRequired: false });
  sb.state.users.set('owner@shop.com', { password: 'a-long-test-pass', confirmed: true, meta: { company_name: 'Shop Co', employee_count: null } });
  const w = loadPage('app.html', ['checklist.js', 'app.js'], sb);
  await waitFor(() => $$(w, 'label').length === 2, 'login form');
  await signIn(w, 'owner@shop.com', 'wrong');
  await waitFor(() => $(w, '.error')?.textContent, 'error');
  assert.equal($(w, '.error').textContent, 'Incorrect email or password.');
  await signIn(w, 'owner@shop.com', 'a-long-test-pass');
  await waitFor(() => $(w, 'h1')?.textContent.includes('Shop Co'), 'home');
  assert.match($(w, 'main').textContent, /No assessments yet/);
  assert.equal($(w, '#userbar button').textContent, 'Sign out');
});

// ── 앱: 점검 · 리포트 · 상담 신청 ──
async function signedInApp(sbOpts) {
  const sb = makeFakeSb({ confirmRequired: false });
  sb.state.users.set('owner@shop.com', { password: 'a-long-test-pass', confirmed: true, meta: { company_name: 'Shop Co', employee_count: null } });
  sb.state.session = { user: { id: 'u-owner@shop.com', email: 'owner@shop.com', user_metadata: { company_name: 'Shop Co' } } };
  const w = loadPage('app.html', ['checklist.js', 'app.js'], sb);
  return { w, sb };
}

test('점검 20문항을 다 풀어야 제출되고, 저장 후 리포트 4요소와 서비스 연결이 보인다', async () => {
  const { w, sb } = await signedInApp();
  await waitFor(() => $(w, 'h1')?.textContent.includes('Shop Co'), 'home');
  w.location.hash = '#/quiz';
  await waitFor(() => $$(w, 'input[type=radio]').length === 60, 'quiz');
  const submit = $$(w, 'button').find((b) => b.textContent === 'See results');
  assert.equal(submit.disabled, true);
  assert.equal(answerAll(w, { t1: 0, d1: 0, a1: 0 }), 20);
  assert.equal(submit.disabled, false);
  click(submit);
  await waitFor(() => $(w, 'h1')?.textContent === 'AI Security Assessment Report', 'report');

  assert.equal(sb.state.assessments.length, 1);
  assert.equal(sb.state.assessments[0].checklist_version, 1);
  const expected = checklist.scoreAnswers({ ...allAnswers(2), t1: 0, d1: 0, a1: 0 });
  assert.equal($(w, '.big').textContent, `${expected.overall} pts`);
  assert.equal($$(w, '.area').length, 4);
  assert.equal($$(w, '.action').length, 3);
  assert.ok($(w, '.svc-line'), 'Top 3 links to the managed service');
  assert.match($(w, '.score-hero').textContent, /first assessment/);
  assert.match($(w, '.card.consult h2').textContent, /Close the gaps/);
  assert.match($(w, '.disclaimer').textContent, /not legal or security advice/);
});

test('두 번째 점검에는 이전 대비 변화가 나온다', async () => {
  const { w, sb } = await signedInApp();
  sb.state.assessments.push({ id: 100, user_id: 'u-owner@shop.com', checklist_version: 1, answers: allAnswers(0), created_at: '2026-09-01T00:00:00.000Z' });
  sb.state.nextId = 101;
  w.location.hash = '#/quiz';
  await waitFor(() => $$(w, 'input[type=radio]').length === 60, 'quiz');
  answerAll(w, {});
  click($$(w, 'button').find((b) => b.textContent === 'See results'));
  await waitFor(() => $(w, 'h1')?.textContent === 'AI Security Assessment Report', 'report');
  assert.match($(w, '.score-hero').textContent, /Compared with your last check/);
  assert.match($(w, '.score-hero').textContent, /up 100 pts/);
});

test('상담 신청: 동의가 없으면 막고, 동의하면 올바른 값만 저장하고 접수 완료로 바뀐다', async () => {
  const { w, sb } = await signedInApp();
  sb.state.assessments.push({ id: 7, user_id: 'u-owner@shop.com', checklist_version: 1, answers: { ...allAnswers(2), t1: 0 }, created_at: '2026-10-01T00:00:00.000Z' });
  w.location.hash = '#/report/7';
  await waitFor(() => $(w, '.card.consult form'), 'consult form');
  const form = $(w, '.card.consult form');
  // Top 3 에 해당하는 영역이 미리 선택돼 있다
  assert.deepEqual(plain($$(w, '.consult input[type=checkbox]:checked').map((i) => i.value)), ['tools']);

  submitForm(w, form);
  await waitFor(() => $(w, '.consult .error')?.textContent, 'consent error');
  assert.match($(w, '.consult .error').textContent, /agree to be contacted/);
  assert.equal(sb.state.consultations.length, 0);

  fill(w, 'c-phone', 'abc');
  w.document.getElementById('c-consent').checked = true;
  submitForm(w, form);
  await waitFor(() => /valid phone/.test($(w, '.consult .error')?.textContent || ''), 'phone error');

  fill(w, 'c-phone', '201-555-0100');
  fill(w, 'c-time', 'morning');
  fill(w, 'c-msg', '  Need help  ');
  submitForm(w, form);
  await waitFor(() => /has been received/.test($(w, '.card.consult h2')?.textContent || ''), 'received');
  assert.equal(sb.state.consultations.length, 1);
  const c = sb.state.consultations[0];
  assert.deepEqual(
    plain({ assessment_id: c.assessment_id, phone: c.phone, preferred_time: c.preferred_time, topics: c.topics, message: c.message, consent_given: c.consent_given }),
    { assessment_id: 7, phone: '201-555-0100', preferred_time: 'morning', topics: ['tools'], message: 'Need help', consent_given: true }
  );
  // 앱이 보낸 값에는 클라이언트가 정하면 안 되는 컬럼이 없다 (user_id·status 는 DB 가 정한다)
  assert.deepEqual(sb.state.sentColumns.consultations.sort(), ['assessment_id', 'consent_given', 'message', 'phone', 'preferred_time', 'topics']);
});

test('세션이 만료되면 로그인 화면으로 돌아간다', async () => {
  const { w, sb } = await signedInApp();
  await waitFor(() => $(w, 'h1')?.textContent.includes('Shop Co'), 'home');
  sb.state.expireSession = true;
  w.location.hash = '#/quiz';
  await waitFor(() => $$(w, 'input[type=radio]').length === 60, 'quiz');
  answerAll(w, {});
  click($$(w, 'button').find((b) => b.textContent === 'See results'));
  await waitFor(() => $$(w, 'label').length === 2 && $(w, 'h1')?.textContent === 'The 10-minute AI security check', 'login view after expiry');
});

test('소개 페이지에서 해 본 답변은 로그인 직후 한 번만 저장되어 리포트가 열린다 (6시간 유효)', async () => {
  const sb = makeFakeSb({ confirmRequired: false });
  sb.state.users.set('owner@shop.com', { password: 'a-long-test-pass', confirmed: true, meta: { company_name: 'Shop Co', employee_count: null } });
  const w = loadPage('app.html', ['checklist.js'], sb);
  w.sessionStorage.setItem('pendingAnswers', JSON.stringify({ answers: { ...allAnswers(2), d1: 0 }, savedAt: Date.now() }));
  w.eval(pub('app.js'));
  await waitFor(() => $$(w, 'label').length === 2, 'login form');
  await signIn(w, 'owner@shop.com', 'a-long-test-pass');
  await waitFor(() => $(w, 'h1')?.textContent === 'AI Security Assessment Report', 'report from pending answers');
  assert.equal(sb.state.assessments.length, 1);
  assert.equal(w.sessionStorage.getItem('pendingAnswers'), null);

  // 오래된 답변은 버린다
  const sb2 = makeFakeSb({ confirmRequired: false });
  sb2.state.session = { user: { id: 'u-x', email: 'x@shop.com', user_metadata: { company_name: 'X' } } };
  const w2 = loadPage('app.html', ['checklist.js'], sb2);
  w2.sessionStorage.setItem('pendingAnswers', JSON.stringify({ answers: allAnswers(2), savedAt: Date.now() - 7 * 3600 * 1000 }));
  w2.eval(pub('app.js'));
  await waitFor(() => $(w2, 'h1')?.textContent.includes('X'), 'home');
  assert.equal(sb2.state.assessments.length, 0);
});

// ── 소개 페이지: 점검 결과와 문의 폼 ──
function runQuiz(w, values) {
  click($$(w, '#quiz button').find((b) => b.textContent === 'Start the check'));
  return (async () => {
    for (let i = 0; i < 4; i++) {
      await waitFor(() => $$(w, '#quiz .qnav button').length, 'step');
      answerAll(w, values);
      click($$(w, '#quiz .qnav button').find((b) => ['Next', 'See results'].includes(b.textContent)));
    }
    await waitFor(() => $(w, '.rscore'), 'result');
  })();
}

test('소개 페이지: 20문항 → 점수·낮은 영역과 서비스 항목 → 상담 신청이 올바른 값으로 저장된다', async () => {
  const sb = makeFakeSb();
  const w = loadPage('index.html', ['checklist.js', 'landing.js'], sb);
  await waitFor(() => $$(w, '#quiz button').length, 'quiz intro');
  await runQuiz(w, { t1: 0, d1: 0, a1: 0 });
  const expected = checklist.scoreAnswers({ ...allAnswers(2), t1: 0, d1: 0, a1: 0 });
  assert.equal($(w, '.rscore').textContent, `${expected.overall} pts`);
  assert.ok($$(w, '.gap').length >= 1);
  assert.ok(!$(w, '.action'), 'Top 3 is not shown before sign-up');

  const form = $(w, '.leadbox form');
  fill(w, 'l-email', '  Boss@Shop.COM ');
  fill(w, 'l-company', ' Shop Co ');
  submitForm(w, form);
  await waitFor(() => $(w, '.leadbox .error')?.textContent, 'consent error');
  assert.match($(w, '.leadbox .error').textContent, /agree to be contacted/);
  assert.equal(sb.state.leads.length, 0);

  w.document.getElementById('l-consent').checked = true;
  submitForm(w, form);
  await waitFor(() => /has been received/.test($(w, '.leadbox h4')?.textContent || ''), 'received');
  assert.equal(sb.state.leads.length, 1);
  const lead = sb.state.leads[0];
  assert.equal(lead.email, 'boss@shop.com');
  assert.equal(lead.company_name, 'Shop Co');
  assert.equal(lead.source, 'check');
  assert.equal(lead.consent_given, true);
  assert.equal(lead.checklist_version, 1);
  assert.equal(lead.phone, null);
  assert.equal(checklist.validateAnswers(lead.answers), null);
  for (const k of ['status', 'client_ip', 'created_at', 'user_id']) assert.ok(!(k in lead), `client must not send ${k}`);
});

test('소개 페이지: 10분 상담·지침 템플릿 폼의 저장값과 오류 안내', async () => {
  const sb = makeFakeSb();
  const w = loadPage('index.html', ['checklist.js', 'landing.js'], sb);
  await waitFor(() => $$(w, 'form.lead-form').length === 2, 'forms');

  const tpl = $(w, 'form[data-source=template]');
  tpl.elements.email.value = 'tpl@shop.com';
  submitForm(w, tpl);
  await waitFor(() => tpl.querySelector('.error').textContent, 'consent error');
  tpl.elements.consent.checked = true;
  submitForm(w, tpl);
  await waitFor(() => $(w, '#guide .done a'), 'template link');
  assert.equal($(w, '#guide .done a').getAttribute('href'), '/ai-policy-template.html');
  assert.deepEqual(plain(sb.state.leads[0]), { email: 'tpl@shop.com', company_name: '(not provided)', phone: null, answers: null, checklist_version: null, source: 'template', consent_given: true });

  const call = $(w, 'form[data-source=call]');
  call.elements.email.value = 'not-an-email';
  call.elements.companyName.value = 'Shop';
  call.elements.consent.checked = true;
  submitForm(w, call);
  await waitFor(() => call.querySelector('.error').textContent, 'email error');
  assert.match(call.querySelector('.error').textContent, /valid email/);
  call.elements.email.value = 'call@shop.com';
  call.elements.phone.value = 'abc';
  submitForm(w, call);
  await waitFor(() => /valid phone/.test(call.querySelector('.error').textContent), 'phone error');
  call.elements.phone.value = '(201) 555-0100';
  sb.state.leadError = 'rate_limited';
  submitForm(w, call);
  await waitFor(() => /Too many requests/.test(call.querySelector('.error').textContent), 'rate limit message');
  assert.equal(sb.state.leads.length, 1);
  sb.state.leadError = null;
  submitForm(w, call);
  await waitFor(() => $(w, '#contact .done h4'), 'call done');
  assert.deepEqual(plain(sb.state.leads[1]), { email: 'call@shop.com', company_name: 'Shop', phone: '(201) 555-0100', answers: null, checklist_version: null, source: 'call', consent_given: true });
});

test('소개 페이지: "저장하고 우선 할 일 받기"는 답변을 임시로 담아 가입 화면으로 넘긴다', async () => {
  const sb = makeFakeSb();
  const w = loadPage('index.html', ['checklist.js', 'landing.js'], sb);
  await waitFor(() => $$(w, '#quiz button').length, 'quiz intro');
  await runQuiz(w, { t1: 0 });
  const saveBtn = $$(w, '.altpath button').find((b) => b.textContent.startsWith('Save my results'));
  assert.ok(saveBtn);
  // jsdom 은 페이지 이동을 구현하지 않으므로 이동 직전까지만 확인한다 (sessionStorage 에 담긴 값)
  try { click(saveBtn); } catch { /* navigation not implemented */ }
  const saved = JSON.parse(w.sessionStorage.getItem('pendingAnswers'));
  assert.equal(checklist.validateAnswers(saved.answers), null);
  assert.ok(Date.now() - saved.savedAt < 5000);
  assert.equal(sb.state.leads.length, 0, 'nothing is sent to the database before the visitor signs up or requests a consultation');
});
