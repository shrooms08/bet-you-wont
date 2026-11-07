// CSP violation reports (report-uri and Reporting API formats). Pure; unit-tested.

export type CspViolation = { directive: string; blocked: string; page: string };

const clean = (s: unknown, max = 120) => (typeof s === "string" ? s : "").replace(/[\r\n\t]/g, " ").slice(0, max);

/** "https://host" for URLs, the keyword for "inline"/"eval"/"data"..., never query strings or paths. */
function originOf(uri: string): string {
  if (!uri) return "unknown";
  try {
    const u = new URL(uri);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "wss:" || u.protocol === "ws:" ? `${u.protocol}//${u.host}` : u.protocol.replace(/:$/, "");
  } catch {
    return clean(uri, 40);
  }
}

function pathOf(uri: string): string {
  try {
    return new URL(uri).pathname.slice(0, 80);
  } catch {
    return "unknown";
  }
}

/** Accepts application/csp-report ({"csp-report": {...}}) and application/reports+json ([{type, body}]). */
export function parseCspReports(body: unknown): CspViolation[] {
  const out: CspViolation[] = [];
  const push = (r: Record<string, unknown>) =>
    out.push({
      directive: clean(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? r.violatedDirective, 40) || "unknown",
      blocked: originOf(clean(r["blocked-uri"] ?? r.blockedURL ?? r.blockedUri, 500)),
      page: pathOf(clean(r["document-uri"] ?? r.documentURL ?? r.documentUri, 500)),
    });
  if (Array.isArray(body)) {
    for (const item of body.slice(0, 20)) {
      const it = item as { type?: string; body?: Record<string, unknown> };
      if (it?.type === "csp-violation" && it.body) push(it.body);
    }
  } else if (body && typeof body === "object" && "csp-report" in body) {
    push((body as { "csp-report": Record<string, unknown> })["csp-report"] ?? {});
  }
  return out;
}
