/**
 * Alerts Layout with Tab Navigation
 * 
 * Purpose: Provides the main layout for the dashboard with tab navigation
 * 
 * Usage: Wraps all pages under /alerts/* route including /alerts, /alerts/damage, and /alerts/leads
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Tab navigation item with active state highlighting
 */
function TabLink({ 
  href, 
  label, 
  isActive 
}: { 
  href: string; 
  label: string; 
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={`
        px-6 py-3 text-sm font-medium rounded-t-lg transition-colors
        ${isActive 
          ? 'bg-white text-gray-900 border-t-2 border-x-2 border-gray-200 border-b-0' 
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 border-b-2 border-gray-200'
        }
      `}
    >
      {label}
    </Link>
  );
}

/**
 * Alerts Layout Component
 */
export default function AlertsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  // Determine which tab is active based on current path
  const isAllAlertsActive = pathname === '/alerts';
  const isDamageAlertsActive = pathname === '/alerts/damage';
  const isLeadsActive = pathname === '/alerts/leads';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Title and Tab Navigation */}
      <div className="bg-gray-900 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-2xl font-bold">Weather Alerts Dashboard</h1>
            <p className="text-sm text-gray-300 mt-1">Real-time weather alerts with lead scoring</p>
          </div>
        </div>
      </div>
      
      {/* Tab Navigation Bar */}
      <div className="bg-gray-100 border-b-2 border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 pt-4">
            <TabLink 
              href="/alerts" 
              label="All Alerts" 
              isActive={isAllAlertsActive}
            />
            <TabLink 
              href="/alerts/damage" 
              label="Damage (Last 7 Days)" 
              isActive={isDamageAlertsActive}
            />
            <TabLink 
              href="/alerts/leads" 
              label="Leads" 
              isActive={isLeadsActive}
            />
          </div>
        </div>
      </div>

      {/* Page Content */}
      {children}
    </div>
  );
}

