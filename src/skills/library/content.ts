import { forCategory } from '../define';
import { CONTENT_AGENTS } from './agents';

const s = forCategory('content');

export const CONTENT_SKILLS = [
  s('content-brief', 'Start from a content brief', CONTENT_AGENTS, 3, 'brief content plan audience goal outline',
    'Define the audience, goal, key message and call to action before writing.',
    ['Name who it is for and what they should do next', 'List the key points and the evidence for each', 'Set length, tone and format'],
    'Writing first and finding the purpose later.'),
  s('headline-writing', 'Headlines that are specific', CONTENT_AGENTS, 2, 'headline title hook subject',
    'A good headline promises a specific benefit that the content delivers.',
    ['Draft several options and choose the clearest', 'Include a concrete detail or number you can support', 'Avoid clickbait'],
    'Vague headlines and promises the article does not keep.'),
  s('plain-language', 'Plain language', CONTENT_AGENTS, 3, 'plain language clear simple readability jargon',
    'Use short sentences, common words and active voice.',
    ['Replace jargon with everyday words', 'Keep sentences and paragraphs short', 'Put the main point first'],
    'Long sentences full of buzzwords.'),
  s('claims-need-evidence', 'Every claim needs evidence', CONTENT_AGENTS, 3, 'claims evidence source statistics proof facts',
    'Support statistics and promises with a source or leave them out.',
    ['Attach a source to every number or study mentioned', 'Prefer first-party data and primary sources', 'Label opinions as opinions'],
    'Invented statistics and quotes.'),
  s('repurposing', 'Repurpose content wisely', CONTENT_AGENTS, 1, 'repurpose reuse social blog email adapt',
    'Adapt one strong piece into formats suited to each channel.',
    ['Pick the core idea and the best evidence', 'Rewrite for each channel rather than pasting', 'Link back to the full piece'],
    'Pasting the same text everywhere.'),
  s('content-calendar', 'A realistic content calendar', CONTENT_AGENTS, 2, 'calendar schedule plan cadence editorial',
    'Plan a cadence the team can sustain.',
    ['Choose a frequency you can keep', 'Map topics to customer questions and seasons', 'Review results monthly and adjust'],
    'An ambitious calendar that is abandoned in a month.'),
  s('case-study-writing', 'Write a credible case study', CONTENT_AGENTS, 2, 'case study story client result testimonial',
    'Tell the client problem, what was done and the measured result.',
    ['Get permission and approved quotes', 'Use real before and after numbers', 'Keep it short and scannable'],
    'Unverified results and unnamed vague clients.'),
  s('product-descriptions', 'Product and service descriptions', CONTENT_AGENTS, 2, 'product description service copy ecommerce features benefits',
    'Describe what it is, who it is for and why it is better, with accurate details.',
    ['Lead with the main benefit', 'List specifications and what is included accurately', 'Answer the questions buyers ask most'],
    'Exaggeration that leads to returns and complaints.'),
];
