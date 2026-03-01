import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const referralId = request.nextUrl.searchParams.get('referralId');

    if (!referralId) {
      return NextResponse.json({ error: 'referralId required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('outreach_events')
      .select('*')
      .eq('referral_id', referralId)
      .order('sent_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch outreach events' },
      { status: 500 }
    );
  }
}
