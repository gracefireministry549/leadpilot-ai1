import type { AgentName } from '../../../docs/agent-contract';

/** Every feature in the app. Keep in sync with AgentName; tests fail if an agent has no skills. */
export const ALL_AGENTS: readonly AgentName[] = [
  'lead-finder', 'trend-finder', 'opportunity-finder', 'tender-finder', 'competitor-monitor',
  'outreach', 'ecommerce-opportunity', 'content', 'command-agent', 'general-manager',
  'verification', 'scoring', 'crm', 'sales', 'workpilot', 'website-brand',
  'gbp-audit', 'gbp-outreach', 'gbp-fix',
];

/** Agent groups shared by several library files. */
export const SEO_AGENTS: readonly AgentName[] = ['website-brand', 'content', 'gbp-audit', 'gbp-fix', 'competitor-monitor', 'opportunity-finder', 'sales', 'workpilot'];
export const DESIGN_AGENTS: readonly AgentName[] = ['website-brand', 'workpilot', 'content', 'sales'];
export const REACT_AGENTS: readonly AgentName[] = ['website-brand', 'workpilot', 'command-agent'];
export const CLOUDFLARE_AGENTS: readonly AgentName[] = ['website-brand', 'verification', 'competitor-monitor', 'command-agent', 'general-manager', 'workpilot'];
export const LEAD_AGENTS: readonly AgentName[] = ['lead-finder', 'verification', 'scoring', 'crm', 'outreach', 'gbp-audit'];
export const TREND_AGENTS: readonly AgentName[] = ['trend-finder', 'opportunity-finder', 'ecommerce-opportunity', 'content'];
export const TENDER_AGENTS: readonly AgentName[] = ['tender-finder', 'opportunity-finder', 'sales', 'workpilot'];
export const ECOMMERCE_AGENTS: readonly AgentName[] = ['ecommerce-opportunity', 'opportunity-finder', 'trend-finder', 'content'];
export const COMPETITIVE_AGENTS: readonly AgentName[] = ['competitor-monitor', 'opportunity-finder', 'sales', 'content', 'outreach'];
export const SALES_AGENTS: readonly AgentName[] = ['outreach', 'sales', 'gbp-outreach', 'crm', 'workpilot', 'content'];
export const OPS_AGENTS: readonly AgentName[] = ['crm', 'scoring', 'verification', 'general-manager', 'command-agent', 'sales', 'lead-finder'];
export const ANALYTICS_AGENTS: readonly AgentName[] = ['general-manager', 'command-agent', 'crm', 'sales', 'scoring', 'competitor-monitor'];
export const GBP_AGENTS: readonly AgentName[] = ['gbp-audit', 'gbp-fix', 'gbp-outreach', 'verification', 'lead-finder'];
export const FREELANCE_AGENTS: readonly AgentName[] = ['workpilot', 'sales', 'website-brand', 'gbp-fix'];
export const CONTENT_AGENTS: readonly AgentName[] = ['content', 'outreach', 'website-brand', 'gbp-outreach', 'sales'];
export const BRAND_AGENTS: readonly AgentName[] = ['website-brand', 'content'];
