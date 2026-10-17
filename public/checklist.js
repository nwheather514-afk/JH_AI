// Fixed checklist and scoring rules. The same answers always produce the same result.
// Questions and recommendations restate general principles from NIST AI RMF 1.0 / NIST CSF 2.0 at small-business level.

(function () {
const VERSION = 1;

// Answer values: 0 = No, 1 = Partly, 2 = Yes
const ANSWER_LABELS = { 0: 'No', 1: 'Partly', 2: 'Yes' };

const AREAS = [
  { id: 'tools', name: 'AI Tool Usage', weight: 25 },
  { id: 'data', name: 'Data Entry Rules', weight: 25 },
  { id: 'access', name: 'Accounts, Access & Training', weight: 25 },
  { id: 'incident', name: 'Incident Response & Misuse Detection', weight: 25 },
];

// weight: risk weight (1-3), effort: how hard it is to act on (1 easy ~ 3 hard)
const QUESTIONS = [
  // ── AI Tool Usage ──
  {
    id: 't1', area: 'tools', weight: 3, effort: 1, ref: 'NIST AI RMF GOVERN',
    text: 'Your company has a list of AI tools that are approved for use.',
    action: {
      title: 'Create an approved AI tools list',
      steps: 'Put a simple table in a spreadsheet: tool name, purpose, which account types are allowed, and who approved it. Share it with every employee and tell them to ask the owner before using any tool that is not on the list.',
    },
  },
  {
    id: 't2', area: 'tools', weight: 2, effort: 1, ref: 'NIST AI RMF MAP',
    text: 'You know which AI tools employees actually use for work (chatbots, translation, meeting summaries, browser extensions, etc.).',
    action: {
      title: 'Find out which AI tools your team uses',
      steps: 'Run a 10-minute survey or ask in a team meeting: "List every AI tool you use for work." Say up front that the goal is to understand, not to punish. You will get more honest answers.',
    },
  },
  {
    id: 't3', area: 'tools', weight: 3, effort: 1, ref: 'NIST CSF PROTECT',
    text: 'Employees use AI for work only through company accounts, not personal accounts.',
    action: {
      title: 'Require company accounts for work AI',
      steps: 'State in your policy that work material must never go into AI accounts created with personal email. Set up team or business plans under company email so the company can manage the accounts and remove them when someone leaves.',
    },
  },
  {
    id: 't4', area: 'tools', weight: 2, effort: 2, ref: 'NIST AI RMF MANAGE',
    text: 'You have checked the data training and retention settings of the AI tools you use (whether your inputs are used to train models and how long history is kept).',
    action: {
      title: 'Check data training and retention settings',
      steps: 'In each tool\'s settings, turn off "use my data to train models" and check how long chat history is kept. Business plans often exclude your data from training by default. Read that part of the terms as well.',
    },
  },
  {
    id: 't5', area: 'tools', weight: 2, effort: 2, ref: 'NIST AI RMF GOVERN',
    text: 'There is an approval process before anyone starts using a new AI tool or browser extension.',
    action: {
      title: 'Set up an approval process for new AI tools',
      steps: 'Keep it simple: "Email the tool name, its purpose, and the kind of data you will put in it; the owner replies within 3 days." Add one line about it to your policy.',
    },
  },

  // ── Data Entry Rules ──
  {
    id: 'd1', area: 'data', weight: 3, effort: 1, ref: 'NIST CSF PROTECT',
    text: 'You have defined what must never be entered into AI (customer personal data, SSNs, bank or card numbers, tax filings, etc.).',
    action: {
      title: 'List what must never go into AI',
      steps: 'Make a one-page list with concrete examples (customer name plus SSN, bank account numbers, original tax returns, passwords, original contracts) and keep it where people can see it.',
    },
  },
  {
    id: 'd2', area: 'data', weight: 3, effort: 1, ref: 'NIST AI RMF GOVERN',
    text: 'Uploading customers\' tax or financial documents to AI is prohibited or requires prior approval.',
    action: {
      title: 'Make customer-document uploads approval-only',
      steps: 'Prohibit uploading customer documents to AI by default. If it is truly needed, require the owner\'s approval and use only a copy with names and numbers removed. Also check whether your client contracts include confidentiality clauses.',
    },
  },
  {
    id: 'd3', area: 'data', weight: 2, effort: 1, ref: 'NIST AI RMF MEASURE',
    text: 'There is a rule that AI-generated results (numbers, legal explanations, documents) are reviewed by a person before use.',
    action: {
      title: 'Require human review of AI output',
      steps: 'Verify AI numbers, tax rules, and dates against the source documents, and require a reviewer\'s sign-off on anything sent to customers. AI can be wrong while sounding certain.',
    },
  },
  {
    id: 'd4', area: 'data', weight: 2, effort: 2, ref: 'NIST CSF PROTECT',
    text: 'Employees know how to remove or replace names and numbers before asking AI about sensitive material.',
    action: {
      title: 'Teach employees to redact before asking',
      steps: 'Add examples to your policy ("John Smith becomes Client A, 123-45-6789 becomes [number]") and demonstrate it for five minutes in a team meeting.',
    },
  },
  {
    id: 'd5', area: 'data', weight: 1, effort: 3, ref: 'NIST AI RMF GOVERN',
    text: 'You have considered how to tell customers, in contracts or notices, that AI may be used in your work.',
    action: {
      title: 'Decide whether to disclose AI use to customers',
      steps: 'Check your industry rules and customer contracts to see whether disclosing AI use is required. If it is unclear, a quick question to an attorney or trade association is the safe move.',
    },
  },

  // ── Accounts, Access & Training ──
  {
    id: 'a1', area: 'access', weight: 3, effort: 2, ref: 'NIST CSF PROTECT',
    text: 'Multi-factor authentication (MFA) is turned on for email and AI tool accounts for every employee.',
    action: {
      title: 'Turn on MFA for every employee',
      steps: 'Start with email (Google/Microsoft): require MFA in the admin console, then enable it on AI tool accounts. An authenticator app is safer than text-message codes.',
    },
  },
  {
    id: 'a2', area: 'access', weight: 2, effort: 2, ref: 'NIST CSF PROTECT',
    text: 'Nobody shares a single AI account or password with others.',
    action: {
      title: 'Replace shared accounts with individual ones',
      steps: 'A shared account cannot tell you who entered what. Create a separate account for each employee on a team plan and store passwords in a password manager.',
    },
  },
  {
    id: 'a3', area: 'access', weight: 2, effort: 1, ref: 'NIST CSF PROTECT',
    text: 'When an employee leaves, all of their accounts, including AI tools, are removed immediately.',
    action: {
      title: 'Create an offboarding checklist',
      steps: 'Write a checklist (email, AI tools, cloud storage, shared password rotation) and complete it on the employee\'s last day. Use the same list when someone joins so nothing gets missed.',
    },
  },
  {
    id: 'a4', area: 'access', weight: 3, effort: 2, ref: 'NIST AI RMF GOVERN',
    text: 'You have a written AI use policy that employees have read and signed.',
    action: {
      title: 'Write a one-page AI policy and get it signed',
      steps: 'Put approved tools, prohibited data, review rules, and who to report to on one or two pages. Have every employee sign or confirm by email, and keep the signed copies.',
    },
  },
  {
    id: 'a5', area: 'access', weight: 2, effort: 2, ref: 'NIST AI RMF GOVERN',
    text: 'Employees receive AI security training (or a short briefing) at least once a year.',
    action: {
      title: 'Schedule annual AI security training',
      steps: 'Use a 30-minute team meeting to read the policy, walk through one or two real incident stories, and run a quick "Can I put this in AI?" quiz. New hires get the same training in their first week.',
    },
  },

  // ── Incident Response & Misuse Detection ──
  {
    id: 'i1', area: 'incident', weight: 3, effort: 1, ref: 'NIST CSF RESPOND',
    text: 'Employees know who to tell, and how, if they enter sensitive information into AI by mistake.',
    action: {
      title: 'Define what to do after a mistaken input',
      steps: 'Write three steps into your policy (tell the owner right away, delete the conversation, record what was entered) and say clearly that reporting a mistake carries no penalty.',
    },
  },
  {
    id: 'i2', area: 'incident', weight: 2, effort: 1, ref: 'NIST CSF GOVERN',
    text: 'A person (plus a backup) is designated to handle AI-related incidents.',
    action: {
      title: 'Name an AI incident owner and a backup',
      steps: 'Write the owner\'s and backup\'s names and phone numbers in the policy. Adding your outside IT provider and attorney makes it faster in an emergency.',
    },
  },
  {
    id: 'i3', area: 'incident', weight: 2, effort: 2, ref: 'NIST CSF DETECT',
    text: 'At least monthly, you review AI tool usage (subscription list, admin-console activity, card statements).',
    action: {
      title: 'Schedule a monthly AI usage review',
      steps: 'Put a recurring 15-minute event on the first week of each month: check AI subscriptions on company cards, the user list in each admin console, and any tool that is not on your approved list. Re-taking this check-up on the same day is convenient.',
    },
  },
  {
    id: 'i4', area: 'incident', weight: 1, effort: 1, ref: 'NIST AI RMF GOVERN',
    text: 'Employees have a comfortable way to report AI misuse or suspicious use without fear.',
    action: {
      title: 'Create an easy way to report concerns',
      steps: 'Set up a dedicated email address or an anonymous suggestion box, and tell people in a meeting that reporting will never be held against them.',
    },
  },
  {
    id: 'i5', area: 'incident', weight: 2, effort: 3, ref: 'NIST CSF RESPOND',
    text: 'You know how to decide whether customers or authorities must be notified if customer information is exposed.',
    action: {
      title: 'Learn your breach-notification duties',
      steps: 'Confirm New York and New Jersey data breach notification rules, and any industry-specific duties, with an attorney or trade association. Then attach the contacts and decision criteria to your policy. This service does not provide legal advice.',
    },
  },
];

const MAX_ANSWER = 2;

function riskGrade(score) {
  if (score >= 80) return { grade: 'A', label: 'Low' };
  if (score >= 60) return { grade: 'B', label: 'Moderate' };
  if (score >= 40) return { grade: 'C', label: 'High' };
  return { grade: 'D', label: 'Very high' };
}

// Checks that every question was answered 0/1/2. Returns an error string if not.
function validateAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return 'Invalid answer format.';
  for (const q of QUESTIONS) {
    const v = answers[q.id];
    if (v !== 0 && v !== 1 && v !== 2) return `Question ${q.id} needs an answer.`;
  }
  return null;
}

// Scores are a "security level" from 0 to 100 (higher is better). The risk grade is derived from the score.
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

  // Top 3: largest (risk weight x shortfall) first. Ties go to the easier action, then to question order.
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

// Change versus the previous assessment. Null if there is no previous one.
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

const DISCLAIMER =
  'This report is a self-assessment based on general principles of public security frameworks (NIST AI RMF, NIST CSF) and is not legal or security advice. ' +
  'Confirm actual legal obligations and security measures with an attorney or security professional. Scores are calculated from your answers and do not guarantee your actual security posture.';

// 저장된 진단 한 건(row)과 그 직전 진단(prevRow)으로 리포트를 만든다. row.answers 는 객체 또는 JSON 문자열.
function buildReport(row, prevRow) {
  const parse = (a) => (typeof a === 'string' ? JSON.parse(a) : a);
  const result = scoreAnswers(parse(row.answers));
  const prev = prevRow ? scoreAnswers(parse(prevRow.answers)) : null;
  return {
    id: row.id,
    createdAt: row.created_at,
    checklistVersion: row.checklist_version,
    ...result,
    comparison: prev ? { previousId: prevRow.id, previousCreatedAt: prevRow.created_at, ...compare(result, prev) } : null,
    disclaimer: DISCLAIMER,
  };
}

const api = { VERSION, AREAS, QUESTIONS, ANSWER_LABELS, DISCLAIMER, validateAnswers, scoreAnswers, compare, riskGrade, buildReport };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else window.Checklist = api;
})();
