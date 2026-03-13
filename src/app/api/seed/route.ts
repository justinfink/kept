import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

const PRACTICE_ID = 'a1000000-0000-0000-0000-000000000001';

const PATIENTS = [
  {
    first_name: 'Test',
    last_name: 'Patient1',
    phone: '+15551230001',
    zip_code: '10001',
    insurance: 'Medicaid',
    consent_given: true,
    consent_method: 'verbal',
    referral: {
      referring_pcp_name: 'Dr. Linda Park',
      phq9_score: 15,
      diagnosis_context: 'Behavioral health referral. Prefers female provider. Spanish-speaking.',
      high_complexity: false,
    },
  },
  {
    first_name: 'Test',
    last_name: 'Patient2',
    phone: '+15551230002',
    zip_code: '10002',
    insurance: 'BlueCross BlueShield',
    consent_given: true,
    consent_method: 'verbal',
    referral: {
      referring_pcp_name: 'Dr. Alan Weiss',
      phq9_score: 22,
      diagnosis_context: 'Behavioral health referral. Trauma history. Requires trauma-informed provider.',
      high_complexity: true,
    },
  },
  {
    first_name: 'Test',
    last_name: 'Patient3',
    phone: '+15551230003',
    zip_code: '10003',
    insurance: 'Aetna',
    consent_given: true,
    consent_method: 'written',
    referral: {
      referring_pcp_name: 'Dr. Sarah Goldberg',
      phq9_score: 11,
      diagnosis_context: 'Behavioral health referral. Prefers telehealth.',
      high_complexity: false,
    },
  },
  {
    first_name: 'Test',
    last_name: 'Patient4',
    phone: '+15551230004',
    zip_code: '10004',
    insurance: 'Medicare',
    consent_given: true,
    consent_method: 'verbal',
    referral: {
      referring_pcp_name: 'Dr. Michael Torres',
      phq9_score: 18,
      diagnosis_context: 'Behavioral health referral. Older adult. Dual-diagnosis history.',
      high_complexity: true,
    },
  },
  {
    first_name: 'Test',
    last_name: 'Patient5',
    phone: '+15551230005',
    zip_code: '10005',
    insurance: 'UnitedHealthcare',
    consent_given: true,
    consent_method: 'verbal',
    referral: {
      referring_pcp_name: 'Dr. Jessica Kim',
      phq9_score: 8,
      diagnosis_context: 'Behavioral health referral. Prefers CBT. Evening/weekend availability preferred.',
      high_complexity: false,
    },
  },
];

export async function POST() {
  try {
    const supabase = createServiceClient();
    const created: { patient: string; referralId: string; status: string }[] = [];

    for (const p of PATIENTS) {
      const { referral: referralData, ...patientData } = p;

      const { data: patient, error: patientError } = await supabase
        .from('patients')
        .insert({
          ...patientData,
          practice_id: PRACTICE_ID,
          consent_given_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (patientError) {
        return NextResponse.json(
          { error: `Failed to create patient ${patientData.first_name}: ${patientError.message}` },
          { status: 500 }
        );
      }

      const hedisWindowClosesAt = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: referral, error: referralError } = await supabase
        .from('referrals')
        .insert({
          practice_id: PRACTICE_ID,
          patient_id: patient.id,
          ...referralData,
          status: 'new',
          hedis_window_closes_at: hedisWindowClosesAt,
        })
        .select()
        .single();

      if (referralError) {
        return NextResponse.json(
          { error: `Failed to create referral for ${patientData.first_name}: ${referralError.message}` },
          { status: 500 }
        );
      }

      created.push({
        patient: `${patientData.first_name} ${patientData.last_name}`,
        referralId: referral.id,
        status: 'new',
      });
    }

    return NextResponse.json({ success: true, created });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
