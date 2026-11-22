import type { AgentName } from '../../docs/agent-contract';

export type SkillCategory =
  | 'seo' | 'ui-ux' | 'design-taste' | 'react' | 'cloudflare'
  | 'lead-research' | 'market-research' | 'competitive'
  | 'outreach-sales' | 'pipeline-ops' | 'analytics'
  | 'google-business-profile' | 'freelance-delivery'
  | 'content' | 'brand-site' | 'safety';

/**
 * A skill is short, original method guidance: how to do one kind of work well.
 * It is never evidence about a business or market, and never a source of facts.
 */
export interface Skill {
  /** `${category}/${slug}`, unique across the library. */
  id: string;
  title: string;
  category: SkillCategory;
  /** The features (agents) this skill applies to. */
  agents: readonly AgentName[];
  /** 3 = core method for these agents (used by default), 2 = useful, 1 = situational. */
  priority: 1 | 2 | 3;
  /** Lower-case keywords; a match with the task text raises the skill in the ranking. */
  tags: readonly string[];
  /** One sentence: what good looks like. */
  summary: string;
  /** Three to five imperative steps. */
  steps: readonly string[];
  /** The most common way this goes wrong. */
  avoid: string;
}
