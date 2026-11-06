import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads the real tokens from theme.css and checks every text-on-fill pair the UI uses is >= 4.5:1.
const css = readFileSync(new URL("../app/theme.css", import.meta.url), "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--byw-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --byw-${name} not found`);
  return m[1];
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS: Array<[fg: string, bg: string]> = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "inset"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "inset"],
  ["money", "surface"],
  ["accent", "bg"],
  ["accent-2", "bg"],
  ["accent-2", "surface"],
  ["danger", "surface"],
  ["on-primary", "primary"],
  ["on-secondary", "secondary"],
  ["on-danger", "danger"],
  ["tag-open-fg", "tag-open-bg"],
  ["tag-accepted-fg", "tag-accepted-bg"],
  ["tag-voting-fg", "tag-voting-bg"],
  ["tag-passed-fg", "tag-passed-bg"],
  ["tag-failed-fg", "tag-failed-bg"],
  ["tag-expired-fg", "tag-expired-bg"],
];

describe("theme contrast (WCAG AA, 4.5:1)", () => {
  for (const [fg, bg] of PAIRS) {
    it(`${fg} on ${bg}`, () => {
      expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
