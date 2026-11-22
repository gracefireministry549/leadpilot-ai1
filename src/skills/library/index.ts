import type { Skill } from '../types';
import { ANALYTICS_SKILLS } from './analytics';
import { BRAND_SITE_SKILLS } from './brand-site';
import { CLOUDFLARE_SKILLS } from './cloudflare';
import { COMPETITIVE_SKILLS } from './competitive';
import { CONTENT_SKILLS } from './content';
import { DESIGN_TASTE_SKILLS } from './design-taste';
import { FREELANCE_DELIVERY_SKILLS } from './freelance-delivery';
import { GBP_SKILLS } from './google-business-profile';
import { LEAD_RESEARCH_SKILLS } from './lead-research';
import { MARKET_RESEARCH_SKILLS } from './market-research';
import { OUTREACH_SALES_SKILLS } from './outreach-sales';
import { PIPELINE_OPS_SKILLS } from './pipeline-ops';
import { REACT_SKILLS } from './react';
import { SAFETY_SKILLS } from './safety';
import { SEO_SKILLS } from './seo';
import { UI_UX_SKILLS } from './ui-ux';

/** The full library. Add a new category file and list it here. */
export const SKILLS: readonly Skill[] = [
  ...SEO_SKILLS,
  ...UI_UX_SKILLS,
  ...DESIGN_TASTE_SKILLS,
  ...REACT_SKILLS,
  ...CLOUDFLARE_SKILLS,
  ...LEAD_RESEARCH_SKILLS,
  ...MARKET_RESEARCH_SKILLS,
  ...COMPETITIVE_SKILLS,
  ...OUTREACH_SALES_SKILLS,
  ...PIPELINE_OPS_SKILLS,
  ...ANALYTICS_SKILLS,
  ...GBP_SKILLS,
  ...FREELANCE_DELIVERY_SKILLS,
  ...CONTENT_SKILLS,
  ...BRAND_SITE_SKILLS,
  ...SAFETY_SKILLS,
];
