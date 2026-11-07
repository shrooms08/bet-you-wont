// Reports and auto-hiding. Pure; unit-tested.

export const REPORT_REASONS = ["dangerous", "illegal", "no_consent", "harassment", "nudity", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTarget = "dare" | "proof";

/** Distinct reporters needed before something is hidden pending review. */
export function hideThreshold(isPublicWifie: boolean): number {
  return isPublicWifie ? 2 : 3;
}

/**
 * Should this dare's text (target "dare") or proof media (target "proof") be auto-hidden?
 * Counts distinct reporters since an admin last cleared it (reports before that were reviewed).
 */
export function shouldAutoHide(
  reports: Array<{ reporter_user_id: string; created_at: string }>,
  isPublicWifie: boolean,
  clearedAt: string | null,
): boolean {
  const since = clearedAt ? Date.parse(clearedAt) : -Infinity;
  const reporters = new Set(reports.filter((r) => Date.parse(r.created_at) > since).map((r) => r.reporter_user_id));
  return reporters.size >= hideThreshold(isPublicWifie);
}

export type HiddenState = { textHidden: boolean; mediaHidden: boolean };

/** What a viewer sees: hidden for everyone once hidden, and hidden for a reporter right away. */
export function hiddenFor(
  dare: { id: number | string; text_hidden_at?: string | null; media_hidden_at?: string | null },
  viewerReports: Set<string>, // keys "<dareId>:dare" / "<dareId>:proof"
): HiddenState {
  const id = String(dare.id);
  return {
    textHidden: !!dare.text_hidden_at || viewerReports.has(`${id}:dare`),
    mediaHidden: !!dare.media_hidden_at || viewerReports.has(`${id}:proof`),
  };
}
