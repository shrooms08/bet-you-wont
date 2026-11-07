import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo";

describe("Logo", () => {
  it("gives every instance its own mask id, referenced by its own cream overlap", () => {
    const html = renderToStaticMarkup(createElement(Fragment, null, createElement(Logo), createElement(Logo, { size: 52 })));
    const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id).toMatch(/^[a-zA-Z0-9_-]+$/); // safe inside url(#...)
      expect(html).toContain(`mask="url(#${id})"`);
    }
  });

  it("is labelled for screen readers unless decorative, and sizes by height", () => {
    const labelled = renderToStaticMarkup(createElement(Logo, { size: 40 }));
    expect(labelled).toContain('aria-label="Bet You Won&#x27;t"');
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('height="40"');
    const decorative = renderToStaticMarkup(createElement(Logo, { decorative: true }));
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain("aria-label");
  });
});
