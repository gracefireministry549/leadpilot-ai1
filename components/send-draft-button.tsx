'use client';
import { useState } from 'react';

/**
 * Approval-first outreach: instead of pretending to send directly (the old
 * version posted a decorative token and never worked), this creates a real
 * approval request via /api/company/approvals. An owner/admin then approves
 * and sends it from Workspace → Approvals. Nothing is ever sent without that
 * human approval step.
 */
export default function SendDraftButton({leadId,defaultTo,defaultSubject,defaultText}:{leadId:string;defaultTo?:string;defaultSubject:string;defaultText:string}){
  const [open,setOpen]=useState(false);
  const [to,setTo]=useState(defaultTo??'');
  const [subject,setSubject]=useState(defaultSubject);
  const [text,setText]=useState(defaultText);
  const [approved,setApproved]=useState(false);
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [message,setMessage]=useState('');
  async function requestApproval(){
    if(!approved||busy)return;
    setBusy(true);setMessage('');
    try{
      const r=await fetch('/api/company/approvals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
        actionType:'outbound_email',
        title:subject.trim().slice(0,180),
        summary:`Outbound email to ${to} — ${subject.trim().slice(0,160)}`,
        payload:{leadId,to:to.trim().toLowerCase(),subject:subject.trim(),text:text.trim(),consentConfirmed:true}
      })});
      const d=await r.json();
      if(!r.ok){
        if(r.status===401)throw new Error('Sign in first — outreach always requires a signed-in workspace member.');
        if(r.status===403)throw new Error(d.error??'Create or join a company workspace first.');
        if(r.status===404)throw new Error('Lead not found in this company. Save the lead to your CRM first, then request outreach.');
        throw new Error(d.error??'Could not create the approval request.');
      }
      setDone(true);
      setMessage('Approval request created. An owner or admin can review, approve and send it in Workspace → Approvals. Nothing is sent without that approval.');
    }catch(e){setMessage(e instanceof Error?e.message:'Could not create the approval request.')}
    finally{setBusy(false)}
  }
  return <>
    <button type="button" onClick={()=>{setOpen(true);setDone(false)}}>Request outreach approval</button>
    {open&&<div className="backdrop" role="dialog" aria-modal="true" onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <section className="modal">
        <h3>Review outreach before requesting approval</h3>
        <p className="hint">This creates an approval request. The email is only sent after an owner or admin approves it.</p>
        <input value={to} onChange={e=>setTo(e.target.value)} placeholder="Recipient email" aria-label="Recipient email"/>
        <input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Subject" aria-label="Email subject"/>
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={9} aria-label="Email message"/>
        <label><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I reviewed this message and consent to requesting its approval.</label>
        <div>
          <button type="button" className="primary" disabled={!approved||busy} onClick={requestApproval}>{busy?'Creating request…':done?'Request created ✓':'Request approval'}</button>
          <button type="button" onClick={()=>setOpen(false)}>Close</button>
        </div>
        {message&&<p className={done?'ok':'err'} role="status">{message}</p>}
      </section>
    </div>}
    <style jsx>{`
      .backdrop{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:100;display:grid;place-items:center;padding:18px}
      .modal{width:min(620px,100%);background:#0b1723;border:1px solid #315064;border-radius:16px;padding:20px;color:#eaf2f8}
      .hint{color:#8ea3b4;font-size:12px;margin:4px 0 10px}
      .modal input,.modal textarea{width:100%;box-sizing:border-box;margin:7px 0;padding:10px;border:1px solid #2a3e50;border-radius:8px;background:#07111c;color:#fff;font:inherit}
      .modal label{font-size:12px;display:flex;gap:8px;align-items:center}
      .modal button{margin:10px 8px 0 0;padding:9px 12px;border:1px solid #315064;border-radius:8px;background:transparent;color:#cbd9e2;cursor:pointer}
      .modal button.primary{background:#7ee7c4;border-color:#7ee7c4;color:#06120f;font-weight:800}
      .modal button.primary:disabled{opacity:.5;cursor:not-allowed}
      .ok{color:#7ee7c4}.err{color:#ffb8bd}
    `}</style>
  </>;
}
