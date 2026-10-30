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

/** Rough reading time: about 200 words a minute, at least 1. */
export function readingMinutes(html: string): number {
  const words = sanitize(html, { allowedTags: [], allowedAttributes: {} }).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
