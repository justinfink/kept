import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import twilio from 'twilio';

export async function GET(
  request: NextRequest,
  { params }: { params: { referralId: string } }
) {
  try {
    const supabase = createServiceClient();
    const { referralId } = params;

    const { data: referral, error } = await supabase
      .from('referrals')
      .select('*, patients (first_name, last_name), providers:matched_provider_id (*)')
      .eq('id', referralId)
      .single();

    if (error || !referral) {
      return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
    }

    // Generate 3 mock available slots in the next 7 days
    const slots = [];
    const now = new Date();
    for (let i = 1; i <= 3; i++) {
      const slotDate = new Date(now);
      slotDate.setDate(now.getDate() + i + Math.floor(Math.random() * 3));
      // Set hours between 9am and 4pm
      slotDate.setHours(9 + Math.floor(Math.random() * 7), Math.random() > 0.5 ? 0 : 30, 0, 0);
      slots.push(slotDate.toISOString());
    }

    return NextResponse.json({
      referral: {
        id: referral.id,
        status: referral.status,
        appointment_date: referral.appointment_date,
      },
      patient: {
        first_name: referral.patients.first_name,
      },
      provider: referral.providers,
      slots,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch booking data' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { referralId: string } }
) {
  try {
    const supabase = createServiceClient();
    const { referralId } = params;
    const { appointmentDate } = await request.json();

    // Fetch referral to get patient info
    const { data: referral, error: refError } = await supabase
      .from('referrals')
      .select('*, patients (*), providers:matched_provider_id (*)')
      .eq('id', referralId)
      .single();

    if (refError || !referral) {
      return NextResponse.json({ error: 'Referral not found' }, { status: 404 });
    }

    // Update referral with appointment
    const { error: updateError } = await supabase
      .from('referrals')
      .update({
        appointment_date: appointmentDate,
        appointment_location: referral.providers
          ? `${referral.providers.address_line || ''}, ${referral.providers.city || ''}, ${referral.providers.state || ''}`
          : '',
        status: 'booked',
        booked_at: new Date().toISOString(),
      })
      .eq('id', referralId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Send confirmation SMS to patient
    const patient = referral.patients;
    if (patient.phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      const providerName = referral.providers?.full_name || 'your provider';
      const dateStr = new Date(appointmentDate).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      const confirmMsg = `${patient.first_name}, you're all set. Your appointment with ${providerName} is confirmed for ${dateStr}. We'll send a reminder the day before.`;

      try {
        const msg = await twilioClient.messages.create({
          body: confirmMsg,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: patient.phone,
        });

        // Log confirmation outreach
        await supabase.from('outreach_events').insert({
          referral_id: referralId,
          channel: 'sms',
          event_type: 'confirmation',
          content: confirmMsg,
          recipient_phone: patient.phone,
          twilio_sid: msg.sid,
          sent_at: new Date().toISOString(),
        });
      } catch (smsErr) {
        console.error('Failed to send confirmation SMS:', smsErr);
      }
    }

    return NextResponse.json({ success: true, appointmentDate });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to book appointment' },
      { status: 500 }
    );
  }
}
