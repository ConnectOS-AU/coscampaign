import sanitizeHtml from "sanitize-html";

// Imported HTML (from the Import HTML/EML button in the campaign editor)
// comes from an arbitrary file the admin uploads -- an attachment forwarded
// from someone else, a downloaded template, anything. It lands directly in
// the Unlayer editor's canvas and, unmodified, in the actual sent email, so
// it's treated as untrusted content: strip scripts, event handlers, and
// anything that could execute or navigate somewhere unexpected, while
// keeping the structural/formatting markup real emails are built from
// (tables, inline styles, images, links).
export function sanitizeImportedHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "html", "head", "title", "body", "meta",
      "div", "span", "p", "br", "hr",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th",
      "a", "img",
      "strong", "b", "em", "i", "u", "s", "small", "sub", "sup",
      "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "blockquote", "pre", "code", "center", "font",
    ],
    allowedAttributes: {
      "*": ["style", "class", "id", "align", "valign", "width", "height", "bgcolor", "border", "cellpadding", "cellspacing"],
      a: ["href", "target", "rel", "name"],
      img: ["src", "alt", "width", "height"],
      meta: ["charset", "name", "content", "http-equiv"],
      font: ["color", "face", "size"],
    },
    // Only allow genuinely inert URL schemes -- no javascript:, data: (data:
    // URIs can carry HTML/SVG payloads), or anything else script-adjacent.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowProtocolRelative: false,
    // sanitize-html strips any attribute not explicitly allowed above (so
    // onclick/onerror/etc. are already gone with no extra config needed),
    // and script/style are in its default nonTextTags list, so removing
    // those tags also removes their content instead of leaving it behind
    // as visible text.
  });
}
