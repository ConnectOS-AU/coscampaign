"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase";
import { getSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { generateQrCodeDataUrl } from "@/lib/qrcode";
import { buildEventInviteDesign } from "@/lib/unlayer-design";
import { buildEventEmailHtml } from "@/lib/event-email";
import { formatDateTime } from "@/lib/format-date";
import type { Event, EventFieldType, EventInviteMode, EventStatus } from "@/lib/types";

const IMAGE_BUCKET = "campaign-images";

export async function createEvent() {
  const session = await getSession();
  requirePermission(session, "manage_events");

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("marketing_email_events")
    .insert({ name: "Untitled event", created_by: session?.userId ?? null })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create event: ${error.message}`);
  }

  redirect(`/events/${data.id}/edit`);
}

export type SaveEventFieldInput = {
  field_label: string;
  field_type: EventFieldType;
  options: string[] | null;
  required: boolean;
};

const OPTIONS_FIELD_TYPES = new Set<EventFieldType>(["dropdown", "multiple_choice", "checkboxes"]);

export async function saveEvent(input: {
  id: string;
  name: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  invite_mode: EventInviteMode;
  status: EventStatus;
  banner_image_url: string | null;
  accent_color: string | null;
  fields: SaveEventFieldInput[];
}) {
  const session = await getSession();
  requirePermission(session, "manage_events");

  const supabase = createServiceRoleClient();

  const { error: eventError } = await supabase
    .from("marketing_email_events")
    .update({
      name: input.name,
      description: input.description || null,
      location: input.location || null,
      starts_at: input.starts_at || null,
      ends_at: input.ends_at || null,
      capacity: input.capacity,
      invite_mode: input.invite_mode,
      status: input.status,
      banner_image_url: input.banner_image_url,
      accent_color: input.accent_color,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (eventError) {
    throw new Error(`Failed to save event: ${eventError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("marketing_email_event_fields")
    .delete()
    .eq("event_id", input.id);

  if (deleteError) {
    throw new Error(`Failed to update fields: ${deleteError.message}`);
  }

  if (input.fields.length > 0) {
    const { error: insertError } = await supabase.from("marketing_email_event_fields").insert(
      input.fields.map((f, i) => ({
        event_id: input.id,
        position: i,
        field_label: f.field_label,
        field_type: f.field_type,
        options: OPTIONS_FIELD_TYPES.has(f.field_type) ? f.options : null,
        required: f.field_type === "section" ? false : f.required,
      })),
    );
    if (insertError) {
      throw new Error(`Failed to save fields: ${insertError.message}`);
    }
  }

  revalidatePath(`/events/${input.id}/edit`);
  revalidatePath("/events");
}

export async function deleteEvent(id: string) {
  const session = await getSession();
  requirePermission(session, "manage_events");

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("marketing_email_events").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete event: ${error.message}`);
  }

  revalidatePath("/events");
}

export async function createInviteCampaignForEvent({ eventId, origin }: { eventId: string; origin: string }) {
  const session = await getSession();
  requirePermission(session, "manage_events");
  requirePermission(session, "manage_campaigns");

  const supabase = createServiceRoleClient();
  const { data: event, error: eventError } = await supabase
    .from("marketing_email_events")
    .select("*")
    .eq("id", eventId)
    .single<Event>();

  if (eventError || !event) {
    throw new Error("Event not found");
  }

  const registrationUrl = `${origin}/e/${eventId}`;
  const qrDataUrl = await generateQrCodeDataUrl(registrationUrl);
  const qrBuffer = Buffer.from(qrDataUrl.split(",")[1] ?? "", "base64");
  const qrStoragePath = `${crypto.randomUUID()}.png`;

  const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(qrStoragePath, qrBuffer, {
    contentType: "image/png",
    upsert: false,
  });
  if (uploadError) {
    throw new Error(`Failed to generate QR image: ${uploadError.message}`);
  }

  const {
    data: { publicUrl: qrPublicUrl },
  } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(qrStoragePath);

  await supabase.from("marketing_email_image_library").insert({
    name: `${event.name} — registration QR`,
    storage_path: qrStoragePath,
    public_url: qrPublicUrl,
    created_by: session?.userId ?? null,
  });

  const details = [
    event.starts_at ? formatDateTime(event.starts_at) : null,
    event.location,
  ]
    .filter(Boolean)
    .join(" · ");

  const html = buildEventEmailHtml({
    eventName: event.name,
    bodyHtml: `
      ${details ? `<p style="color: #525252;">${details}</p>` : ""}
      ${event.description ? `<p>${event.description}</p>` : ""}
    `,
    cta: { text: "Register Now", url: registrationUrl },
    footerHtml: `
      <img src="${qrPublicUrl}" alt="Registration QR code" width="160" height="160" />
      <p style="color: #737373; font-size: 12px;">${registrationUrl}</p>
    `,
  });

  // Unlayer's visual editor only ever initializes from unlayer_design_json --
  // it can't reverse-engineer a design from arbitrary HTML. Without this, the
  // editor would show a blank canvas (no QR code, no button, nothing usable)
  // even though html_content has real content, since nothing populated the
  // design the WYSIWYG builder actually renders from.
  const design = buildEventInviteDesign({
    eventName: event.name,
    details,
    description: event.description,
    registrationUrl,
    qrPublicUrl,
  });

  const { data: campaign, error: campaignError } = await supabase
    .from("marketing_email_campaigns")
    .insert({
      name: `Invite: ${event.name}`,
      subject: `You're invited: ${event.name}`,
      html_content: html,
      unlayer_design_json: design,
      created_by: session?.userId ?? null,
    })
    .select("id")
    .single();

  if (campaignError) {
    throw new Error(`Failed to create invite campaign: ${campaignError.message}`);
  }

  redirect(`/campaigns/${campaign.id}/edit`);
}
