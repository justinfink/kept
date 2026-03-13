import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import twilio from 'twilio';

export interface BulkSendItem {
  referralId: string;
  providerId: string;
  message: string;
}

export interface BulkSendResult {
  referralId: string;
  success: boolean;
  error?: string;
}

async function sendOne(
  item: BulkSendItem,
  supabase: ReturnType<typeof createServiceClient>,
  twilioClient: ReturnType<typeof twilio> | null,
  twilioFrom: string | undefined
): Promise<BulkSendResult> {
  const { data: referral, error } = await supabase
    .from('referrals')
    .select('*, patients (*)')
    .eq('id', item.referralId)
    .single();

  if (error || !referral) {
    return { referralId: item.referralId, success: false, error: 'Referral not found' };
  }

  const patient = referral.patients;

  if (!patient.consent_given) {
    return { referralId: item.referralId, success: false, error: 'Patient consent not given' };
  }

  if (!patient.phone) {
    return { referralId: item.referralId, success: false, error: 'No phone number on file' };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kept-alpha.vercel.app';
  const bookingLink = `${appUrl}/book/${item.referralId}`;

  let twilioSid: string | null = null;

  if (twilioClient && twilioFrom) {
    try {
      const msg = await twilioClient.messages.create({
        body: item.message,
        from: twilioFrom,
        to: patient.phone,
      });
      twilioSid = msg.sid;
    } catch (err: any) {
      return { referralId: item.referralId, success: false, error: `SMS failed: ${err.message}` };
    }
  }

  await supabase.from('outreach_events').insert({
    referral_id: item.referralId,
    channel: 'sms',
    event_type: 'initial',
    content: item.message,
    recipient_phone: patient.phone,
    booking_link: bookingLink,
    twilio_sid: twilioSid,
    sent_at: new Date().toISOString(),
  });

  await supabase
    .from('referrals')
    .update({ status: 'outreach_sent', outreach_sent_at: new Date().toISOString() })
    .eq('id', item.referralId);

  return { referralId: item.referralId, success: true };
}

export async function POST(request: NextRequest) {
  try {
    const { items } = await request.json() as { items: BulkSendItem[] };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const twilioClient =
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
        : null;

    const results = await Promise.allSettled(
      items.map((item) => sendOne(item, supabase, twilioClient, process.env.TWILIO_PHONE_NUMBER))
    );

    const sendResults: BulkSendResult[] = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { referralId: items[i].referralId, success: false, error: r.reason?.message };
    });

    const succeeded = sendResults.filter((r) => r.success).length;
    const failed = sendResults.filter((r) => !r.success).length;

    return NextResponse.json({ results: sendResults, succeeded, failed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
