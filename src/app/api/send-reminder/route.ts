import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import twilio from 'twilio';

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

    if (!patient.phone) {
      return NextResponse.json({ error: 'No phone number on file' }, { status: 400 });
    }

    const dateStr = new Date(referral.appointment_date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const reminderMsg = `Hi ${patient.first_name}, just a reminder about your appointment with ${provider?.full_name || 'your provider'} tomorrow, ${dateStr}. You've got this.`;

    let twilioSid = null;

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );

      const msg = await twilioClient.messages.create({
        body: reminderMsg,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: patient.phone,
      });

      twilioSid = msg.sid;
    }

    // Log reminder
    await supabase.from('outreach_events').insert({
      referral_id: referralId,
      channel: 'sms',
      event_type: 'reminder_24h',
      content: reminderMsg,
      recipient_phone: patient.phone,
      twilio_sid: twilioSid,
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, twilioSid });
  } catch (err: any) {
    console.error('Send reminder error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to send reminder' },
      { status: 500 }
    );
  }
}
