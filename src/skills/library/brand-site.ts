import { forCategory } from '../define';
import { BRAND_AGENTS } from './agents';

const s = forCategory('brand-site');

export const BRAND_SITE_SKILLS = [
  s('brand-positioning', 'Brand positioning', BRAND_AGENTS, 3, 'brand positioning identity audience promise differentiate',
    'State who the business serves, what it promises and why it is different.',
    ['Write the audience, the promise and the proof', 'Name what competitors do not offer', 'Test the statement on a real customer'],
    'A positioning statement that fits any business.'),
  s('naming', 'Naming a business', ['website-brand'], 1, 'name naming brand domain trademark',
    'Choose a name that is easy to say, spell and find.',
    ['Shortlist names and say them aloud', 'Check domain, social handles and existing trademarks', 'Avoid names that limit future growth'],
    'Falling in love with a name that is already taken.'),
  s('brand-voice', 'Brand voice', BRAND_AGENTS, 3, 'voice tone personality writing brand copy',
    'Define how the brand sounds so copy stays consistent.',
    ['Choose three voice traits with do and do-not examples', 'Match tone to the audience and the situation', 'Apply the voice to buttons, errors and emails too'],
    'A different voice on every page.'),
  s('logo-brief', 'A clear logo brief', ['website-brand'], 2, 'logo mark brief identity symbol wordmark',
    'Describe the brand and constraints so the logo works in real use.',
    ['State the brand traits, audience and use cases', 'Require simple shapes that work small and in one colour', 'Avoid copying existing marks and check originality'],
    'Complex logos that fail at small sizes.'),
  s('site-architecture', 'Site architecture', BRAND_AGENTS, 3, 'site structure sitemap pages navigation information architecture',
    'Organise pages around what visitors want to do.',
    ['List the main visitor tasks', 'Create one page per major service or question', 'Keep the contact route within one click everywhere'],
    'Burying services behind vague menu labels.'),
  s('industry-page-templates', 'Page patterns by industry', ['website-brand'], 3, 'industry template restaurant clinic trades legal salon page sections',
    'Use the sections customers in that industry expect, in an original layout.',
    ['Identify what customers decide on, such as menu, prices, credentials or reviews', 'Place that information near the top and keep the action visible', 'Add industry trust signals such as licences and insurance when real'],
    'One template for every industry.'),
  s('conversion-copy', 'Conversion copy', BRAND_AGENTS, 3, 'copy conversion landing headline benefit objection faq',
    'Write about the customer problem and outcome, and answer objections before they arise.',
    ['Lead with the outcome the customer wants', 'Answer the top objections in an FAQ', 'Repeat a single clear call to action'],
    'Talking about the company instead of the customer.'),
  s('local-trust-page', 'Local trust content', ['website-brand', 'content'], 2, 'local trust about team area reviews address map',
    'Show that a real local business stands behind the work.',
    ['Show the team, the place and the service area', 'Display real reviews and credentials', 'Make contact details, hours and the map easy to find'],
    'Anonymous pages with no sign of who runs the business.'),
];
