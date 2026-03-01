import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

async function queryNPPES(taxonomy: string, zipCode: string): Promise<any[]> {
  const url = new URL('https://npiregistry.cms.hhs.gov/api/');
  url.searchParams.set('version', '2.1');
  url.searchParams.set('taxonomy_description', taxonomy);
  url.searchParams.set('postal_code', zipCode);
  url.searchParams.set('limit', '10');

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

function formatNPPESProvider(r: any) {
  const basic = r.basic || {};
  const address = r.addresses?.[0] || {};
  const taxonomy = r.taxonomies?.[0] || {};
  return {
    npi: r.number,
    name: `${basic.first_name || ''} ${basic.last_name || basic.organization_name || ''}`.trim(),
    credential: basic.credential || '',
    specialty: taxonomy.desc || '',
    address: address.address_1 || '',
    city: address.city || '',
    state: address.state || '',
    zip: address.postal_code?.substring(0, 5) || '',
    phone: address.telephone_number || '',
    source: 'nppes' as const,
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { referralId } = await request.json();

    const { data: referral, error: refError } = await supabase
      .from('referrals')
      .select('*, patients (*)')
      .eq('id', referralId)
      .single();

    if (refError || !referral) {
      return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
    }

    const patient = referral.patients;

    // STEP 1: Check our own provider network first (rich profiles)
    const { data: networkProviders } = await supabase
      .from('providers')
      .select('*')
      .eq('is_accepting_new', true)
      .order('average_rating', { ascending: false, nullsFirst: false });

    const enrichedNetworkProviders = (networkProviders || [])
      .filter((p: any) => p.bio) // Only include providers with full profiles
      .map((p: any) => ({
        npi: p.npi,
        name: p.full_name,
        credential: p.credential || '',
        specialty: p.specialty || '',
        address: p.address_line || '',
        city: p.city || '',
        state: p.state || '',
        zip: p.zip_code || '',
        phone: p.phone || '',
        // Rich data for Claude
        bio: p.bio || '',
        approach: p.approach || '',
        languages: p.languages || [],
        accepts_insurance: p.accepts_insurance || [],
        telehealth_available: p.telehealth_available || false,
        earliest_availability: p.earliest_availability || 'Unknown',
        average_rating: p.average_rating || null,
        review_count: p.review_count || 0,
        source: 'network' as const,
      }));

    // STEP 2: Also query NPPES for additional options
    const taxonomies = ['Psychiatry', 'Psycholog', 'Social Worker', 'Counselor'];
    const allNPPES = await Promise.all(
      taxonomies.map((t) => queryNPPES(t, patient.zip_code))
    );

    const seen = new Set<string>(enrichedNetworkProviders.map((p: any) => p.npi));
    const nppesProviders: any[] = [];
    for (const results of allNPPES) {
      for (const r of results) {
        if (!seen.has(r.number)) {
          seen.add(r.number);
          nppesProviders.push(formatNPPESProvider(r));
        }
      }
    }

    // Combine: network providers first, then NPPES
    const allProviders = [...enrichedNetworkProviders, ...nppesProviders];

    if (allProviders.length === 0) {
      return NextResponse.json({
        error: 'No behavioral health providers found in this area',
      }, { status: 404 });
    }

    // Claude ranks top 3 using all available data
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: `You are a care coordination assistant matching a patient to the best behavioral health provider.

You have two types of providers:
1. "network" providers — from our vetted provider network with detailed profiles, patient ratings, insurance info, bios, and therapeutic approach. STRONGLY prefer these.
2. "nppes" providers — from the national NPI registry with basic info only. Use as fallback.

Rank the top 3 providers. For each, write a 1-2 sentence "rationale" that a coordinator would find useful — explain WHY this provider is a good fit for THIS specific patient. Reference specific details: their approach, language match, insurance coverage, availability, rating, etc.

Return JSON only. No markdown, no code fences.
Shape: {"providers": [{"npi": "...", "name": "...", "credential": "...", "specialty": "...", "rationale": "...", "availability": "...", "rating": ..., "languages": [...], "telehealth": true/false, "accepts_patient_insurance": true/false}]}

Set accepts_patient_insurance to true if the provider's insurance list includes the patient's insurance, false otherwise.`,
      messages: [
        {
          role: 'user',
          content: `PATIENT:
- Name: ${patient.first_name} ${patient.last_name}
- ZIP: ${patient.zip_code}
- Insurance: ${patient.insurance || 'Unknown'}
- PHQ-9 score: ${referral.phq9_score}
- High complexity: ${referral.high_complexity ? 'Yes' : 'No'}
- Diagnosis context: ${referral.diagnosis_context || 'Behavioral health referral'}

AVAILABLE PROVIDERS:
${JSON.stringify(allProviders, null, 2)}`,
        },
      ],
    });

    const responseText = (message.content[0] as any).text;
    let ranked;
    try {
      ranked = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        ranked = JSON.parse(jsonMatch[0]);
      } else {
        return NextResponse.json({ error: 'Failed to parse provider rankings' }, { status: 500 });
      }
    }

    // Upsert any NPPES-only providers into our DB
    for (const p of ranked.providers || []) {
      const nppesMatch = nppesProviders.find((np: any) => np.npi === p.npi);
      if (nppesMatch) {
        await supabase
          .from('providers')
          .upsert({
            npi: p.npi,
            full_name: p.name,
            credential: p.credential || nppesMatch.credential || '',
            specialty: p.specialty || nppesMatch.specialty || '',
            address_line: nppesMatch.address || '',
            city: nppesMatch.city || '',
            state: nppesMatch.state || '',
            zip_code: nppesMatch.zip || '',
            phone: nppesMatch.phone || '',
            is_accepting_new: true,
            nppes_last_updated: new Date().toISOString().split('T')[0],
          }, { onConflict: 'npi' });
      }
    }

    // Enrich response with address from source data
    const enrichedProviders = (ranked.providers || []).map((p: any) => {
      const networkMatch = enrichedNetworkProviders.find((np: any) => np.npi === p.npi);
      const nppesMatch = nppesProviders.find((np: any) => np.npi === p.npi);
      const source = networkMatch || nppesMatch;
      return {
        ...p,
        address: source?.address || '',
        city: source?.city || '',
        state: source?.state || '',
        zip: source?.zip || '',
        phone: source?.phone || '',
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
