// Minimal Unlayer design-JSON builder. Unlayer's visual editor only ever
// initializes its canvas from `design` (unlayer_design_json) -- it has no
// way to reverse-engineer a design from arbitrary HTML. A campaign that only
// has `html_content` set (no design) opens to a blank canvas in the editor,
// even though the stored HTML is real -- confirmed as the cause of the
// event auto-embed invite campaign appearing empty/unusable in the builder.
// Field shapes here are modeled directly on a real design JSON pulled from
// this project's own database (see marketing_email_templates), not just
// Unlayer's public docs, to match what this specific editor version expects.

function randId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function paragraphContent(html: string, opts: { fontSize?: string; textAlign?: string; color?: string } = {}) {
  return {
    id: randId(),
    type: "paragraph",
    values: {
      text: html,
      _meta: { htmlID: `u_content_paragraph_${randId()}`, htmlClassNames: "u_content_paragraph" },
      anchor: "",
      locked: false,
      fontSize: opts.fontSize ?? "14px",
      hideable: true,
      color: opts.color,
      deletable: true,
      draggable: true,
      textAlign: opts.textAlign ?? "center",
      lineHeight: "140%",
      selectable: true,
      duplicatable: true,
      containerPadding: "10px",
      displayCondition: null,
    },
  };
}

function buttonContent(text: string, href: string) {
  return {
    id: randId(),
    type: "button",
    values: {
      href: { name: "web", values: { href, target: "_blank" } },
      size: { width: "100%", autoWidth: true },
      text: `<span><span>${text}</span></span>`,
      _meta: { htmlID: `u_content_button_${randId()}`, htmlClassNames: "u_content_button" },
      anchor: "",
      border: {},
      locked: false,
      padding: "12px 24px",
      fontSize: "14px",
      hideable: true,
      deletable: true,
      draggable: true,
      textAlign: "center",
      lineHeight: "120%",
      selectable: true,
      borderRadius: "6px",
      buttonColors: {
        color: "#FFFFFF",
        hoverColor: "#FFFFFF",
        backgroundColor: "#171717",
        hoverBackgroundColor: "#171717",
      },
      duplicatable: true,
      containerPadding: "10px",
      displayCondition: null,
    },
  };
}

function imageContent(url: string, width: number, height: number) {
  return {
    id: randId(),
    type: "image",
    values: {
      src: { url, width, height, dynamic: true, contentType: "image/png" },
      _meta: { htmlID: `u_content_image_${randId()}`, htmlClassNames: "u_content_image" },
      action: { name: "web", values: { href: "", target: "_blank" } },
      anchor: "",
      locked: false,
      altText: "Registration QR code",
      pending: false,
      hideable: true,
      deletable: true,
      draggable: true,
      textAlign: "center",
      selectable: true,
      duplicatable: true,
      containerPadding: "10px",
      displayCondition: null,
    },
  };
}

function htmlContent(html: string) {
  return {
    id: randId(),
    type: "html",
    values: {
      html,
      synced: { id: randId(), dirty: false },
      _meta: { htmlID: `u_content_html_${randId()}`, htmlClassNames: "u_content_html" },
      anchor: "",
      locked: false,
      hideable: true,
      deletable: true,
      draggable: true,
      selectable: true,
      duplicatable: true,
      containerPadding: "0px",
      displayCondition: null,
    },
  };
}

function row(contents: unknown[]) {
  return {
    id: randId(),
    cells: [1],
    values: {
      _meta: { htmlID: `u_row_${randId()}`, htmlClassNames: "u_row" },
      anchor: "",
      locked: false,
      columns: false,
      padding: "0px",
      hideable: true,
      deletable: true,
      draggable: true,
      selectable: true,
      duplicatable: true,
      backgroundColor: "",
      displayCondition: null,
    },
    columns: [
      {
        id: randId(),
        values: {
          _meta: { htmlID: `u_column_${randId()}`, htmlClassNames: "u_column" },
          border: {},
          locked: false,
          padding: "0px",
          deletable: true,
          borderRadius: "0px",
          backgroundColor: "",
        },
        contents,
      },
    ],
  };
}

/** Builds a design for the event auto-embed invite campaign: title, details, description, a register button, and the QR code -- all as real, editable Unlayer blocks. */
export function buildEventInviteDesign({
  eventName,
  details,
  description,
  registrationUrl,
  qrPublicUrl,
}: {
  eventName: string;
  details: string;
  description: string | null;
  registrationUrl: string;
  qrPublicUrl: string;
}) {
  const rows = [
    row([paragraphContent(`<p style="margin:0;"><strong>${eventName}</strong></p>`, { fontSize: "22px" })]),
    ...(details ? [row([paragraphContent(`<p style="margin:0;">${details}</p>`, { color: "#525252" })])] : []),
    ...(description ? [row([paragraphContent(`<p style="margin:0;">${description}</p>`)])] : []),
    row([buttonContent("Register Now", registrationUrl)]),
    row([imageContent(qrPublicUrl, 160, 160)]),
    row([paragraphContent(`<p style="margin:0;">${registrationUrl}</p>`, { fontSize: "12px", color: "#737373" })]),
  ];

  return {
    body: {
      id: randId(),
      rows,
      values: {
        _meta: { htmlID: "u_body", htmlClassNames: "u_body" },
        textColor: "#000000",
        fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" },
        contentAlign: "center",
        contentWidth: "480px",
        backgroundColor: "#F7F8F9",
        preheaderText: "",
      },
      footers: [],
      headers: [],
    },
    schemaVersion: 26,
  };
}

/**
 * Wraps an imported HTML email (e.g. exported from Outlook) as a single
 * Unlayer "html" content block, so it loads into the visual editor instead
 * of leaving the canvas blank. The imported markup itself is only editable
 * via that block's own "Edit HTML" source view, not drag-and-drop -- Unlayer
 * has no way to reverse-engineer arbitrary HTML into separate blocks -- but
 * other blocks can still be dragged in around it, and the whole design saves
 * and sends exactly like any other campaign from here on.
 */
export function buildImportedHtmlDesign(html: string) {
  return {
    body: {
      id: randId(),
      rows: [row([htmlContent(html)])],
      values: {
        _meta: { htmlID: "u_body", htmlClassNames: "u_body" },
        textColor: "#000000",
        fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" },
        contentAlign: "center",
        contentWidth: "600px",
        backgroundColor: "#FFFFFF",
        preheaderText: "",
      },
      footers: [],
      headers: [],
    },
    schemaVersion: 26,
  };
}
