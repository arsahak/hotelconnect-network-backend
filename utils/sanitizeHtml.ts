import sanitize from "sanitize-html";

/**
 * Cleans rich text from the dashboard editor before it is stored, so a story
 * can never carry scripts or event handlers onto the public website.
 */
export function sanitizeRichText(html: string): string {
  return sanitize(html, {
    allowedTags: [
      ...sanitize.defaults.allowedTags,
      "img",
      "figure",
      "figcaption",
      "span",
      "iframe",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      iframe: ["src", "width", "height", "allowfullscreen", "frameborder", "allow"],
      "*": ["class", "style", "data-size"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // Videos only from YouTube and Vimeo.
    allowedIframeHostnames: ["www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com"],
    transformTags: {
      a: sanitize.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}

/** Job descriptions (Master Briefing v4): plain formatting only — bold, italic, lists, links. */
export const JOB_TEXT_MAX = 2000;

export function sanitizeJobText(html: string): string {
  // Older jobs are plain text: keep their line breaks.
  const input = /<[a-z][\s\S]*>/i.test(html) ? html : html.split(/\n{2,}/).map((p) => `<p>${sanitize(p, { allowedTags: [], allowedAttributes: {} }).replace(/\n/g, "<br>")}</p>`).join("");
  return sanitize(input, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "h3", "h4"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: { a: sanitize.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }) },
  });
}

/** The visible text of rich text (for length limits and search). */
export const plainText = (html: string) => sanitize(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();

/** Rough reading time: about 200 words a minute, at least 1. */
export function readingMinutes(html: string): number {
  const words = sanitize(html, { allowedTags: [], allowedAttributes: {} }).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
