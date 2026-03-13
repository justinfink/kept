import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface BulkProposal {
  referralId: string;
  patientLabel: string; // "Jane S." — no full name in transport
  originalStatus: 'new' | 'matched';
  provider: {
    id: string;
    npi: string;
    name: string;
    specialty: string | null;
    rationale: string;
  };
  message: string;
  error?: string;
}

async function prepareOne(referralId: string, supabase: ReturnType<typeof createServiceClient>): Promise<BulkProposal> {
  const { data: referral, error } = await supabase
    .from('referrals')
    .select('*, patients (*), providers:matched_provider_id (*)')
    .eq('id', referralId)
    .single();

  if (error || !referral) throw new Error('Referral not found');

  const patient = referral.patients;
  const originalStatus = referral.status as 'new' | 'matched';
  const patientLabel = `${patient.first_name} ${patient.last_name.charAt(0)}.`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kept-alpha.vercel.app';
  const bookingLink = `${appUrl}/book/${referralId}`;

  let provider = referral.providers as any;

  // ── For new referrals: pick top provider from our network ──
  if (originalStatus === 'new') {
    const { data: networkProviders } = await supabase
      .from('providers')
      .select('*')
      .eq('is_accepting_new', true)
      .order('average_rating', { ascending: false, nullsFirst: false });

    const candidates = (networkProviders || []).filter((p: any) => p.bio);

    if (!candidates.length) throw new Error('No network providers available');

    const pickMsg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: 'You are a care coordination assistant. Pick the single best provider for this patient and write a one-sentence rationale a coordinator would find useful. Return JSON only: {"npi":"...","rationale":"..."}',
      messages: [{
        role: 'user',
        content: `Patient ZIP: ${patient.zip_code}, Insurance: ${patient.insurance || 'Unknown'}, PHQ-9: ${referral.phq9_score}, Context: ${referral.diagnosis_context || 'Behavioral health referral'}\n\nProviders:\n${JSON.stringify(candidates.map((p: any) => ({ npi: p.npi, name: p.full_name, specialty: p.specialty, insurance: p.accepts_insurance, languages: p.languages, rating: p.average_rating, bio: p.bio?.substring(0, 120) })))}`,
      }],
    });

    let pick: { npi: string; rationale: string };
    try {
      const text = (pickMsg.content[0] as any).text;
      pick = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
    } catch {
      pick = { npi: candidates[0].npi, rationale: 'Best available match in network.' };
    }

    const matched = candidates.find((p: any) => p.npi === pick.npi) || candidates[0];

    // Auto-select: move referral to matched
    await supabase
      .from('referrals')
      .update({ status: 'matched', matched_provider_id: matched.id })
      .eq('id', referralId);

    provider = { ...matched, rationale: pick.rationale };
  }

  if (!provider) throw new Error('No provider associated with referral');

  // ── Generate outreach message ──
  const { data: practice } = await supabase
    .from('practices')
    .select('name')
    .eq('id', referral.practice_id)
    .single();

  const providerLocation = [provider.address_line, provider.city, provider.state].filter(Boolean).join(', ');

  const smsMsg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: `You write SMS messages for a care coordinator. Text a patient to help them book with a therapist their doctor recommended. Sound like a real person — warm, brief, human. RULES: Use patient's first name. Mention their doctor. Mention the provider's name and one specific detail. Include the booking link exactly as given. Never mention PHQ-9, depression, anxiety, or any diagnosis. Under 280 characters. ${referral.phq9_score >= 20 ? 'Add on a new line at the end: "If you need immediate support, call or text 988 anytime."' : ''} Return ONLY the SMS text.`,
    messages: [{
      role: 'user',
      content: `Patient: ${patient.first_name}, Insurance: ${patient.insurance || 'Unknown'}, Doctor: ${referral.referring_pcp_name}, Practice: ${practice?.name || 'the practice'}\nProvider: ${provider.full_name}, ${provider.credential || 'Therapist'}, ${providerLocation || 'nearby'}, Telehealth: ${provider.telehealth_available ? 'yes' : 'no'}\nBooking link: ${bookingLink}`,
    }],
  });

  const message = (smsMsg.content[0] as any).text.trim();

  return {
    referralId,
    patientLabel,
    originalStatus,
    provider: {
      id: provider.id,
      npi: provider.npi,
      name: provider.full_name,
      specialty: provider.specialty || null,
      rationale: provider.rationale || '',
    },
    message,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { referralIds } = await request.json() as { referralIds: string[] };

    if (!Array.isArray(referralIds) || referralIds.length === 0) {
      return NextResponse.json({ error: 'No referral IDs provided' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const results = await Promise.allSettled(
      referralIds.map((id) => prepareOne(id, supabase))
    );

    const proposals: BulkProposal[] = results.map((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      return {
        referralId: referralIds[i],
        patientLabel: 'Unknown',
        originalStatus: 'new',
        provider: { id: '', npi: '', name: '', specialty: null, rationale: '' },
        message: '',
        error: result.reason?.message || 'Failed to prepare',
      };
    });

    return NextResponse.json({ proposals });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
