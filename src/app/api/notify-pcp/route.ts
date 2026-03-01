import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { Resend } from 'resend';

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
    const statusLabel = referral.status === 'kept' ? 'Appointment kept' : 'Appointment booked';

    const dateStr = referral.appointment_date
      ? new Date(referral.appointment_date).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : 'TBD';

    const emailBody = `Referral update for ${patient.first_name} ${patient.last_name.charAt(0)}.

Status: ${statusLabel}
Provider: ${provider?.full_name || 'N/A'}, ${provider?.credential || ''}
Specialty: ${provider?.specialty || 'Behavioral Health'}
Appointment: ${dateStr}

This is an automated notification from Kept. No action is required on your part.`;

    // Send via Resend if configured
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from: 'Kept <onboarding@resend.dev>',
        to: ['delivered@resend.dev'], // Demo: use Resend test address
        subject: `Referral update: ${patient.first_name} ${patient.last_name.charAt(0)}. - ${statusLabel}`,
        text: emailBody,
      });
    }

    // Update pcp_notified_at
    await supabase
      .from('referrals')
      .update({ pcp_notified_at: new Date().toISOString() })
      .eq('id', referralId);

    return NextResponse.json({ success: true, emailBody });
  } catch (err: any) {
    console.error('Notify PCP error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to notify PCP' },
      { status: 500 }
    );
  }
}
