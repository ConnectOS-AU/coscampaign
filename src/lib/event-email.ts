// These emails interpolate free text an ordinary user typed somewhere (an
// event registrant's name, a survey answer, etc.) into raw HTML template
// strings -- unlike JSX, template literals don't auto-escape, so every
// caller building bodyHtml/footerHtml is responsible for running any such
// value through this first. eventName below is escaped automatically since
// every caller passes it as a plain string, never pre-built HTML.
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Shared visual template for every transactional, event-related email (invite,
// confirmation, waitlist promotion, cancellation) so they all read as the same
// branded thing rather than one styled card and three plain paragraphs.
export function buildEventEmailHtml({
  eventName,
  bodyHtml,
  cta,
  footerHtml,
}: {
  eventName: string;
  bodyHtml: string;
  cta?: { text: string; url: string };
  footerHtml?: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; text-align: center;">
      <h1 style="font-size: 20px;">${escapeHtml(eventName)}</h1>
      ${bodyHtml}
      ${
        cta
          ? `<p style="margin: 24px 0;"><a href="${cta.url}" style="background: #171717; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">${cta.text}</a></p>`
          : ""
      }
      ${footerHtml ?? ""}
    </div>
  `.trim();
}
