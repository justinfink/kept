import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { referralId } = await request.json();

    const { data: referral, error } = await supabase
      .from('referrals')
      .select('*, patients (*), providers:matched_provider_id (*)')
      .eq('id', referralId)
      .single();

    if (error || !referral) {
      return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
    }

    const patient = referral.patients;
    const provider = referral.providers;

    // Count previous follow-up attempts
    const { count } = await supabase
      .from('outreach_events')
      .select('*', { count: 'exact', head: true })
      .eq('referral_id', referralId)
      .eq('event_type', 'no_show_followup');

    const attemptNumber = (count || 0) + 1;
    const daysSinceReferral = Math.floor(
      (Date.now() - new Date(referral.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 512,
      system: `You are writing a follow-up SMS for a patient who missed their first therapy appointment.
Rules:
- No guilt, no disappointment, no 'we noticed you missed'
- Normalize that scheduling is hard
- Offer to rebook with one tap
- Same rules as initial outreach: no clinical language, first name only, under 300 chars
- Include [BOOKING_LINK] placeholder
- If this is attempt 3 or higher, include "If you need immediate support, call 988"
Return ONLY the SMS text. No quotes, no explanation.`,
      messages: [
        {
          role: 'user',
          content: `Patient: ${patient.first_name}
This is follow-up attempt #${attemptNumber}
Original provider: ${provider?.full_name || 'the provider'}
Days since original referral: ${daysSinceReferral}`,
        },
      ],
    });

    const smsContent = (message.content[0] as any).text.trim();

    return NextResponse.json({ content: smsContent });
  } catch (err: any) {
    console.error('Generate followup error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate follow-up' },
      { status: 500 }
    );
  }
}
