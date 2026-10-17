// What we tell customers about the managed service after the check-up. The landing page and the report share this copy.
// Edit this file to match your real scope, name, and offer. (No pricing on purpose: quotes happen in the consultation.)
const SERVICE = {
  name: 'Managed AI Security Service',
  tagline: 'The check-up is just the start. We fill in the gaps for you and re-check every month.',
  // One-sentence promise shown on the landing page
  promise: 'We write the rules, set things up, and verify every month. You just let your team use AI with peace of mind.',
  items: [
    {
      area: 'tools',
      outcome: 'No more uneasy guessing about what your team is using',
      title: 'AI tool list & approval process',
      body: 'We find out which AI tools your people use, build an approved list, and review requests to use new tools on your behalf.',
    },
    {
      area: 'data',
      outcome: 'Employees stop deciding alone whether something is OK to paste into AI',
      title: 'AI use policy & employee training',
      body: 'We write rules on what must never go into AI and an AI use policy tailored to your industry, and we train your team on it.',
    },
    {
      area: 'access',
      outcome: 'Worries about former employees\' accounts and shared passwords go away',
      title: 'Account & authentication cleanup',
      body: 'We set up multi-factor authentication, replace shared accounts, and put an offboarding process in place.',
    },
    {
      area: 'incident',
      outcome: 'When something goes wrong, who does what is already decided',
      title: 'Monthly check-ups & incident response',
      body: 'Every month we re-check, report how your score changed, and if a problem comes up we work through it together in a set order.',
    },
  ],
  // Before / after comparison (landing page)
  transform: [
    { before: 'Nobody knows which AI tools employees use', after: 'There is an approved tool list, and we review new tools first' },
    { before: 'Everyone decides differently what is OK to paste into AI', after: 'One page of rules gives everyone the same answer' },
    { before: 'Accounts and sign-in security vary from person to person', after: 'MFA for every employee, accounts removed on the last day' },
    { before: 'When something happens, you first scramble to figure out who to tell', after: 'A set procedure, handled together with us' },
    { before: 'You tidy up once and forget about it', after: 'Re-checked every month, with score changes reported to you' },
  ],
  // The full range of help, beyond the check-up result
  suite: [
    { title: 'AI security management', body: 'We take care of the four areas above, re-check monthly, and report back.' },
    { title: 'AI adoption consulting', body: 'We help design how your team uses AI safely to save working time.' },
    { title: 'Full office IT support', body: 'PCs, networks, cloud, and backups: one place to handle your office IT problems.' },
    { title: 'Employee training', body: 'We explain new tools and security habits in a way your team can follow.' },
  ],
  // Broader managed cybersecurity offered alongside AI security (shown as "AI is one door. We protect the rest too.")
  cybersecurity: [
    { title: 'Endpoint protection', body: 'Every laptop and desktop is monitored and kept up to date, so threats are caught and handled early.' },
    { title: 'Email security', body: 'Filters that stop phishing, dangerous attachments, and spoofed senders before they reach your staff.' },
    { title: 'Access control & MFA', body: 'Only the right people get in, verified every time, with the minimum access their job needs.' },
    { title: 'Dark web monitoring', body: 'We watch for your company credentials showing up in leaked data and tell you right away so you can reset them.' },
    { title: 'Cloud app security', body: 'Microsoft 365, Google Workspace, and other cloud tools set up so only the right people sign in, with unusual activity watched.' },
    { title: 'Risk assessment & roadmap', body: 'A clear picture of your gaps and a prioritized plan, not a pile of scary findings.' },
  ],
  cybersecurityNote: 'Offered as part of the same managed relationship. Scope and pricing are set in the consultation.',
  // Questions every owner should be able to answer (shown above the check)
  questions: [
    'Which AI tools is my team using right now?',
    'What customer information has gone into them?',
    'Are we meeting our privacy and security obligations?',
    'If someone made a mistake tomorrow, would they know exactly what to do?',
  ],
  industries: ['Accounting & tax', 'Legal', 'Healthcare & pharmacy', 'Finance', 'Real estate', 'Education', 'Small & midsize businesses'],
  // Optional review rating, shown only when set. Example: rating: { score: 4.9, count: 75, source: 'Google' },
  rating: null,
  // Once real customer testimonials or credentials exist, add them here and they appear on the landing page automatically.
  // When empty, the whole section stays hidden.
  // Example: testimonials: [{ quote: '...', name: 'Jane Doe', company: 'Doe Pharmacy' }],  credentials: ['Named ... by ...'],
  testimonials: [],
  credentials: [],
  extra: 'Full office IT support (PCs, networks, cloud, backups) can be discussed in the same consultation.',
  cta: 'Request a consultation',
  note: 'There is no obligation to buy.',
  templateUrl: '/ai-policy-template.html',
};

module.exports = { SERVICE };
