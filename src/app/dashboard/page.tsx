'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ReferralWithPatient, ReferralStatus } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
} from 'lucide-react';

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

function getActionButton(status: ReferralStatus): { label: string; icon: React.ReactNode } {
  switch (status) {
    case 'new':
      return { label: 'Find Match', icon: <Search className="w-4 h-4" /> };
    case 'matched':
      return { label: 'Send Outreach', icon: <Phone className="w-4 h-4" /> };
    case 'outreach_sent':
      return { label: 'View Outreach', icon: <ArrowRight className="w-4 h-4" /> };
    case 'booked':
      return { label: 'Confirm Kept', icon: <CheckCircle2 className="w-4 h-4" /> };
    case 'no_show':
      return { label: 'Follow Up', icon: <Phone className="w-4 h-4" /> };
    default:
      return { label: 'View', icon: <ArrowRight className="w-4 h-4" /> };
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const [referrals, setReferrals] = useState<ReferralWithPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'at_risk' | 'action_needed'>('all');

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

    // Subscribe to real-time updates on referrals table
    const channel = supabase
      .channel('referrals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'referrals' },
        () => {
          fetchReferrals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReferrals]);

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
                      </div>
                    </div>

                    {/* Right: Urgency + Action */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className={`flex items-center gap-1.5 text-sm font-medium ${getUrgencyColor(days)}`}>
                        <Clock className="w-4 h-4" />
                        <span>
                          {days <= 0 ? 'Window closing today' : `${days}d remaining`}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        className="bg-kept-sage hover:bg-kept-sage/90 text-white text-xs gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/${referral.id}`);
                        }}
                      >
                        {action.icon}
                        {action.label}
                      </Button>
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
    </div>
  );
}
