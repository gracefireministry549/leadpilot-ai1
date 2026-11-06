export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../src/auth/supabase-server';
import { addFinanceEntry, verifyFinanceEntry } from '../actions';
import { aggregateVerifiedFinance } from '../../../src/workspace/finance';

function formatMoney(amountMinor: number, currency: string) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amountMinor / 100);
  } catch {
    return (amountMinor / 100).toFixed(2) + ' ' + currency;
  }
}

export default async function Finance({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id,role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!membership?.company_id) redirect('/workspace/setup');

  const { data: rows } = await supabase
    .from('financial_entries')
    .select('id,entry_type,status,amount_minor,currency,description,occurred_at,created_at')
    .eq('company_id', membership.company_id)
    .order('occurred_at', { ascending: false })
    .limit(100);

  const entries = rows ?? [];
  const verifiedTotals = aggregateVerifiedFinance(entries);
  const canVerify = ['owner', 'admin'].includes(membership.role);

  return (
    <main className="page">
      <Link href="/workspace">← Overview</Link>
      <p className="eyebrow">FINANCIAL OPERATIONS</p>
      <h1>Revenue & finance</h1>
      <p className="muted">Track revenue and expenses with a clear verification trail. Totals remain separated by currency; no exchange rates are assumed.</p>

      <section className="panel">
        <div className="panelHeading"><div><p className="eyebrow">VERIFIED POSITION</p><h2>Financial summary</h2></div><span className="verifiedTag">Verified only</span></div>
        {Object.keys(verifiedTotals).length ? (
          <div className="currencyGrid">
            {Object.entries(verifiedTotals).map(([currency, totals]) => (
              <article className="currencyCard" key={currency}>
                <strong>{currency}</strong>
                <div><small>Revenue</small><b>{formatMoney(totals.revenue, currency)}</b></div>
                <div><small>Expenses</small><b>{formatMoney(totals.expenses, currency)}</b></div>
                <div className="net"><small>Net verified</small><b>{formatMoney(totals.revenue - totals.expenses, currency)}</b></div>
              </article>
            ))}
          </div>
        ) : <p className="muted">No verified financial entries yet. New records start as unverified.</p>}
      </section>

      <section className="panel">
        <div className="panelHeading"><div><p className="eyebrow">RECORD KEEPING</p><h2>Add a financial entry</h2></div></div>
        {searchParams.error ? <p className="error">{searchParams.error}</p> : null}
        <form action={addFinanceEntry} className="financeForm">
          <label>Entry type<select name="entry_type" defaultValue="revenue"><option value="revenue">Revenue</option><option value="expense">Expense</option></select></label>
          <label>Amount<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required /></label>
          <label>Currency<select name="currency" defaultValue="NGN"><option value="NGN">NGN — Nigerian naira</option><option value="USD">USD — US dollar</option><option value="GBP">GBP — British pound</option><option value="EUR">EUR — Euro</option></select></label>
          <label className="descriptionField">Description / evidence reference<input name="description" maxLength={240} placeholder="Invoice, payment reference, or expense details" required /></label>
          <button type="submit">Save as unverified</button>
        </form>
        <p className="formNote">Saving an entry does not mark it verified. An Owner or Admin must review it.</p>
      </section>

      <section className="panel">
        <div className="panelHeading"><div><p className="eyebrow">AUDIT TRAIL</p><h2>Recent entries</h2></div><span className="entryCount">{entries.length} records</span></div>
        {entries.length ? (
          <div className="entryList">
            {entries.map((entry) => (
              <article className="entry" key={entry.id}>
                <div className="entryCopy"><b>{entry.description}</b><small>{entry.entry_type} · {new Date(entry.occurred_at || entry.created_at).toLocaleDateString()}</small></div>
                <strong className="entryAmount">{formatMoney(Number(entry.amount_minor || 0), entry.currency || 'NGN')}</strong>
                <span className={entry.status === 'verified' ? 'entryStatus isVerified' : 'entryStatus'}>{entry.status}</span>
                {entry.status === 'unverified' && canVerify ? (
                  <form action={verifyFinanceEntry}><input type="hidden" name="id" value={entry.id} /><button type="submit">Verify</button></form>
                ) : null}
              </article>
            ))}
          </div>
        ) : <p className="muted">No entries have been recorded. Add the first revenue or expense above.</p>}
      </section>

      <style>{`
        .page{max-width:1120px;margin:0 auto;padding:8px 0 35px;color:#eaf2f8}
        .page>a{color:#7de2bd;text-decoration:none;font-size:11px;font-weight:700}
        .page>.eyebrow{margin:27px 0 8px;color:#75dfbd;font-size:9px;letter-spacing:.17em;font-weight:800}
        .page>h1{margin:0;color:#f0f7f9;font-size:clamp(30px,4vw,42px);letter-spacing:-.045em}
        .muted{max-width:720px;color:#91a7b5;font-size:12px;line-height:1.65}
        .panel{margin-top:16px;padding:21px;border:1px solid #203849;border-radius:15px;background:linear-gradient(145deg,rgba(13,28,41,.97),rgba(9,22,33,.97))}
        .panelHeading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px}
        .panelHeading .eyebrow{margin:0 0 6px;color:#75dfbd;font-size:9px;letter-spacing:.15em;font-weight:800}
        .panelHeading h2{margin:0;color:#eaf3f6;font-size:17px}
        .verifiedTag,.entryCount{padding:6px 9px;border:1px solid #285d4c;border-radius:8px;background:#12342a;color:#8ce7c5;font-size:9px}
        .currencyGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
        .currencyCard{display:grid;gap:12px;padding:15px;border:1px solid #294254;border-radius:12px;background:#091723}
        .currencyCard>strong{color:#8beac7;font-size:12px;letter-spacing:.1em}
        .currencyCard>div{display:flex;justify-content:space-between;align-items:center;gap:8px}
        .currencyCard small{color:#8399a8;font-size:10px}
        .currencyCard b{color:#e2edf0;font-size:12px;text-align:right}
        .currencyCard .net{padding-top:10px;border-top:1px solid #203849}
        .currencyCard .net b{color:#8beac7}
        .financeForm{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
        .financeForm label{display:grid;gap:6px;color:#a9bac4;font-size:10px;font-weight:700}
        .financeForm input,.financeForm select{width:100%;min-width:0;box-sizing:border-box;padding:12px;border:1px solid #2a4052;border-radius:9px;background:#07111c;color:#edf5f8;font:inherit;font-size:12px}
        .financeForm .descriptionField{grid-column:span 2}
        .financeForm button{align-self:end;min-height:40px;border:0;border-radius:9px;background:linear-gradient(135deg,#83edc8,#5cc8a5);color:#062017;font-size:11px;font-weight:800}
        .formNote{margin:10px 0 0;color:#7f96a5;font-size:10px}
        .entryList{display:grid}
        .entry{display:flex;align-items:center;gap:13px;padding:13px 0;border-top:1px solid rgba(37,59,74,.72)}
        .entryCopy{display:grid;gap:5px;flex:1;min-width:0}
        .entryCopy b{overflow:hidden;color:#dce9ed;font-size:11px;text-overflow:ellipsis;white-space:nowrap}
        .entryCopy small{color:#8299a8;font-size:9px;text-transform:capitalize}
        .entryAmount{color:#dce9ed;font-size:11px;white-space:nowrap}
        .entryStatus{padding:5px 7px;border:1px solid #66532e;border-radius:7px;color:#edc879;font-size:8px;text-transform:capitalize}
        .entryStatus.isVerified{border-color:#285d4c;background:#12342a;color:#8ce7c5}
        .entry form button{padding:7px 10px;border:1px solid #3b7966;border-radius:7px;background:#153a30;color:#91e9c8;font-size:9px;font-weight:800}
        .error{color:#ffb6bf;font-size:11px}
        @media(max-width:720px){.financeForm{grid-template-columns:1fr 1fr}.financeForm .descriptionField{grid-column:1/-1}.financeForm button{grid-column:1/-1}}
        @media(max-width:520px){.panel{padding:15px}.financeForm{grid-template-columns:1fr}.financeForm .descriptionField,.financeForm button{grid-column:auto}.entry{flex-wrap:wrap}.entryCopy{flex-basis:100%}.entryAmount{flex:1}.page>h1{font-size:33px}}
      `}</style>
    </main>
  );
}
