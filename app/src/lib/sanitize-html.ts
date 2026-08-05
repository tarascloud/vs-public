/**
 * Canonical HTML sanitizer for VS Landing.
 *
 * Implementation inlined from `packages/security/src/sanitize-html.ts` to avoid
 * monorepo resolution issues in Docker builds. Keeps the same security posture:
 *   - explicit ALLOWED_TAGS (allowlist, not blocklist)
 *   - URI scheme enforcement (http, https, mailto — no javascript:/data:)
 *   - Link rel hardening (noopener noreferrer on all anchors)
 *   - `ALLOW_DATA_ATTR: false` — no data-* attributes in user HTML
 *   - `style=""` — never allowed (CSS exfiltration risk)
 *
 * For SVG diagrams (AI-generated schemas) use `sanitizeSchemaHtml()`.
 */
import DOMPurify from "isomorphic-dompurify";

const BASE_TAGS = [
  "p", "br", "b", "i", "u", "strong", "em", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "blockquote", "pre", "code", "table", "thead", "tbody", "tr", "th", "td",
  "span",
];

const BASE_ATTRS = ["href", "alt", "class", "target", "rel"];

// Safe URI regexp — only http(s), mailto, relative, or anchor links.
const SAFE_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/**
 * Sanitize user-supplied HTML for safe rendering via dangerouslySetInnerHTML.
 * Use for markdown-rendered content, chat messages, admin-authored notes.
 */
export function sanitizeHtml(html: string): string {
  if (typeof html !== "string" || html.length === 0) return "";

  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: BASE_TAGS,
    ALLOWED_ATTR: BASE_ATTRS,
    ALLOWED_URI_REGEXP: SAFE_URI,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "svg"],
    FORBID_ATTR: ["style", "on*", "formaction", "srcdoc"],
  });

  // Harden all anchors: force rel="noopener noreferrer" and target=_blank
  // for external links. Runs a second pass on the sanitized string only.
  return clean.replace(
    /<a\s+([^>]*?)href="(https?:[^"]+)"([^>]*?)>/gi,
    (_match: string, pre: string, href: string, post: string) => {
      const rel = `rel="noopener noreferrer nofollow"`;
      const tgt = `target="_blank"`;
      // Strip any existing rel/target
      const cleanPre = pre.replace(/\s*(rel|target)="[^"]*"/gi, "");
      const cleanPost = post.replace(/\s*(rel|target)="[^"]*"/gi, "");
      return `<a ${cleanPre}href="${href}" ${tgt} ${rel}${cleanPost}>`;
    },
  );
}

/**
 * Sanitize AI-generated HTML/SVG schema (diagrams, illustrations).
 * Allows SVG namespace and a small set of geometric tags/attrs needed for
 * declarative diagrams. DO NOT use this for user-supplied content.
 */
export function sanitizeSchemaHtml(html: string): string {
  if (typeof html !== "string" || html.length === 0) return "";

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      ...BASE_TAGS,
      "div",
      "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline",
      "polygon", "text", "tspan", "defs", "linearGradient", "radialGradient",
      "stop", "marker", "use", "symbol", "title", "desc",
    ],
    ALLOWED_ATTR: [
      ...BASE_ATTRS,
      "viewBox", "xmlns", "xmlns:xlink", "fill", "stroke", "stroke-width",
      "stroke-linecap", "stroke-linejoin", "d", "x", "y", "x1", "y1", "x2",
      "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "transform",
      "opacity", "fill-opacity", "stroke-opacity", "points", "text-anchor",
      "font-size", "font-family", "font-weight", "dy", "dx", "offset",
      "stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
      "xlink:href", "id", "preserveAspectRatio",
    ],
    ALLOWED_URI_REGEXP: SAFE_URI,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "style"],
    FORBID_ATTR: ["style", "on*", "formaction"],
  });
}
