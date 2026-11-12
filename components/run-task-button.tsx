'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RunTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/company/tasks/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'The task could not be run.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The task could not be run.');
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <span className="run-task">
      <button type="button" onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run now'}</button>
      {error ? <small role="alert">{error}</small> : null}
    </span>
  );
}
