'use client';

import { useEffect, useState } from 'react';

/**
 * LocalTime Component
 * 
 * Renders a date in the user's local timezone.
 * Handles hydration mismatch by rendering nothing (or a fallback) on the server.
 */
export default function LocalTime({ 
  dateStr, 
  label 
}: { 
  dateStr: string | null,
  label?: string 
}) {
  const [formatted, setFormatted] = useState<string>('');

  useEffect(() => {
    if (!dateStr) {
      setFormatted('N/A');
      return;
    }

    try {
      const date = new Date(dateStr);
      // Format: "Nov 19, 10:20 AM PST"
      const localString = date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short', // Adds MST, PST, EST, etc.
      });
      setFormatted(localString);
    } catch {
      setFormatted('Invalid date');
    }
  }, [dateStr]);

  if (!dateStr) return <span>N/A</span>;

  // Render a placeholder or nothing on the server to avoid hydration errors
  if (!formatted) {
    return <span className="opacity-0">Loading...</span>;
  }

  return (
    <span title={`${label ? label + ': ' : ''}${formatted}`}>
      {formatted}
    </span>
  );
}

