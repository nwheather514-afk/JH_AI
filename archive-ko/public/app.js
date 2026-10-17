(() => {
  const app = document.getElementById('app');
  const userbar = document.getElementById('userbar');
  let me = null;
  let checklist = null;
  let service = null;
  const draft = {}; // 진행 중인 답변 (새로고침 전까지만 유지)

  // 사용자 입력은 항상 textContent 로만 넣는다.
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }

  // replaceChildren 은 배열을 문자열로 바꿔 버리므로 항상 평탄화해서 넘긴다.
  const show = (...nodes) => app.replaceChildren(...nodes.flat());

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || '요청에 실패했습니다.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const fmtDate = (iso) => new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

  function deltaEl(d) {
    if (d == null) return h('span', { class: 'delta same' }, '비교 없음');
    if (d > 0) return h('span', { class: 'delta up' }, `▲ ${d}점 상승`);
    if (d < 0) return h('span', { class: 'delta down' }, `▼ ${-d}점 하락`);
    return h('span', { class: 'delta same' }, '변화 없음');
  }

  function bar(score) {
    const fill = h('span');
    fill.style.width = `${score}%`;
    return h('div', { class: 'bar', role: 'img', 'aria-label': `${score}점` }, fill);
  }

  function renderUserbar() {
    userbar.replaceChildren();
    if (!me) return;
    userbar.append(
      h('span', {}, me.companyName),
      h('button', {
        class: 'ghost',
        onclick: async () => {
          await api('/api/logout', { method: 'POST', body: {} }).catch(() => {});
          me = null;
          location.hash = '#/';
          route();
        },
      }, '로그아웃')
    );
  }

  // ── 로그인 / 가입 ──
  function viewAuth(mode = 'login') {
    const err = h('div', { class: 'error', role: 'alert' });
    const f = {
      email: h('input', { type: 'email', id: 'email', autocomplete: 'email', required: true }),
      pw: h('input', { type: 'password', id: 'pw', autocomplete: mode === 'signup' ? 'new-password' : 'current-password', required: true, minlength: 8 }),
      company: h('input', { type: 'text', id: 'company', maxlength: 100, autocomplete: 'organization' }),
      emp: h('input', { type: 'number', id: 'emp', min: 1, max: 500, inputmode: 'numeric' }),
    };
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        try {
          const body = { email: f.email.value, password: f.pw.value };
          if (mode === 'signup') Object.assign(body, { companyName: f.company.value, employeeCount: f.emp.value });
          me = await api(mode === 'signup' ? '/api/signup' : '/api/login', { method: 'POST', body });
          location.hash = '#/';
          route();
        } catch (ex) {
          err.textContent = ex.message;
        }
      },
    },
      h('label', { for: 'email' }, '이메일'), f.email,
      h('label', { for: 'pw' }, mode === 'signup' ? '비밀번호 (8자 이상)' : '비밀번호'), f.pw,
      mode === 'signup' ? [
        h('label', { for: 'company' }, '회사 이름'), f.company,
        h('label', { for: 'emp' }, '직원 수 (선택)'), f.emp,
        h('p', { class: 'muted' }, '저장하는 정보는 이메일, 회사 이름, 직원 수(선택), 진단 답변뿐입니다. 고객 정보나 AI 사용 기록은 받지 않습니다.'),
      ] : null,
      h('div', { class: 'row' }, h('button', { type: 'submit' }, mode === 'signup' ? '가입하고 시작하기' : '로그인')),
      err
    );
    show(
      h('h1', {}, '10분이면 끝나는 AI 보안 점검'),
      h('p', {}, '20개 질문에 답하면 회사의 AI 보안 점수와 이번 달 먼저 할 일 3가지를 알려드립니다. 정기적으로 다시 점검하면 점수가 어떻게 달라졌는지 볼 수 있습니다.'),
      h('div', { class: 'tabs' },
        h('button', { class: mode === 'login' ? '' : 'ghost', onclick: () => viewAuth('login') }, '로그인'),
        h('button', { class: mode === 'signup' ? '' : 'ghost', onclick: () => viewAuth('signup') }, '새로 가입')
      ),
      h('div', { class: 'card' }, form)
    );
  }

  // ── 대시보드 ──
  async function viewHome() {
    const list = await api('/api/assessments');
    const children = [
      h('h1', {}, `${me.companyName} AI 보안 점검`),
      h('p', {}, list.length ? '정기 점검은 한 달에 한 번을 권장합니다.' : '아직 진단 기록이 없습니다. 10분 정도 걸립니다.'),
      h('a', { class: 'btn', href: '#/quiz' }, list.length ? '다시 점검하기' : '진단 시작하기'),
    ];
    if (list.length) {
      children.push(
        h('h2', {}, '진단 기록'),
        h('div', { class: 'card' },
          h('table', {},
            h('thead', {}, h('tr', {}, h('th', {}, '날짜'), h('th', {}, '점수'), h('th', {}, '위험 등급'), h('th', {}, ''))),
            h('tbody', {}, list.map((r) => h('tr', {},
              h('td', {}, fmtDate(r.createdAt)),
              h('td', {}, `${r.overall}점`),
              h('td', {}, `${r.grade} (${r.label})`),
              h('td', {}, h('a', { href: `#/report/${r.id}` }, '리포트 보기'))
            )))
          )
        )
      );
    }
    show(children);
  }

  // ── 질문 ──
  async function viewQuiz() {
    checklist ||= await api('/api/checklist');
    const total = checklist.areas.reduce((n, a) => n + a.questions.length, 0);
    const prog = h('progress', { max: total, value: 0, 'aria-label': '진행률' });
    const count = h('span', { class: 'muted' });
    const err = h('div', { class: 'error', role: 'alert' });
    const submit = h('button', { type: 'button', disabled: true }, '결과 보기');

    function refresh() {
      const n = Object.keys(draft).length;
      prog.value = n;
      count.textContent = `${n} / ${total} 답변`;
      submit.disabled = n < total;
    }

    const sections = checklist.areas.map((area) =>
      h('section', { class: 'card' },
        h('h2', {}, area.name),
        area.questions.map((qn) =>
          h('fieldset', { class: 'q' },
            h('legend', {}, qn.text),
            h('div', { class: 'choices' },
              [2, 1, 0].map((v) => {
                const input = h('input', { type: 'radio', name: qn.id, value: v, checked: draft[qn.id] === v, onchange: () => { draft[qn.id] = v; refresh(); } });
                return h('label', {}, input, checklist.answers[v]);
              })
            )
          )
        )
      )
    );

    submit.addEventListener('click', async () => {
      err.textContent = '';
      submit.disabled = true;
      try {
        const report = await api('/api/assessments', { method: 'POST', body: { answers: draft } });
        for (const k of Object.keys(draft)) delete draft[k];
        location.hash = `#/report/${report.id}`;
      } catch (ex) {
        err.textContent = ex.message;
        submit.disabled = false;
      }
    });

    show(
      h('h1', {}, 'AI 보안 점검'),
      h('p', { class: 'muted' }, '"예"는 지금 실제로 하고 있는 경우, "일부"는 일부만 하거나 사람마다 다른 경우, "아니오"는 하지 않거나 잘 모르는 경우입니다.'),
      h('div', { class: 'progress-wrap' }, prog, count),
      sections,
      h('div', { class: 'row' }, submit),
      err
    );
    refresh();
  }


  // ── 상담 신청 카드 ──
  const AREA_BY_PREFIX = { t: 'tools', d: 'data', a: 'access', i: 'incident' };

  // Top 3 항목마다 "이 일을 맡아 주는 서비스 항목"을 보여준다.
  function svcLine(action) {
    const item = service.items.find((i) => i.area === AREA_BY_PREFIX[action.questionId[0]]);
    return item ? h('p', { class: 'svc-line' }, '직접 하기 부담되면 ', h('strong', {}, `${service.name}: ${item.title}`), '에서 대신 진행해 드립니다.') : null;
  }

  function consultCard(r) {
    if (r.consultationRequestedAt) {
      return h('div', { class: 'card consult noprint' },
        h('h2', {}, `${service.name} 상담 신청이 접수되었습니다`),
        h('p', {}, `${fmtDate(r.consultationRequestedAt)}에 신청하셨습니다. 담당자가 확인한 뒤 남겨 주신 이메일이나 연락처로 연락드립니다.`)
      );
    }

    const suggested = new Set(r.topActions.map((a) => AREA_BY_PREFIX[a.questionId[0]]));
    const weakAreas = new Set(r.areas.filter((a) => a.score < 80).map((a) => a.id));
    const weakItems = service.items.filter((i) => weakAreas.has(i.area));
    const topicOptions = [...checklist.areas.map((a) => ({ id: a.id, name: a.name })), { id: 'it-support', name: '사무실 IT 전반 지원 (PC·네트워크·클라우드·백업)' }];
    const err = h('div', { class: 'error', role: 'alert' });
    const topicBoxes = topicOptions.map((t) => ({ t, input: h('input', { type: 'checkbox', value: t.id, checked: suggested.has(t.id) }) }));
    const phone = h('input', { type: 'text', id: 'c-phone', inputmode: 'tel', autocomplete: 'tel', maxlength: 30, placeholder: '선택 사항' });
    const time = h('select', { id: 'c-time' },
      h('option', { value: 'any' }, '상관없음'),
      h('option', { value: 'morning' }, '오전'),
      h('option', { value: 'afternoon' }, '오후')
    );
    const msg = h('textarea', { id: 'c-msg', rows: 3, maxlength: 1000, placeholder: '예: 직원이 ChatGPT를 쓰는데 어디부터 정리해야 할지 모르겠어요' });
    const consent = h('input', { type: 'checkbox', id: 'c-consent' });
    const submit = h('button', { type: 'submit' }, service.cta);

    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        submit.disabled = true;
        try {
          await api('/api/consultations', {
            method: 'POST',
            body: {
              assessmentId: r.id,
              topics: topicBoxes.filter((b) => b.input.checked).map((b) => b.t.id),
              phone: phone.value,
              preferredTime: time.value,
              message: msg.value,
              consent: consent.checked,
            },
          });
          viewReport(r.id);
        } catch (ex) {
          err.textContent = ex.message;
          submit.disabled = false;
        }
      },
    },
      h('fieldset', { class: 'plain' },
        h('legend', {}, '어떤 이야기를 나누고 싶으세요? (여러 개 선택 가능)'),
        topicBoxes.map(({ t, input }) => h('label', { class: 'check' }, input, t.name))
      ),
      h('label', { for: 'c-phone' }, '연락처 (선택)'), phone,
      h('label', { for: 'c-time' }, '연락받기 편한 시간'), time,
      h('label', { for: 'c-msg' }, '전하고 싶은 내용 (선택)'), msg,
      h('label', { class: 'check consent', for: 'c-consent' }, consent, '상담을 위해 가입한 이메일과 위 연락처로 연락받는 데 동의합니다.'),
      h('div', { class: 'row' }, submit),
      err
    );

    return h('div', { class: 'card consult noprint' },
      h('h2', {}, `${service.name}로 이어서 해결하세요`),
      h('p', {}, service.tagline),
      weakItems.length
        ? h('div', {},
            h('p', { class: 'muted' }, '이번 점검에서 점수가 낮게 나온 영역은 이렇게 도와드립니다.'),
            h('ul', { class: 'svc-list' }, weakItems.map((it) => h('li', {}, h('strong', {}, it.title), ' — ', it.body)))
          )
        : null,
      h('p', { class: 'muted' }, `${service.extra} ${service.note}`),
      form
    );
  }

  // ── 리포트 ──
  async function viewReport(id) {
    checklist ||= await api('/api/checklist');
    service ||= await api('/api/service');
    const r = await api(`/api/assessments/${id}`);
    const cmp = r.comparison;
    const areaDelta = (aid) => (cmp ? cmp.areas.find((a) => a.id === aid)?.delta : null);

    show(
      h('h1', {}, 'AI 보안 진단 리포트'),
      h('p', { class: 'muted' }, `${fmtDate(r.createdAt)} 진단`),

      h('div', { class: 'card score-hero' },
        h('div', { class: `grade ${r.grade}`, 'aria-label': `위험 등급 ${r.grade}` }, r.grade),
        h('div', {},
          h('div', { class: 'big' }, `${r.overall}점`),
          h('div', {}, `종합 위험 등급 ${r.grade} · 위험도 ${r.label}`),
          h('div', { class: 'muted' }, '점수가 높을수록 안전합니다 (100점 만점)'),
          h('div', {}, cmp ? ['지난 진단(', fmtDate(cmp.previousCreatedAt), ') 대비 ', deltaEl(cmp.overall)] : '첫 진단입니다. 다음 점검부터 변화가 표시됩니다.')
        )
      ),

      h('h2', {}, '영역별 점수'),
      h('div', { class: 'card' },
        r.areas.map((a) => h('div', { class: 'area' },
          h('div', { class: 'area-head' }, h('strong', {}, a.name), h('span', {}, `${a.score}점 · `, deltaEl(areaDelta(a.id)))),
          bar(a.score)
        ))
      ),

      h('h2', {}, '이번 달 우선 할 일 Top 3'),
      r.topActions.length
        ? r.topActions.map((a) => h('div', { class: 'card action' },
            h('div', {}, h('span', { class: 'tag' }, `${a.rank}순위`), h('span', { class: 'tag' }, a.area), h('span', { class: 'tag' }, `난이도 ${['쉬움', '보통', '어려움'][a.effort - 1]}`), h('span', { class: 'tag' }, `현재: ${a.current}`)),
            h('h3', {}, a.title),
            h('p', {}, a.steps),
            svcLine(a),
            h('div', { class: 'muted' }, `근거: ${a.ref}`)
          ))
        : h('div', { class: 'card' }, '모든 항목에 "예"로 답하셨습니다. 이 상태를 유지하도록 한 달에 한 번 다시 점검하세요.'),

      consultCard(r),

      h('p', { class: 'disclaimer' }, r.disclaimer),
      h('div', { class: 'row noprint' },
        h('a', { class: 'btn', href: '#/quiz' }, '다시 점검하기'),
        h('button', { class: 'ghost', onclick: () => window.print() }, '인쇄 / PDF 저장'),
        h('a', { class: 'btn ghost', href: '#/' }, '기록으로')
      )
    );
  }

  // 소개 페이지에서 해 본 점검 답변이 있으면, 가입·로그인 직후 한 번만 저장하고 리포트를 연다.
  function takePendingAnswers() {
    try {
      const raw = sessionStorage.getItem('pendingAnswers');
      sessionStorage.removeItem('pendingAnswers'); // 실패해도 반복 제출하지 않는다
      if (!raw) return null;
      const saved = JSON.parse(raw);
      // 오래 전에 남은 답변이 나중에 다른 계정으로 저장되지 않도록 1시간만 유효하다.
      return saved && saved.answers && Date.now() - saved.savedAt < 60 * 60 * 1000 ? saved.answers : null;
    } catch {
      return null;
    }
  }

  async function route() {
    renderUserbar();
    const hash = location.hash || '#/';
    try {
      if (!me) {
        try { me = await api('/api/me'); } catch (e) { if (e.status !== 401) throw e; }
        renderUserbar();
      }
      if (!me) return viewAuth(hash === '#/signup' ? 'signup' : 'login');
      const pending = takePendingAnswers();
      if (pending) {
        try {
          const rep = await api('/api/assessments', { method: 'POST', body: { answers: pending } });
          history.replaceState(null, '', `#/report/${rep.id}`);
          return await viewReport(rep.id);
        } catch (e) {
          if (e.status === 401) throw e; // 아래에서 로그인 화면으로 보낸다
          /* 답변이 올바르지 않으면 건너뛰고 평소 화면으로 */
        }
      }
      const m = hash.match(/^#\/report\/(\d+)$/);
      if (m) return await viewReport(m[1]);
      if (hash === '#/quiz') return await viewQuiz();
      return await viewHome();
    } catch (e) {
      if (e.status === 401) { me = null; renderUserbar(); return viewAuth('login'); }
      show(h('div', { class: 'card' }, h('p', { class: 'error' }, e.message), h('a', { href: '#/' }, '처음으로')));
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();
