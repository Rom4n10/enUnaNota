const BARS = [0.55, 1, 0.7, 0.9, 0.45];

export function Logo({ playing = true }: { playing?: boolean }) {
  return (
    <span className="flex h-9 w-9 items-end justify-center gap-[3px] rounded-xl bg-lime p-2 shadow-[0_6px_20px_-6px_rgba(200,255,46,0.7)]">
      {BARS.map((h, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-ink"
          style={{
            height: `${h * 100}%`,
            animation: playing ? `eq ${0.7 + i * 0.13}s ease-in-out ${i * 0.09}s infinite` : undefined,
          }}
        />
      ))}
    </span>
  );
}
