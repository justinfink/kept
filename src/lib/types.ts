export type ReferralStatus =
  | 'new'
  | 'matched'
  | 'outreach_sent'
  | 'booked'
  | 'kept'
  | 'no_show'
  | 'rebooked'
  | 'closed';

export type OutreachChannel = 'sms' | 'email';

export type OutreachEventType =
  | 'initial'
  | 'reminder_24h'
  | 'no_show_followup'
  | 'confirmation';

export interface Practice {
  id: string;
  name: string;
  npi: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  created_at: string;
}

export interface Coordinator {
  id: string;
  auth_user_id: string;
  practice_id: string;
  full_name: string;
  email: string;
  created_at: string;
}

export interface Patient {
  id: string;
  practice_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  insurance: string | null;
  zip_code: string;
  consent_given: boolean;
  consent_given_at: string | null;
  consent_method: string | null;
  created_at: string;
}

export interface Provider {
  id: string;
  npi: string;
  full_name: string;
  credential: string | null;
  specialty: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  phone: string | null;
  is_accepting_new: boolean | null;
  nppes_last_updated: string | null;
  languages: string[] | null;
  accepts_insurance: string[] | null;
  telehealth_available: boolean | null;
  earliest_availability: string | null;
  approach: string | null;
  bio: string | null;
  average_rating: number | null;
  review_count: number | null;
  created_at: string;
}

export interface Referral {
  id: string;
  practice_id: string;
  patient_id: string;
  coordinator_id: string | null;
  referring_pcp_name: string;
  referring_pcp_npi: string | null;
  phq9_score: number | null;
  diagnosis_context: string | null;
  high_complexity: boolean | null;
  matched_provider_id: string | null;
  appointment_date: string | null;
  appointment_location: string | null;
  status: ReferralStatus;
  hedis_window_closes_at: string;
  created_at: string;
  outreach_sent_at: string | null;
  booked_at: string | null;
  appointment_kept_at: string | null;
  closed_at: string | null;
  pcp_notified_at: string | null;
}

export interface ReferralWithPatient extends Referral {
  patients: Patient;
  providers?: Provider | null;
}

export interface OutreachEvent {
  id: string;
  referral_id: string;
  coordinator_id: string | null;
  channel: OutreachChannel;
  event_type: OutreachEventType;
  content: string;
  recipient_phone: string | null;
  recipient_email: string | null;
  sent_at: string;
  delivered_at: string | null;
  booking_link: string | null;
  twilio_sid: string | null;
}

export interface MatchedProvider {
  npi: string;
  name: string;
  credential: string;
  specialty: string;
  rationale: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  availability?: string;
  rating?: number;
  languages?: string[];
  telehealth?: boolean;
  accepts_patient_insurance?: boolean;
}
