import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('referrals')
      .select(`
        *,
        patients (*),
        providers:matched_provider_id (*)
      `)
      .order('hedis_window_closes_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const response = NextResponse.json(data);
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch referrals' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const {
      firstName,
      lastName,
      phone,
      zipCode,
      insurance,
      phq9Score,
      pcpName,
      diagnosisContext,
      consentGiven,
    } = await request.json();

    if (!firstName || !lastName || !zipCode || !pcpName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const practiceId = 'a1000000-0000-0000-0000-000000000001';

    // Create patient
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .insert({
        practice_id: practiceId,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        zip_code: zipCode,
        insurance: insurance || null,
        consent_given: consentGiven ?? false,
        consent_given_at: consentGiven ? new Date().toISOString() : null,
        consent_method: consentGiven ? 'verbal' : null,
      })
      .select()
      .single();

    if (patientError) {
      return NextResponse.json({ error: patientError.message }, { status: 500 });
    }

    // HEDIS window: 30 days from today
    const hedisWindowClosesAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Create referral
    const { data: referral, error: referralError } = await supabase
      .from('referrals')
      .insert({
        practice_id: practiceId,
        patient_id: patient.id,
        referring_pcp_name: pcpName,
        phq9_score: phq9Score ? Number(phq9Score) : null,
        diagnosis_context: diagnosisContext || null,
        high_complexity: phq9Score && Number(phq9Score) >= 20,
        status: 'new',
        hedis_window_closes_at: hedisWindowClosesAt,
      })
      .select()
      .single();

    if (referralError) {
      return NextResponse.json({ error: referralError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, referralId: referral.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
