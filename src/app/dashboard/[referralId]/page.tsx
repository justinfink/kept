'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ReferralWithPatient, MatchedProvider, OutreachEvent } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Clock,
  Search,
  Send,
  CheckCircle2,
  XCircle,
  X,
  User,
  Phone,
  MapPin,
  FileText,
  AlertTriangle,
  Loader2,
  MessageSquare,
  Bell,
  Mail,
  Calendar,
} from 'lucide-react';

function InlineError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="shrink-0 text-red-400 hover:text-red-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function InlineSuccess({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export default function ReferralDetailPage() {
  const router = useRouter();
  const params = useParams();
  const referralId = params.referralId as string;

  const [referral, setReferral] = useState<ReferralWithPatient | null>(null);
  const [loading, setLoading] = useState(true);
  const [matchedProviders, setMatchedProviders] = useState<MatchedProvider[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [outreachDraft, setOutreachDraft] = useState('');
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [outreachEvents, setOutreachEvents] = useState<OutreachEvent[]>([]);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchReferral = useCallback(async () => {
    try {
      const res = await fetch(`/api/referrals/${referralId}`);
      const data = await res.json();
      if (data.id) {
        setReferral(data);
      }
    } catch (err) {
      console.error('Failed to fetch referral:', err);
    } finally {
      setLoading(false);
    }
  }, [referralId]);

  const fetchOutreachEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/outreach-events?referralId=${referralId}`);
      const data = await res.json();
      if (Array.isArray(data)) setOutreachEvents(data);
    } catch (err) {
      console.error('Failed to fetch outreach events:', err);
    }
  }, [referralId]);

  useEffect(() => {
    fetchReferral();
    fetchOutreachEvents();

    const channel = supabase
      .channel(`referral-${referralId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'referrals', filter: `id=eq.${referralId}` },
        () => fetchReferral()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'outreach_events', filter: `referral_id=eq.${referralId}` },
        () => fetchOutreachEvents()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [referralId, fetchReferral, fetchOutreachEvents]);

  const handleFindMatch = async () => {
    setMatchLoading(true);
    setError('');
    try {
      const res = await fetch('/api/match-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralId }),
      });
      const data = await res.json();
      if (data.providers && data.providers.length > 0) {
        setMatchedProviders(data.providers);
      } else {
        setError(data.error || 'No providers found in this area. Try a different ZIP code.');
      }
    } catch {
      setError('Failed to search for providers. Please try again.');
    } finally {
      setMatchLoading(false);
    }
  };

  const handleSelectProvider = async (provider: MatchedProvider) => {
    setError('');
    setMatchLoading(true);

    try {
      // Use server-side API to look up provider and update referral (bypasses RLS)
      const selectRes = await fetch('/api/select-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralId, npi: provider.npi }),
      });
      const selectData = await selectRes.json();

      if (!selectData.success) {
        setError(selectData.error || 'Could not save provider selection. Please try again.');
        setMatchLoading(false);
        return;
      }

      setMatchedProviders([]);
      setMatchLoading(false);

      // Now generate outreach
      setOutreachLoading(true);
      try {
        const res = await fetch('/api/generate-outreach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referralId, providerId: selectData.providerId }),
        });
        const data = await res.json();
        if (data.content) {
          setOutreachDraft(data.content);
        } else {
          setError('Failed to generate outreach message. You can write one manually below.');
        }
      } catch {
        setError('Failed to generate outreach message.');
      } finally {
        setOutreachLoading(false);
      }

      fetchReferral();
    } catch {
      setError('Could not save provider selection. Please try again.');
      setMatchLoading(false);
    }
  };

  const handleSendOutreach = async () => {
    if (!outreachDraft.trim()) return;
    setSendLoading(true);
    setError('');
    try {
      const res = await fetch('/api/send-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralId, content: outreachDraft }),
      });
      const data = await res.json();
      if (data.success) {
        setOutreachDraft('');
        setSuccess(data.twilioSid
          ? 'SMS sent successfully via Twilio.'
          : 'Outreach logged. Configure Twilio to send real SMS.');
        fetchReferral();
        fetchOutreachEvents();
      } else {
        setError(data.error || 'Failed to send outreach.');
      }
    } catch {
      setError('Failed to send SMS. Please try again.');
    } finally {
      setSendLoading(false);
    }
  };

  const handleMarkKept = async () => {
    setActionLoading('kept');
    setError('');
    try {
      await fetch(`/api/referrals/${referralId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'kept' }),
      });

      await fetch('/api/notify-pcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralId }),
      });

      setSuccess('Appointment marked as kept. PCP has been notified.');
      fetchReferral();
    } catch {
      setError('Failed to update referral status.');
    } finally {
      setActionLoading('');
    }
  };

  const handleMarkNoShow = async () => {
    setActionLoading('no_show');
    setError('');
    try {
      await fetch(`/api/referrals/${referralId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'no_show' }),
      });
      fetchReferral();
    } catch {
      setError('Failed to update referral status.');
    } finally {
      setActionLoading('');
    }
  };

  const handleFollowUp = async () => {
    setOutreachLoading(true);
    setError('');
    try {
      const res = await fetch('/api/generate-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralId }),
      });
      const data = await res.json();
      if (data.content) {
        setOutreachDraft(data.content);
      } else {
        setError('Failed to generate follow-up message.');
      }
    } catch {
      setError('Failed to generate follow-up message.');
    } finally {
      setOutreachLoading(false);
    }
  };

  const handleSendReminder = async () => {
    setActionLoading('reminder');
    setError('');
    try {
      const res = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralId }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Reminder sent.');
      }
      fetchOutreachEvents();
    } catch {
      setError('Failed to send reminder.');
    } finally {
      setActionLoading('');
    }
  };

  if (loading || !referral) {
    return (
      <div className="min-h-screen bg-kept-bg flex items-center justify-center">
        <div className="flex items-center gap-2 text-kept-gray">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading referral...
        </div>
      </div>
    );
  }

  const patient = referral.patients;
  const provider = referral.providers;
  const daysRemaining = Math.ceil(
    (new Date(referral.hedis_window_closes_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const urgencyColor = daysRemaining <= 1 ? 'text-red-600' : daysRemaining <= 4 ? 'text-kept-orange' : 'text-kept-green';

  return (
    <div className="min-h-screen bg-kept-bg">
      {/* Header */}
      <header className="bg-white border-b border-kept-sage/10 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard')}
            className="text-kept-gray hover:text-kept-dark gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <h1 className="text-sm font-medium text-kept-dark">
            {patient.first_name} {patient.last_name}
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Inline notifications */}
        {error && <InlineError message={error} onDismiss={() => setError('')} />}
        {success && <InlineSuccess message={success} />}

        {/* Patient Summary */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl font-bold text-kept-dark">
                    {patient.first_name} {patient.last_name}
                  </h2>
                  <Badge
                    className={
                      referral.status === 'kept'
                        ? 'bg-emerald-50 text-kept-green'
                        : referral.status === 'no_show'
                        ? 'bg-red-50 text-red-700'
                        : referral.status === 'booked'
                        ? 'bg-emerald-50 text-kept-green'
                        : 'bg-kept-sage-light text-kept-sage'
                    }
                  >
                    {referral.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-kept-gray">PHQ-9</span>
                    <p className="font-semibold text-kept-dark">{referral.phq9_score}</p>
                  </div>
                  <div>
                    <span className="text-kept-gray">Insurance</span>
                    <p className="font-semibold text-kept-dark">{patient.insurance || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-kept-gray">ZIP</span>
                    <p className="font-semibold text-kept-dark">{patient.zip_code}</p>
                  </div>
                  <div>
                    <span className="text-kept-gray">PCP</span>
                    <p className="font-semibold text-kept-dark">{referral.referring_pcp_name}</p>
                  </div>
                </div>
              </div>
              <div className={`flex items-center gap-2 text-sm font-medium ${urgencyColor}`}>
                <Clock className="w-4 h-4" />
                {daysRemaining <= 0 ? 'HEDIS window closing today' : `${daysRemaining} days remaining`}
              </div>
            </div>

            {referral.diagnosis_context && (
              <div className="mt-4 p-3 bg-kept-bg rounded-lg">
                <div className="flex items-center gap-1.5 text-xs text-kept-gray mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  Diagnosis Context (internal only)
                </div>
                <p className="text-sm text-kept-dark">{referral.diagnosis_context}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PHQ-9 >= 20 Crisis Alert */}
        {referral.phq9_score && referral.phq9_score >= 20 && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">High Severity - PHQ-9 score of {referral.phq9_score}</p>
                <p className="text-sm text-red-700 mt-1">
                  All outreach for this patient will include the 988 Suicide & Crisis Lifeline number.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Provider Matching Section */}
        {referral.status === 'new' && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-kept-dark flex items-center gap-2">
                <Search className="w-4 h-4 text-kept-sage" />
                Find a Provider Match
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {matchedProviders.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-kept-gray mb-4">
                    Search for behavioral health providers near {patient.zip_code}
                  </p>
                  <Button
                    onClick={handleFindMatch}
                    disabled={matchLoading}
                    className="bg-kept-sage hover:bg-kept-sage/90 text-white gap-2"
                  >
                    {matchLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Searching NPPES & ranking with AI...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Find Match
                      </>
                    )}
                  </Button>
                  {matchLoading && (
                    <p className="text-xs text-kept-gray mt-3 animate-pulse">
                      Querying the NPI registry, then Claude will rank the best matches...
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-kept-gray">
                    Claude ranked these providers based on specialty match, proximity, and patient needs. Select one to continue.
                  </p>
                  {matchedProviders.map((p, i) => (
                    <Card
                      key={p.npi}
                      className="border border-kept-sage/10 hover:border-kept-sage/30 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => handleSelectProvider(p)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-kept-sage bg-kept-sage-light rounded-full w-5 h-5 flex items-center justify-center">
                                {i + 1}
                              </span>
                              <h4 className="font-semibold text-kept-dark">{p.name}</h4>
                              {p.credential && (
                                <span className="text-xs text-kept-gray bg-gray-100 px-1.5 py-0.5 rounded">{p.credential}</span>
                              )}
                            </div>
                            <p className="text-sm text-kept-gray">{p.specialty}</p>

                            {/* Rich provider details */}
                            <div className="flex flex-wrap gap-2 mt-2">
                              {p.rating && (
                                <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                                  {p.rating}/5 rating
                                </span>
                              )}
                              {p.availability && (
                                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                                  {p.availability}
                                </span>
                              )}
                              {p.accepts_patient_insurance && (
                                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                  Accepts insurance
                                </span>
                              )}
                              {p.telehealth && (
                                <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                                  Telehealth
                                </span>
                              )}
                              {p.languages && p.languages.length > 1 && (
                                <span className="text-xs bg-gray-50 text-kept-gray px-2 py-0.5 rounded-full">
                                  {p.languages.join(', ')}
                                </span>
                              )}
                            </div>

                            {(p.city || p.state) && (
                              <p className="text-xs text-kept-gray mt-2 flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {[p.city, p.state].filter(Boolean).join(', ')}
                              </p>
                            )}
                            <p className="text-sm text-kept-sage mt-2 italic leading-relaxed">{p.rationale}</p>
                          </div>
                          <Button
                            size="sm"
                            className="bg-kept-sage hover:bg-kept-sage/90 text-white shrink-0"
                          >
                            Select
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Outreach Sent: Waiting for patient to book */}
        {referral.status === 'outreach_sent' && (
          <Card className="border-0 shadow-sm border-l-4 border-l-kept-orange">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-kept-dark flex items-center gap-2">
                <Clock className="w-4 h-4 text-kept-orange" />
                Waiting for Patient to Book
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-kept-gray">
                Outreach was sent{referral.outreach_sent_at && ` on ${new Date(referral.outreach_sent_at).toLocaleDateString()}`}.
                The patient has a booking link to schedule their appointment.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-kept-sage/30 text-kept-sage hover:bg-kept-sage-light/50 gap-2"
                  onClick={() => {
                    const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
                    navigator.clipboard.writeText(`${appUrl}/book/${referralId}`);
                    setSuccess('Booking link copied to clipboard.');
                    setTimeout(() => setSuccess(''), 3000);
                  }}
                >
                  <Calendar className="w-4 h-4" />
                  Copy Booking Link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-kept-sage/30 text-kept-sage hover:bg-kept-sage-light/50 gap-2"
                  onClick={async () => {
                    setOutreachLoading(true);
                    setError('');
                    try {
                      const providerId = referral.matched_provider_id;
                      if (!providerId) {
                        setError('No provider matched. Please find a match first.');
                        return;
                      }
                      const res = await fetch('/api/generate-outreach', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ referralId, providerId }),
                      });
                      const data = await res.json();
                      if (data.content) {
                        setOutreachDraft(data.content);
                      } else {
                        setError('Failed to generate follow-up message.');
                      }
                    } catch {
                      setError('Failed to generate message.');
                    } finally {
                      setOutreachLoading(false);
                    }
                  }}
                  disabled={outreachLoading}
                >
                  {outreachLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  Re-send Outreach
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-kept-green/30 text-kept-green hover:bg-emerald-50 gap-2"
                  onClick={async () => {
                    setActionLoading('book_manual');
                    try {
                      await fetch(`/api/referrals/${referralId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          status: 'booked',
                          booked_at: new Date().toISOString(),
                          appointment_date: new Date(Date.now() + 3 * 86400000).toISOString(),
                        }),
                      });
                      setSuccess('Manually marked as booked.');
                      fetchReferral();
                    } catch {
                      setError('Failed to update status.');
                    } finally {
                      setActionLoading('');
                    }
                  }}
                  disabled={actionLoading === 'book_manual'}
                >
                  {actionLoading === 'book_manual' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Mark Booked Manually
                </Button>
              </div>

              {/* Show outreach draft for re-send */}
              {outreachDraft && (
                <div className="mt-3 space-y-3">
                  <Textarea
                    value={outreachDraft}
                    onChange={(e) => setOutreachDraft(e.target.value)}
                    rows={3}
                    className="border-kept-sage/20 focus:ring-kept-sage text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${outreachDraft.length > 300 ? 'text-red-500' : 'text-kept-gray'}`}>
                      {outreachDraft.length}/300 characters
                    </span>
                    <Button
                      onClick={handleSendOutreach}
                      disabled={sendLoading || !outreachDraft.trim()}
                      className="bg-kept-sage hover:bg-kept-sage/90 text-white gap-2"
                      size="sm"
                    >
                      {sendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Send SMS
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Matched Provider Info */}
        {provider && referral.status !== 'new' && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-kept-dark flex items-center gap-2">
                <User className="w-4 h-4 text-kept-sage" />
                Matched Provider
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold text-kept-dark">
                    {provider.full_name}{provider.credential ? `, ${provider.credential}` : ''}
                  </h4>
                  <p className="text-sm text-kept-gray">{provider.specialty}</p>
                </div>

                {provider.bio && (
                  <p className="text-sm text-kept-dark leading-relaxed">{provider.bio}</p>
                )}

                {provider.approach && (
                  <div className="p-3 bg-kept-bg rounded-lg">
                    <p className="text-xs text-kept-gray mb-1 font-medium">Therapeutic Approach</p>
                    <p className="text-sm text-kept-dark">{provider.approach}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {provider.average_rating && (
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full">
                      {provider.average_rating}/5 from {provider.review_count} patients
                    </span>
                  )}
                  {provider.earliest_availability && (
                    <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">
                      Available: {provider.earliest_availability}
                    </span>
                  )}
                  {provider.telehealth_available && (
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">
                      Telehealth available
                    </span>
                  )}
                  {provider.languages && provider.languages.length > 1 && (
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                      {provider.languages.join(', ')}
                    </span>
                  )}
                </div>

                {provider.accepts_insurance && provider.accepts_insurance.length > 0 && (
                  <p className="text-xs text-kept-gray">
                    Accepts: {provider.accepts_insurance.join(', ')}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-kept-gray pt-1">
                  {provider.address_line && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {[provider.address_line, provider.city, provider.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                  {provider.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {provider.phone}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Outreach Draft / Send Section */}
        {(referral.status === 'matched' || outreachDraft) && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-kept-dark flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-kept-sage" />
                Outreach Message
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {outreachLoading ? (
                <div className="flex items-center gap-2 text-kept-gray text-sm py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Claude is drafting a warm, non-clinical message...
                </div>
              ) : (
                <>
                  <Textarea
                    value={outreachDraft}
                    onChange={(e) => setOutreachDraft(e.target.value)}
                    rows={4}
                    className="border-kept-sage/20 focus:ring-kept-sage text-sm"
                    placeholder="SMS message will appear here..."
                  />
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${outreachDraft.length > 300 ? 'text-red-500 font-medium' : 'text-kept-gray'}`}>
                      {outreachDraft.length}/300 characters
                    </span>
                    <Button
                      onClick={handleSendOutreach}
                      disabled={sendLoading || !outreachDraft.trim()}
                      className="bg-kept-sage hover:bg-kept-sage/90 text-white gap-2"
                    >
                      {sendLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Send SMS
                    </Button>
                  </div>
                  <p className="text-xs text-kept-gray">
                    Review this message before sending. You can edit anything above.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Booked: Appointment Actions */}
        {referral.status === 'booked' && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-kept-dark flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-kept-green" />
                Appointment Booked
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {referral.appointment_date && (
                <p className="text-sm text-kept-dark">
                  Scheduled for{' '}
                  <strong>
                    {new Date(referral.appointment_date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </strong>
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleSendReminder}
                  disabled={actionLoading === 'reminder'}
                  variant="outline"
                  className="border-kept-sage/30 text-kept-sage hover:bg-kept-sage-light/50 gap-2"
                >
                  {actionLoading === 'reminder' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Bell className="w-4 h-4" />
                  )}
                  Send Reminder
                </Button>
                <Button
                  onClick={handleMarkKept}
                  disabled={actionLoading === 'kept'}
                  className="bg-kept-green hover:bg-kept-green/90 text-white gap-2"
                >
                  {actionLoading === 'kept' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Mark as Kept
                </Button>
                <Button
                  onClick={handleMarkNoShow}
                  disabled={actionLoading === 'no_show'}
                  variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50 gap-2"
                >
                  {actionLoading === 'no_show' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  No Show
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No Show: Follow-up */}
        {referral.status === 'no_show' && (
          <Card className="border-0 shadow-sm border-l-4 border-l-kept-orange">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-kept-dark flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-kept-orange" />
                No Show - Follow Up Needed
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {outreachDraft ? (
                <>
                  <Textarea
                    value={outreachDraft}
                    onChange={(e) => setOutreachDraft(e.target.value)}
                    rows={4}
                    className="border-kept-sage/20 focus:ring-kept-sage text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-kept-gray">{outreachDraft.length}/300 characters</span>
                    <Button
                      onClick={handleSendOutreach}
                      disabled={sendLoading}
                      className="bg-kept-sage hover:bg-kept-sage/90 text-white gap-2"
                    >
                      {sendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Send Follow-Up
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  onClick={handleFollowUp}
                  disabled={outreachLoading}
                  className="bg-kept-amber hover:bg-kept-amber/90 text-white gap-2"
                >
                  {outreachLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <MessageSquare className="w-4 h-4" />
                  )}
                  Generate Follow-Up Message
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Kept: Success */}
        {referral.status === 'kept' && (
          <Card className="border-0 shadow-sm bg-emerald-50 border border-kept-green/20">
            <CardContent className="p-5 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-kept-green shrink-0" />
              <div>
                <h3 className="font-semibold text-kept-green">Appointment Kept</h3>
                <p className="text-sm text-kept-dark mt-1">
                  {patient.first_name} attended their appointment
                  {referral.appointment_kept_at &&
                    ` on ${new Date(referral.appointment_kept_at).toLocaleDateString()}`
                  }. PCP has been notified.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Outreach History */}
        {outreachEvents.length > 0 && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-kept-dark flex items-center gap-2">
                <Mail className="w-4 h-4 text-kept-sage" />
                Outreach History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {outreachEvents.map((event) => (
                  <div
                    key={event.id}
                    className="p-3 bg-kept-bg rounded-lg border border-kept-sage/5"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge className="text-xs bg-kept-sage-light text-kept-sage">
                        {event.channel.toUpperCase()}
                      </Badge>
                      <Badge className="text-xs bg-gray-100 text-kept-gray">
                        {event.event_type.replace('_', ' ')}
                      </Badge>
                      <span className="text-xs text-kept-gray">
                        {new Date(event.sent_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-kept-dark">{event.content}</p>
                    {event.twilio_sid && (
                      <p className="text-xs text-kept-gray mt-1">Twilio SID: {event.twilio_sid}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
