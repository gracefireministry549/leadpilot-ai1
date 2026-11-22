import type { AgentName } from '../../docs/agent-contract';
import type { Skill, SkillCategory } from './types';

/** Compact skill constructor so each library file stays readable. Tags are space separated. */
export function forCategory(category: SkillCategory) {
  return (
    slug: string,
    title: string,
    agents: readonly AgentName[],
    priority: Skill['priority'],
    tags: string,
    summary: string,
    steps: readonly string[],
    avoid: string,
  ): Skill => ({
    id: `${category}/${slug}`,
    title,
    category,
    agents,
    priority,
    tags: tags.split(/\s+/).filter(Boolean),
    summary,
    steps,
    avoid,
  });
}
