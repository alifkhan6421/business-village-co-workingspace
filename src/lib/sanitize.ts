import sanitizeHtml from "sanitize-html";

/** Sanitizes CMS rich text. Only a small, safe subset of HTML survives. */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "hr"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        const external = /^https:/i.test(href);
        return {
          tagName,
          attribs: {
            href,
            ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}),
          },
        };
      },
    },
  }).trim();
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

export function isEmptyRichText(html: string | null | undefined): boolean {
  return stripHtml(html) === "";
}
