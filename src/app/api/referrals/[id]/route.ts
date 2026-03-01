import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceClient();
    const { id } = params;

    const { data, error } = await supabase
      .from('referrals')
      .select(`
        *,
        patients (*),
        providers:matched_provider_id (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch referral' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServiceClient();
    const { id } = params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};

    if (body.status) updateData.status = body.status;
    if (body.matched_provider_id) updateData.matched_provider_id = body.matched_provider_id;
    if (body.appointment_date) updateData.appointment_date = body.appointment_date;
    if (body.appointment_location) updateData.appointment_location = body.appointment_location;

    // Set timestamp fields based on status changes
    if (body.status === 'outreach_sent') updateData.outreach_sent_at = new Date().toISOString();
    if (body.status === 'booked') updateData.booked_at = new Date().toISOString();
    if (body.status === 'kept') updateData.appointment_kept_at = new Date().toISOString();
    if (body.status === 'closed') updateData.closed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('referrals')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        patients (*),
        providers:matched_provider_id (*)
      `)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Failed to update referral' },
      { status: 500 }
    );
  }
}
