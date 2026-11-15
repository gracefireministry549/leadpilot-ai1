'use client';

import { useState } from 'react';

type Props = {
  approvalId: string;
  leadId: string;
  subject: string;
  text: string;
};

export default function SendApprovedOutreach({ approvalId, leadId, subject, text }: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function send() {
    if (state === 'sending' || state === 'sent') return;
    setState('sending');
    setMessage('');
    try {
      const response = await fetch('/api/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, leadId, subject, text }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setState('error');
        setMessage(typeof result.error === 'string' ? result.error : 'The email was not sent.');
        return;
      }
      setState('sent');
      setMessage('Email sent successfully.');
    } catch {
      setState('error');
      setMessage('The delivery result is unknown. Check your email provider before trying again.');
    }
  }

  return (
    <div className="approved-send">
      <button type="button" onClick={send} disabled={state === 'sending' || state === 'sent'}>
        {state === 'sending' ? 'Sending…' : state === 'sent' ? 'Sent' : 'Send approved email'}
      </button>
      {message ? <small role="status" aria-live="polite">{message}</small> : null}
      <style>{`.approved-send{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:12px}.approved-send button{border:0;border-radius:8px;background:var(--ws-accent);color:#06140f;padding:10px 14px;font-weight:800}.approved-send button:disabled{opacity:.55;cursor:not-allowed}.approved-send small{color:var(--ws-muted,#91a5b5);font-size:12px}`}</style>
    </div>
  );
}
