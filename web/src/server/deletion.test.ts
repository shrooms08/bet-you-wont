import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny fake of the Supabase admin client: records every table write and storage call.
const W = "0x00000000000000000000000000000000000000a1";
const W2 = "0x00000000000000000000000000000000000000a2";
type Op = { table: string; op: string; filters: Array<[string, string, unknown]>; patch?: unknown };
const ops: Op[] = [];
const removed: Record<string, string[]> = {};
const files: Record<string, string[]> = {};
const rows: Record<string, Array<Record<string, unknown>>> = {};

function query(table: string) {
  const state: Op = { table, op: "select", filters: [] };
  const api = {
    select: () => api,
    eq: (c: string, v: unknown) => (state.filters.push(["eq", c, v]), api),
    in: (c: string, v: unknown) => (state.filters.push(["in", c, v]), api),
    limit: () => api,
    update: (patch: unknown) => ((state.op = "update"), (state.patch = patch), api),
    delete: () => ((state.op = "delete"), api),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      ops.push(state);
      const data =
        state.op === "select"
          ? (rows[table] ?? []).filter((r) => state.filters.every(([k, c, v]) => (k === "eq" ? r[c] === v : (v as unknown[]).includes(r[c]))))
          : null;
      return Promise.resolve({ data, error: null }).then(res, rej);
    },
  };
  return api;
}

vi.mock("./supabase", () => ({
  db: () => ({
    from: (t: string) => query(t),
    storage: {
      from: (bucket: string) => ({
        list: async (prefix: string) => ({
          data: (files[`${bucket}/${prefix}`] ?? []).map((name) => ({ name, id: `id-${name}`, created_at: null })),
          error: null,
        }),
        remove: async (paths: string[]) => {
          (removed[bucket] ??= []).push(...paths);
          return { data: null, error: null };
        },
        createSignedUrls: async () => ({ data: [], error: null }),
      }),
    },
  }),
  check: <T,>(r: { data: T }) => r.data,
}));

const { deleteProofFiles, deleteUserData } = await import("./deletion");

beforeEach(() => {
  ops.length = 0;
  for (const k of Object.keys(removed)) delete removed[k];
  for (const k of Object.keys(files)) delete files[k];
  for (const k of Object.keys(rows)) delete rows[k];
});

describe("delete my data", () => {
  it("removes avatar + proof files of every wallet, reactions, uploads and the profile (freeing the @name)", async () => {
    rows.profiles = [{ privy_user_id: "u1", wallet_address: W2 }]; // the profile's wallet differs from the acting one
    files[`avatars/avatar/${W}`] = ["a.jpg"];
    files[`avatars/avatar/${W2}`] = ["b.png"];
    files[`proofs/proof/${W}`] = ["p1.jpg", "p1-poster.jpg"];
    files[`proofs/proof/${W2}`] = [];

    const res = await deleteUserData({ privyUserId: "u1", wallets: [W.toUpperCase().replace("0X", "0x")] });

    expect(res).toEqual({ wallets: 2, files: 4 });
    expect(removed.avatars.sort()).toEqual([`avatar/${W}/a.jpg`, `avatar/${W2}/b.png`]);
    expect(removed.proofs.sort()).toEqual([`proof/${W}/p1-poster.jpg`, `proof/${W}/p1.jpg`]);
    const writes = ops.filter((o) => o.op !== "select");
    const did = (table: string, op: string) => writes.find((o) => o.table === table && o.op === op);
    expect(did("proofs", "update")?.patch).toHaveProperty("deleted_at");
    expect(did("proofs", "update")?.filters).toEqual([["in", "uploader_wallet", [W, W2]]]);
    expect(did("reactions", "delete")?.filters).toEqual([["in", "wallet_address", [W, W2]]]);
    expect(did("uploads", "delete")?.filters).toEqual([["eq", "privy_user_id", "u1"]]);
    expect(writes.filter((o) => o.table === "profiles" && o.op === "delete")).toHaveLength(2); // by user id and by wallet
  });

  it("an admin can delete by wallet alone (no profile)", async () => {
    files[`avatars/avatar/${W}`] = [];
    files[`proofs/proof/${W}`] = ["x.webm"];
    const res = await deleteUserData({ privyUserId: null, wallets: [W] });
    expect(res.files).toBe(1);
    expect(ops.some((o) => o.table === "uploads")).toBe(false);
  });

  it("admin 'delete proof file' removes the media and poster and marks the row deleted", async () => {
    rows.proofs = [{ dare_id: 9, proof_hash: "0xab", storage_path: `proof/${W}/m.mp4`, poster_path: `proof/${W}/m.jpg` }];
    expect(await deleteProofFiles(9)).toBe(2);
    expect(removed.proofs).toEqual([`proof/${W}/m.mp4`, `proof/${W}/m.jpg`]);
    expect(ops.find((o) => o.table === "proofs" && o.op === "update")?.patch).toHaveProperty("deleted_at");
  });
});
