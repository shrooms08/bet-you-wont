// Upload rules. Must match the storage buckets created in supabase/migrations/001_init.sql.

export type UploadKind = "avatar" | "proof";

type BucketRule = { bucket: string; maxBytes: number; mimes: Record<string, string> /* mime -> ext */ };

export const UPLOAD_RULES: Record<UploadKind, BucketRule> = {
  avatar: {
    bucket: "avatars",
    maxBytes: 5 * 1024 * 1024,
    mimes: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  },
  proof: {
    bucket: "proofs",
    maxBytes: 50 * 1024 * 1024,
    mimes: {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/heic": "heic",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
      "video/webm": "webm",
    },
  },
};

/** Storage paths are always `<kind>/<lowercased wallet>/<uuid>.<ext>`. */
export function storagePathFor(kind: UploadKind, wallet: string, uuid: string, mime: string): string {
  const ext = UPLOAD_RULES[kind].mimes[mime];
  if (!ext) throw new Error(`mime ${mime} not allowed for ${kind}`);
  return `${kind}/${wallet.toLowerCase()}/${uuid}.${ext}`;
}

const PATH_RE = /^(avatar|proof)\/(0x[0-9a-f]{40})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z0-9]{3,4})$/;

/** Parses a storage path we issued. Returns null for anything else (including path tricks like "..'). */
export function parseStoragePath(path: string): { kind: UploadKind; wallet: string; ext: string } | null {
  const m = PATH_RE.exec(path);
  if (!m) return null;
  return { kind: m[1] as UploadKind, wallet: m[2], ext: m[3] };
}

/**
 * Checks the file's first bytes against its declared mime type, so a renamed file can't pass
 * as a photo or clip. Returns true when the magic bytes fit the mime.
 */
export function magicMatches(mime: string, head: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => head[i] === b);
  switch (mime) {
    case "image/jpeg":
      return startsWith(0xff, 0xd8, 0xff);
    case "image/png":
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "video/webm":
      return startsWith(0x1a, 0x45, 0xdf, 0xa3);
    case "image/heic":
      return ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(8, 12));
    case "video/mp4":
      return ascii(4, 8) === "ftyp";
    case "video/quicktime":
      // QuickTime files start with an atom: usually ftyp (brand "qt  "), sometimes moov/wide/mdat/free.
      return /^(ftyp|moov|wide|mdat|free|skip)$/.test(ascii(4, 8));
    default:
      return false;
  }
}
