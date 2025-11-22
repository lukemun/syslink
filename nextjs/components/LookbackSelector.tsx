/**
 * Lookback Period Selector Component
 * 
 * Purpose: Client-side dropdown for selecting the lookback period for alerts
 * Usage: Used in Leads and Damage pages to filter alerts by date range
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface LookbackSelectorProps {
  defaultDays?: number;
}

export default function LookbackSelector({ defaultDays = 7 }: LookbackSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDays = searchParams.get('days') || String(defaultDays);

  const handleChange = (days: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('days', days);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="lookback" className="text-sm font-medium text-gray-700">
        Lookback Period:
      </label>
      <select
        id="lookback"
        value={currentDays}
        onChange={(e) => handleChange(e.target.value)}
        className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1 px-3"
      >
        <option value="7">Last 7 Days</option>
        <option value="14">Last 14 Days</option>
      </select>
    </div>
  );
}

