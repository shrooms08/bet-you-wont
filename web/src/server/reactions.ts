// 🔥 reaction toggle, written against a tiny store interface so the logic is unit-testable.
export type ReactionStore = {
  remove: (dareId: string, wallet: string) => Promise<boolean>; // true if a row was deleted
  insert: (dareId: string, wallet: string) => Promise<void>;
  count: (dareId: string) => Promise<number>;
};

/** One tap = toggle: remove if present, else add. Returns the new state and count. */
export async function toggleReaction(store: ReactionStore, dareId: string, wallet: string) {
  const w = wallet.toLowerCase();
  const removed = await store.remove(dareId, w);
  if (!removed) await store.insert(dareId, w);
  return { reacted: !removed, count: await store.count(dareId) };
}
