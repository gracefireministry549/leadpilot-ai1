'use client';

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="dash">
      <div className="dash-empty" role="alert">
        <strong>This page could not be loaded</strong>
        <small>Check your connection and try again. {error.digest ? `Reference: ${error.digest}` : ''}</small>
        <button type="button" onClick={reset} className="dash-primary" style={{ justifySelf: 'center', border: 0, cursor: 'pointer' }}>Try again</button>
      </div>
    </main>
  );
}
