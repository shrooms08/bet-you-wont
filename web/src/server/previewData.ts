import "server-only";
import { errLine } from "./redact";
import { darePreview, type Preview } from "./linkPreview";
import { DARE_COLUMNS, profilesByWallet, type DareRow, type GroupRow } from "./queries";
import { check, db } from "./supabase";

/** The dare row and its wifie, for link previews and the public share card. Null when missing. */
export async function loadDareAndGroup(dareId: number): Promise<{ dare: DareRow; group: GroupRow | null } | null> {
  const dare = (check(await db().from("dares").select(DARE_COLUMNS).eq("id", dareId).limit(1), "loading dare") as unknown as DareRow[])[0];
  if (!dare) return null;
  const group = (check(await db().from("groups").select("*").eq("id", dare.group_id).limit(1), "loading group") as GroupRow[])[0] ?? null;
  return { dare, group };
}

/** Link preview for /d/<id>. Never throws: any failure falls back to the generic preview. */
export async function previewForDare(dareId: number): Promise<Preview> {
  try {
    const found = Number.isSafeInteger(dareId) && dareId > 0 ? await loadDareAndGroup(dareId) : null;
    if (!found) return darePreview(null, null);
    const { dare, group } = found;
    let doerName: string | null = null;
    if (group?.is_public && dare.doer_wallet) {
      const p = (await profilesByWallet([dare.doer_wallet])).get(dare.doer_wallet.toLowerCase());
      doerName = p?.username ? `@${p.username}` : null;
    }
    // text hidden after reports never appears in link previews
    return darePreview({ ...dare, text: dare.text_hidden_at ? null : dare.text, doerName }, group);
  } catch (err) {
    console.error("[preview]", errLine(err));
    return darePreview(null, null);
  }
}
