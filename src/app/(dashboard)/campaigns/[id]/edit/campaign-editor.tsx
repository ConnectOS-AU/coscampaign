"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import EmailEditor, { type EditorRef, type EmailEditorProps } from "react-email-editor";
import type { Campaign, EmailTemplate, LibraryImage } from "@/lib/types";
import type { Sender, SuppressionGroup } from "@/lib/sendgrid";
import { emptyEmployeeFilter, type EmployeeFilterOptions } from "@/lib/employees";
import { saveCampaignDraft } from "../../actions";
import { saveTemplate } from "../../../templates/actions";
import { ImagePickerModal } from "./image-picker-modal";
import { EmployeeRecipientPicker } from "./employee-recipient-picker";

type TemplateOption = Pick<EmailTemplate, "id" | "name" | "unlayer_design_json">;

type Props = {
  campaign: Campaign;
  senders: Sender[];
  suppressionGroups: SuppressionGroup[];
  initialEmployeeOptions: EmployeeFilterOptions;
  templates: TemplateOption[];
  libraryImages: LibraryImage[];
};

type ImageUploadDone = (result: { progress?: number; url?: string }) => void;
type SelectImageDone = (result: { url: string }) => void;

export function CampaignEditor({
  campaign,
  senders,
  suppressionGroups,
  initialEmployeeOptions,
  templates,
  libraryImages,
}: Props) {
  const router = useRouter();
  const editorRef = useRef<EditorRef>(null);
  const [selectImageDone, setSelectImageDone] = useState<SelectImageDone | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [name, setName] = useState(campaign.name);
  const [subject, setSubject] = useState(campaign.subject ?? "");
  const [senderId, setSenderId] = useState(
    senders.find((s) => s.from_email === campaign.from_email)?.id.toString() ?? "",
  );
  const [recipientFilter, setRecipientFilter] = useState(campaign.recipient_filter ?? emptyEmployeeFilter());
  const [matchingCount, setMatchingCount] = useState(initialEmployeeOptions.matchingCount);
  const [suppressionGroupId, setSuppressionGroupId] = useState(
    campaign.sendgrid_suppression_group_id?.toString() ??
      suppressionGroups.find((g) => g.is_default)?.id.toString() ??
      "",
  );
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const onLoad: EmailEditorProps["onLoad"] = (unlayer) => {
    if (campaign.unlayer_design_json) {
      unlayer.loadDesign(campaign.unlayer_design_json as never);
    }

    // Route the built-in "Upload Image" action through our own storage so
    // every image used in a campaign is also added to the shared library.
    unlayer.registerCallback("image", (file: { attachments: File[] }, done: ImageUploadDone) => {
      const formData = new FormData();
      formData.append("file", file.attachments[0]);

      fetch("/api/images", { method: "POST", body: formData })
        .then((res) => res.json())
        .then((body) => {
          if (body.image?.public_url) {
            done({ progress: 100, url: body.image.public_url });
          }
        })
        .catch(() => {
          // Leave the upload widget as-is; the user can retry.
        });
    });

    // Replace the built-in "Select Image" action with our library picker.
    unlayer.registerCallback("selectImage", (_data: unknown, done: SelectImageDone) => {
      setSelectImageDone(() => done);
    });
  };

  function exportEditorState(): Promise<{ design: unknown; html: string }> {
    return new Promise((resolve, reject) => {
      if (!editorRef.current?.editor) {
        reject(new Error("Editor not ready"));
        return;
      }
      editorRef.current.editor.exportHtml((data) => resolve(data));
    });
  }

  async function handleSaveDraft() {
    setSaving(true);
    setMessage(null);
    try {
      const { design, html } = await exportEditorState();
      await saveCampaignDraft({
        id: campaign.id,
        name,
        subject,
        from_name: senders.find((s) => s.id.toString() === senderId)?.from_name ?? "",
        from_email: senders.find((s) => s.id.toString() === senderId)?.from_email ?? "",
        html_content: html,
        unlayer_design_json: design,
        recipient_filter: recipientFilter,
        sendgrid_suppression_group_id: suppressionGroupId ? Number(suppressionGroupId) : null,
      });
      setMessage({ type: "success", text: "Draft saved." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save draft" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSend(mode: "now" | "schedule") {
    if (!subject.trim()) {
      setMessage({ type: "error", text: "Subject is required before sending." });
      return;
    }
    if (!senderId) {
      setMessage({ type: "error", text: "Choose a verified sender before sending." });
      return;
    }
    const isResend = Boolean(campaign.resend_of_campaign_id);
    if (!isResend && matchingCount === 0) {
      setMessage({ type: "error", text: "No employees match the current recipient filters." });
      return;
    }
    if (!suppressionGroupId) {
      setMessage({ type: "error", text: "Choose an unsubscribe group before sending (required by SendGrid)." });
      return;
    }

    let sendAt: string | "now" = "now";
    if (mode === "schedule") {
      const input = window.prompt("Send at (ISO 8601, e.g. 2026-09-01T09:00:00Z):");
      if (!input) return;
      sendAt = input;
    }

    setSending(true);
    setMessage(null);
    try {
      const { design, html } = await exportEditorState();
      await saveCampaignDraft({
        id: campaign.id,
        name,
        subject,
        from_name: senders.find((s) => s.id.toString() === senderId)?.from_name ?? "",
        from_email: senders.find((s) => s.id.toString() === senderId)?.from_email ?? "",
        html_content: html,
        unlayer_design_json: design,
        recipient_filter: recipientFilter,
        sendgrid_suppression_group_id: suppressionGroupId ? Number(suppressionGroupId) : null,
      });

      const res = await fetch(`/api/campaigns/${campaign.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: Number(senderId), sendAt }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Send failed (${res.status})`);
      }

      router.push(`/campaigns/${campaign.id}/report`);
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to send" });
    } finally {
      setSending(false);
    }
  }

  async function handleSaveAsTemplate() {
    const templateName = window.prompt("Template name:", name);
    if (!templateName) return;

    setSavingTemplate(true);
    setMessage(null);
    try {
      const { design, html } = await exportEditorState();
      await saveTemplate({ name: templateName, unlayer_design_json: design, html_content: html });
      setMessage({ type: "success", text: `Saved template "${templateName}".` });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save template" });
    } finally {
      setSavingTemplate(false);
    }
  }

  function handleLoadTemplate(templateId: string) {
    if (!templateId) return;
    const template = templates.find((t) => t.id === templateId);
    if (!template || !editorRef.current?.editor) return;
    if (!window.confirm(`Load "${template.name}"? This replaces the current design in the editor.`)) return;
    editorRef.current.editor.loadDesign(template.unlayer_design_json as never);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full max-w-md rounded-md border border-transparent bg-transparent px-1 text-2xl font-semibold text-neutral-900 hover:border-neutral-200 focus:border-neutral-300 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <select
            value=""
            onChange={(e) => handleLoadTemplate(e.target.value)}
            disabled={templates.length === 0}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 disabled:opacity-50"
          >
            <option value="">Load template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleSaveAsTemplate}
            disabled={savingTemplate}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            {savingTemplate ? "Saving..." : "Save as template"}
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={saving}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save draft"}
          </button>
          <button
            onClick={() => handleSend("schedule")}
            disabled={sending}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            Schedule
          </button>
          <button
            onClick={() => handleSend("now")}
            disabled={sending}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send now"}
          </button>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 bg-white p-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Subject line</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What recipients see in their inbox"
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">From (verified sender)</label>
          <select
            value={senderId}
            onChange={(e) => setSenderId(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          >
            <option value="">Select a sender...</option>
            {senders.map((s) => (
              <option key={s.id} value={s.id}>
                {s.from_name} &lt;{s.from_email}&gt;
              </option>
            ))}
          </select>
          {senders.length === 0 && (
            <p className="text-xs text-amber-700">
              No verified senders found. Add one in SendGrid under Settings &gt; Sender Authentication.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-700">Unsubscribe group</label>
          <select
            value={suppressionGroupId}
            onChange={(e) => setSuppressionGroupId(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          >
            <option value="">Select an unsubscribe group...</option>
            {suppressionGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
          {suppressionGroups.length === 0 && (
            <p className="text-xs text-amber-700">
              No unsubscribe groups found. Create one in SendGrid under Settings &gt; Suppressions &gt;
              Unsubscribe Groups — SendGrid requires this to schedule any send.
            </p>
          )}
        </div>

        {campaign.resend_of_campaign_id ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-4 md:col-span-2">
            <h3 className="text-sm font-medium text-neutral-700">Recipients</h3>
            <p className="mt-1 text-sm text-neutral-500">
              This is a resend draft — it targets the specific recipients selected when it was created, not
              the employee filters below.
            </p>
          </div>
        ) : (
          <EmployeeRecipientPicker
            value={recipientFilter}
            onChange={setRecipientFilter}
            initialOptions={initialEmployeeOptions}
            onMatchingCountChange={setMatchingCount}
          />
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <EmailEditor ref={editorRef} onLoad={onLoad} minHeight="800px" />
      </div>

      {selectImageDone && (
        <ImagePickerModal
          images={libraryImages}
          onSelect={(url) => {
            selectImageDone({ url });
            setSelectImageDone(null);
          }}
          onClose={() => setSelectImageDone(null)}
        />
      )}
    </div>
  );
}
