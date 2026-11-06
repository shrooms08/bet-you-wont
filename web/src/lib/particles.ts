// Fixed-size particle pool for the click burst, stamp confetti and reactions.
// Pure (no DOM): the canvas layer (components/fx/FxLayer) draws it. All particle objects are
// allocated once; spawning reuses dead slots and, when full, recycles the oldest live particle,
// so there is never more than `cap` alive and nothing is allocated per frame.

export type ParticleKind = "glyph" | "dot" | "emoji";

export type Particle = {
  alive: boolean;
  born: number; // ms timestamp, for "oldest" recycling
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number; // px per second
  vy: number;
  gravity: number; // px per second^2
  rot: number; // radians
  vr: number; // radians per second
  life: number; // seconds remaining
  maxLife: number;
  size: number; // px
  color: string;
  glyph: string;
};

export const GLYPHS = ["×", "+", "○", "□", "≡", "#"] as const;
export const BURST_COLORS = ["#B8DA3C", "#9077EA", "#F2F0E6", "#3CD6E6", "#E64FB8"] as const;
export const DEFAULT_CAP = 60;

const blank = (): Particle => ({
  alive: false,
  born: 0,
  kind: "glyph",
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  gravity: 0,
  rot: 0,
  vr: 0,
  life: 0,
  maxLife: 1,
  size: 10,
  color: "#fff",
  glyph: "+",
});

export class ParticlePool {
  readonly items: Particle[];
  private liveCount = 0;

  constructor(readonly cap = DEFAULT_CAP) {
    this.items = Array.from({ length: cap }, blank);
  }

  get alive(): number {
    return this.liveCount;
  }

  /** Takes a free slot, or recycles the oldest live particle when the pool is full. */
  private slot(): Particle {
    let oldest: Particle | null = null;
    for (const p of this.items) {
      if (!p.alive) return p;
      if (!oldest || p.born < oldest.born) oldest = p;
    }
    this.liveCount--; // the recycled one is re-counted below
    return oldest!;
  }

  spawn(init: Omit<Partial<Particle>, "alive" | "born">, now = 0): Particle {
    const p = this.slot();
    Object.assign(p, blank(), init, { alive: true, born: now });
    p.maxLife = init.life ?? p.life;
    this.liveCount++;
    return p;
  }

  /** Advance by dt seconds; kills particles whose life ran out. */
  step(dt: number): void {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.liveCount--;
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  clear(): void {
    for (const p of this.items) p.alive = false;
    this.liveCount = 0;
  }
}

const rand = (a: number, b: number, r: () => number) => a + (b - a) * r();
const pickOne = <T,>(list: readonly T[], r: () => number): T => list[Math.floor(r() * list.length)];

/** Click/tap burst: 8-12 glyphs flying 20-60px outward with a little gravity, 450-650ms. */
export function spawnBurst(pool: ParticlePool, x: number, y: number, now: number, r: () => number = Math.random) {
  const n = 8 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const life = rand(0.45, 0.65, r);
    const dist = rand(20, 60, r);
    const angle = r() * Math.PI * 2;
    // distance ~= speed * life (ignoring gravity), so speed = dist / life
    const speed = dist / life;
    pool.spawn(
      {
        kind: "glyph",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 140,
        rot: rand(-0.6, 0.6, r),
        vr: rand(-6, 6, r),
        life,
        size: rand(10, 12, r),
        color: pickOne(BURST_COLORS, r),
        glyph: pickOne(GLYPHS, r),
      },
      now,
    );
  }
}

/** Stamp confetti: 30-40 round dots in theme colors, upward spray, gravity, gone by 1.2s. */
export function spawnConfetti(pool: ParticlePool, x: number, y: number, now: number, colors: readonly string[], r: () => number = Math.random) {
  const n = 30 + Math.floor(r() * 11);
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + rand(-1.3, 1.3, r);
    const speed = rand(180, 420, r);
    pool.spawn(
      {
        kind: "dot",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 900,
        life: rand(0.8, 1.2, r),
        size: rand(3, 7, r),
        color: pickOne(colors, r),
      },
      now,
    );
  }
}

/** Small emoji particles (double-tap reactions). */
export function spawnEmoji(pool: ParticlePool, x: number, y: number, now: number, emoji: string, count = 6, r: () => number = Math.random) {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + rand(-1.1, 1.1, r);
    const speed = rand(90, 200, r);
    pool.spawn(
      {
        kind: "emoji",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 260,
        vr: rand(-3, 3, r),
        life: rand(0.6, 0.9, r),
        size: rand(14, 20, r),
        glyph: emoji,
      },
      now,
    );
  }
}
