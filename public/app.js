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
      const err = new Error(data.error || 'The request failed.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  function deltaEl(d) {
    if (d == null) return h('span', { class: 'delta same' }, 'No comparison');
    if (d > 0) return h('span', { class: 'delta up' }, `▲ up ${d} pts`);
    if (d < 0) return h('span', { class: 'delta down' }, `▼ down ${-d} pts`);
    return h('span', { class: 'delta same' }, 'No change');
  }

  function bar(score) {
    const fill = h('span');
    fill.style.width = `${score}%`;
    return h('div', { class: 'bar', role: 'img', 'aria-label': `${score} points` }, fill);
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
      }, 'Sign out')
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
      h('label', { for: 'email' }, 'Email'), f.email,
      h('label', { for: 'pw' }, mode === 'signup' ? 'Password (8+ characters)' : 'Password'), f.pw,
      mode === 'signup' ? [
        h('label', { for: 'company' }, 'Company name'), f.company,
        h('label', { for: 'emp' }, 'Number of employees (optional)'), f.emp,
        h('p', { class: 'muted' }, 'We store only your email, company name, employee count (optional), and your answers. We do not collect customer information or AI usage logs.'),
      ] : null,
      h('div', { class: 'row' }, h('button', { type: 'submit' }, mode === 'signup' ? 'Sign up and start' : 'Sign in')),
      err
    );
    show(
      h('h1', {}, 'The 10-minute AI security check'),
      h('p', {}, 'Answer 20 questions and get your company\'s AI security score and the 3 things to do first this month. Re-check regularly to see how your score changes.'),
      h('div', { class: 'tabs' },
        h('button', { class: mode === 'login' ? '' : 'ghost', onclick: () => viewAuth('login') }, 'Sign in'),
        h('button', { class: mode === 'signup' ? '' : 'ghost', onclick: () => viewAuth('signup') }, 'Create account')
      ),
      h('div', { class: 'card' }, form)
    );
  }

  // ── 대시보드 ──
  async function viewHome() {
    const list = await api('/api/assessments');
    const children = [
      h('h1', {}, `${me.companyName} · AI Security Check`),
      h('p', {}, list.length ? 'We recommend re-checking once a month.' : 'No assessments yet. It takes about 10 minutes.'),
      h('a', { class: 'btn', href: '#/quiz' }, list.length ? 'Check again' : 'Start the check'),
    ];
    if (list.length) {
      children.push(
        h('h2', {}, 'Assessment history'),
        h('div', { class: 'card' },
          h('table', {},
            h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Score'), h('th', {}, 'Risk grade'), h('th', {}, ''))),
            h('tbody', {}, list.map((r) => h('tr', {},
              h('td', {}, fmtDate(r.createdAt)),
              h('td', {}, `${r.overall} pts`),
              h('td', {}, `${r.grade} (${r.label})`),
              h('td', {}, h('a', { href: `#/report/${r.id}` }, 'View report'))
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
    const prog = h('progress', { max: total, value: 0, 'aria-label': 'Progress' });
    const count = h('span', { class: 'muted' });
    const err = h('div', { class: 'error', role: 'alert' });
    const submit = h('button', { type: 'button', disabled: true }, 'See results');

    function refresh() {
      const n = Object.keys(draft).length;
      prog.value = n;
      count.textContent = `${n} of ${total} answered`;
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
      h('h1', {}, 'AI Security Check'),
      h('p', { class: 'muted' }, 'Answer "Yes" if you do this today, "Partly" if only some of it or it varies by person, and "No" if you do not or are not sure.'),
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
    return item ? h('p', { class: 'svc-line' }, 'If you would rather not do this yourself, ', h('strong', {}, `${service.name}: ${item.title}`), ' can handle it for you.') : null;
  }

  function consultCard(r) {
    if (r.consultationRequestedAt) {
      return h('div', { class: 'card consult noprint' },
        h('h2', {}, `Your ${service.name} consultation request has been received`),
        h('p', {}, `You requested it on ${fmtDate(r.consultationRequestedAt)}. Once the person handling it has reviewed it, we will contact you at the email or phone number you gave us.`)
      );
    }

    const suggested = new Set(r.topActions.map((a) => AREA_BY_PREFIX[a.questionId[0]]));
    const weakAreas = new Set(r.areas.filter((a) => a.score < 80).map((a) => a.id));
    const weakItems = service.items.filter((i) => weakAreas.has(i.area));
    const topicOptions = [...checklist.areas.map((a) => ({ id: a.id, name: a.name })), { id: 'it-support', name: 'Full office IT support (PCs, networks, cloud, backups)' }];
    const err = h('div', { class: 'error', role: 'alert' });
    const topicBoxes = topicOptions.map((t) => ({ t, input: h('input', { type: 'checkbox', value: t.id, checked: suggested.has(t.id) }) }));
    const phone = h('input', { type: 'text', id: 'c-phone', inputmode: 'tel', autocomplete: 'tel', maxlength: 30, placeholder: 'Optional' });
    const time = h('select', { id: 'c-time' },
      h('option', { value: 'any' }, 'Any time'),
      h('option', { value: 'morning' }, 'Morning'),
      h('option', { value: 'afternoon' }, 'Afternoon')
    );
    const msg = h('textarea', { id: 'c-msg', rows: 3, maxlength: 1000, placeholder: 'e.g., My staff use ChatGPT and I do not know where to start' });
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
        h('legend', {}, 'What would you like to talk about? (choose any)'),
        topicBoxes.map(({ t, input }) => h('label', { class: 'check' }, input, t.name))
      ),
      h('label', { for: 'c-phone' }, 'Phone (optional)'), phone,
      h('label', { for: 'c-time' }, 'Best time to reach you'), time,
      h('label', { for: 'c-msg' }, 'Anything you want us to know (optional)'), msg,
      h('label', { class: 'check consent', for: 'c-consent' }, consent, 'I agree to be contacted at my account email and the phone number above about this request.'),
      h('div', { class: 'row' }, submit),
      err
    );

    return h('div', { class: 'card consult noprint' },
      h('h2', {}, `Close the gaps with the ${service.name}`),
      h('p', {}, service.tagline),
      weakItems.length
        ? h('div', {},
            h('p', { class: 'muted' }, 'Here is how we help with the areas that scored low in this check.'),
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
      h('h1', {}, 'AI Security Assessment Report'),
      h('p', { class: 'muted' }, `Assessed on ${fmtDate(r.createdAt)}`),

      h('div', { class: 'card score-hero' },
        h('div', { class: `grade ${r.grade}`, 'aria-label': `Risk grade ${r.grade}` }, r.grade),
        h('div', {},
          h('div', { class: 'big' }, `${r.overall} pts`),
          h('div', {}, `Overall risk grade ${r.grade} · ${r.label} risk`),
          h('div', { class: 'muted' }, 'A higher score is safer (out of 100)'),
          h('div', {}, cmp ? ['Compared with your last check (', fmtDate(cmp.previousCreatedAt), '): ', deltaEl(cmp.overall)] : 'This is your first assessment. Changes will show from your next check.')
        )
      ),

      h('h2', {}, 'Score by area'),
      h('div', { class: 'card' },
        r.areas.map((a) => h('div', { class: 'area' },
          h('div', { class: 'area-head' }, h('strong', {}, a.name), h('span', {}, `${a.score} pts · `, deltaEl(areaDelta(a.id)))),
          bar(a.score)
        ))
      ),

      h('h2', {}, 'Top 3 priorities this month'),
      r.topActions.length
        ? r.topActions.map((a) => h('div', { class: 'card action' },
            h('div', {}, h('span', { class: 'tag' }, `#${a.rank}`), h('span', { class: 'tag' }, a.area), h('span', { class: 'tag' }, `Effort: ${['Easy', 'Moderate', 'Hard'][a.effort - 1]}`), h('span', { class: 'tag' }, `Now: ${a.current}`)),
            h('h3', {}, a.title),
            h('p', {}, a.steps),
            svcLine(a),
            h('div', { class: 'muted' }, `Basis: ${a.ref}`)
          ))
        : h('div', { class: 'card' }, 'You answered "Yes" to everything. Re-check once a month to keep it that way.'),

      consultCard(r),

      h('p', { class: 'disclaimer' }, r.disclaimer),
      h('div', { class: 'row noprint' },
        h('a', { class: 'btn', href: '#/quiz' }, 'Check again'),
        h('button', { class: 'ghost', onclick: () => window.print() }, 'Print / Save as PDF'),
        h('a', { class: 'btn ghost', href: '#/' }, 'Back to history')
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
      show(h('div', { class: 'card' }, h('p', { class: 'error' }, e.message), h('a', { href: '#/' }, 'Back to start')));
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();
