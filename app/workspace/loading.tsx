export default function WorkspaceLoading() {
  return (
    <main className="dash" aria-busy="true" aria-live="polite">
      <div className="dash-empty"><strong>Loading your workspace…</strong></div>
    </main>
  );
}
