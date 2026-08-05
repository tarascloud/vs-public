/**
 * Unit tests for VS sanitize-html.ts
 * Ported from sh-private/tests/sanitize-html.test.ts.
 *
 * Covers: script injection, iframe, event handlers, javascript: URLs,
 * data: URIs, CSS exfiltration via style, and SVG schema allowlist.
 */
import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeSchemaHtml } from "@/lib/sanitize-html";

// ── sanitizeHtml ───────────────────────────────────────────────────────────

describe("sanitizeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("passes through safe plain text", () => {
    const out = sanitizeHtml("<p>Hello <strong>world</strong></p>");
    expect(out).toContain("Hello");
    expect(out).toContain("<strong>world</strong>");
  });

  it("strips <script> tags", () => {
    const out = sanitizeHtml('<p>ok</p><script>alert("xss")</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("strips <iframe> tags", () => {
    const out = sanitizeHtml('<iframe src="https://evil.com"></iframe>');
    expect(out).not.toContain("<iframe");
  });

  it("strips on* event handlers", () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
  });

  it("strips onclick from anchor", () => {
    const out = sanitizeHtml('<a href="#" onclick="steal()">click</a>');
    expect(out).not.toContain("onclick");
  });

  it("strips javascript: URL in href", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">xss</a>');
    expect(out).not.toContain("javascript:");
  });

  it("strips data: URI in href", () => {
    const out = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">xss</a>');
    expect(out).not.toContain("data:");
  });

  it("does not strip https: href", () => {
    const out = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('href="https://example.com"');
  });

  it("hardens external anchors with rel and target", () => {
    const out = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it("strips style attributes", () => {
    const out = sanitizeHtml('<p style="color:red">text</p>');
    expect(out).not.toContain("style=");
  });

  it("strips <style> tags", () => {
    const out = sanitizeHtml('<style>body{display:none}</style><p>safe</p>');
    expect(out).not.toContain("<style");
    expect(out).toContain("<p>safe</p>");
  });

  it("strips SVG tags (user content)", () => {
    const out = sanitizeHtml('<svg><use href="data:image/svg+xml,#x"></use></svg><p>ok</p>');
    expect(out).not.toContain("<svg");
    expect(out).toContain("<p>ok</p>");
  });

  it("preserves allowed markdown tags", () => {
    const out = sanitizeHtml("<h2>Title</h2><ul><li>item</li></ul><code>code()</code>");
    expect(out).toContain("<h2>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>item</li>");
    expect(out).toContain("<code>code()</code>");
  });

  it("strips data-* attributes", () => {
    const out = sanitizeHtml('<p data-secret="token">text</p>');
    expect(out).not.toContain("data-secret");
  });

  it("returns empty string for non-string input", () => {
    // @ts-expect-error intentional type violation for defensive test
    expect(sanitizeHtml(null)).toBe("");
    // @ts-expect-error
    expect(sanitizeHtml(undefined)).toBe("");
  });
});

// ── sanitizeSchemaHtml ─────────────────────────────────────────────────────

describe("sanitizeSchemaHtml", () => {
  it("preserves SVG tags for AI diagrams", () => {
    const svg = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#6366f1"/></svg>';
    const out = sanitizeSchemaHtml(svg);
    expect(out).toContain("<svg");
    expect(out).toContain("viewBox");
    expect(out).toContain("<circle");
  });

  it("still strips <script> from schema HTML", () => {
    const out = sanitizeSchemaHtml('<svg><script>alert(1)</script></svg>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("still strips on* handlers from schema HTML", () => {
    const out = sanitizeSchemaHtml('<svg onload="xss()"><rect/></svg>');
    expect(out).not.toContain("onload");
  });

  it("still strips javascript: in schema href", () => {
    const out = sanitizeSchemaHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  it("preserves SVG path data", () => {
    const out = sanitizeSchemaHtml('<svg><path d="M10 10 L90 90" stroke="#fff"/></svg>');
    expect(out).toContain('d="M10 10 L90 90"');
    expect(out).toContain("stroke=");
  });
});
