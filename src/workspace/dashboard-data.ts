export type LeadSummaryRow = {
  id: string;
  status: string | null;
  score: number | null;
  score_label?: string | null;
  reliability_confidence: number | null;
  created_at: string;
  updated_at?: string | null;
};

export type WeekBucket = { label: string; count: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Count dates into `weeks` rolling 7-day buckets ending today (oldest first). */
export function bucketByWeek(dates: Array<string | null | undefined>, now: Date, weeks = 5): WeekBucket[] {
  const todayStart = startOfUtcDay(now);
  const windowStart = todayStart + DAY_MS - weeks * 7 * DAY_MS;
  const buckets: WeekBucket[] = [];
  for (let i = 0; i < weeks; i += 1) {
    const start = new Date(windowStart + i * 7 * DAY_MS);
    buckets.push({ label: start.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }), count: 0 });
  }
  for (const value of dates) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time) || time < windowStart || time >= todayStart + DAY_MS) continue;
    const index = Math.floor((time - windowStart) / (7 * DAY_MS));
    if (buckets[index]) buckets[index].count += 1;
  }
  return buckets;
}

/** Percentage change; null when there is no previous value to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Items created in the last 7 days versus the 7 days before that. */
export function weekOverWeek(dates: Array<string | null | undefined>, now: Date) {
  const end = startOfUtcDay(now) + DAY_MS;
  let current = 0;
  let previous = 0;
  for (const value of dates) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time) || time >= end) continue;
    if (time >= end - 7 * DAY_MS) current += 1;
    else if (time >= end - 14 * DAY_MS) previous += 1;
  }
  return { current, previous, change: percentChange(current, previous) };
}

export function averageScore(rows: Array<{ score: number | null }>): number | null {
  const scores = rows
    .filter((row) => row.score !== null && row.score !== undefined)
    .map((row) => Number(row.score))
    .filter((value) => Number.isFinite(value));
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

/** Leads whose reliability confidence is at least `threshold` (default 70). */
export function isVerifiedLead(row: { reliability_confidence: number | null }, threshold = 70): boolean {
  return row.reliability_confidence !== null && Number(row.reliability_confidence) >= threshold;
}

export type LeadTier = 'Hot' | 'Good' | 'Medium' | 'Low';

export function leadTier(score: number | null | undefined): LeadTier {
  const value = Number(score ?? 0);
  if (value >= 85) return 'Hot';
  if (value >= 70) return 'Good';
  if (value >= 40) return 'Medium';
  return 'Low';
}

/** SVG polyline point strings for series sharing one y-scale. */
export function chartPoints(series: number[][], width: number, height: number, pad = 8): string[] {
  const max = Math.max(1, ...series.flat());
  return series.map((values) => {
    const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
    return values
      .map((value, index) => `${(pad + index * step).toFixed(1)},${(height - pad - (value / max) * (height - pad * 2)).toFixed(1)}`)
      .join(' ');
  });
}

export function displayNameFrom(profileName: string | null | undefined, email: string | null | undefined): string {
  const name = (profileName ?? '').trim();
  if (name) return name.split(/\s+/)[0];
  const local = (email ?? '').split('@')[0]?.replace(/[._-]+/g, ' ').trim().split(' ')[0] ?? '';
  if (!local) return 'there';
  return local.charAt(0).toUpperCase() + local.slice(1);
}
