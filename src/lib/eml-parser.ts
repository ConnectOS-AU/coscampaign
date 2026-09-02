// Parses a raw .eml (RFC 822 / MIME) export -- e.g. an email dragged out of
// Outlook -- into a subject line, HTML body, and any inline (cid:) images.
// Uses only Web-standard APIs (atob/TextDecoder), not Node's Buffer, so the
// same code runs unmodified in the browser (the campaign editor imports this
// directly) and on the server.
//
// Handles the common Outlook-export shape: multipart/alternative (or
// multipart/related wrapping it) with quoted-printable or base64 encoded
// text/html and inline image parts. Uncommon cases -- unusual charsets,
// deeply nested multipart/mixed with attachments, etc. -- aren't specially
// handled; the html/text extraction just does its best.

function decodeQuotedPrintable(input: string): string {
  // Soft line breaks ("=" at end of line) are line-continuation, not content.
  const joined = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === "=" && /^[0-9A-Fa-f]{2}/.test(joined.slice(i + 1, i + 3))) {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(joined.charCodeAt(i));
    }
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

function decodeBase64Utf8(input: string): string {
  const binary = atob(input.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeMimeWord(text: string): string {
  // RFC 2047 encoded-word headers, e.g. Subject: =?UTF-8?B?SGVsbG8=?=
  return text.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _charset, enc, data) =>
    enc.toUpperCase() === "B" ? decodeBase64Utf8(data) : decodeQuotedPrintable(data.replace(/_/g, " ")),
  );
}

function parseHeaders(block: string): Map<string, string> {
  // Unfold header lines (a continuation line starts with whitespace).
  const unfolded = block.replace(/\r?\n[ \t]+/g, " ");
  const headers = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }
  return headers;
}

function decodeTextPart(body: string, headers: Map<string, string>): string {
  const encoding = (headers.get("content-transfer-encoding") ?? "").toLowerCase();
  if (encoding === "quoted-printable") return decodeQuotedPrintable(body);
  if (encoding === "base64") return decodeBase64Utf8(body);
  return body;
}

export type InlineAsset = { contentId: string; contentType: string; base64: string };

function walkPart(
  body: string,
  headers: Map<string, string>,
  inlineAssets: InlineAsset[],
): { html: string | null; text: string | null } {
  const contentType = headers.get("content-type") ?? "text/plain";
  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);

  if (contentType.toLowerCase().startsWith("multipart/") && boundaryMatch) {
    const boundary = boundaryMatch[1];
    const rawParts = body.split(`--${boundary}`).slice(1, -1);
    let html: string | null = null;
    let text: string | null = null;
    for (const rawPart of rawParts) {
      const trimmed = rawPart.replace(/^\r?\n/, "");
      const splitAt = trimmed.search(/\r?\n\r?\n/);
      if (splitAt === -1) continue;
      const partHeaders = parseHeaders(trimmed.slice(0, splitAt));
      const partBody = trimmed.slice(splitAt).replace(/^\r?\n\r?\n/, "");
      const nested = walkPart(partBody, partHeaders, inlineAssets);
      html = html ?? nested.html;
      text = text ?? nested.text;
    }
    return { html, text };
  }

  const contentId = headers.get("content-id")?.replace(/^<|>$/g, "") ?? null;
  if (contentId && contentType.toLowerCase().startsWith("image/")) {
    const encoding = (headers.get("content-transfer-encoding") ?? "").toLowerCase();
    const base64 = encoding === "base64" ? body.replace(/\s+/g, "") : btoa(body);
    inlineAssets.push({ contentId, contentType: contentType.split(";")[0].trim(), base64 });
    return { html: null, text: null };
  }

  const decoded = decodeTextPart(body, headers);
  if (contentType.toLowerCase().includes("text/html")) return { html: decoded, text: null };
  if (contentType.toLowerCase().includes("text/plain")) return { html: null, text: decoded };
  return { html: null, text: null };
}

export type ParsedEmail = {
  subject: string | null;
  html: string | null;
  text: string | null;
  inlineAssets: InlineAsset[];
};

export function parseEml(raw: string): ParsedEmail {
  const splitAt = raw.search(/\r?\n\r?\n/);
  if (splitAt === -1) return { subject: null, html: null, text: raw, inlineAssets: [] };

  const headers = parseHeaders(raw.slice(0, splitAt));
  const body = raw.slice(splitAt).replace(/^\r?\n\r?\n/, "");
  const inlineAssets: InlineAsset[] = [];
  const { html, text } = walkPart(body, headers, inlineAssets);
  const subjectRaw = headers.get("subject") ?? null;

  return { subject: subjectRaw ? decodeMimeWord(subjectRaw) : null, html, text, inlineAssets };
}
