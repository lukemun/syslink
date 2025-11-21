/**
 * Alerts Layout with Tab Navigation
 * 
 * Purpose: Provides a shared layout for all alerts pages with a tab bar
 * at the top to switch between "All Alerts" and "Damage (Last 7 Days)".
 * 
 * Usage: Wraps all pages under /alerts/* route including /alerts and /alerts/damage
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
        px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
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

