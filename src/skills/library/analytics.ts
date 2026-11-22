import { forCategory } from '../define';
import { ANALYTICS_AGENTS } from './agents';

const s = forCategory('analytics');

export const ANALYTICS_SKILLS = [
  s('kpi-definitions', 'Define KPIs precisely', ANALYTICS_AGENTS, 3, 'kpi metric definition measure target',
    'Every metric needs a written definition, a source and an owner.',
    ['Define numerator, denominator and time window', 'Name the data source and the owner', 'Set a target and a review date'],
    'Two teams using the same metric name for different things.'),
  s('funnel-metrics', 'Measure the funnel stage by stage', ANALYTICS_AGENTS, 3, 'funnel conversion rate stage drop-off leads replies meetings',
    'Track conversion between stages to find the real bottleneck.',
    ['Count leads at each stage over the same cohort', 'Compute stage-to-stage conversion', 'Fix the biggest drop before optimising elsewhere'],
    'Optimising the top of the funnel when the leak is lower down.'),
  s('ab-testing-basics', 'Run honest experiments', ANALYTICS_AGENTS, 1, 'ab test experiment variant sample significance',
    'Change one thing, decide the measure in advance and wait for enough data.',
    ['State the hypothesis and the success metric first', 'Split traffic randomly and run for a full cycle', 'Report results with the sample size and uncertainty'],
    'Stopping a test the moment one variant looks ahead.'),
  s('reporting-cadence', 'Report on a steady cadence', ANALYTICS_AGENTS, 2, 'report weekly monthly review dashboard cadence',
    'Give the same short report on a regular schedule.',
    ['Pick a few metrics that drive decisions', 'Show change against the previous period', 'Add one insight and one action'],
    'Dashboards with dozens of metrics and no decisions.'),
  s('attribution-caveats', 'Be careful with attribution', ANALYTICS_AGENTS, 1, 'attribution source credit channel cause',
    'Attribution is an estimate; say what it can and cannot show.',
    ['Use consistent source tagging', 'Note that several touches usually contribute', 'Avoid claiming causation from correlation'],
    'Crediting one channel for everything.'),
  s('forecast-honesty', 'Forecast with honest ranges', ANALYTICS_AGENTS, 2, 'forecast projection estimate range pipeline revenue',
    'Give a range and the assumptions behind it.',
    ['Base the forecast on historic conversion rates', 'Show low, expected and high cases', 'Update it as new data arrives'],
    'A single precise number presented as certain.'),
];
