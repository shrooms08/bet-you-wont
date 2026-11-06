// Tiny bridge so any component can fire canvas effects owned by the single <FxLayer/>.
// When no layer is mounted (tests, server) every call is a no-op.

type FxHandler = {
  burst: (x: number, y: number) => void;
  confetti: (x: number, y: number) => void;
  emoji: (x: number, y: number, emoji: string, count?: number) => void;
  reduced: () => boolean;
};

let handler: FxHandler | null = null;

export function registerFx(h: FxHandler): () => void {
  handler = h;
  return () => {
    if (handler === h) handler = null;
  };
}

export const fx = {
  burst: (x: number, y: number) => handler?.burst(x, y),
  confetti: (x: number, y: number) => handler?.confetti(x, y),
  emoji: (x: number, y: number, emoji: string, count?: number) => handler?.emoji(x, y, emoji, count),
  /** True when the user prefers reduced motion (effects are off). */
  reduced: () => handler?.reduced() ?? false,
};
