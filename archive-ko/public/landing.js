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

      // 후기·수상 이력은 service.js 에 실제 내용이 있을 때만 보여준다.
      const quotes = svc.testimonials || [];
      const creds = svc.credentials || [];
      const proof = document.getElementById('proof');
      if (proof && (quotes.length || creds.length)) {
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

  // 소개 페이지의 문의 폼(10분 상담, 지침 템플릿): data-source 로 경로를 구분해 /api/leads 로 보낸다.
  document.querySelectorAll('form.lead-form').forEach((form) => {
    const err = form.querySelector('.error');
    const button = form.querySelector('button[type=submit]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      const get = (n) => (form.elements[n] ? form.elements[n].value : '');
      button.disabled = true;
      try {
        const res = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: form.dataset.source, email: get('email'), companyName: get('companyName'), phone: get('phone'), consent: form.elements.consent.checked }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '신청하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
        const done = document.createElement('div');
        done.className = 'done';
        const title = document.createElement('h4');
        const body = document.createElement('p');
        if (form.dataset.source === 'template') {
          title.textContent = '지침 템플릿이 준비되었습니다';
          const a = document.createElement('a');
          a.className = 'btn big';
          a.href = '/ai-policy-template.html';
          a.textContent = '템플릿 열기';
          done.append(title, a);
        } else {
          title.textContent = '상담 신청이 접수되었습니다';
          body.textContent = `${get('email')}로 연락드리겠습니다. 점검을 먼저 해 보시면 상담이 더 구체적으로 진행됩니다.`;
          const a = document.createElement('a');
          a.className = 'btn';
          a.href = '#check';
          a.textContent = '10분 점검 해 보기';
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
    try {
      const res = await fetch('/api/checklist');
      if (!res.ok) throw new Error();
      checklist = await res.json();
    } catch {
      show(h('p', { class: 'error' }, '점검 질문을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.'));
      return;
    }
    renderIntro();
  }

  function renderIntro() {
    show(
      h('div', { class: 'qcard center' },
        h('p', { class: 'qintro' }, '질문 20개 · 약 10분 · 가입 필요 없음'),
        h('p', { class: 'muted' }, '"예"는 지금 실제로 하고 있는 경우, "일부"는 일부만 하거나 사람마다 다른 경우, "아니오"는 하지 않거나 잘 모르는 경우입니다.'),
        h('button', { class: 'btn big', type: 'button', onclick: () => { step = 0; renderStep(); } }, '점검 시작하기')
      )
    );
  }

  function renderStep() {
    const area = checklist.areas[step];
    const last = step === checklist.areas.length - 1;
    const answered = () => area.questions.every((q) => draft[q.id] !== undefined);

    const next = h('button', { class: 'btn', type: 'button', disabled: !answered(), onclick: () => (last ? renderResult() : (step++, renderStep())) }, last ? '결과 보기' : '다음');
    const prev = h('button', { class: 'btn ghost', type: 'button', disabled: step === 0, onclick: () => { step--; renderStep(); } }, '이전');
    const refresh = () => { next.disabled = !answered(); };

    const dots = h('ol', { class: 'dots', 'aria-label': '진행 단계' },
      checklist.areas.map((a, i) => h('li', { class: i === step ? 'on' : i < step ? 'done' : '', 'aria-current': i === step ? 'step' : null }, a.name))
    );

    show(
      h('div', { class: 'qcard' },
        dots,
        h('p', { class: 'qcount' }, `${step + 1} / ${checklist.areas.length}단계`),
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
    A: ['이미 잘 관리하고 계십니다', '지금 수준을 유지하는 것이 과제입니다. 매달 다시 점검해 상태가 흐트러지지 않도록 확인해 드릴 수 있습니다.'],
    B: ['기본은 갖추셨습니다. 몇 군데만 채우면 됩니다', '아래 영역을 정리하면 점수가 눈에 띄게 올라갑니다. 저희가 대신 맡아서 진행할 수 있습니다.'],
    C: ['중요한 빈틈이 여러 곳 있습니다', '직원이 AI를 쓰는 방식에 비해 규칙과 설정이 부족한 부분이 보입니다. 우선순위를 정해 순서대로 정리하는 것이 좋습니다.'],
    D: ['지금 바로 정리가 필요한 상태입니다', '대부분의 항목이 아직 갖춰지지 않았습니다. 한꺼번에 하려 하지 말고, 가장 급한 것부터 저희와 함께 시작해 보세요.'],
  };

  async function renderResult() {
    show(h('div', { class: 'qcard center' }, h('p', {}, '점수를 계산하고 있습니다…')));
    let r, service;
    try {
      const [pr, sr] = await Promise.all([
        fetch('/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: draft }) }),
        fetch('/api/service'),
      ]);
      r = await pr.json();
      if (!pr.ok) throw new Error(r.error || '');
      service = await sr.json();
    } catch (e) {
      show(h('div', { class: 'qcard center' }, h('p', { class: 'error' }, e.message || '점수를 계산하지 못했습니다.'), h('button', { class: 'btn ghost', type: 'button', onclick: renderStep }, '돌아가기')));
      return;
    }

    const bar = (score) => {
      const fill = h('span');
      fill.style.width = `${score}%`;
      return h('div', { class: 'rbar', role: 'img', 'aria-label': `${score}점` }, fill);
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
      phone: h('input', { type: 'text', id: 'l-phone', autocomplete: 'tel', inputmode: 'tel', maxlength: 30, placeholder: '선택 사항' }),
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
          const res = await fetch('/api/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: f.email.value, companyName: f.company.value, phone: f.phone.value, answers: draft, consent: f.consent.checked }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || '신청하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
          formBox.replaceChildren(
            h('h4', {}, '상담 신청이 접수되었습니다'),
            h('p', {}, `${f.email.value}로 연락드리겠습니다. 점수와 부족한 영역을 미리 확인한 상태에서 상담을 시작합니다.`),
            h('p', { class: 'muted' }, '우선 할 일 3가지가 적힌 전체 리포트를 지금 받아 보시려면 아래에서 저장하세요.')
          );
        } catch (ex) {
          err.textContent = ex.message;
          submit.disabled = false;
        }
      },
    },
      h('label', { for: 'l-email' }, '이메일'), f.email,
      h('label', { for: 'l-company' }, '회사 이름'), f.company,
      h('label', { for: 'l-phone' }, '연락처'), f.phone,
      h('label', { class: 'check', for: 'l-consent' }, f.consent, '상담을 위해 위 이메일과 연락처로 연락받는 데 동의합니다. 점검 점수와 답변도 담당자에게 전달됩니다.'),
      h('div', { class: 'center' }, submit),
      err
    );
    formBox.append(h('h4', {}, `${service.name}, 상담으로 시작해 보세요`), h('p', { class: 'muted' }, `${service.note} 방금 하신 점검 결과를 바탕으로 이야기합니다.`), form);

    show(
      h('div', { class: 'qcard result' },
        h('p', { class: 'qcount' }, '점검 결과'),
        h('div', { class: 'rhero' },
          h('div', { class: `rgrade g${r.grade}`, 'aria-label': `위험 등급 ${r.grade}` }, r.grade),
          h('div', {},
            h('div', { class: 'rscore' }, `${r.overall}점`),
            h('div', {}, `종합 위험 등급 ${r.grade} · 위험도 ${r.label}`),
            h('div', { class: 'muted' }, '점수가 높을수록 안전합니다 (100점 만점)')
          )
        ),
        h('div', { class: 'rareas' },
          r.areas.map((a) => h('div', { class: 'rarea' }, h('div', { class: 'rhead' }, h('span', {}, a.name), h('b', {}, `${a.score}점`)), bar(a.score)))
        ),

        h('div', { class: 'pitch' },
          h('h3', { class: 'pitch-title' }, headTitle),
          h('p', {}, headBody),
          weak.length
            ? h('div', { class: 'gaps' },
                weak.map((a) => {
                  const it = itemFor(a.id);
                  return h('div', { class: 'gap' },
                    h('div', { class: 'gap-area' }, `${a.name} · ${a.score}점`),
                    h('div', { class: 'gap-svc' }, it ? it.title : ''),
                    h('p', {}, it ? it.body : '')
                  );
                })
              )
            : h('p', { class: 'muted' }, `${service.name}에서는 매달 점검으로 이 상태가 유지되는지 확인해 드립니다.`)
        ),

        formBox,

        h('div', { class: 'altpath' },
          h('p', {}, '먼저 직접 해 보고 싶으시다면'),
          h('button', { class: 'btn ghost', type: 'button', onclick: goSignup }, '결과 저장하고 우선 할 일 3가지 받기'),
          h('p', { class: 'muted' }, '답변은 이 브라우저에만 임시로 담아 가입 화면으로 넘기며, 가입을 마치기 전에는 서버에 저장하지 않습니다. (위 상담 신청을 하시면 답변이 담당자에게 전달됩니다.)')
        ),
        h('button', { class: 'linkbtn', type: 'button', onclick: () => { for (const k of Object.keys(draft)) delete draft[k]; renderIntro(); scrollToQuiz(); } }, '처음부터 다시 하기')
      )
    );
    scrollToQuiz();
  }

  start();
})();
