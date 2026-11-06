/** Full-screen brand splash while auth/session resolves. */
export function Splash() {
  return (
    <main className="grid min-h-dvh place-items-center px-6" aria-busy="true" aria-label="loading">
      <p className="animate-byw-pulse font-display text-[56px] uppercase leading-[0.9] tracking-[-0.03em]">
        <span className="block text-accent-2">bet you</span>
        <span className="block">won&apos;t.</span>
      </p>
    </main>
  );
}
