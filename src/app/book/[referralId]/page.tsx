'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Clock, User, Loader2, CheckCircle2, Calendar } from 'lucide-react';

interface BookingData {
  referral: { id: string; status: string; appointment_date: string | null };
  patient: { first_name: string };
  provider: {
    full_name: string;
    credential: string | null;
    specialty: string | null;
    address_line: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    phone: string | null;
  } | null;
  slots: string[];
}

export default function PatientBookingPage() {
  const router = useRouter();
  const params = useParams();
  const referralId = params.referralId as string;

  const [data, setData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchBookingData = async () => {
      try {
        const res = await fetch(`/api/book/${referralId}`);
        const json = await res.json();
        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
          // If already booked, redirect to confirmed
          if (json.referral.status === 'booked' || json.referral.status === 'kept') {
            router.push(`/book/${referralId}/confirmed`);
          }
        }
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchBookingData();
  }, [referralId, router]);

  const handleBook = async (slot: string) => {
    setBookingSlot(slot);
    try {
      const res = await fetch(`/api/book/${referralId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentDate: slot }),
      });
      const json = await res.json();
      if (json.success) {
        router.push(`/book/${referralId}/confirmed?date=${encodeURIComponent(slot)}&provider=${encodeURIComponent(data?.provider?.full_name || '')}`);
      } else {
        setError(json.error || 'Failed to book. Please try again.');
        setBookingSlot(null);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setBookingSlot(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-kept-bg flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-kept-sage animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-kept-bg flex items-center justify-center p-4">
        <Card className="max-w-sm w-full border-0 shadow-lg">
          <CardContent className="p-6 text-center">
            <p className="text-kept-dark font-medium">{error || 'Unable to load booking page'}</p>
            <p className="text-sm text-kept-gray mt-2">
              If you need help, please call your doctor's office.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { patient, provider, slots } = data;

  return (
    <div className="min-h-screen bg-kept-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">
        {/* Greeting */}
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-kept-sage-light rounded-full mb-3">
            <Calendar className="w-6 h-6 text-kept-sage" />
          </div>
          <h1 className="text-xl font-bold text-kept-dark">
            Hi {patient.first_name}, pick a time that works
          </h1>
          <p className="text-sm text-kept-gray mt-1">
            One tap and you're booked.
          </p>
        </div>

        {/* Provider Card */}
        {provider && (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-kept-sage-light rounded-full flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-kept-sage" />
                </div>
                <div>
                  <h2 className="font-semibold text-kept-dark">
                    {provider.full_name}
                    {provider.credential ? `, ${provider.credential}` : ''}
                  </h2>
                  <p className="text-sm text-kept-gray">{provider.specialty}</p>
                  {provider.address_line && (
                    <p className="text-xs text-kept-gray mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {[provider.address_line, provider.city, provider.state].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Time Slots */}
        <div className="space-y-3">
          {slots.map((slot, index) => {
            const date = new Date(slot);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
            const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const isSelected = bookingSlot === slot;
            const isDisabled = bookingSlot !== null;

            return (
              <Button
                key={index}
                onClick={() => handleBook(slot)}
                disabled={isDisabled}
                className={`w-full h-auto py-4 px-5 text-left border rounded-xl transition-all shadow-sm ${
                  isSelected
                    ? 'bg-kept-sage border-kept-sage text-white'
                    : isDisabled
                    ? 'bg-white border-kept-sage/10 opacity-40 cursor-not-allowed'
                    : 'bg-white hover:bg-kept-sage-light/50 border-kept-sage/15 hover:border-kept-sage/40'
                }`}
                variant="outline"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isSelected ? 'bg-white/20' : 'bg-kept-sage-light'}`}>
                      <Clock className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-kept-sage'}`} />
                    </div>
                    <div>
                      <p className={`font-semibold text-base ${isSelected ? 'text-white' : 'text-kept-dark'}`}>{dayName}</p>
                      <p className={`text-sm ${isSelected ? 'text-white/80' : 'text-kept-gray'}`}>{dateStr} at {timeStr}</p>
                    </div>
                  </div>
                  {isSelected ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-kept-sage/30" />
                  )}
                </div>
              </Button>
            );
          })}
        </div>

        <p className="text-xs text-center text-kept-gray pt-2">
          Sent by your doctor's office to help you get connected.
        </p>
      </div>
    </div>
  );
}
