import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { referralId, providerId } = await request.json();

    // Fetch referral with patient
    const { data: referral, error: refError } = await supabase
      .from('referrals')
      .select('*, patients (*)')
      .eq('id', referralId)
      .single();

    if (refError || !referral) {
      return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
    }

    // Fetch the selected provider with full details
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

    // Build the real booking link — no placeholders
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kept-alpha.vercel.app';
    const bookingLink = `${appUrl}/book/${referralId}`;

    // Build provider location string
    const providerLocation = [provider.address_line, provider.city, provider.state]
      .filter(Boolean)
      .join(', ');

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: `You write SMS messages for a care coordinator at a doctor's office. You're texting a patient to help them book a first visit with a therapist or counselor their doctor recommended.

Your job is to sound like a real person — not a chatbot, not a system notification. Think: a friendly coordinator named Sarah who texts patients as part of her day.

HARD RULES:
- Use the patient's first name only.
- Mention their doctor by name ("Dr. Chen asked me to reach out").
- Mention the provider's name AND one specific detail about them (their office location, their specialty area, or their credential) so the patient knows this is a real person picked for them, not a random link.
- Include the booking link EXACTLY as provided — do not wrap it in brackets or modify it.
- NEVER mention PHQ-9, depression, anxiety, diagnosis, or any clinical term. Say things like "the support Dr. Chen recommended" or "someone to talk to."
- Keep it under 280 characters.
- End with a simple call to action.
- If PHQ-9 is 20+, add on a new line at the end: "If you ever need immediate support, you can call or text 988 anytime."

TONE: Brief, warm, human. Like a text from someone at the front desk who actually cares. No exclamation points. No "we're here for you" corporate filler.

Return ONLY the SMS text. Nothing else.`,
      messages: [
        {
          role: 'user',
          content: `Patient first name: ${patient.first_name}
Patient insurance: ${patient.insurance || 'Unknown'}
Referring doctor: ${referral.referring_pcp_name}
Practice name: ${practice?.name || 'the practice'}

PROVIDER DETAILS:
Name: ${provider.full_name}
Credential: ${provider.credential || 'Therapist'}
Specialty: ${provider.specialty || 'Behavioral Health'}
Location: ${providerLocation || 'nearby'}
Phone: ${provider.phone || ''}
Bio: ${provider.bio || 'Experienced behavioral health provider'}
Approach: ${provider.approach || ''}
Languages: ${(provider.languages || ['English']).join(', ')}
Telehealth: ${provider.telehealth_available ? 'Yes — virtual visits available' : 'In-person only'}
Earliest availability: ${provider.earliest_availability || 'Soon'}
Rating: ${provider.average_rating ? `${provider.average_rating}/5 from ${provider.review_count} patients` : 'New provider'}
Accepts patient insurance: ${(provider.accepts_insurance || []).includes(patient.insurance) ? 'Yes' : 'Check with office'}

Booking link: ${bookingLink}

INTERNAL ONLY (never include in message):
PHQ-9 score: ${referral.phq9_score}
Context: ${referral.diagnosis_context || 'Behavioral health referral'}`,
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
