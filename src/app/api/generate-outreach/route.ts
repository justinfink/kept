import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { referralId, providerId } = await request.json();

    // Fetch referral with patient + provider
    const { data: referral, error: refError } = await supabase
      .from('referrals')
      .select('*, patients (*)')
      .eq('id', referralId)
      .single();

    if (refError || !referral) {
      return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
    }

    // Fetch the selected provider
    const { data: provider, error: provError } = await supabase
      .from('providers')
      .select('*')
      .eq('id', providerId)
      .single();

    if (provError || !provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const patient = referral.patients;

    // Fetch the practice name
    const { data: practice } = await supabase
      .from('practices')
      .select('name')
      .eq('id', referral.practice_id)
      .single();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: `You are writing an SMS on behalf of a doctor's office to help a patient connect with a therapist.
Rules:
- Use the patient's first name only
- Reference the referring doctor by name
- NEVER mention the PHQ-9 score, depression, anxiety, or any clinical term
- NEVER use the word 'mental health' in the SMS
- Keep it under 300 characters
- Include a placeholder [BOOKING_LINK] where the link should go
- Tone: warm, brief, like a trusted person reaching out, not a system notification
- End with a clear call to action (tap to book / pick a time)
- If the PHQ-9 score is 20 or above, include "If you need immediate support, call 988" at the end
Return ONLY the SMS text. No quotes, no explanation.`,
      messages: [
        {
          role: 'user',
          content: `Patient: ${patient.first_name}
Referring doctor: ${referral.referring_pcp_name}
Practice: ${practice?.name || 'the practice'}
Provider they'll be seeing: ${provider.full_name}, ${provider.credential || ''}
Context (for tone only, do NOT include in message): PHQ-9 ${referral.phq9_score}, ${referral.diagnosis_context || ''}`,
        },
      ],
    });

    const smsContent = (message.content[0] as any).text.trim();

    return NextResponse.json({
      content: smsContent,
      provider,
    });
  } catch (err: any) {
    console.error('Generate outreach error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to generate outreach' },
      { status: 500 }
    );
  }
}
