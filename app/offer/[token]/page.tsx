import { verifyOfferToken } from '../../../src/agents/offer-link';

export default async function OfferPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const offer = verifyOfferToken(params.token);
  if (!offer) return <main style={{fontFamily:'system-ui',maxWidth:680,margin:'80px auto',padding:24,textAlign:'center'}}><h1>Offer unavailable</h1><p>This payment link is invalid or has expired. Please request a new link.</p></main>;
  return <main style={{fontFamily:'system-ui',maxWidth:680,margin:'60px auto',padding:24}}><div style={{border:'1px solid #ddd',borderRadius:20,padding:32}}><p style={{letterSpacing:2,fontSize:12}}>VICTORY AI</p><h1>{offer.offer}</h1><p style={{fontSize:16,color:'#667085'}}>Secure payment for your personalized offer.</p><div style={{fontSize:40,fontWeight:800,margin:'28px 0'}}>{offer.currency} {offer.amount.toLocaleString()}</div><form action="/api/payments/initialize" method="POST"><input type="hidden" name="offerToken" value={params.token}/><label style={{display:'block',fontWeight:600}}>Email</label><input name="email" type="email" required placeholder="you@example.com" style={{width:'100%',padding:14,margin:'8px 0 18px',boxSizing:'border-box',borderRadius:10,border:'1px solid #ccc'}}/><button type="submit" style={{width:'100%',padding:15,border:0,borderRadius:10,fontWeight:800,cursor:'pointer'}}>Pay securely</button></form><p style={{fontSize:12,color:'#667085',marginTop:18}}>Your payment is processed securely by Paystack. This page never receives your card details.</p></div></main>;
}
