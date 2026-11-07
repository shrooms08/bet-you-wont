import { parseCspReports } from "@/server/cspReport";

// POST /api/csp-report: browsers send Content-Security-Policy violation reports here (report-uri
// and the Reporting API's report-to). We log one compact line per violation (directive, blocked
// origin, page path: no query strings, no user data) so blocked resources stay visible in the
// Vercel logs. Capped per instance so a misbehaving page can't flood the logs.
const MAX_PER_MINUTE = 60;
let windowStart = 0;
let logged = 0;

export async function POST(request: Request): Promise<Response> {
  const text = (await request.text().catch(() => "")).slice(0, 16_384);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });
  }
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    logged = 0;
  }
  for (const v of parseCspReports(body)) {
    if (logged++ >= MAX_PER_MINUTE) break;
    console.warn(`[csp] blocked ${v.directive} -> ${v.blocked} on ${v.page}`);
  }
  return new Response(null, { status: 204 });
}
