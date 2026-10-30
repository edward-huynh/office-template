/**
 * Content specifications for the sample catalog. Each spec drives three outputs:
 * the template file (DOCX/PPTX), its preview images, and its manifest.json.
 */

export type DocxBlock =
  | { t: 'title'; text: string }
  | { t: 'subtitle'; text: string }
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'bullets'; items: string[] }
  | { t: 'table'; header: string[]; rows: string[][] };

export interface DocxSpec {
  hidden?: boolean;
  id: string;
  name: string;
  category: string;
  description: string;
  accent: string; // hex without '#'
  blocks: DocxBlock[];
}

export type SlideSpec =
  | { layout: 'title' | 'closing'; title: string; subtitle: string }
  | { layout: 'section'; title: string; subtitle?: string }
  | { layout: 'bullets'; title: string; bullets: string[] }
  | { layout: 'two-column'; title: string; columns: [{ heading: string; bullets: string[] }, { heading: string; bullets: string[] }] }
  | { layout: 'stats'; title: string; stats: { value: string; label: string }[] }
  /** Title and content boxes with no text, ready to be typed into. */
  | { layout: 'blank' };

export interface PptxSpec {
  hidden?: boolean;
  id: string;
  name: string;
  category: string;
  description: string;
  theme: { bg: string; fg: string; muted: string; accent: string; card: string };
  slides: SlideSpec[];
}

export const docxSpecs: DocxSpec[] = [
  {
    id: 'business-letter',
    name: 'Business Letter',
    category: 'Letters',
    description: 'A formal letter with sender block, recipient, subject line and signature.',
    accent: '1F4E79',
    blocks: [
      { t: 'title', text: 'Your Company Name' },
      { t: 'p', text: '123 Main Street, City, Country  |  +00 000 000 000  |  contact@company.com' },
      { t: 'p', text: 'Date: [Month Day, Year]' },
      { t: 'p', text: '[Recipient Name]\n[Recipient Title]\n[Recipient Company]\n[Recipient Address]' },
      { t: 'h', text: 'Subject: [Short description of the letter]' },
      { t: 'p', text: 'Dear [Recipient Name],' },
      { t: 'p', text: 'I am writing to [state the purpose of the letter in one or two sentences]. This paragraph should give the reader the context they need to understand the rest of the letter.' },
      { t: 'p', text: 'In the second paragraph, provide the supporting details, dates, amounts or references. Keep the language clear and specific so the reader knows exactly what is expected.' },
      { t: 'p', text: 'Thank you for your time and consideration. I look forward to your reply and am happy to provide any additional information.' },
      { t: 'p', text: 'Sincerely,\n\n[Your Name]\n[Your Title]' },
    ],
  },
  {
    id: 'meeting-minutes',
    name: 'Meeting Minutes',
    category: 'Meetings',
    description: 'Agenda, attendees, decisions and an action-item table for recurring meetings.',
    accent: '2E7D32',
    blocks: [
      { t: 'title', text: 'Meeting Minutes' },
      { t: 'subtitle', text: '[Meeting name]  |  [Date]  |  [Location or link]' },
      { t: 'h', text: 'Attendees' },
      { t: 'bullets', items: ['[Name], [Role] (facilitator)', '[Name], [Role]', '[Name], [Role]'] },
      { t: 'h', text: 'Agenda' },
      { t: 'bullets', items: ['Review of previous action items', '[Topic 1]', '[Topic 2]', 'Open questions'] },
      { t: 'h', text: 'Decisions' },
      { t: 'p', text: 'Summarize each decision in one sentence and note who made it.' },
      { t: 'h', text: 'Action items' },
      {
        t: 'table',
        header: ['Action', 'Owner', 'Due date', 'Status'],
        rows: [
          ['[Action item]', '[Name]', '[Date]', 'Open'],
          ['[Action item]', '[Name]', '[Date]', 'Open'],
          ['[Action item]', '[Name]', '[Date]', 'Open'],
        ],
      },
      { t: 'p', text: 'Next meeting: [Date and time]' },
    ],
  },
  {
    id: 'project-proposal',
    name: 'Project Proposal',
    category: 'Business',
    description: 'Problem statement, objectives, scope, timeline and budget for a new project.',
    accent: '6A1B9A',
    blocks: [
      { t: 'title', text: 'Project Proposal' },
      { t: 'subtitle', text: '[Project name]  |  Prepared by [Author]  |  [Date]' },
      { t: 'h', text: '1. Background' },
      { t: 'p', text: 'Describe the problem or opportunity and why it matters now. Include the evidence that supports it.' },
      { t: 'h', text: '2. Objectives' },
      { t: 'bullets', items: ['[Measurable objective 1]', '[Measurable objective 2]', '[Measurable objective 3]'] },
      { t: 'h', text: '3. Scope' },
      { t: 'p', text: 'List what is included and, just as importantly, what is explicitly out of scope.' },
      { t: 'h', text: '4. Timeline' },
      {
        t: 'table',
        header: ['Phase', 'Deliverable', 'Start', 'End'],
        rows: [
          ['Discovery', '[Deliverable]', '[Date]', '[Date]'],
          ['Build', '[Deliverable]', '[Date]', '[Date]'],
          ['Launch', '[Deliverable]', '[Date]', '[Date]'],
        ],
      },
      { t: 'h', text: '5. Budget' },
      { t: 'p', text: 'Summarize the estimated cost, the assumptions behind it and the approval needed.' },
    ],
  },
  {
    id: 'resume-modern',
    name: 'Modern Resume',
    category: 'Career',
    description: 'A clean one-page resume with summary, experience, education and skills.',
    accent: '00695C',
    blocks: [
      { t: 'title', text: '[Your Full Name]' },
      { t: 'subtitle', text: '[Job title]  |  [City, Country]  |  [email]  |  [phone]' },
      { t: 'h', text: 'Summary' },
      { t: 'p', text: 'Two or three sentences describing your experience, your strongest skills and the kind of role you are looking for.' },
      { t: 'h', text: 'Experience' },
      { t: 'p', text: '[Job title], [Company]  |  [Start] - [End]' },
      { t: 'bullets', items: ['Achievement with a measurable result', 'Responsibility that shows scope or leadership', 'Project that used a relevant skill'] },
      { t: 'p', text: '[Job title], [Company]  |  [Start] - [End]' },
      { t: 'bullets', items: ['Achievement with a measurable result', 'Responsibility that shows scope or leadership'] },
      { t: 'h', text: 'Education' },
      { t: 'p', text: '[Degree], [University]  |  [Year]' },
      { t: 'h', text: 'Skills' },
      { t: 'bullets', items: ['[Skill group]: [skills]', '[Skill group]: [skills]'] },
    ],
  },
  {
    id: 'invoice-simple',
    name: 'Simple Invoice',
    category: 'Finance',
    description: 'An invoice with bill-to details, itemized table and payment terms.',
    accent: 'C62828',
    blocks: [
      { t: 'title', text: 'Invoice' },
      { t: 'subtitle', text: 'Invoice no. [0001]  |  Issued [Date]  |  Due [Date]' },
      { t: 'h', text: 'Bill to' },
      { t: 'p', text: '[Client name]\n[Client address]\n[Client email]' },
      { t: 'h', text: 'Items' },
      {
        t: 'table',
        header: ['Description', 'Qty', 'Unit price', 'Amount'],
        rows: [
          ['[Service or product]', '1', '0.00', '0.00'],
          ['[Service or product]', '1', '0.00', '0.00'],
          ['[Service or product]', '1', '0.00', '0.00'],
          ['Total', '', '', '0.00'],
        ],
      },
      { t: 'h', text: 'Payment terms' },
      { t: 'p', text: 'Payment is due within [30] days. Please include the invoice number with your transfer to [Bank name], account [Account number].' },
    ],
  },
  {
    id: 'weekly-status-report',
    name: 'Weekly Status Report',
    category: 'Reports',
    description: 'Progress, blockers and next steps in a format teams can fill in five minutes.',
    accent: 'EF6C00',
    blocks: [
      { t: 'title', text: 'Weekly Status Report' },
      { t: 'subtitle', text: '[Team or project]  |  Week of [Date]  |  [Author]' },
      { t: 'h', text: 'Highlights' },
      { t: 'bullets', items: ['[What was completed this week]', '[What was completed this week]'] },
      { t: 'h', text: 'In progress' },
      {
        t: 'table',
        header: ['Item', 'Owner', 'Progress', 'Notes'],
        rows: [
          ['[Work item]', '[Name]', '60%', '[Note]'],
          ['[Work item]', '[Name]', '30%', '[Note]'],
        ],
      },
      { t: 'h', text: 'Blockers and risks' },
      { t: 'bullets', items: ['[Blocker and who can unblock it]', '[Risk and mitigation]'] },
      { t: 'h', text: 'Next week' },
      { t: 'bullets', items: ['[Planned item]', '[Planned item]'] },
    ],
  },
];

export const pptxSpecs: PptxSpec[] = [
  {
    id: 'pitch-deck-modern',
    name: 'Modern Pitch Deck',
    category: 'Business',
    description: 'A dark, high-contrast investor pitch: problem, solution, traction and the ask.',
    theme: { bg: '0F172A', fg: 'F8FAFC', muted: '94A3B8', accent: '38BDF8', card: '1E293B' },
    slides: [
      { layout: 'title', title: 'Your Startup Name', subtitle: 'One sentence that explains what you do and for whom' },
      { layout: 'bullets', title: 'The problem', bullets: ['Who experiences the problem', 'How they cope today', 'What it costs them in time or money'] },
      { layout: 'two-column', title: 'Our solution', columns: [{ heading: 'What we built', bullets: ['Core product idea', 'The key differentiator'] }, { heading: 'Why it works', bullets: ['Evidence from users', 'Unfair advantage'] }] },
      { layout: 'stats', title: 'Traction', stats: [{ value: '10k', label: 'Active users' }, { value: '3x', label: 'Revenue growth' }, { value: '92%', label: 'Retention' }] },
      { layout: 'bullets', title: 'Business model', bullets: ['How we make money', 'Pricing and unit economics', 'Go-to-market channels'] },
      { layout: 'closing', title: 'The ask', subtitle: 'Raising $0M to reach the next milestone  |  founder@startup.com' },
    ],
  },
  {
    id: 'quarterly-business-review',
    name: 'Quarterly Business Review',
    category: 'Reports',
    description: 'A clean light deck for results, highlights, lessons and next-quarter priorities.',
    theme: { bg: 'FFFFFF', fg: '1E293B', muted: '64748B', accent: '2563EB', card: 'EFF6FF' },
    slides: [
      { layout: 'title', title: 'Quarterly Business Review', subtitle: 'Q[1] [Year]  |  [Team or department]' },
      { layout: 'stats', title: 'Results at a glance', stats: [{ value: '+18%', label: 'Revenue vs. plan' }, { value: '4.6', label: 'Customer score' }, { value: '97%', label: 'On-time delivery' }] },
      { layout: 'two-column', title: 'Wins and misses', columns: [{ heading: 'What went well', bullets: ['Win with a number', 'Win with a customer'] }, { heading: 'What fell short', bullets: ['Miss and its cause', 'Miss and the fix'] }] },
      { layout: 'section', title: 'Next quarter', subtitle: 'Three priorities' },
      { layout: 'bullets', title: 'Priorities', bullets: ['Priority one and its owner', 'Priority two and its owner', 'Priority three and its owner'] },
      { layout: 'closing', title: 'Questions?', subtitle: '[Presenter name]  |  [email]' },
    ],
  },
  {
    id: 'lesson-plan',
    name: 'Lesson Plan',
    category: 'Education',
    description: 'A warm, friendly deck for teaching a topic: goals, key ideas, practice and recap.',
    theme: { bg: 'FFF8E7', fg: '3B2F1C', muted: '8A7455', accent: 'D97706', card: 'FDEBC8' },
    slides: [
      { layout: 'title', title: 'Lesson Title', subtitle: '[Subject]  |  [Grade or level]  |  [Teacher]' },
      { layout: 'bullets', title: 'Learning goals', bullets: ['By the end you can explain...', 'By the end you can apply...', 'By the end you can compare...'] },
      { layout: 'two-column', title: 'Key ideas', columns: [{ heading: 'Concept', bullets: ['Definition in plain words', 'A simple example'] }, { heading: 'In practice', bullets: ['Where you see it', 'Common mistakes'] }] },
      { layout: 'section', title: 'Practice time', subtitle: 'Work in pairs for ten minutes' },
      { layout: 'closing', title: 'Recap', subtitle: 'Three things to remember  |  Homework: [task]' },
    ],
  },
  {
    id: 'product-launch',
    name: 'Product Launch Plan',
    category: 'Marketing',
    description: 'A bold deck for launch goals, audience, messaging, channels and timeline.',
    theme: { bg: '1A0B2E', fg: 'FDF4FF', muted: 'C4A7E7', accent: 'F472B6', card: '2E1A47' },
    slides: [
      { layout: 'title', title: 'Product Launch Plan', subtitle: '[Product name]  |  Launch date [Date]' },
      { layout: 'stats', title: 'Launch goals', stats: [{ value: '5k', label: 'Sign-ups' }, { value: '30%', label: 'Activation' }, { value: '12', label: 'Press mentions' }] },
      { layout: 'two-column', title: 'Audience and message', columns: [{ heading: 'Who we speak to', bullets: ['Primary segment', 'Secondary segment'] }, { heading: 'What we say', bullets: ['Headline promise', 'Three proof points'] }] },
      { layout: 'bullets', title: 'Channels', bullets: ['Owned: email, site, product', 'Earned: press and community', 'Paid: social and search'] },
      { layout: 'closing', title: "Let's launch", subtitle: 'Owner: [Name]  |  Questions: [email]' },
    ],
  },
];

/**
 * Blank starters. They are templates like any other (so "Create blank" goes through the same
 * copy-on-use flow) but hidden from the gallery grid; the gallery links to them by id.
 */
export const blankDocxSpec: DocxSpec = {
  id: 'blank-document',
  hidden: true,
  name: 'Blank document',
  category: 'Blank',
  description: 'An empty page to start writing.',
  accent: '2B579A',
  blocks: [{ t: 'p', text: '' }],
};

export const blankPptxSpec: PptxSpec = {
  id: 'blank-presentation',
  hidden: true,
  name: 'Blank presentation',
  category: 'Blank',
  description: 'One empty title-and-content slide to start building.',
  theme: { bg: 'FFFFFF', fg: '1E293B', muted: '64748B', accent: 'C43E1C', card: 'F1F5F9' },
  slides: [{ layout: 'blank' }],
};
