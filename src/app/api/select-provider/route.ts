import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { referralId, npi } = await request.json();

    // Look up provider by NPI (server-side, bypasses RLS)
    const { data: provider, error: provError } = await supabase
      .from('providers')
      .select('id')
      .eq('npi', npi)
      .single();

    if (provError || !provider) {
      return NextResponse.json(
        { error: 'Provider not found. Please try matching again.' },
        { status: 404 }
      );
    }

    // Update referral with matched provider
    const { data: referral, error: refError } = await supabase
      .from('referrals')
      .update({
        status: 'matched',
        matched_provider_id: provider.id,
      })
      .eq('id', referralId)
      .select('*, patients (*), providers:matched_provider_id (*)')
      .single();

    if (refError) {
      return NextResponse.json(
        { error: refError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      providerId: provider.id,
      referral,
    });
  } catch (err: any) {
    console.error('Select provider error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to select provider' },
      { status: 500 }
    );
  }
}
