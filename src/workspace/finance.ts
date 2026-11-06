export type FinanceEntryForSummary = {
  status: string | null;
  entry_type: string | null;
  amount_minor: number | string | null;
  currency: string | null;
};

export type CurrencyTotals = {
  revenue: number;
  expenses: number;
};

export function aggregateVerifiedFinance(entries: FinanceEntryForSummary[]): Record<string, CurrencyTotals> {
  return entries
    .filter((entry) => entry.status === 'verified')
    .reduce<Record<string, CurrencyTotals>>((totals, entry) => {
      const currency = entry.currency || 'NGN';
      totals[currency] ??= { revenue: 0, expenses: 0 };
      const amount = Number(entry.amount_minor || 0);
      if (!Number.isFinite(amount) || amount < 0) return totals;
      if (entry.entry_type === 'revenue') totals[currency].revenue += amount;
      if (entry.entry_type === 'expense') totals[currency].expenses += amount;
      return totals;
    }, {});
}
