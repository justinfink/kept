'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ReferralWithPatient, ReferralStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Phone,
  Calendar,
  Search,
  LogOut,
  User,
  Plus,
  Link,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { BulkProposal } from '@/app/api/bulk-prepare/route';

const STATUS_CONFIG: Record<ReferralStatus, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-kept-sage-light text-kept-sage border-kept-sage/20' },
  matched: { label: 'Matched', className: 'bg-kept-sage-light text-kept-sage border-kept-sage/20' },
  outreach_sent: { label: 'Outreach Sent', className: 'bg-kept-amber-light text-kept-orange border-kept-orange/20' },
  booked: { label: 'Booked', className: 'bg-emerald-50 text-kept-green border-kept-green/20' },
  kept: { label: 'Kept', className: 'bg-emerald-50 text-kept-green border-kept-green/20' },
  no_show: { label: 'No Show', className: 'bg-red-50 text-red-700 border-red-200' },
  rebooked: { label: 'Rebooked', className: 'bg-kept-amber-light text-kept-orange border-kept-orange/20' },
  closed: { label: 'Closed', className: 'bg-gray-100 text-kept-gray border-kept-gray/20' },
};

function getDaysRemaining(hedisDate: string): number {
  const now = new Date();
  const closes = new Date(hedisDate);
  return Math.ceil((closes.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getUrgencyColor(days: number): string {
  if (days <= 1) return 'text-red-600';
  if (days <= 4) return 'text-kept-orange';
  return 'text-kept-green';
}

function getUrgencyBg(days: number): string {
  if (days <= 1) return 'bg-red-50 border-red-200';
  if (days <= 4) return 'bg-kept-amber-light border-kept-orange/20';
  return 'bg-kept-sage-light/50 border-kept-sage/10';
}

function getActionButton(status: ReferralStatus): { label: string; icon: React.ReactNode; hint: string } {
  switch (status) {
    case 'new':
      return { label: 'Find Match', icon: <Search className="w-4 h-4" />, hint: 'Match a provider to get started' };
    case 'matched':
      return { label: 'Send Outreach', icon: <Phone className="w-4 h-4" />, hint: 'Provider matched — send patient SMS' };
    case 'outreach_sent':
      return { label: 'View Status', icon: <ArrowRight className="w-4 h-4" />, hint: 'Waiting for patient to book' };
    case 'booked':
      return { label: 'Confirm Kept', icon: <CheckCircle2 className="w-4 h-4" />, hint: 'Appointment scheduled — confirm attendance' };
    case 'no_show':
      return { label: 'Follow Up', icon: <Phone className="w-4 h-4" />, hint: 'Patient no-showed — send follow-up' };
    case 'kept':
      return { label: 'View', icon: <CheckCircle2 className="w-4 h-4" />, hint: 'Appointment kept — PCP notified' };
    default:
      return { label: 'View', icon: <ArrowRight className="w-4 h-4" />, hint: '' };
  }
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  phone: '',
  zipCode: '',
  insurance: '',
  phq9Score: '',
  pcpName: '',
  diagnosisContext: '',
  consentGiven: false,
};

export default function DashboardPage() {
  const router = useRouter();
  const [referrals, setReferrals] = useState<ReferralWithPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'at_risk' | 'action_needed'>('all');

  // New Referral dialog state
  const [showNewReferral, setShowNewReferral] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Per-card copy-link state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Bulk review state
  const [showBulkReview, setShowBulkReview] = useState(false);
  const [bulkProposals, setBulkProposals] = useState<BulkProposal[]>([]);
  const [bulkPreparing, setBulkPreparing] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkExcluded, setBulkExcluded] = useState<Set<string>>(new Set());
  const [bulkMessages, setBulkMessages] = useState<Record<string, string>>({});
  const [bulkExpanded, setBulkExpanded] = useState<Set<string>>(new Set());
  const [bulkSendResults, setBulkSendResults] = useState<Record<string, boolean | null>>({});
  const [bulkSendErrors, setBulkSendErrors] = useState<Record<string, string>>({});

  const fetchReferrals = useCallback(async () => {
    try {
      const res = await fetch('/api/referrals');
      const data = await res.json();
      if (Array.isArray(data)) {
        setReferrals(data);
      }
    } catch (err) {
      console.error('Failed to fetch referrals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReferrals();

    const channel = supabase
      .channel('referrals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'referrals' },
        () => fetchReferrals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReferrals]);

  const handleCopyLink = (e: React.MouseEvent, referralId: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}/book/${referralId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(referralId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewReferral(false);
        setForm(EMPTY_FORM);
        // Navigate directly to the new referral with autoMatch flag
        router.push(`/dashboard/${data.referralId}?autoMatch=true`);
      } else {
        setFormError(data.error || 'Failed to create referral.');
      }
    } catch {
      setFormError('Something went wrong. Please try again.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleOpenBulkReview = async () => {
    const actionable = referrals.filter((r) => (r.status === 'new' || r.status === 'matched') && r.patients?.consent_given);
    if (!actionable.length) return;

    setShowBulkReview(true);
    setBulkPreparing(true);
    setBulkProposals([]);
    setBulkExcluded(new Set());
    setBulkMessages({});
    setBulkExpanded(new Set());
    setBulkSendResults({});
    setBulkSendErrors({});

    try {
      const res = await fetch('/api/bulk-prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralIds: actionable.map((r) => r.id) }),
      });
      const data = await res.json();
      if (data.proposals) {
        setBulkProposals(data.proposals);
        const msgs: Record<string, string> = {};
        for (const p of data.proposals) {
          if (!p.error) msgs[p.referralId] = p.message;
        }
        setBulkMessages(msgs);
        // Auto-exclude any that errored
        const errored = new Set<string>(
          data.proposals.filter((p: BulkProposal) => p.error).map((p: BulkProposal) => p.referralId)
        );
        setBulkExcluded(errored);
      }
    } catch (err) {
      console.error('Bulk prepare failed:', err);
    } finally {
      setBulkPreparing(false);
    }
  };

  const handleBulkSend = async () => {
    const toSend = bulkProposals.filter((p) => !bulkExcluded.has(p.referralId) && !p.error);
    if (!toSend.length) return;

    setBulkSending(true);
    const initialResults: Record<string, boolean | null> = {};
    for (const p of toSend) initialResults[p.referralId] = null; // pending
    setBulkSendResults(initialResults);

    try {
      const res = await fetch('/api/bulk-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: toSend.map((p) => ({
            referralId: p.referralId,
            providerId: p.provider.id,
            message: bulkMessages[p.referralId] ?? p.message,
          })),
        }),
      });
      const data = await res.json();
      const results: Record<string, boolean | null> = {};
      const errors: Record<string, string> = {};
      for (const r of data.results || []) {
        results[r.referralId] = r.success;
        if (!r.success && r.error) errors[r.referralId] = r.error;
      }
      setBulkSendResults(results);
      setBulkSendErrors(errors);
      fetchReferrals();
    } catch (err) {
      console.error('Bulk send failed:', err);
    } finally {
      setBulkSending(false);
    }
  };

  const filteredReferrals = referrals.filter((r) => {
    if (filter === 'at_risk') {
      const days = getDaysRemaining(r.hedis_window_closes_at);
      return days <= 4;
    }
    if (filter === 'action_needed') {
      return ['new', 'matched', 'no_show'].includes(r.status);
    }
    return true;
  });

  const atRiskCount = referrals.filter(
    (r) => getDaysRemaining(r.hedis_window_closes_at) <= 4 && !['kept', 'closed'].includes(r.status)
  ).length;

  const actionableCount = referrals.filter((r) => (r.status === 'new' || r.status === 'matched') && r.patients?.consent_given).length;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-kept-bg flex items-center justify-center">
        <div className="text-kept-gray animate-pulse">Loading referrals...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-kept-bg">
      {/* Header */}
      <header className="bg-white border-b border-kept-sage/10 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-kept-sage">Kept</h1>
            <span className="text-xs text-kept-gray hidden sm:block">Riverside Family Medicine</span>
          </div>
          <div className="flex items-center gap-3">
            {actionableCount > 0 && (
              <Button
                onClick={handleOpenBulkReview}
                size="sm"
                variant="outline"
                className="border-kept-sage/30 text-kept-sage hover:bg-kept-sage-light/60 gap-1.5 font-medium"
              >
                Review Queue
                <span className="bg-kept-sage text-white rounded-full w-5 h-5 flex items-center justify-center text-xs leading-none">
                  {actionableCount}
                </span>
              </Button>
            )}
            <Button
              onClick={() => setShowNewReferral(true)}
              size="sm"
              className="bg-kept-sage hover:bg-kept-sage/90 text-white gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New Referral
            </Button>
            <div className="flex items-center gap-1.5 text-kept-gray">
              <User className="w-4 h-4" />
              <span className="text-sm hidden sm:block">Coordinator</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-kept-gray hover:text-kept-dark"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex items-center gap-2 bg-white rounded-lg px-4 py-2.5 border border-kept-sage/10">
            <Calendar className="w-4 h-4 text-kept-sage" />
            <span className="text-sm font-medium text-kept-dark">{referrals.length} Active Referrals</span>
          </div>
          {atRiskCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 rounded-lg px-4 py-2.5 border border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-red-700">{atRiskCount} At Risk</span>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {(['all', 'at_risk', 'action_needed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors ${
                filter === f
                  ? 'bg-kept-sage text-white'
                  : 'text-kept-gray hover:bg-kept-sage-light/50 hover:text-kept-sage'
              }`}
            >
              {f === 'all' ? 'All' : f === 'at_risk' ? 'At Risk' : 'Action Needed'}
            </button>
          ))}
        </div>

        {/* Referral Cards */}
        <div className="space-y-3">
          {filteredReferrals.map((referral) => {
            const patient = referral.patients;
            const days = getDaysRemaining(referral.hedis_window_closes_at);
            const action = getActionButton(referral.status);
            const statusConfig = STATUS_CONFIG[referral.status];

            return (
              <Card
                key={referral.id}
                className={`border transition-all hover:shadow-md cursor-pointer ${getUrgencyBg(days)}`}
                onClick={() => router.push(`/dashboard/${referral.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Patient Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="font-semibold text-kept-dark truncate">
                          {patient.first_name} {patient.last_name}
                        </h3>
                        <Badge className={`text-xs shrink-0 ${statusConfig.className}`}>
                          {statusConfig.label}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-kept-gray">
                        <span>PHQ-9: <strong className="text-kept-dark">{referral.phq9_score}</strong></span>
                        <span>{patient.insurance || 'No insurance'}</span>
                        <span>ZIP {patient.zip_code}</span>
                        <span>PCP: {referral.referring_pcp_name}</span>
                        {referral.status === 'booked' && referral.appointment_date && (
                          <span className="flex items-center gap-1 text-kept-green font-medium">
                            <Calendar className="w-3.5 h-3.5" />
                            Appt:{' '}
                            {new Date(referral.appointment_date).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      {action.hint && (
                        <p className="text-xs text-kept-sage mt-1.5 font-medium">{action.hint}</p>
                      )}
                    </div>

                    {/* Right: Urgency + Actions */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className={`flex items-center gap-1.5 text-sm font-medium ${getUrgencyColor(days)}`}>
                        <Clock className="w-4 h-4" />
                        <span>
                          {days <= 0 ? 'Window closing today' : `${days}d remaining`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Quick action: Copy booking link for outreach_sent */}
                        {referral.status === 'outreach_sent' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-kept-sage/30 text-kept-sage hover:bg-kept-sage-light/50 text-xs gap-1.5"
                            onClick={(e) => handleCopyLink(e, referral.id)}
                          >
                            {copiedId === referral.id ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Link className="w-3.5 h-3.5" />
                                Copy Link
                              </>
                            )}
                          </Button>
                        )}
                        {/* Primary action button */}
                        <Button
                          size="sm"
                          className="bg-kept-sage hover:bg-kept-sage/90 text-white text-xs gap-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (referral.status === 'new') {
                              router.push(`/dashboard/${referral.id}?autoMatch=true`);
                            } else {
                              router.push(`/dashboard/${referral.id}`);
                            }
                          }}
                        >
                          {action.icon}
                          {action.label}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filteredReferrals.length === 0 && (
            <div className="text-center py-12 text-kept-gray">
              <p className="text-lg font-medium">No referrals match this filter</p>
              <p className="text-sm mt-1">Try selecting a different view above</p>
            </div>
          )}
        </div>
      </main>

      {/* New Referral Dialog */}
      <Dialog open={showNewReferral} onOpenChange={(open) => { setShowNewReferral(open); if (!open) { setForm(EMPTY_FORM); setFormError(''); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-kept-dark">New Referral</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateReferral} className="space-y-4 pt-1">
            {/* Patient name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-sm font-medium text-kept-dark">First name <span className="text-red-500">*</span></Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="Jane"
                  required
                  className="border-kept-sage/20 focus:ring-kept-sage"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-sm font-medium text-kept-dark">Last name <span className="text-red-500">*</span></Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="Smith"
                  required
                  className="border-kept-sage/20 focus:ring-kept-sage"
                />
              </div>
            </div>

            {/* Phone + ZIP */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-sm font-medium text-kept-dark">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(555) 000-0000"
                  className="border-kept-sage/20 focus:ring-kept-sage"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="zipCode" className="text-sm font-medium text-kept-dark">ZIP code <span className="text-red-500">*</span></Label>
                <Input
                  id="zipCode"
                  value={form.zipCode}
                  onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                  placeholder="02134"
                  required
                  maxLength={5}
                  className="border-kept-sage/20 focus:ring-kept-sage"
                />
              </div>
            </div>

            {/* Insurance + PHQ-9 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="insurance" className="text-sm font-medium text-kept-dark">Insurance</Label>
                <Input
                  id="insurance"
                  value={form.insurance}
                  onChange={(e) => setForm({ ...form, insurance: e.target.value })}
                  placeholder="BlueCross, Medicaid…"
                  className="border-kept-sage/20 focus:ring-kept-sage"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phq9Score" className="text-sm font-medium text-kept-dark">PHQ-9 score</Label>
                <Input
                  id="phq9Score"
                  type="number"
                  min={0}
                  max={27}
                  value={form.phq9Score}
                  onChange={(e) => setForm({ ...form, phq9Score: e.target.value })}
                  placeholder="0–27"
                  className="border-kept-sage/20 focus:ring-kept-sage"
                />
              </div>
            </div>

            {/* PCP */}
            <div className="space-y-1.5">
              <Label htmlFor="pcpName" className="text-sm font-medium text-kept-dark">Referring PCP <span className="text-red-500">*</span></Label>
              <Input
                id="pcpName"
                value={form.pcpName}
                onChange={(e) => setForm({ ...form, pcpName: e.target.value })}
                placeholder="Dr. Patel"
                required
                className="border-kept-sage/20 focus:ring-kept-sage"
              />
            </div>

            {/* Diagnosis context */}
            <div className="space-y-1.5">
              <Label htmlFor="diagnosisContext" className="text-sm font-medium text-kept-dark">Diagnosis context <span className="text-xs font-normal text-kept-gray">(internal, not shared with patient)</span></Label>
              <Textarea
                id="diagnosisContext"
                value={form.diagnosisContext}
                onChange={(e) => setForm({ ...form, diagnosisContext: e.target.value })}
                placeholder="e.g. Generalized anxiety, history of trauma, prefers female provider"
                rows={2}
                className="border-kept-sage/20 focus:ring-kept-sage text-sm"
              />
            </div>

            {/* Consent */}
            <div className="flex items-center gap-2.5">
              <input
                id="consentGiven"
                type="checkbox"
                checked={form.consentGiven}
                onChange={(e) => setForm({ ...form, consentGiven: e.target.checked })}
                className="w-4 h-4 rounded border-kept-sage/30 accent-kept-sage"
              />
              <Label htmlFor="consentGiven" className="text-sm text-kept-dark cursor-pointer">
                Patient has given verbal consent to be contacted
              </Label>
            </div>

            {formError && (
              <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{formError}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowNewReferral(false)}
                className="border-kept-sage/30 text-kept-gray"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={formLoading}
                className="bg-kept-sage hover:bg-kept-sage/90 text-white gap-2"
              >
                {formLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  'Create & Find Match'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Review Dialog */}
      <Dialog open={showBulkReview} onOpenChange={(open) => { if (!bulkSending) setShowBulkReview(open); }}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-kept-sage/10">
            <DialogTitle className="text-kept-dark">Review Queue</DialogTitle>
            {!bulkPreparing && bulkProposals.length > 0 && (
              <p className="text-xs text-kept-gray mt-0.5">
                Review and edit each message before sending. Uncheck to skip.
              </p>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {bulkPreparing && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-kept-gray">
                <Loader2 className="w-8 h-8 animate-spin text-kept-sage" />
                <p className="text-sm font-medium">Preparing proposals…</p>
                <p className="text-xs">Matching providers and drafting messages</p>
              </div>
            )}

            {!bulkPreparing && bulkProposals.map((proposal) => {
              const excluded = bulkExcluded.has(proposal.referralId);
              const expanded = bulkExpanded.has(proposal.referralId);
              const sendResult = bulkSendResults[proposal.referralId];
              const hasError = !!proposal.error;

              return (
                <div
                  key={proposal.referralId}
                  className={`rounded-lg border transition-all ${
                    excluded || hasError
                      ? 'border-gray-200 bg-gray-50 opacity-60'
                      : sendResult === true
                      ? 'border-kept-green/30 bg-emerald-50'
                      : sendResult === false
                      ? 'border-red-300 bg-red-50'
                      : 'border-kept-sage/20 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3 p-3">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={!excluded && !hasError}
                      disabled={hasError || bulkSending || sendResult !== undefined}
                      onChange={(e) => {
                        const next = new Set(bulkExcluded);
                        if (!e.target.checked) next.add(proposal.referralId);
                        else next.delete(proposal.referralId);
                        setBulkExcluded(next);
                      }}
                      className="mt-0.5 w-4 h-4 rounded accent-kept-sage shrink-0"
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-kept-dark">{proposal.patientLabel}</span>
                          <Badge className={`text-xs ${proposal.originalStatus === 'new' ? 'bg-kept-sage-light text-kept-sage border-kept-sage/20' : 'bg-kept-amber-light text-kept-orange border-kept-orange/20'}`}>
                            {proposal.originalStatus === 'new' ? 'New → Matched' : 'Matched'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {sendResult === true && <span className="text-xs text-kept-green font-medium flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Sent</span>}
                          {sendResult === false && <span className="text-xs text-red-600 font-medium">Failed</span>}
                          {sendResult === null && <Loader2 className="w-3.5 h-3.5 animate-spin text-kept-gray" />}
                          {!hasError && sendResult === undefined && (
                            <button
                              onClick={() => {
                                const next = new Set(bulkExpanded);
                                if (expanded) next.delete(proposal.referralId);
                                else next.add(proposal.referralId);
                                setBulkExpanded(next);
                              }}
                              className="text-kept-gray hover:text-kept-dark"
                            >
                              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {hasError ? (
                        <p className="text-xs text-red-600">{proposal.error}</p>
                      ) : (
                        <>
                          <p className="text-xs text-kept-gray mb-1.5">
                            <span className="font-medium text-kept-dark">{proposal.provider.name}</span>
                            {proposal.provider.specialty && ` · ${proposal.provider.specialty}`}
                            {proposal.provider.rationale && (
                              <span className="text-kept-sage"> · {proposal.provider.rationale}</span>
                            )}
                          </p>

                          {/* Message preview / edit */}
                          {expanded ? (
                            <Textarea
                              value={bulkMessages[proposal.referralId] ?? proposal.message}
                              onChange={(e) => setBulkMessages({ ...bulkMessages, [proposal.referralId]: e.target.value })}
                              rows={4}
                              className="text-xs border-kept-sage/20 focus:ring-kept-sage mt-1.5"
                            />
                          ) : (
                            <p className="text-xs text-kept-gray bg-kept-sage-light/30 rounded p-2 leading-relaxed line-clamp-2">
                              {bulkMessages[proposal.referralId] ?? proposal.message}
                            </p>
                          )}
                          {sendResult === false && bulkSendErrors[proposal.referralId] && (
                            <p className="text-xs text-red-600 mt-1.5 bg-red-50 rounded px-2 py-1">
                              {bulkSendErrors[proposal.referralId]}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {!bulkPreparing && bulkProposals.length > 0 && (
            <div className="px-6 py-4 border-t border-kept-sage/10 flex items-center justify-between bg-white">
              {(() => {
                const toSend = bulkProposals.filter((p) => !bulkExcluded.has(p.referralId) && !p.error);
                const sent = Object.values(bulkSendResults).filter(Boolean).length;
                const allDone = Object.keys(bulkSendResults).length > 0 &&
                  Object.keys(bulkSendResults).length === toSend.length;
                return (
                  <>
                    <p className="text-sm text-kept-gray">
                      {allDone
                        ? `${sent} of ${toSend.length} sent successfully`
                        : `${toSend.length} of ${bulkProposals.length} selected`}
                    </p>
                    {allDone ? (
                      <Button
                        onClick={() => setShowBulkReview(false)}
                        className="bg-kept-sage hover:bg-kept-sage/90 text-white gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Done
                      </Button>
                    ) : (
                      <Button
                        onClick={handleBulkSend}
                        disabled={bulkSending || toSend.length === 0}
                        className="bg-kept-sage hover:bg-kept-sage/90 text-white gap-2"
                      >
                        {bulkSending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          <>
                            <Phone className="w-4 h-4" />
                            Send {toSend.length} Message{toSend.length !== 1 ? 's' : ''}
                          </>
                        )}
                      </Button>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
