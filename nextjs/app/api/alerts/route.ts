/**
 * API Route Handler for fetching active weather alerts
 * 
 * Purpose: Provides a JSON API endpoint for retrieving active alerts with enrichment
 * 
 * Usage:
 *   GET /api/alerts
 *   GET /api/alerts?is_damaged=true
 *   GET /api/alerts?limit=50
 *   GET /api/alerts?is_damaged=true&since=2024-01-01T00:00:00Z
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveAlertsForUI } from '@/shared/alertsDb';

export async function GET(request: Request) {
  try {
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const isDamagedParam = searchParams.get('is_damaged');
    const limitParam = searchParams.get('limit');
    const sinceParam = searchParams.get('since');

    const options: {
      is_damaged?: boolean;
      limit?: number;
      since?: Date;
    } = {};

    if (isDamagedParam !== null) {
      options.is_damaged = isDamagedParam === 'true';
    }

    if (limitParam !== null) {
      const limit = parseInt(limitParam, 10);
      if (!isNaN(limit) && limit > 0) {
        options.limit = Math.min(limit, 500); // Cap at 500
      }
    }

    if (sinceParam !== null) {
      const sinceDate = new Date(sinceParam);
      if (!isNaN(sinceDate.getTime())) {
        options.since = sinceDate;
      }
    }

    // Create Supabase client
    const supabase = await createClient();

    // Fetch enriched alerts using shared module
    const alerts = await getActiveAlertsForUI(supabase, options);

    return NextResponse.json({
      success: true,
      count: alerts.length,
      alerts,
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch alerts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

