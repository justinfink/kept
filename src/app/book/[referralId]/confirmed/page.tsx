'use client';

import { useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Calendar, User } from 'lucide-react';

export default function BookingConfirmedPage() {
  const searchParams = useSearchParams();
  const dateStr = searchParams.get('date');
  const providerName = searchParams.get('provider');

  const formattedDate = dateStr
    ? new Date(dateStr).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="min-h-screen bg-kept-bg flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <Card className="border-0 shadow-lg overflow-hidden">
          {/* Success Banner */}
          <div className="bg-kept-sage p-6 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-white/20 rounded-full mb-3">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">You're booked</h1>
          </div>

          <CardContent className="p-6 space-y-4">
            {providerName && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-kept-sage-light rounded-full flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-kept-sage" />
                </div>
                <div>
                  <p className="text-xs text-kept-gray">Provider</p>
                  <p className="font-medium text-kept-dark">{providerName}</p>
                </div>
              </div>
            )}

            {formattedDate && (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-kept-sage-light rounded-full flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-kept-sage" />
                </div>
                <div>
                  <p className="text-xs text-kept-gray">Appointment</p>
                  <p className="font-medium text-kept-dark">{formattedDate}</p>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-kept-sage/10">
              <p className="text-sm text-kept-gray leading-relaxed">
                We'll send you a reminder the day before. If you need to reschedule,
                just reply to the text from your doctor's office.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-kept-gray mt-4">
          You've got this. We'll be here if you need anything.
        </p>
      </div>
    </div>
  );
}
