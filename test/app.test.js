const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createApp } = require('../src/server');
const checklist = require('../public/checklist');

const root = path.join(__dirname, '..');
const allAnswers = (v) => Object.fromEntries(checklist.QUESTIONS.map((q) => [q.id, v]));

// ── 점수 규칙 (공유 모듈: Node 와 브라우저가 같은 파일을 쓴다) ──
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
  a.t1 = 0;
  a.a1 = 0;
  a.d3 = 0;
  a.t5 = 1;
  assert.deepEqual(checklist.scoreAnswers(a).topActions.map((x) => x.questionId), ['t1', 'a1', 'd3']);
});

test('답변 검증: 누락·범위 밖 값은 거부', () => {
  assert.equal(checklist.validateAnswers(allAnswers(1)), null);
  assert.ok(checklist.validateAnswers({}));
  assert.ok(checklist.validateAnswers({ ...allAnswers(1), t1: 3 }));
  assert.ok(checklist.validateAnswers({ ...allAnswers(1), t1: '2' }));
  assert.ok(checklist.validateAnswers(null));
});

test('리포트: 4요소(종합·영역별·Top 3·이전 대비 변화)와 면책 문구', () => {
  const first = { id: 1, created_at: '2026-01-01T00:00:00Z', checklist_version: 1, answers: allAnswers(0) };
  const second = { id: 2, created_at: '2026-02-01T00:00:00Z', checklist_version: 1, answers: JSON.stringify(allAnswers(1)) }; // 문자열 JSON 도 받는다
  const r1 = checklist.buildReport(first, null);
  assert.equal(r1.overall, 0);
  assert.equal(r1.comparison, null);
  assert.equal(r1.areas.length, 4);
  assert.equal(r1.topActions.length, 3);
  assert.ok(r1.disclaimer.includes('legal'));
  const r2 = checklist.buildReport(second, first);
  assert.equal(r2.overall, 50);
  assert.equal(r2.comparison.overall, 50);
  assert.equal(r2.comparison.previousId, 1);
  assert.ok(r2.comparison.areas.every((x) => x.delta === 50));
});

test('브라우저에서도 같은 파일이 window.Checklist 로 노출된다', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'public', 'checklist.js'), 'utf8'), ctx);
  assert.equal(ctx.window.Checklist.QUESTIONS.length, 20);
  assert.equal(ctx.window.Checklist.scoreAnswers(allAnswers(2)).overall, 100);
});

// ── 정적 서버 ──
async function withServer(fn, opts) {
  const { server } = createApp(opts);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(async (p, init) => {
      const res = await fetch(base + p, init);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: res.status, text, json, headers: res.headers };
    });
  } finally {
    server.close();
  }
}

test('소개 페이지는 /, 점검 앱은 /app.html, 템플릿은 /ai-policy-template.html', async () => {
  await withServer(async (get) => {
    const home = await get('/');
    assert.equal(home.status, 200);
    assert.ok(home.text.includes('/app.html#/signup'));
    assert.equal((await get('/app.html')).status, 200);
    const tpl = await get('/ai-policy-template.html');
    assert.equal(tpl.status, 200);
    assert.ok(tpl.text.includes('Employee AI Use Policy'));
  });
});

test('HTML 이 읽는 스크립트는 모두 실제로 서빙되고, 인라인 스크립트는 없다 (CSP)', async () => {
  await withServer(async (get) => {
    for (const page of ['/', '/app.html', '/ai-policy-template.html']) {
      const html = (await get(page)).text;
      assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/.test(html), `inline script in ${page}`);
      for (const [, src] of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) {
        const res = await get(src);
        assert.equal(res.status, 200, `${page} loads ${src}`);
      }
    }
    // 스크립트 순서: 설정 → supabase 라이브러리 → 클라이언트 → 점수 규칙 → 화면
    const app = (await get('/app.html')).text;
    const order = ['/config.js', '/vendor/supabase.js', '/supabase-client.js', '/checklist.js', '/app.js'].map((s) => app.indexOf(s));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });
});

test('/config.js 는 공개 키만 내려주고, CSP 는 Supabase 와 자기 자신으로만 연결을 허용한다', async () => {
  await withServer(
    async (get) => {
      const cfg = await get('/config.js');
      assert.equal(cfg.status, 200);
      assert.ok(cfg.text.startsWith('window.APP_CONFIG = '));
      assert.ok(cfg.text.includes('https://abc.supabase.co'));
      assert.ok(cfg.text.includes('sb_publishable_test'));
      const csp = cfg.headers.get('content-security-policy');
      assert.match(csp, /connect-src 'self' https:\/\/abc\.supabase\.co/);
      assert.match(csp, /script-src 'self'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.equal(cfg.headers.get('x-frame-options'), 'DENY');
    },
    { supabase: { url: 'https://abc.supabase.co', publishableKey: 'sb_publishable_test' } }
  );
});

test('/api/service 와 /api/site, 없는 API 는 404, 옛 서버 API 는 더 이상 없다', async () => {
  await withServer(
    async (get) => {
      const svc = (await get('/api/service')).json;
      assert.deepEqual(svc.items.map((i) => i.area).sort(), checklist.AREAS.map((a) => a.id).sort());
      assert.equal(svc.cybersecurity.length, 6);
      assert.equal(svc.questions.length, 4);
      assert.equal(svc.rating, null);
      assert.deepEqual(svc.testimonials, []);
      const site = (await get('/api/site')).json;
      assert.equal(site.companyName, 'Acme');
      for (const p of ['/api/signup', '/api/login', '/api/leads', '/api/assessments', '/api/preview', '/api/me']) {
        assert.equal((await get(p)).status, 404, p);
      }
    },
    { site: { companyName: 'Acme' } }
  );
});

test('정적 파일 경로 이탈과 POST 는 막는다', async () => {
  await withServer(async (get) => {
    assert.notEqual((await get('/..%2fsrc%2fserver.js')).status, 200);
    assert.notEqual((await get('/%2e%2e/package.json')).status, 200);
    assert.equal((await get('/', { method: 'POST' })).status, 405);
  });
});

// ── 비밀값이 코드에 섞이지 않았는지 ──
test('저장소에 서버 비밀값이 없다 (service_role/secret 키, DB 연결 문자열)', () => {
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (['node_modules', '.git', 'archive-ko', 'data', '.claude'].includes(name)) continue;
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (!/package-lock\.json$|vendor[\\/]supabase\.js$/.test(full) && /\.(js|json|html|md|sql|example)$/.test(name)) files.push(full);
    }
  };
  walk(root);
  const bad = /sb_secret_|service_role"|SERVICE_ROLE_KEY=|postgres(ql)?:\/\/[^\s'"`]*:[^\s'"`@]{6,}@/i;
  for (const f of files) {
    if (f === __filename) continue;
    const text = fs.readFileSync(f, 'utf8');
    assert.ok(!bad.test(text), `possible secret in ${path.relative(root, f)}`);
  }
  // 공개 키는 허용: publishable 형식이어야 한다
  const cfg = require('../src/supabase-config.json');
  assert.match(cfg.publishableKey, /^sb_publishable_/);
  assert.match(cfg.url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
});

test('고객에게 보이는 화면과 문구는 영어다 (한글 없음)', () => {
  const hangul = /[가-힣]/;
  for (const f of ['index.html', 'app.html', 'ai-policy-template.html']) {
    assert.ok(!hangul.test(fs.readFileSync(path.join(root, 'public', f), 'utf8')), `${f} contains Korean`);
  }
  const { SERVICE } = require('../src/service');
  assert.ok(!hangul.test(JSON.stringify(SERVICE)), 'service copy contains Korean');
  assert.ok(!hangul.test(JSON.stringify({ AREAS: checklist.AREAS, Q: checklist.QUESTIONS, A: checklist.ANSWER_LABELS })), 'checklist contains Korean');
});
