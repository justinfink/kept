import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import twilio from 'twilio';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { referralId, content } = await request.json();

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

    // Check consent
    if (!patient.consent_given) {
      return NextResponse.json(
        { error: 'Patient has not given consent for outreach' },
        { status: 403 }
      );
    }

    if (!patient.phone) {
      return NextResponse.json(
        { error: 'Patient has no phone number on file' },
        { status: 400 }
      );
    }

    // Replace booking link placeholder
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const bookingLink = `${appUrl}/book/${referralId}`;
    const finalContent = content.replace('[BOOKING_LINK]', bookingLink);

    let twilioSid = null;

    // Send via Twilio if configured
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      const message = await twilioClient.messages.create({
        body: finalContent,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: patient.phone,
      });

      twilioSid = message.sid;
    }

    // Log to outreach_events
    const { error: logError } = await supabase.from('outreach_events').insert({
      referral_id: referralId,
      channel: 'sms',
      event_type: 'initial',
      content: finalContent,
      recipient_phone: patient.phone,
      booking_link: bookingLink,
      twilio_sid: twilioSid,
      sent_at: new Date().toISOString(),
    });

    if (logError) {
      console.error('Failed to log outreach event:', logError);
    }

    // Update referral status
    await supabase
      .from('referrals')
      .update({
        status: 'outreach_sent',
        outreach_sent_at: new Date().toISOString(),
      })
      .eq('id', referralId);

    return NextResponse.json({
      success: true,
      twilioSid,
      bookingLink,
      content: finalContent,
    });
  } catch (err: any) {
    console.error('Send outreach error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to send outreach' },
      { status: 500 }
    );
  }
}
