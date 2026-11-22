import type { AgentName } from '../../docs/agent-contract';
import type { Skill } from './types';

const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'our', 'are', 'you', 'how', 'what', 'can', 'get', 'new']);

/** Cheap singularization so "audits" matches the tag "audit". */
function stem(word: string): string {
  return word.replace(/ies$/, 'y').replace(/(?<=[^s])s$/, '');
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9.+#-]*/g) ?? []).map((w) => w.replace(/[.-]+$/, ''));
}

export interface SelectOptions {
  /** Maximum number of skills returned (default 3, capped at 8). */
  limit?: number;
  /** Override the library (used by tests). */
  library?: readonly Skill[];
}

/**
 * Picks the few skills most useful for this agent and task.
 * Every agent has core skills (priority 3) that apply to any request; words in the
 * task text that match a skill's tags or title raise more specific skills above them.
 * Deterministic: equal scores fall back to the skill id. No more than half the picks
 * (rounded up) come from one category, so the guidance stays varied.
 */
export function selectSkills(agent: AgentName, query: string, library: readonly Skill[], options: SelectOptions = {}): Skill[] {
  const limit = Math.max(0, Math.min(Math.floor(options.limit ?? 3), 8));
  if (limit === 0) return [];
  const queryWords = new Set(words(query).filter((w) => w.length >= 2 && !STOP_WORDS.has(w)).map(stem));

  const ranked = library
    .filter((skill) => skill.agents.includes(agent))
    .map((skill) => {
      const tagHits = skill.tags.filter((tag) => queryWords.has(stem(tag))).length;
      const titleHits = words(skill.title).filter((w) => queryWords.has(stem(w))).length;
      return { skill, score: skill.priority * 2 + 5 * Math.min(tagHits, 3) + 2 * Math.min(titleHits, 3) };
    })
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id));

  const perCategoryCap = Math.ceil(limit / 2);
  const perCategory = new Map<string, number>();
  const picked: Skill[] = [];
  for (const { skill } of ranked) {
    const used = perCategory.get(skill.category) ?? 0;
    if (used >= perCategoryCap) continue;
    perCategory.set(skill.category, used + 1);
    picked.push(skill);
    if (picked.length >= limit) break;
  }
  return picked;
}

const HEADER =
  'Method guidance from the skill library. It describes HOW to do this kind of work well. ' +
  'It is not evidence about the business or market, so never present anything in it as a finding.';

/** Compact prompt text for the chosen skills, cut off cleanly at a character budget. */
export function renderSkillContext(skills: readonly Skill[], maxChars = 1600): string {
  const blocks: string[] = [];
  let used = HEADER.length;
  for (const skill of skills) {
    const block = `- ${skill.title}: ${skill.summary} Steps: ${skill.steps.join('; ')}. Avoid: ${skill.avoid}`;
    if (used + block.length + 1 > maxChars) break;
    blocks.push(block);
    used += block.length + 1;
  }
  return blocks.length ? [HEADER, ...blocks].join('\n') : '';
}
