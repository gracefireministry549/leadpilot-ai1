'use client';
import Link from 'next/link';

/**
 * The old version posted {email, name} without an offer token to
 * /api/payments/initialize, which always rejected it — the button could
 * never work. Real checkout links are personalized and HMAC-signed
 * (/offer/[token]). This page now explains that instead of a dead button.
 */
export default function OfferPage(){
  return <main className="wrap"><div className="card">
    <div className="mark">LP</div>
    <p className="eyebrow">LEADPILOT AI</p>
    <h1>Turn more opportunities<br/><span>into customers.</span></h1>
    <p className="desc">AI-powered lead discovery, verification and outreach that finds real businesses for you — and never sends anything without your approval.</p>
    <div className="offer">
      <div><b>LeadPilot Growth</b><small>AI lead discovery + qualification + approval-first outreach</small></div>
      <strong>Personalized link</strong>
    </div>
    <div className="notice">
      <b>This checkout needs your personal offer link.</b>
      <p>Offer links are generated individually and signed for security. Open the exact link that was shared with you (it looks like <code>/offer/…</code>), or ask the person who invited you to send it again.</p>
    </div>
    <Link className="home" href="/">Explore LeadPilot free →</Link>
    <p className="secure">Payments are processed securely by the payment provider. Your card details are never seen by LeadPilot.</p>
  </div>
  <style jsx>{`
    :global(body){margin:0;background:#07101b;color:#edf5f8;font-family:Inter,system-ui,sans-serif}
    .wrap{min-height:100vh;display:grid;place-items:center;padding:20px}
    .card{width:min(560px,100%);background:#0b1723;border:1px solid #243646;border-radius:22px;padding:38px;box-shadow:0 20px 70px #0005}
    .mark{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#123c3a;color:#7ee7c4;font-weight:800}
    .eyebrow{font-size:10px;letter-spacing:.16em;color:#6dd8b5;font-weight:800;margin:22px 0 10px}
    .card h1{font-size:clamp(34px,6vw,54px);line-height:1.05;letter-spacing:-.05em;margin:0}
    .card h1 span{color:#7ee7c4}
    .desc{color:#8ea3b4;line-height:1.6}
    .offer{display:flex;justify-content:space-between;gap:15px;padding:17px;border:1px solid #294050;background:#0f202b;border-radius:12px;margin:25px 0}
    .offer small{display:block;color:#7e94a6;margin-top:5px}
    .offer strong{color:#7ee7c4;align-self:center;font-size:12px}
    .notice{border:1px solid #6b5a31;background:#241e11;border-radius:12px;padding:16px;margin:0 0 18px}
    .notice b{color:#d6c58c;font-size:13px}
    .notice p{color:#c4b88a;font-size:12.5px;line-height:1.55;margin:8px 0 0}
    .notice code{background:#1a160d;padding:1px 5px;border-radius:5px;font-size:11px}
    .home{display:block;text-align:center;border:0;border-radius:9px;background:#7ee7c4;color:#06110f;font-weight:800;padding:14px;text-decoration:none}
    .secure{text-align:center;color:#607789;font-size:10px;line-height:1.5;margin:16px 0 0}
  `}</style></main>;
}
