'use client';

import { useEffect, useState } from 'react';

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Rendered on the client so the greeting follows the visitor's local time. */
export default function WorkspaceGreeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState('Welcome back');
  useEffect(() => setGreeting(greetingFor(new Date().getHours())), []);
  return (
    <h1>
      {greeting}, <span>{name}!</span>
    </h1>
  );
}
