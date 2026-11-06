import type { PublicProfile } from "@/lib/types";
import { handle } from "@/lib/format";

// The prototype's default "doodle" face, for people without a photo.
export const DOODLE_SRC =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='#212126'/><path d='M32 44 q4 -7 8 0 M60 44 q4 -7 8 0' stroke='#F2F0E6' stroke-width='5' fill='none' stroke-linecap='round'/><path d='M30 62 q20 18 40 0' stroke='#B8DA3C' stroke-width='6' fill='none' stroke-linecap='round'/></svg>",
  );

const FALLBACK_RING = "#3A3A41";

/** Round photo (or doodle) inside a thick ring in the person's ring color. */
export function Avatar({ person, size = 40, className = "" }: { person: PublicProfile | null | undefined; size?: number; className?: string }) {
  const ring = person?.ringColor ?? FALLBACK_RING;
  const ringW = size >= 56 ? 4 : 3;
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size, padding: ringW, background: ring }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- avatars come from Supabase storage or a data: doodle */}
      <img
        src={person?.avatarUrl || DOODLE_SRC}
        alt={person ? handle(person) : "no one yet"}
        width={size - ringW * 2}
        height={size - ringW * 2}
        className="block h-full w-full rounded-full border-2 border-bg object-cover"
        loading="lazy"
      />
    </span>
  );
}

/** Overlapping stack of up to `max` avatars. */
export function AvatarStack({ people, size = 36, max = 5 }: { people: Array<PublicProfile | null>; size?: number; max?: number }) {
  return (
    <span className="flex items-center">
      {people.slice(0, max).map((p, i) => (
        <span key={p?.wallet ?? i} style={{ marginLeft: i === 0 ? 0 : -size / 4 }}>
          <Avatar person={p} size={size} />
        </span>
      ))}
    </span>
  );
}

/** "@kemi" above a pill in their ring color holding their avatar. */
export function AvatarChip({ person, label }: { person: PublicProfile | null | undefined; label?: string }) {
  const text = label ?? handle(person);
  return (
    <span className="inline-flex shrink-0 flex-col gap-1">
      <span className="max-w-24 truncate text-[13px] font-extrabold leading-none">{text}</span>
      {person ? (
        <span
          className="inline-flex h-9 w-16 items-center rounded-full border-[3px] border-line px-0.5"
          style={{ background: person.ringColor ?? FALLBACK_RING }}
        >
          <Avatar person={{ ...person, ringColor: "transparent" }} size={28} />
        </span>
      ) : (
        <span className="inline-grid h-9 w-16 place-items-center rounded-full border-[3px] border-dashed border-line text-[15px] text-muted" aria-hidden>
          ?
        </span>
      )}
    </span>
  );
}
