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

    // Count previous outreach attempts
    const { count } = await supabase
      .from('outreach_events')
      .select('*', { count: 'exact', head: true })
      .eq('referral_id', referralId);

    const attemptNumber = (count || 0) + 1;
    const daysSinceReferral = Math.floor(
      (Date.now() - new Date(referral.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Build booking link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kept-alpha.vercel.app';
    const bookingLink = `${appUrl}/book/${referralId}`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: `You write follow-up SMS messages for a care coordinator. The patient missed their appointment or hasn't booked yet, and you're reaching back out.

Your tone should shift based on how many times you've reached out:
- Attempt 2: Casual check-in. "Hey [name], just circling back..."
- Attempt 3: Acknowledge it's been a while, offer flexibility. "No rush, just wanted to make sure you still have the link..."
- Attempt 4+: Gentle, final. "Just wanted you to know the option is still open if you want it."

HARD RULES:
- NEVER guilt them. No "we noticed you missed" or "you didn't show up."
- Normalize that life gets busy. Don't make it a big deal.
- Include the booking link EXACTLY as provided.
- Mention the provider by name if available.
- No clinical language whatsoever.
- Keep under 250 characters.
- If attempt 3+, add on a new line: "If you ever need immediate support, call or text 988."

Return ONLY the SMS text. Nothing else.`,
      messages: [
        {
          role: 'user',
          content: `Patient first name: ${patient.first_name}
Provider name: ${provider?.full_name || 'your provider'}
Provider location: ${[provider?.city, provider?.state].filter(Boolean).join(', ') || 'nearby'}
This is outreach attempt #${attemptNumber}
Days since referral: ${daysSinceReferral}
Booking link: ${bookingLink}`,
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
