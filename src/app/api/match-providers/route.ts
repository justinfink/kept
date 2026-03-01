import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { referralId } = await request.json();

    // Fetch the referral with patient data
    const { data: referral, error: refError } = await supabase
      .from('referrals')
      .select('*, patients (*)')
      .eq('id', referralId)
      .single();

    if (refError || !referral) {
      return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
    }

    const patient = referral.patients;
    const zipCode = patient.zip_code;

    // Query NPPES for behavioral health providers near patient
    const taxonomies = [
      'Clinical Psychologist',
      'Psychiatry & Neurology',
      'Clinical Social Worker',
      'Mental Health Counselor',
    ];

    const nppesUrl = new URL('https://npiregistry.cms.hhs.gov/api/');
    nppesUrl.searchParams.set('version', '2.1');
    nppesUrl.searchParams.set('taxonomy_description', taxonomies.join(','));
    nppesUrl.searchParams.set('postal_code', zipCode);
    nppesUrl.searchParams.set('limit', '20');

    const nppesResponse = await fetch(nppesUrl.toString());
    const nppesData = await nppesResponse.json();

    if (!nppesData.results || nppesData.results.length === 0) {
      // Fallback: try broader search without postal code filter
      nppesUrl.searchParams.delete('postal_code');
      nppesUrl.searchParams.set('state', 'OR');
      nppesUrl.searchParams.set('city', 'Portland');
      const fallbackResponse = await fetch(nppesUrl.toString());
      const fallbackData = await fallbackResponse.json();

      if (!fallbackData.results || fallbackData.results.length === 0) {
        return NextResponse.json({
          error: 'No behavioral health providers found in this area'
        }, { status: 404 });
      }
      nppesData.results = fallbackData.results;
    }

    // Format NPPES results for Claude
    const formattedProviders = nppesData.results.map((r: any) => {
      const basic = r.basic || {};
      const address = r.addresses?.[0] || {};
      const taxonomy = r.taxonomies?.[0] || {};
      return {
        npi: r.number,
        name: `${basic.first_name || ''} ${basic.last_name || basic.organization_name || ''}`.trim(),
        credential: basic.credential || '',
        specialty: taxonomy.desc || '',
        address: `${address.address_1 || ''}`,
        city: address.city || '',
        state: address.state || '',
        zip: address.postal_code?.substring(0, 5) || '',
        phone: address.telephone_number || '',
      };
    });

    // Claude ranks top 3
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 1024,
      system: `You are a care coordination assistant helping match patients to behavioral health providers.
Given a list of providers from the NPPES registry and a patient's context, rank the top 3
best-fit providers. Consider: specialty match to the patient's needs, geographic proximity,
credential level, and whether the provider type aligns with the diagnosis context.
Return JSON only. No markdown, no code fences. Just the raw JSON object.`,
      messages: [
        {
          role: 'user',
          content: `Patient context:
- ZIP: ${patient.zip_code}
- Insurance: ${patient.insurance || 'Unknown'}
- PHQ-9 score: ${referral.phq9_score}
- Diagnosis context: ${referral.diagnosis_context || 'Behavioral health referral'}

Available providers (from NPPES):
${JSON.stringify(formattedProviders, null, 2)}`,
        },
      ],
    });

    const responseText = (message.content[0] as any).text;
    let ranked;
    try {
      ranked = JSON.parse(responseText);
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        ranked = JSON.parse(jsonMatch[0]);
      } else {
        return NextResponse.json({ error: 'Failed to parse provider rankings' }, { status: 500 });
      }
    }

    // Cache providers in the providers table (upsert by NPI)
    const providersToCache = (ranked.providers || []).map((p: any) => {
      const nppesMatch = formattedProviders.find((np: any) => np.npi === p.npi);
      return {
        npi: p.npi,
        full_name: p.name,
        credential: p.credential || nppesMatch?.credential || '',
        specialty: p.specialty || nppesMatch?.specialty || '',
        address_line: nppesMatch?.address || '',
        city: nppesMatch?.city || '',
        state: nppesMatch?.state || '',
        zip_code: nppesMatch?.zip || '',
        phone: nppesMatch?.phone || '',
        is_accepting_new: true,
        nppes_last_updated: new Date().toISOString().split('T')[0],
      };
    });

    for (const provider of providersToCache) {
      await supabase
        .from('providers')
        .upsert(provider, { onConflict: 'npi' });
    }

    // Attach rationale to each provider
    const enrichedProviders = (ranked.providers || []).map((p: any) => {
      const nppesMatch = formattedProviders.find((np: any) => np.npi === p.npi);
      return {
        ...p,
        address: nppesMatch?.address || '',
        city: nppesMatch?.city || '',
        state: nppesMatch?.state || '',
        zip: nppesMatch?.zip || '',
        phone: nppesMatch?.phone || '',
      };
    });

    return NextResponse.json({ providers: enrichedProviders });
  } catch (err: any) {
    console.error('Match providers error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to match providers' },
      { status: 500 }
    );
  }
}
