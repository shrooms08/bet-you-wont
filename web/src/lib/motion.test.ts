import { describe, expect, it } from "vitest";
import { fxEnabled, pick, REDUCED, springs, STAGGER } from "./motion";
import { DEFAULT_CAP, ParticlePool, spawnBurst, spawnConfetti, spawnEmoji } from "./particles";

// Deterministic random for repeatable tests.
function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

describe("particle pool", () => {
  it("never has more than the cap alive, however many are spawned", () => {
    const pool = new ParticlePool();
    expect(DEFAULT_CAP).toBe(60);
    const r = seeded();
    for (let i = 0; i < 20; i++) spawnBurst(pool, 100, 100, i, r); // ~200 particles
    expect(pool.alive).toBe(60);
    expect(pool.items.filter((p) => p.alive)).toHaveLength(60);
    expect(pool.items).toHaveLength(60); // no growth: preallocated
  });

  it("recycles the oldest live particle when full", () => {
    const pool = new ParticlePool(3);
    const a = pool.spawn({ life: 1 }, 1);
    pool.spawn({ life: 1 }, 2);
    pool.spawn({ life: 1 }, 3);
    const d = pool.spawn({ life: 1, glyph: "#" }, 4);
    expect(d).toBe(a); // slot of the oldest was reused
    expect(pool.alive).toBe(3);
  });

  it("reuses the same particle objects (no per-frame allocation) and frees dead ones", () => {
    const pool = new ParticlePool(10);
    const before = [...pool.items];
    spawnBurst(pool, 0, 0, 0, seeded(1));
    pool.step(0.3);
    expect(pool.alive).toBeGreaterThan(0);
    pool.step(1); // every burst particle lives <= 650 ms
    expect(pool.alive).toBe(0);
    expect(pool.items.every((p, i) => p === before[i])).toBe(true);
  });

  it("burst: 8-12 glyphs that move and fall; confetti 30-40 dots; emoji count as asked", () => {
    const r = seeded(7);
    const pool = new ParticlePool(200);
    spawnBurst(pool, 50, 50, 0, r);
    expect(pool.alive).toBeGreaterThanOrEqual(8);
    expect(pool.alive).toBeLessThanOrEqual(12);
    const p = pool.items.find((x) => x.alive)!;
    const y0 = p.y;
    pool.step(0.1);
    expect(p.y).not.toBe(y0);
    pool.clear();
    spawnConfetti(pool, 0, 0, 0, ["#B8DA3C"], r);
    expect(pool.alive).toBeGreaterThanOrEqual(30);
    expect(pool.alive).toBeLessThanOrEqual(40);
    pool.clear();
    spawnEmoji(pool, 0, 0, 0, "🔥", 6, r);
    expect(pool.alive).toBe(6);
  });
});

describe("reduced-motion switch", () => {
  it("turns off cursor, spotlight, particles and springs when the user prefers reduced motion", () => {
    expect(fxEnabled({ reducedMotion: true, finePointer: true })).toEqual({ pixelCursor: false, spotlight: false, particles: false, springs: false });
  });
  it("cursor and spotlight only with a fine pointer; particles on touch too", () => {
    expect(fxEnabled({ reducedMotion: false, finePointer: false })).toEqual({ pixelCursor: false, spotlight: false, particles: true, springs: true });
    expect(fxEnabled({ reducedMotion: false, finePointer: true })).toEqual({ pixelCursor: true, spotlight: true, particles: true, springs: true });
  });
  it("pick() returns a short fade instead of a spring under reduced motion", () => {
    expect(pick("bouncy", true)).toBe(REDUCED);
    expect(pick("bouncy", false)).toEqual(springs.bouncy);
    expect(springs).toEqual({
      snappy: { type: "spring", stiffness: 500, damping: 32 },
      smooth: { type: "spring", stiffness: 260, damping: 30 },
      bouncy: { type: "spring", stiffness: 400, damping: 18 },
    });
    expect(STAGGER).toBe(0.04);
  });
});
