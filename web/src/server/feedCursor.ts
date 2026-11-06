// Feed cursor: (activity_at, id) of the last item, opaque to the client. Pure; unit-tested.
export type Cursor = { at: string; id: number };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.at}|${c.id}`, "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const [at, id] = Buffer.from(raw, "base64url").toString("utf8").split("|");
    const n = Number(id);
    if (!at || Number.isNaN(Date.parse(at)) || !Number.isInteger(n) || n <= 0) return null;
    return { at: new Date(at).toISOString(), id: n };
  } catch {
    return null;
  }
}

/** Given rows fetched with limit pageSize+1, returns the page and the next cursor (null at the end). */
export function paginate<T extends { id: number; activity_at: string | null }>(rows: T[], pageSize: number) {
  const page = rows.slice(0, pageSize);
  const last = page[page.length - 1];
  const next = rows.length > pageSize && last?.activity_at ? encodeCursor({ at: last.activity_at, id: Number(last.id) }) : null;
  return { page, next };
}
