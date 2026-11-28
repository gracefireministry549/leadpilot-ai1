import type { LeadProvider, LeadSearchQuery } from '../providers/lead-provider';
import { searchLeads } from '../providers/search-service';
import { buildReliableLeadReport } from '../leads/reliable-report';
import { scoreLead } from '../leads/scoring';
import { verifyBusiness } from '../leads/verification';
import type { BusinessRecord, LeadRecord } from '../leads/model';
import { researchLead } from '../agents/lead-research-agent';

export interface FinderPipelineResult { lead: LeadRecord; business: BusinessRecord; report: Awaited<ReturnType<typeof buildReliableLeadReport>>; research: Awaited<ReturnType<typeof researchLead>>['research']; }

function hasVerifiedIdentity(discovered: { name?: string; source?: string; address?: string; city?: string; country?: string }) {
  return Boolean(discovered.name?.trim() && discovered.source?.trim() && (discovered.address?.trim() || discovered.city?.trim() || discovered.country?.trim()));
}

export async function runLeadFinderPipeline(accountId: string, providers: LeadProvider[], query: LeadSearchQuery): Promise<{ results: FinderPipelineResult[]; warnings: string[] }> {
  const found = await searchLeads(providers, query);
  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
  const candidates = found.records.filter(hasVerifiedIdentity).slice(0, limit);
  const rejected = found.records.length - candidates.length;
  const contactReady = candidates.filter((r) => Boolean(r.website?.trim() || r.phone?.trim() || r.email?.trim())).length;
  const warnings = [...found.warnings];
  if (rejected > 0) warnings.push(`${rejected} records were excluded because they lacked a verifiable business identity/location.`);
  if (contactReady < candidates.length) warnings.push(`${candidates.length - contactReady} real businesses have no public website, phone, or email in the configured sources. They remain visible as leads with missing-contact fields; no synthetic data was created.`);
  if (candidates.length < limit) warnings.push(`Only ${candidates.length} relevant source-backed businesses were available for this request. The system will not fill the remaining slots with unrelated businesses.`);

  const results = await Promise.all(candidates.map(async (discovered) => {
    const business: BusinessRecord = { id: crypto.randomUUID(), name: discovered.name, website: discovered.website, phone: discovered.phone, email: discovered.email, address: discovered.address, city: discovered.city, country: discovered.country, industry: discovered.industry, source: discovered.source };
    const verification = verifyBusiness(business);
    const baseScore = scoreLead(business, verification, query.industry);
    const researched = await researchLead(business, baseScore);
    const report = await buildReliableLeadReport(business);
    const now = new Date().toISOString();
    return { business, lead: { id: crypto.randomUUID(), accountId, businessId: business.id, status: 'NEW' as const, score: researched.score.score, scoreLabel: researched.score.label, reliabilityConfidence: report.reliability.confidence, reliabilityLevel: report.reliability.level, websiteStatus: report.website.status, recommendation: report.recommendation, createdAt: now, updatedAt: now }, report, research: researched.research };
  }));
  results.sort((a, b) => b.lead.score - a.lead.score);
  return { results, warnings };
}
