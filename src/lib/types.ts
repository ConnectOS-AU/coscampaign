import type { EmployeeRecipientFilter } from "./employees";

export type CampaignStatus = "draft" | "queued" | "scheduled" | "sending" | "sent";

export type Campaign = {
  id: string;
  name: string;
  subject: string | null;
  from_name: string | null;
  from_email: string | null;
  unlayer_design_json: unknown | null;
  html_content: string | null;
  status: CampaignStatus;
  sendgrid_singlesend_id: string | null;
  sendgrid_list_ids: string[];
  sendgrid_segment_ids: string[];
  sendgrid_suppression_group_id: number | null;
  resend_of_campaign_id: string | null;
  recipient_filter: EmployeeRecipientFilter | null;
  event_id: string | null;
  individual_recipient_emails: string[] | null;
  // Set while status is "queued" -- the background worker in
  // src/lib/campaign-queue.ts polls sendgrid_pending_import_job_id and, once
  // SendGrid's contact import finishes, finalizes the send using
  // queued_sender_id/queued_send_at (captured at "Send now" time, since
  // there's no live request to read them from once queued).
  sendgrid_pending_import_job_id: string | null;
  queued_sender_id: number | null;
  queued_send_at: string | null;
  queued_at: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignLink = {
  id: string;
  campaign_id: string;
  url: string;
  label: string | null;
  first_seen_at: string;
};

export type TrackingEventType =
  | "processed"
  | "delivered"
  | "open"
  | "click"
  | "bounce"
  | "dropped"
  | "deferred"
  | "unsubscribe"
  | "spamreport"
  | "group_unsubscribe"
  | "group_resubscribe";

export type TrackingEvent = {
  id: string;
  campaign_id: string | null;
  sendgrid_message_id: string | null;
  contact_email: string | null;
  event_type: TrackingEventType | string;
  url: string | null;
  user_agent: string | null;
  ip: string | null;
  occurred_at: string | null;
  raw_payload: unknown;
  created_at: string;
};

export type EngagementPixel = {
  id: string;
  campaign_id: string;
  contact_email: string;
  segment: 1 | 2 | 3 | 4;
  fired_at: string;
};

export const READ_DEPTH_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "25%",
  2: "50%",
  3: "75%",
  4: "100%",
};

export type EmailTemplate = {
  id: string;
  name: string;
  description: string | null;
  unlayer_design_json: unknown;
  html_content: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LibraryImage = {
  id: string;
  name: string;
  storage_path: string;
  public_url: string;
  created_by: string | null;
  created_at: string;
};

export type Survey = {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SurveyQuestionType = "text" | "multiple_choice" | "rating";

export type SurveyQuestion = {
  id: string;
  survey_id: string;
  position: number;
  question_text: string;
  question_type: SurveyQuestionType;
  options: string[] | null;
  created_at: string;
};

export type SurveyResponse = {
  id: string;
  survey_id: string;
  contact_email: string;
  submitted_at: string;
};

export type SurveyAnswer = {
  id: string;
  response_id: string;
  question_id: string;
  answer_text: string | null;
};

export type EventInviteMode = "manual" | "auto_embed";
export type EventStatus = "draft" | "open" | "closed";

export type Event = {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  banner_image_url: string | null;
  accent_color: string | null;
  capacity: number | null;
  invite_mode: EventInviteMode;
  status: EventStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EventFieldType =
  | "short_text"
  | "paragraph"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "dropdown"
  | "multiple_choice"
  | "checkboxes"
  | "yes_no"
  | "section";

export type EventField = {
  id: string;
  event_id: string;
  position: number;
  field_label: string;
  field_type: EventFieldType;
  options: string[] | null;
  required: boolean;
  created_at: string;
};

export type EventRegistrationStatus = "confirmed" | "waitlisted";

export type EventRegistration = {
  id: string;
  event_id: string;
  name: string;
  email: string;
  cosid: string;
  // The office_email resolved from cosphere_active_employees for `cosid` at
  // registration time -- may differ from `email` (which is whatever the
  // registrant typed) and is what confirmation/cancellation emails go to.
  verified_email: string;
  email_confirmed_at: string | null;
  status: EventRegistrationStatus;
  registered_at: string;
};

export type EventRegistrationAnswer = {
  id: string;
  registration_id: string;
  field_id: string;
  answer_text: string | null;
};

export type CampaignFunnel = {
  processed: number;
  delivered: number;
  opens: number;
  unique_opens: number;
  clicks: number;
  unique_clicks: number;
  bounces: number;
  unsubscribes: number;
};
