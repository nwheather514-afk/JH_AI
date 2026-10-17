// 고정 체크리스트와 점수 규칙. 같은 답변이면 항상 같은 결과가 나온다.
// 질문·권고는 NIST AI RMF 1.0 / NIST CSF 2.0 의 일반 원칙을 중소기업 수준으로 풀어 쓴 것이다.

const VERSION = 1;

// 답변 값: 0 = 아니오, 1 = 일부, 2 = 예
const ANSWER_LABELS = { 0: '아니오', 1: '일부', 2: '예' };

const AREAS = [
  { id: 'tools', name: 'AI 도구 사용 현황', weight: 25 },
  { id: 'data', name: '데이터 입력 규칙', weight: 25 },
  { id: 'access', name: '계정·접근 관리 + 교육·지침', weight: 25 },
  { id: 'incident', name: '사고 대응·오용 감지', weight: 25 },
];

// weight: 위험도 가중치(1~3), effort: 실행 난이도(1 쉬움 ~ 3 어려움)
const QUESTIONS = [
  // ── AI 도구 사용 현황 ──
  {
    id: 't1', area: 'tools', weight: 3, effort: 1, ref: 'NIST AI RMF GOVERN',
    text: '회사가 사용을 승인한 AI 도구 목록이 있습니다.',
    action: {
      title: '승인된 AI 도구 목록 만들기',
      steps: '스프레드시트 한 장에 "도구 이름 / 용도 / 사용 가능한 계정 종류 / 승인자"를 적고 전 직원에게 공유하세요. 목록에 없는 도구는 사용 전 사장님께 문의하도록 안내합니다.',
    },
  },
  {
    id: 't2', area: 'tools', weight: 2, effort: 1, ref: 'NIST AI RMF MAP',
    text: '직원들이 업무에 실제로 쓰는 AI 도구(챗봇, 번역, 회의 요약, 브라우저 확장 등)를 파악하고 있습니다.',
    action: {
      title: '직원들의 AI 사용 현황 파악하기',
      steps: '10분짜리 설문이나 팀 회의에서 "업무에 쓰는 AI 도구를 모두 적어 주세요"라고 물어보세요. 처벌이 아니라 파악이 목적이라고 먼저 알려야 솔직한 답이 나옵니다.',
    },
  },
  {
    id: 't3', area: 'tools', weight: 3, effort: 1, ref: 'NIST CSF PROTECT',
    text: '직원은 개인 계정이 아니라 회사 계정으로만 업무용 AI를 사용합니다.',
    action: {
      title: '업무용 AI는 회사 계정으로만 쓰도록 정하기',
      steps: '개인 이메일로 가입한 AI 계정에 업무 자료를 넣지 않도록 지침에 명시하고, 필요한 도구는 회사 이메일로 팀/비즈니스 플랜을 만드세요. 회사가 계정을 관리할 수 있어야 퇴사 시 회수도 됩니다.',
    },
  },
  {
    id: 't4', area: 'tools', weight: 2, effort: 2, ref: 'NIST AI RMF MANAGE',
    text: '사용 중인 AI 도구의 데이터 학습·보관 설정(입력 내용을 모델 학습에 쓰는지, 기록을 얼마나 보관하는지)을 확인했습니다.',
    action: {
      title: 'AI 도구의 데이터 학습·보관 설정 확인하기',
      steps: '사용 중인 도구마다 설정 화면에서 "내 데이터로 모델 학습" 옵션을 끄고, 대화 기록 보관 기간을 확인하세요. 기업용 플랜은 기본적으로 학습에서 제외되는 경우가 많으니 약관의 해당 항목을 같이 읽어 보세요.',
    },
  },
  {
    id: 't5', area: 'tools', weight: 2, effort: 2, ref: 'NIST AI RMF GOVERN',
    text: '새 AI 도구나 브라우저 확장 프로그램을 쓰기 전에 승인을 받는 절차가 있습니다.',
    action: {
      title: '새 AI 도구 도입 승인 절차 만들기',
      steps: '"새 도구를 쓰고 싶으면 이름, 용도, 넣을 자료 종류를 메일로 보낸다 → 사장님이 3일 안에 답한다" 정도의 간단한 절차를 정하고 지침에 한 줄로 적으세요.',
    },
  },

  // ── 데이터 입력 규칙 ──
  {
    id: 'd1', area: 'data', weight: 3, effort: 1, ref: 'NIST CSF PROTECT',
    text: 'AI에 입력하면 안 되는 정보(고객 개인정보, 주민번호/SSN, 계좌·카드번호, 세금 신고 자료 등)가 정해져 있습니다.',
    action: {
      title: 'AI에 넣으면 안 되는 정보 목록 정하기',
      steps: '"고객 이름+SSN, 계좌번호, 세금 신고서 원본, 비밀번호, 계약서 원본"처럼 구체적인 예를 들어 금지 목록을 한 장으로 만들어 책상 옆이나 공유 폴더에 두세요.',
    },
  },
  {
    id: 'd2', area: 'data', weight: 3, effort: 1, ref: 'NIST AI RMF GOVERN',
    text: '고객의 세금·재무 문서를 AI에 올리는 것은 금지되어 있거나 사전 승인이 필요합니다.',
    action: {
      title: '고객 문서의 AI 업로드는 승인제로 바꾸기',
      steps: '고객 문서를 AI에 올리는 일은 원칙적으로 금지하고, 꼭 필요하면 사장님 승인 후 이름·번호를 지운 사본만 쓰도록 하세요. 고객과의 계약서에 비밀유지 조항이 있는지도 확인하세요.',
    },
  },
  {
    id: 'd3', area: 'data', weight: 2, effort: 1, ref: 'NIST AI RMF MEASURE',
    text: 'AI가 만든 결과(숫자, 법규 설명, 문서)는 사람이 확인한 뒤에만 사용하는 규칙이 있습니다.',
    action: {
      title: 'AI 결과물은 사람이 검토 후 사용하도록 정하기',
      steps: 'AI 답변의 숫자·세법·날짜는 원문 자료로 한 번 더 확인하고, 고객에게 나가는 문서에는 담당자 검토 서명을 넣는 규칙을 만드세요. AI는 틀린 내용도 자신 있게 말합니다.',
    },
  },
  {
    id: 'd4', area: 'data', weight: 2, effort: 2, ref: 'NIST CSF PROTECT',
    text: '민감한 내용을 AI에 물어봐야 할 때 이름·번호를 지우거나 바꾸는 방법을 직원들이 알고 있습니다.',
    action: {
      title: '이름·번호 지우고 질문하는 방법 알려주기',
      steps: '"홍길동 → 고객A, 123-45-6789 → [번호]"처럼 바꿔서 질문하는 예시를 지침에 넣고, 직원 회의에서 5분만 시연하세요.',
    },
  },
  {
    id: 'd5', area: 'data', weight: 1, effort: 3, ref: 'NIST AI RMF GOVERN',
    text: '고객 계약서나 안내문에 업무에서 AI를 쓸 수 있다는 점을 어떻게 알릴지 검토했습니다.',
    action: {
      title: '고객에게 AI 사용 사실을 알릴지 검토하기',
      steps: '업종 규정과 고객 계약서를 보고 AI 사용 고지가 필요한지 확인하세요. 판단이 어렵다면 변호사나 업종 협회에 한 번 문의하는 것이 안전합니다.',
    },
  },

  // ── 계정·접근 관리 + 교육·지침 ──
  {
    id: 'a1', area: 'access', weight: 3, effort: 2, ref: 'NIST CSF PROTECT',
    text: '이메일과 AI 도구 계정에 다단계 인증(MFA, 문자·앱 인증)을 전 직원이 켜 두었습니다.',
    action: {
      title: '전 직원 다단계 인증(MFA) 켜기',
      steps: '이메일(Google/Microsoft)부터 관리자 화면에서 MFA를 필수로 지정하고, 그다음 AI 도구 계정에도 켜세요. 인증 앱(Authenticator)이 문자 인증보다 안전합니다.',
    },
  },
  {
    id: 'a2', area: 'access', weight: 2, effort: 2, ref: 'NIST CSF PROTECT',
    text: '여러 사람이 하나의 AI 계정이나 비밀번호를 같이 쓰지 않습니다.',
    action: {
      title: '공유 계정을 개인 계정으로 나누기',
      steps: '공유 계정은 누가 무엇을 입력했는지 알 수 없습니다. 팀 플랜에서 직원별 계정을 만들고, 비밀번호는 비밀번호 관리자로 보관하세요.',
    },
  },
  {
    id: 'a3', area: 'access', weight: 2, effort: 1, ref: 'NIST CSF PROTECT',
    text: '직원이 퇴사하면 AI 도구를 포함한 모든 계정을 즉시 회수합니다.',
    action: {
      title: '퇴사자 계정 회수 체크리스트 만들기',
      steps: '"이메일, AI 도구, 클라우드 저장소, 공유 비밀번호 교체"를 퇴사 당일 확인하는 체크리스트를 만들어 두세요. 입사 시에도 같은 목록으로 계정을 만들면 빠짐이 줄어듭니다.',
    },
  },
  {
    id: 'a4', area: 'access', weight: 3, effort: 2, ref: 'NIST AI RMF GOVERN',
    text: '문서로 된 AI 사용 지침이 있고 직원들이 읽고 서명했습니다.',
    action: {
      title: 'AI 사용 지침 한 장 만들고 서명받기',
      steps: '승인 도구, 금지 정보, 검토 규칙, 사고 시 보고처를 한 장(A4 1~2쪽)에 담아 전 직원에게 서명이나 이메일 확인 회신을 받으세요. 서명본은 보관합니다.',
    },
  },
  {
    id: 'a5', area: 'access', weight: 2, effort: 2, ref: 'NIST AI RMF GOVERN',
    text: '직원들이 연 1회 이상 AI 사용 보안 교육(또는 짧은 안내)을 받습니다.',
    action: {
      title: '연 1회 AI 보안 교육 잡기',
      steps: '30분짜리 팀 회의에서 지침을 읽고, 실제 사고 사례 한두 개와 "이 정보는 넣어도 될까요?" 퀴즈를 해 보세요. 신규 입사자는 첫 주에 같은 교육을 받게 합니다.',
    },
  },

  // ── 사고 대응·오용 감지 ──
  {
    id: 'i1', area: 'incident', weight: 3, effort: 1, ref: 'NIST CSF RESPOND',
    text: '민감한 정보를 AI에 잘못 입력했을 때 누구에게 어떻게 알릴지 직원들이 알고 있습니다.',
    action: {
      title: '실수로 입력했을 때의 보고 절차 정하기',
      steps: '"즉시 사장님께 말하기 → 해당 대화 삭제 → 무엇을 입력했는지 기록"의 3단계를 지침에 적고, 실수를 보고해도 불이익이 없다고 분명히 알려주세요.',
    },
  },
  {
    id: 'i2', area: 'incident', weight: 2, effort: 1, ref: 'NIST CSF GOVERN',
    text: 'AI 관련 사고가 생겼을 때 대응을 맡을 담당자(대리인 포함)가 정해져 있습니다.',
    action: {
      title: 'AI 사고 대응 담당자와 대리인 정하기',
      steps: '사장님과 대리인 한 명의 이름·전화번호를 지침에 적으세요. 외부 IT 업체나 변호사 연락처도 함께 적어 두면 급할 때 빠릅니다.',
    },
  },
  {
    id: 'i3', area: 'incident', weight: 2, effort: 2, ref: 'NIST CSF DETECT',
    text: '월 1회 이상 AI 도구 사용 내역(구독 목록, 관리자 화면의 사용 기록, 카드 청구서)을 점검합니다.',
    action: {
      title: '월 1회 AI 사용 내역 점검 일정 잡기',
      steps: '매월 첫 주에 "법인카드·청구서의 AI 구독, 관리자 화면의 사용자 목록, 승인 목록에 없는 도구"를 15분 동안 확인하는 일정을 캘린더에 반복으로 넣으세요. 이 서비스의 재점검도 같은 날 하면 편합니다.',
    },
  },
  {
    id: 'i4', area: 'incident', weight: 1, effort: 1, ref: 'NIST AI RMF GOVERN',
    text: '직원이 AI 오용이나 의심스러운 사용을 부담 없이 알릴 수 있는 분위기와 창구가 있습니다.',
    action: {
      title: '오용 의심을 편하게 알릴 창구 만들기',
      steps: '전용 이메일 주소나 익명 의견함을 정하고, 신고한 사람에게 불이익이 없다는 점을 회의에서 직접 말하세요.',
    },
  },
  {
    id: 'i5', area: 'incident', weight: 2, effort: 3, ref: 'NIST CSF RESPOND',
    text: '고객 정보가 유출된 경우 고객·관계 기관에 알려야 하는지 판단하는 절차를 알고 있습니다.',
    action: {
      title: '정보 유출 시 통지 의무 판단 절차 알아두기',
      steps: '뉴욕·뉴저지의 데이터 유출 통지 규정과 업종별 의무를 변호사나 협회에서 한 번 확인하고, 연락처와 판단 기준을 지침 부록으로 붙여 두세요. 이 서비스는 법률 자문을 제공하지 않습니다.',
    },
  },
];

const MAX_ANSWER = 2;

function riskGrade(score) {
  if (score >= 80) return { grade: 'A', label: '낮음' };
  if (score >= 60) return { grade: 'B', label: '보통' };
  if (score >= 40) return { grade: 'C', label: '높음' };
  return { grade: 'D', label: '매우 높음' };
}

// 모든 질문에 0/1/2로 답했는지 검사한다. 문제가 있으면 오류 문자열을 돌려준다.
function validateAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return '답변 형식이 올바르지 않습니다.';
  for (const q of QUESTIONS) {
    const v = answers[q.id];
    if (v !== 0 && v !== 1 && v !== 2) return `질문 ${q.id}에 답변이 필요합니다.`;
  }
  return null;
}

// 점수는 "안전 수준" 0~100 (높을수록 좋음). 위험 등급은 점수에서 파생한다.
function scoreAnswers(answers) {
  const areas = AREAS.map((area) => {
    const qs = QUESTIONS.filter((q) => q.area === area.id);
    const max = qs.reduce((s, q) => s + q.weight * MAX_ANSWER, 0);
    const got = qs.reduce((s, q) => s + q.weight * answers[q.id], 0);
    const score = Math.round((got / max) * 100);
    return { id: area.id, name: area.name, weight: area.weight, score, ...riskGrade(score) };
  });
  const totalWeight = AREAS.reduce((s, a) => s + a.weight, 0);
  const overall = Math.round(areas.reduce((s, a) => s + a.score * a.weight, 0) / totalWeight);

  // Top 3: 위험도 가중치 × 부족분이 큰 순. 같으면 쉬운 것 먼저, 그래도 같으면 질문 순서.
  const order = new Map(QUESTIONS.map((q, i) => [q.id, i]));
  const gaps = QUESTIONS.filter((q) => answers[q.id] < MAX_ANSWER)
    .map((q) => ({ q, gap: q.weight * (MAX_ANSWER - answers[q.id]) }))
    .sort((a, b) => b.gap - a.gap || a.q.effort - b.q.effort || order.get(a.q.id) - order.get(b.q.id));
  const topActions = gaps.slice(0, 3).map(({ q, gap }, i) => ({
    rank: i + 1,
    questionId: q.id,
    area: AREAS.find((a) => a.id === q.area).name,
    title: q.action.title,
    steps: q.action.steps,
    effort: q.effort,
    current: ANSWER_LABELS[answers[q.id]],
    gap,
    ref: q.ref,
  }));

  return { overall, ...riskGrade(overall), areas, topActions };
}

// 이전 진단과 비교한 변화. 이전이 없으면 null.
function compare(current, previous) {
  if (!previous) return null;
  return {
    overall: current.overall - previous.overall,
    areas: current.areas.map((a) => {
      const prev = previous.areas.find((p) => p.id === a.id);
      return { id: a.id, name: a.name, delta: prev ? a.score - prev.score : null };
    }),
  };
}

module.exports = { VERSION, AREAS, QUESTIONS, ANSWER_LABELS, validateAnswers, scoreAnswers, compare, riskGrade };
