const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const checklist = require('../src/checklist');

const allAnswers = (v) => Object.fromEntries(checklist.QUESTIONS.map((q) => [q.id, v]));

// ── 점수 규칙 ──
test('모두 예 → 100점 A, 모두 아니오 → 0점 D, 할 일은 아니오일 때 3개', () => {
  const best = checklist.scoreAnswers(allAnswers(2));
  assert.equal(best.overall, 100);
  assert.equal(best.grade, 'A');
  assert.equal(best.topActions.length, 0);
  const worst = checklist.scoreAnswers(allAnswers(0));
  assert.equal(worst.overall, 0);
  assert.equal(worst.grade, 'D');
  assert.equal(worst.topActions.length, 3);
});

test('영역 4개, 질문 20개, 질문마다 실행 가능한 권고가 있다', () => {
  assert.equal(checklist.AREAS.length, 4);
  assert.equal(checklist.QUESTIONS.length, 20);
  for (const q of checklist.QUESTIONS) {
    assert.ok(q.action.title && q.action.steps, q.id);
    assert.ok(checklist.AREAS.some((a) => a.id === q.area), q.id);
  }
});

test('같은 답변이면 항상 같은 결과 (결정적)', () => {
  const a = { ...allAnswers(1), t1: 0, d2: 0, i1: 0 };
  assert.deepEqual(checklist.scoreAnswers(a), checklist.scoreAnswers({ ...a }));
});

test('Top 3는 위험 가중치×부족분이 큰 순서, 동점이면 쉬운 것 먼저', () => {
  const a = allAnswers(2);
  a.t1 = 0; // 3*2=6, effort1
  a.a1 = 0; // 3*2=6, effort2
  a.d3 = 0; // 2*2=4
  a.t5 = 1; // 2*1=2
  const ids = checklist.scoreAnswers(a).topActions.map((x) => x.questionId);
  assert.deepEqual(ids, ['t1', 'a1', 'd3']);
});

test('답변 검증: 누락·범위 밖 값은 거부', () => {
  assert.equal(checklist.validateAnswers(allAnswers(1)), null);
  assert.ok(checklist.validateAnswers({}));
  assert.ok(checklist.validateAnswers({ ...allAnswers(1), t1: 3 }));
  assert.ok(checklist.validateAnswers({ ...allAnswers(1), t1: '2' }));
  assert.ok(checklist.validateAnswers(null));
});

// ── API ──
async function withServer(fn) {
  const { server, db } = createApp({ dbFile: ':memory:' });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (path, { method = 'GET', body, headers = {} } = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: res.status, json, text, headers: res.headers };
    };
  };
  try {
    await fn(client, db);
  } finally {
    server.close();
    db.close();
  }
}

const owner = { email: 'Boss@Example.com', password: 'correct horse battery', companyName: '김 회계사무소', employeeCount: 10 };

test('가입·로그인·로그아웃과 회사별 분리', async () => {
  await withServer(async (client) => {
    const a = client();
    assert.equal((await a('/api/me')).status, 401);
    assert.equal((await a('/api/signup', { method: 'POST', body: owner })).status, 201);
    const me = await a('/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.companyName, owner.companyName);

    assert.equal((await a('/api/signup', { method: 'POST', body: owner })).status, 409);
    assert.equal((await a('/api/signup', { method: 'POST', body: { ...owner, email: 'x@y.com', password: 'short' } })).status, 400);

    await a('/api/logout', { method: 'POST', body: {} });
    assert.equal((await a('/api/me')).status, 401);
    const b = client();
    assert.equal((await b('/api/login', { method: 'POST', body: { email: owner.email, password: 'wrong password' } })).status, 401);
    assert.equal((await b('/api/login', { method: 'POST', body: { email: 'boss@example.com', password: owner.password } })).status, 200);
  });
});

test('진단 저장 → 리포트 4요소 → 재점검 시 변화 표시', async () => {
  await withServer(async (client) => {
    const a = client();
    await a('/api/signup', { method: 'POST', body: owner });

    const first = await a('/api/assessments', { method: 'POST', body: { answers: allAnswers(0) } });
    assert.equal(first.status, 201);
    assert.equal(first.json.overall, 0);
    assert.equal(first.json.grade, 'D');
    assert.equal(first.json.areas.length, 4);
    assert.equal(first.json.topActions.length, 3);
    assert.equal(first.json.comparison, null);
    assert.ok(first.json.disclaimer.includes('legal'));

    const second = await a('/api/assessments', { method: 'POST', body: { answers: allAnswers(1) } });
    assert.equal(second.json.overall, 50);
    assert.equal(second.json.comparison.overall, 50);
    assert.equal(second.json.comparison.previousId, first.json.id);
    assert.ok(second.json.comparison.areas.every((x) => x.delta === 50));

    const list = await a('/api/assessments');
    assert.equal(list.json.length, 2);
    assert.equal(list.json[0].overall, 50); // 최신이 먼저

    // 이전 기록을 다시 열어도 비교 대상은 그 직전 기록
    const reopened = await a(`/api/assessments/${first.json.id}`);
    assert.equal(reopened.json.comparison, null);
  });
});

test('다른 회사의 진단은 볼 수 없다', async () => {
  await withServer(async (client) => {
    const a = client();
    const b = client();
    await a('/api/signup', { method: 'POST', body: owner });
    await b('/api/signup', { method: 'POST', body: { ...owner, email: 'other@example.com', companyName: '다른 회사' } });
    const mine = await a('/api/assessments', { method: 'POST', body: { answers: allAnswers(2) } });
    assert.equal((await b(`/api/assessments/${mine.json.id}`)).status, 404);
    assert.equal((await b('/api/assessments')).json.length, 0);
  });
});

test('로그인 없이는 진단 API 접근 불가, 잘못된 답변은 거부', async () => {
  await withServer(async (client) => {
    const anon = client();
    assert.equal((await anon('/api/assessments')).status, 401);
    assert.equal((await anon('/api/assessments', { method: 'POST', body: { answers: allAnswers(1) } })).status, 401);
    const a = client();
    await a('/api/signup', { method: 'POST', body: owner });
    assert.equal((await a('/api/assessments', { method: 'POST', body: { answers: { t1: 2 } } })).status, 400);
    assert.equal((await a('/api/assessments', { method: 'POST', body: { answers: { ...allAnswers(1), t1: 9 } } })).status, 400);
  });
});

test('JSON이 아닌 POST는 거부 (CSRF 완화), 정적 파일 경로 이탈 차단', async () => {
  await withServer(async (client) => {
    const a = client();
    const res = await a('/api/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: owner });
    assert.equal(res.status, 415);
    assert.equal((await a('/')).status, 200);
    assert.equal((await a('/..%2fsrc%2fserver.js')).status === 200, false);
    assert.equal((await a('/%2e%2e/package.json')).status === 200, false);
  });
});

test('같은 이메일·IP로 로그인 10회 실패하면 제한', async () => {
  await withServer(async (client) => {
    const a = client();
    await a('/api/signup', { method: 'POST', body: owner });
    const b = client();
    for (let i = 0; i < 10; i++) assert.equal((await b('/api/login', { method: 'POST', body: { email: owner.email, password: 'nope nope nope' } })).status, 401);
    assert.equal((await b('/api/login', { method: 'POST', body: { email: owner.email, password: owner.password } })).status, 429);
  });
});

// ── 소개 페이지·상담 신청 ──
test('소개 페이지는 / 에서, 점검 앱은 /app.html 에서 열린다', async () => {
  await withServer(async (client) => {
    const a = client();
    const home = await a('/');
    assert.equal(home.status, 200);
    assert.ok(home.text.includes('/app.html#/signup'));
    assert.ok(!home.text.includes('<script>'), '인라인 스크립트 금지(CSP)');
    assert.equal((await a('/app.html')).status, 200);
    const site = await a('/api/site');
    assert.equal(site.status, 200);
    assert.deepEqual(Object.keys(site.json).sort(), ['companyName', 'contactEmail', 'contactPhone']);
  });
});

const consult = (assessmentId, over = {}) => ({
  assessmentId, topics: ['tools', 'it-support'], phone: '201-555-0100', preferredTime: 'morning', message: '도움이 필요합니다', consent: true, ...over,
});

test('상담 신청: 동의 필수, 본인 진단만, 진단당 1회, 리포트에 접수 표시', async () => {
  await withServer(async (client) => {
    const a = client();
    const b = client();
    await a('/api/signup', { method: 'POST', body: owner });
    await b('/api/signup', { method: 'POST', body: { ...owner, email: 'other@example.com', companyName: '다른 회사' } });
    const rep = await a('/api/assessments', { method: 'POST', body: { answers: allAnswers(1) } });
    const id = rep.json.id;
    assert.equal(rep.json.consultationRequestedAt, null);

    assert.equal((await a('/api/consultations', { method: 'POST', body: consult(id, { consent: false }) })).status, 400);
    assert.equal((await a('/api/consultations', { method: 'POST', body: consult(id, { topics: ['hack'] }) })).status, 400);
    assert.equal((await a('/api/consultations', { method: 'POST', body: consult(id, { preferredTime: 'night' }) })).status, 400);
    assert.equal((await a('/api/consultations', { method: 'POST', body: consult(id, { phone: 'abc' }) })).status, 400);
    assert.equal((await a('/api/consultations', { method: 'POST', body: consult(id, { message: 'x'.repeat(1001) }) })).status, 400);
    // 다른 회사의 진단으로는 신청할 수 없다
    assert.equal((await b('/api/consultations', { method: 'POST', body: consult(id) })).status, 404);
    assert.equal((await client()('/api/consultations', { method: 'POST', body: consult(id) })).status, 401);

    assert.equal((await a('/api/consultations', { method: 'POST', body: consult(id) })).status, 201);
    assert.equal((await a('/api/consultations', { method: 'POST', body: consult(id) })).status, 409);
    const again = await a(`/api/assessments/${id}`);
    assert.ok(again.json.consultationRequestedAt);

    // 새 진단은 다시 신청할 수 있다
    const rep2 = await a('/api/assessments', { method: 'POST', body: { answers: allAnswers(2) } });
    assert.equal(rep2.json.consultationRequestedAt, null);
    assert.equal((await a('/api/consultations', { method: 'POST', body: consult(rep2.json.id, { phone: '', topics: [] }) })).status, 201);
  });
});

test('가입 전 미리보기: 점수만 반환하고 저장하지 않으며 Top 3는 주지 않는다', async () => {
  await withServer(async (client, db) => {
    const anon = client();
    const res = await anon('/api/preview', { method: 'POST', body: { answers: { ...allAnswers(2), t1: 0 } } });
    assert.equal(res.status, 200);
    assert.equal(res.json.areas.length, 4);
    assert.ok(Number.isInteger(res.json.overall));
    assert.equal(res.json.topActions, undefined);
    assert.equal(res.json.areas[0].steps, undefined);
    assert.equal((await anon('/api/preview', { method: 'POST', body: { answers: { t1: 2 } } })).status, 400);
    assert.equal((await anon('/api/preview', { method: 'POST', body: { answers: { ...allAnswers(2), t1: 5 } } })).status, 400);
    // 미리보기는 같은 입력이면 같은 점수이고, 저장된 진단 기록이 없다
    const again = await anon('/api/preview', { method: 'POST', body: { answers: { ...allAnswers(2), t1: 0 } } });
    assert.deepEqual(again.json, res.json);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM assessments').get().n, 0);
  });
});

// ── 관리 서비스 안내와 가입 없는 상담 신청 ──
const lead = (over = {}) => ({ email: 'Owner@Shop.com', companyName: '동네 약국', phone: '973-555-0100', answers: { ...allAnswers(1), t1: 0 }, consent: true, ...over });

test('서비스 정의는 4개 영역과 1:1로 대응한다', async () => {
  await withServer(async (client) => {
    const res = await client()('/api/service');
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.items.map((i) => i.area).sort(), checklist.AREAS.map((a) => a.id).sort());
    assert.ok(res.json.name && res.json.cta);
  });
});

test('가입 없는 상담 신청: 동의·형식 검증, 점수 포함 저장, 하루 1건 중복 방지', async () => {
  await withServer(async (client, db) => {
    const anon = client();
    const post = (b) => anon('/api/leads', { method: 'POST', body: b });
    assert.equal((await post(lead({ consent: false }))).status, 400);
    assert.equal((await post(lead({ email: 'bad' }))).status, 400);
    assert.equal((await post(lead({ companyName: '' }))).status, 400);
    assert.equal((await post(lead({ phone: 'abc' }))).status, 400);
    assert.equal((await post(lead({ answers: { t1: 2 } }))).status, 400);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 0);

    assert.equal((await post(lead())).status, 201);
    assert.equal((await post(lead({ email: 'owner@shop.com' }))).status, 201); // 같은 이메일(대소문자 무시): 성공으로 보이지만 쌓이지 않는다
    const rows = db.prepare('SELECT * FROM leads').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'owner@shop.com');
    assert.equal(JSON.parse(rows[0].answers).t1, 0);
    assert.ok(rows[0].consent_at);
  });
});

test('가입 없는 상담 신청은 IP당 1시간 5건까지', async () => {
  await withServer(async (client) => {
    const anon = client();
    for (let i = 0; i < 5; i++) assert.equal((await anon('/api/leads', { method: 'POST', body: lead({ email: `u${i}@shop.com` }) })).status, 201);
    assert.equal((await anon('/api/leads', { method: 'POST', body: lead({ email: 'u9@shop.com' }) })).status, 429);
  });
});

test('문의 경로: call·template 은 답변 없이 가능, 경로별 중복 방지, 잘못된 source 거부', async () => {
  await withServer(async (client, db) => {
    const anon = client();
    const post = (b) => anon('/api/leads', { method: 'POST', body: b });
    const base = { email: 'a@shop.com', companyName: '동네 약국', consent: true };
    assert.equal((await post({ ...base, source: 'hack' })).status, 400);
    assert.equal((await post({ ...base, source: 'call', companyName: '' })).status, 400); // 상담은 회사 이름 필수
    assert.equal((await post({ ...base, source: 'call', phone: '973-555-0100' })).status, 201);
    assert.equal((await post({ ...base, source: 'call' })).status, 201); // 같은 경로 중복: 쌓이지 않음
    assert.equal((await post({ email: 'a@shop.com', companyName: '', source: 'template', consent: true })).status, 201); // 다른 경로: 쌓임, 회사 이름 선택
    assert.equal((await post({ ...base, source: 'template', consent: false })).status, 400);
    const rows = db.prepare('SELECT source, company_name, answers FROM leads ORDER BY id').all();
    assert.deepEqual(rows.map((r) => r.source), ['call', 'template']);
    assert.equal(rows[0].answers, null);
    assert.equal(rows[1].company_name, '(not provided)');
    // source 를 생략하면 기존처럼 점검 결과 신청(답변 필수)
    assert.equal((await post({ ...base, email: 'b@shop.com' })).status, 400);
  });
});

test('지침 템플릿 페이지와 서비스 정의(구성·증거 자리)', async () => {
  await withServer(async (client) => {
    const a = client();
    const page = await a('/ai-policy-template.html');
    assert.equal(page.status, 200);
    assert.ok(page.text.includes('Employee AI Use Policy'));
    assert.ok(!page.text.includes('<script>'), '인라인 스크립트 금지(CSP)');
    const svc = (await a('/api/service')).json;
    assert.equal(svc.suite.length, 4);
    assert.ok(Array.isArray(svc.testimonials) && Array.isArray(svc.credentials));
    assert.equal(svc.templateUrl, '/ai-policy-template.html');
  });
});

test('고객에게 보이는 화면과 문구는 영어다 (한글 없음)', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const hangul = /[가-힣]/;
  const pub = path.join(__dirname, '..', 'public');
  for (const f of ['index.html', 'app.html', 'ai-policy-template.html']) {
    assert.ok(!hangul.test(fs.readFileSync(path.join(pub, f), 'utf8')), `${f} contains Korean`);
  }
  const { SERVICE } = require('../src/service');
  assert.ok(!hangul.test(JSON.stringify(SERVICE)), 'service copy contains Korean');
  assert.ok(!hangul.test(JSON.stringify({ AREAS: checklist.AREAS, Q: checklist.QUESTIONS, A: checklist.ANSWER_LABELS })), 'checklist contains Korean');
  const sample = checklist.scoreAnswers({ ...allAnswers(0) });
  assert.ok(!hangul.test(JSON.stringify(sample)));
});

test('사이버보안 구성: 서비스 6가지, 경영자 질문 4개, 업종, 평점 슬롯은 비어 있음', async () => {
  await withServer(async (client) => {
    const svc = (await client()('/api/service')).json;
    assert.equal(svc.cybersecurity.length, 6);
    assert.equal(svc.questions.length, 4);
    assert.ok(svc.industries.length >= 5);
    assert.equal(svc.rating, null);
    assert.deepEqual(svc.testimonials, []);
    for (const c of svc.cybersecurity) assert.ok(c.title && c.body);
  });
});
