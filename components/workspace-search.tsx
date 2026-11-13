'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

export default function WorkspaceSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const term = query.trim();
    router.push(term ? `/workspace/leads?q=${encodeURIComponent(term)}` : '/workspace/leads');
  }

  return (
    <form className="workspace-search" role="search" onSubmit={submit}>
      <span aria-hidden="true">⌕</span>
      <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads by business, city or country…" aria-label="Search leads" maxLength={80} />
      <kbd>Ctrl + K</kbd>
    </form>
  );
}
