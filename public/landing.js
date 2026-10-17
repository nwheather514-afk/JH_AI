(() => {
  const PENDING_KEY = 'pendingAnswers';

  // 푸터의 회사 정보: 서버 설정(COMPANY_NAME, CONTACT_EMAIL, CONTACT_PHONE)에서 채운다.
  (async () => {
    try {
      const res = await fetch('/api/site');
      if (!res.ok) return;
      const s = await res.json();
      if (s.companyName) document.getElementById('site-company').textContent = s.companyName;
      document.getElementById('site-contact').textContent = [s.contactEmail, s.contactPhone].filter(Boolean).join(' · ');
    } catch {
      /* 못 가져오면 기본 문구 유지 */
    }
  })();

  // 서비스 소개 섹션은 서버의 서비스 정의(src/service.js)로 채워서 결과 화면과 문구를 맞춘다.
  (async () => {
    const box = document.getElementById('service-cards');
    if (!box) return;
    try {
      const res = await fetch('/api/service');
      if (!res.ok) return;
      const svc = await res.json();
      document.getElementById('service-tagline').textContent = svc.promise || svc.tagline;
      document.getElementById('service-extra').textContent = svc.extra;

      const card = (i) => {
        const el = document.createElement('article');
        el.className = 'card';
        const h3 = document.createElement('h3');
        h3.textContent = i.title;
        const p = document.createElement('p');
        p.textContent = i.body;
        el.append(h3, p);
        return el;
      };
      // 서비스 항목은 "무엇이 달라지는가"를 먼저, 하는 일은 그 아래에 둔다.
      const itemCard = (i) => {
        const el = document.createElement('article');
        el.className = 'card benefit';
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = i.title;
        const h3 = document.createElement('h3');
        h3.textContent = i.outcome || i.title;
        const p = document.createElement('p');
        p.textContent = i.body;
        el.append(tag, h3, p);
        return el;
      };
      box.replaceChildren(...svc.items.map(itemCard));
      const suite = document.getElementById('suite-cards');
      if (suite && svc.suite) suite.replaceChildren(...svc.suite.map(card));

      const ba = document.getElementById('transform-rows');
      if (ba && svc.transform) {
        ba.append(...svc.transform.map((t) => {
          const row = document.createElement('div');
          row.className = 'ba-row';
          row.setAttribute('role', 'row');
          const before = document.createElement('span');
          before.className = 'ba-before';
          before.setAttribute('role', 'cell');
          before.textContent = t.before;
          const after = document.createElement('span');
          after.className = 'ba-after';
          after.setAttribute('role', 'cell');
          after.textContent = t.after;
          row.append(before, after);
          return row;
        }));
      }

      // 사이버보안 서비스 카드, 업종 칩, 경영자 질문 (service.js 가 원본)
      const cyber = document.getElementById('cyber-cards');
      if (cyber && svc.cybersecurity) cyber.replaceChildren(...svc.cybersecurity.map(card));
      const cyberNote = document.getElementById('cyber-note');
      if (cyberNote && svc.cybersecurityNote) cyberNote.textContent = svc.cybersecurityNote;
      const chips = document.getElementById('industry-chips');
      if (chips && svc.industries) {
        chips.replaceChildren(...svc.industries.map((name) => {
          const li = document.createElement('li');
          li.textContent = name;
          return li;
        }));
      }
      const oq = document.getElementById('owner-questions');
      if (oq && svc.questions) {
        oq.replaceChildren(...svc.questions.map((text) => {
          const li = document.createElement('li');
          li.textContent = text;
          return li;
        }));
      }

      // 후기·수상 이력·평점은 service.js 에 실제 내용이 있을 때만 보여준다.
      const quotes = svc.testimonials || [];
      const creds = svc.credentials || [];
      const rating = svc.rating && svc.rating.score ? svc.rating : null;
      const proof = document.getElementById('proof');
      if (proof && (quotes.length || creds.length || rating)) {
        const ratingEl = document.getElementById('proof-rating');
        if (ratingEl && rating) {
          ratingEl.textContent = `${rating.score} out of 5 stars${rating.count ? ` · ${rating.count} reviews` : ''}${rating.source ? ` on ${rating.source}` : ''}`;
          ratingEl.hidden = false;
        }
        document.getElementById('proof-creds').replaceChildren(...creds.map((c) => {
          const li = document.createElement('li');
          li.textContent = c;
          return li;
        }));
        document.getElementById('proof-quotes').replaceChildren(...quotes.map((t) => {
          const el = document.createElement('figure');
          el.className = 'card quote';
          const q = document.createElement('blockquote');
          q.textContent = t.quote;
          const cap = document.createElement('figcaption');
          cap.textContent = [t.name, t.company].filter(Boolean).join(' · ');
          el.append(q, cap);
          return el;
        }));
        proof.hidden = false;
      }
    } catch {
      /* 못 가져오면 정적 문구 유지 */
    }
  })();

  // 문의 저장: 브라우저가 Supabase(aicheck_leads)에 직접 넣는다. 읽기 권한은 아무에게도 없고,
  // 도배 제한(IP당 시간당 5건)·같은 이메일 하루 1건·입력 검증은 DB 안의 트리거와 제약이 맡는다.
  const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
  const PHONE_RE = /^[0-9+()\-\s]{7,30}$/;
  async function submitLead({ source, email, companyName, phone, answers, consent }) {
    const mail = String(email || '').trim().toLowerCase();
    const company = String(companyName || '').trim();
    const tel = String(phone || '').trim();
    if (!consent) throw new Error('Please agree to be contacted so we can process your request.');
    if (!EMAIL_RE.test(mail)) throw new Error('Please enter a valid email address.');
    if (company.length > 100 || (source !== 'template' && !company)) throw new Error('Please enter your company name (up to 100 characters).');
    if (tel && !PHONE_RE.test(tel)) throw new Error('Please enter a valid phone number.');
    const { error } = await window.sb.from('aicheck_leads').insert({
      email: mail,
      company_name: company || '(not provided)',
      phone: tel || null,
      answers: source === 'check' ? answers : null,
      checklist_version: source === 'check' ? window.Checklist.VERSION : null,
      source,
      consent_given: true,
    });
    if (error) {
      if (error.message === 'rate_limited') throw new Error('Too many requests. Please try again in a little while.');
      throw new Error('We could not submit your request. Please check your details and try again.');
    }
  }

  // 소개 페이지의 문의 폼(10분 상담, 지침 템플릿): data-source 로 경로를 구분한다.
  document.querySelectorAll('form.lead-form').forEach((form) => {
    const err = form.querySelector('.error');
    const button = form.querySelector('button[type=submit]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const get = (n) => (form.elements[n] ? form.elements[n].value : '');
      button.disabled = true;
      try {
        await submitLead({ source: form.dataset.source, email: get('email'), companyName: get('companyName'), phone: get('phone'), consent: form.elements.consent.checked });
        const done = document.createElement('div');
        done.className = 'done';
        const title = document.createElement('h4');
        const body = document.createElement('p');
        if (form.dataset.source === 'template') {
          title.textContent = 'Your policy template is ready';
          const a = document.createElement('a');
          a.className = 'btn big';
          a.href = '/ai-policy-template.html';
          a.textContent = 'Open the template';
          done.append(title, a);
        } else {
          title.textContent = 'Your request has been received';
          body.textContent = `We will contact you at ${get('email')}. If you take the 10-minute check first, the conversation can be more specific.`;
          const a = document.createElement('a');
          a.className = 'btn';
          a.href = '#check';
          a.textContent = 'Take the 10-minute check';
          done.append(title, body, a);
        }
        form.replaceChildren(done);
      } catch (ex) {
        err.textContent = ex.message;
        button.disabled = false;
      }
    });
  });

  // ── 가입 없이 해 보는 점검 ──
  const root = document.getElementById('quiz');
  if (!root) return;

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
  const show = (...nodes) => root.replaceChildren(...nodes.flat());
  const scrollToQuiz = () => root.scrollIntoView({ block: 'start' });

  let checklist = null;
  let step = 0;
  const draft = {};

  async function start() {
    const C = window.Checklist;
    checklist = {
      answers: C.ANSWER_LABELS,
      areas: C.AREAS.map((a) => ({ id: a.id, name: a.name, questions: C.QUESTIONS.filter((q) => q.area === a.id).map((q) => ({ id: q.id, text: q.text })) })),
    };
    renderIntro();
  }

  function renderIntro() {
    show(
      h('div', { class: 'qcard center' },
        h('p', { class: 'qintro' }, '20 questions · about 10 minutes · no sign-up needed'),
        h('p', { class: 'muted' }, 'Answer "Yes" if you do this today, "Partly" if only some of it or it varies by person, and "No" if you do not or are not sure.'),
        h('button', { class: 'btn big', type: 'button', onclick: () => { step = 0; renderStep(); } }, 'Start the check')
      )
    );
  }

  function renderStep() {
    const area = checklist.areas[step];
    const last = step === checklist.areas.length - 1;
    const answered = () => area.questions.every((q) => draft[q.id] !== undefined);

    const next = h('button', { class: 'btn', type: 'button', disabled: !answered(), onclick: () => (last ? renderResult() : (step++, renderStep())) }, last ? 'See results' : 'Next');
    const prev = h('button', { class: 'btn ghost', type: 'button', disabled: step === 0, onclick: () => { step--; renderStep(); } }, 'Back');
    const refresh = () => { next.disabled = !answered(); };

    const dots = h('ol', { class: 'dots', 'aria-label': 'Progress' },
      checklist.areas.map((a, i) => h('li', { class: i === step ? 'on' : i < step ? 'done' : '', 'aria-current': i === step ? 'step' : null }, a.name))
    );

    show(
      h('div', { class: 'qcard' },
        dots,
        h('p', { class: 'qcount' }, `Step ${step + 1} of ${checklist.areas.length}`),
        h('h3', {}, area.name),
        area.questions.map((q) =>
          h('fieldset', { class: 'q' },
            h('legend', {}, q.text),
            h('div', { class: 'choices' },
              [2, 1, 0].map((v) =>
                h('label', {},
                  h('input', { type: 'radio', name: q.id, value: v, checked: draft[q.id] === v, onchange: () => { draft[q.id] = v; refresh(); } }),
                  checklist.answers[v]
                )
              )
            )
          )
        ),
        h('div', { class: 'qnav' }, prev, next)
      )
    );
    scrollToQuiz();
  }

  const GRADE_HEAD = {
    A: ['You are already managing this well', 'Your job now is to stay at this level. We can re-check every month so things do not slip.'],
    B: ['You have the basics. A few gaps to close', 'Tidying up the areas below will raise your score noticeably, and we can take care of it for you.'],
    C: ['There are several important gaps', 'Your rules and settings have not kept up with how your team uses AI. It is best to set priorities and work through them in order.'],
    D: ['This needs attention right now', 'Most items are not in place yet. Do not try to do everything at once. Start with the most urgent one together with us.'],
  };

  async function renderResult() {
    show(h('div', { class: 'qcard center' }, h('p', {}, 'Calculating your score...')));
    let r, service;
    try {
      const sr = await fetch('/api/service');
      if (!sr.ok) throw new Error('');
      service = await sr.json();
      const { overall, grade, label, areas } = window.Checklist.scoreAnswers(draft);
      r = { overall, grade, label, areas }; // 우선 할 일 Top 3 는 가입 후 리포트에서만 보여준다
    } catch (e) {
      show(h('div', { class: 'qcard center' }, h('p', { class: 'error' }, e.message || 'We could not calculate your score.'), h('button', { class: 'btn ghost', type: 'button', onclick: renderStep }, 'Go back')));
      return;
    }

    const bar = (score) => {
      const fill = h('span');
      fill.style.width = `${score}%`;
      return h('div', { class: 'rbar', role: 'img', 'aria-label': `${score} points` }, fill);
    };
    const goSignup = () => {
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ answers: draft, savedAt: Date.now() })); } catch { /* 저장 못 해도 가입은 진행 */ }
      location.href = '/app.html#/signup';
    };

    // 점수가 낮은 영역과, 그 영역을 맡아 주는 서비스 항목을 짝지어 보여준다.
    const weak = r.areas.filter((a) => a.score < 80).sort((a, b) => a.score - b.score).slice(0, 3);
    const itemFor = (id) => service.items.find((i) => i.area === id);
    const [headTitle, headBody] = GRADE_HEAD[r.grade];

    // 상담 신청 폼
    const err = h('div', { class: 'error', role: 'alert' });
    const f = {
      email: h('input', { type: 'email', id: 'l-email', autocomplete: 'email', required: true }),
      company: h('input', { type: 'text', id: 'l-company', autocomplete: 'organization', maxlength: 100, required: true }),
      phone: h('input', { type: 'text', id: 'l-phone', autocomplete: 'tel', inputmode: 'tel', maxlength: 30, placeholder: 'Optional' }),
      consent: h('input', { type: 'checkbox', id: 'l-consent' }),
    };
    const submit = h('button', { class: 'btn big', type: 'submit' }, service.cta);
    const formBox = h('div', { class: 'leadbox' });
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        submit.disabled = true;
        try {
          await submitLead({ source: 'check', email: f.email.value, companyName: f.company.value, phone: f.phone.value, answers: draft, consent: f.consent.checked });
          formBox.replaceChildren(
            h('h4', {}, 'Your request has been received'),
            h('p', {}, `We will contact you at ${f.email.value}. We will already have your score and weak areas in front of us when we talk.`),
            h('p', { class: 'muted' }, 'To get the full report with your 3 priority actions right now, save your results below.')
          );
        } catch (ex) {
          err.textContent = ex.message;
          submit.disabled = false;
        }
      },
    },
      h('label', { for: 'l-email' }, 'Email'), f.email,
      h('label', { for: 'l-company' }, 'Company name'), f.company,
      h('label', { for: 'l-phone' }, 'Phone'), f.phone,
      h('label', { class: 'check', for: 'l-consent' }, f.consent, 'I agree to be contacted at this email and phone number about my request. My score and answers will be shared with the person handling it.'),
      h('div', { class: 'center' }, submit),
      err
    );
    formBox.append(h('h4', {}, `Start a conversation about the ${service.name}`), h('p', { class: 'muted' }, `${service.note} We will talk based on the results you just got.`), form);

    show(
      h('div', { class: 'qcard result' },
        h('p', { class: 'qcount' }, 'Your results'),
        h('div', { class: 'rhero' },
          h('div', { class: `rgrade g${r.grade}`, 'aria-label': `Risk grade ${r.grade}` }, r.grade),
          h('div', {},
            h('div', { class: 'rscore' }, `${r.overall} pts`),
            h('div', {}, `Overall risk grade ${r.grade} · ${r.label} risk`),
            h('div', { class: 'muted' }, 'A higher score is safer (out of 100)')
          )
        ),
        h('div', { class: 'rareas' },
          r.areas.map((a) => h('div', { class: 'rarea' }, h('div', { class: 'rhead' }, h('span', {}, a.name), h('b', {}, `${a.score} pts`)), bar(a.score)))
        ),

        h('div', { class: 'pitch' },
          h('h3', { class: 'pitch-title' }, headTitle),
          h('p', {}, headBody),
          weak.length
            ? h('div', { class: 'gaps' },
                weak.map((a) => {
                  const it = itemFor(a.id);
                  return h('div', { class: 'gap' },
                    h('div', { class: 'gap-area' }, `${a.name} · ${a.score} pts`),
                    h('div', { class: 'gap-svc' }, it ? it.title : ''),
                    h('p', {}, it ? it.body : '')
                  );
                })
              )
            : h('p', { class: 'muted' }, `With the ${service.name}, we re-check every month to make sure this holds.`)
        ),

        formBox,

        h('div', { class: 'altpath' },
          h('p', {}, 'If you would rather try it yourself first'),
          h('button', { class: 'btn ghost', type: 'button', onclick: goSignup }, 'Save my results and get 3 priority actions'),
          h('p', { class: 'muted' }, 'Your answers are held only in this browser and passed to the sign-up screen. Nothing is saved on our server until you finish signing up. (If you request a consultation above, your answers are shared with the person handling it.)')
        ),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { for (const k of Object.keys(draft)) delete draft[k]; renderIntro(); scrollToQuiz(); } }, 'Start over')
      )
    );
    scrollToQuiz();
  }

  start();
})();
