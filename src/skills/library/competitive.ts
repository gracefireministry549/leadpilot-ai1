import { forCategory } from '../define';
import { COMPETITIVE_AGENTS } from './agents';

const s = forCategory('competitive');

export const COMPETITIVE_SKILLS = [
  s('change-detection', 'Detect meaningful changes', COMPETITIVE_AGENTS, 3, 'competitor change detect monitor diff website update',
    'Compare snapshots over time and report what changed, not everything that exists.',
    ['Capture dated snapshots of the pages that matter', 'Ignore cosmetic changes such as counters and timestamps', 'Summarise each real change and what it may mean'],
    'Alerting on noise until nobody reads the alerts.'),
  s('pricing-page-watch', 'Watch pricing and packaging', COMPETITIVE_AGENTS, 2, 'pricing plans price competitor package tier',
    'Track price, plan structure and limits, with dates.',
    ['Record plans, prices, limits and discounts with the date seen', 'Note changes in packaging, not only price', 'Flag the sales implication in one line'],
    'Treating a promotional price as the standard price.'),
  s('messaging-diff', 'Compare positioning and messaging', COMPETITIVE_AGENTS, 2, 'messaging positioning headline claims copy',
    'Capture how competitors describe themselves and who they target.',
    ['Record headline, audience and main claims', 'Compare against your own message', 'Highlight differences that customers would notice'],
    'Copying competitor claims that cannot be backed up.'),
  s('review-mining', 'Mine competitor reviews', COMPETITIVE_AGENTS, 3, 'review competitor complaint praise rating customers',
    'Learn what customers value and dislike from public reviews.',
    ['Sample recent reviews across several sites', 'Group praise and complaints into themes with counts', 'Turn the biggest complaints into opportunities'],
    'Drawing conclusions from a handful of extreme reviews.'),
  s('hiring-signals', 'Read hiring signals', COMPETITIVE_AGENTS, 1, 'hiring jobs signals expansion team roles',
    'Use public job postings as a hint of direction.',
    ['Note roles, seniority and locations over time', 'Link hiring to likely launches or expansion', 'Treat it as a hint, not a fact'],
    'Stating plans as certain based on a few postings.'),
  s('launch-tracking', 'Track launches and announcements', COMPETITIVE_AGENTS, 2, 'launch product announcement release news changelog',
    'Follow release notes and announcements to see where competitors are heading.',
    ['Watch changelogs, blogs and press pages', 'Record the date and the claim made', 'Assess impact on your customers'],
    'Reacting to every announcement as a threat.'),
  s('alert-prioritization', 'Prioritise alerts by impact', COMPETITIVE_AGENTS, 3, 'alert priority impact urgent digest summary',
    'Rank changes by how much they affect the business and send a digest.',
    ['Label each change high, medium or low impact', 'Send urgent items immediately and the rest in a digest', 'Include evidence and a suggested response'],
    'Sending every change as an urgent alert.'),
  s('ethical-monitoring', 'Monitor ethically and legally', COMPETITIVE_AGENTS, 3, 'ethical public information terms legal scraping robots',
    'Use only public information and respect site rules.',
    ['Check the terms and robots rules before automated collection', 'Never use logins, leaked data or deception', 'Rate-limit requests and identify the tool honestly'],
    'Scraping behind a login or ignoring a block request.'),
];
