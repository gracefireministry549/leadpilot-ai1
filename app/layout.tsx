import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './leadpilot.css';
import './glass.css';

export const metadata: Metadata = {
  title: 'LeadPilot AI',
  description: 'Dynamic AI command center for leads, trends, jobs, websites, agents and client communication.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
