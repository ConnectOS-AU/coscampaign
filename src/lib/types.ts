export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent";

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
