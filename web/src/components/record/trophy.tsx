import type { Level } from "@/lib/record/levels";
import { cn } from "@/lib/utils";

const ORDER: Level["id"][] = ["ready", "first", "bronze", "silver", "gold", "platinum", "diamond", "legend", "hall"];
const atLeast = (id: Level["id"], than: Level["id"]) => ORDER.indexOf(id) >= ORDER.indexOf(than);

/** Leaves of a laurel branch along an arc beside the cup (left side; the right one is mirrored). */
const LEAVES = Array.from({ length: 8 }, (_, i) => {
  const t = i / 7;
  const angle = Math.PI * (0.8 + t * 0.48); // around the outside of the left handle, from beside the rim down to the base
  // rounded: the server and the browser compute cos/sin a hair differently, which would break hydration
  const round = (n: number) => Math.round(n * 100) / 100;
  return { x: round(100 + Math.cos(angle) * 88), y: round(104 - Math.sin(angle) * 82), r: round((angle * 180) / Math.PI) };
});

/** Sparkle positions around the trophy (percent of the stage); more of them at higher levels. */
const SPARKLES = [
  [14, 22], [84, 18], [8, 58], [90, 52], [22, 84], [78, 82], [50, 6], [30, 10], [70, 8], [4, 38], [96, 34], [16, 70], [86, 70], [40, 92], [62, 94], [26, 44], [74, 40], [50, 96],
];
const SPARKLE_COUNT: Partial<Record<Level["id"], number>> = { gold: 6, platinum: 9, diamond: 12, legend: 15, hall: 18 };

/**
 * The Proofread record trophy: drawn here (no image files), richer at every level: a glow from Bronze, light rays from
 * Silver, sparkles from Gold, a laurel wreath from Platinum, a gem from Diamond, a turning ring from Legend, a crown at
 * Hall of fame. Animations stop for people who turned motion off (globals.css).
 */
export function Trophy({ level, finished, className }: { level: Level["id"]; finished: number; className?: string }) {
  const ready = level === "ready";
  const sparkles = SPARKLE_COUNT[level] ?? 0;
  return (
    <div
      data-trophy={level}
      className={cn("trophy-stage relative mx-auto aspect-square w-full max-w-[19rem]", className)}
      style={{ "--metal": `var(--trophy-${level})` } as React.CSSProperties}
    >
      {atLeast(level, "legend") && <div aria-hidden className="trophy-ring absolute inset-[6%] rounded-full" />}
      {atLeast(level, "silver") && <div aria-hidden className="trophy-rays absolute inset-[-10%] rounded-full" />}
      {atLeast(level, "bronze") && <div aria-hidden className="trophy-glow absolute inset-[18%] rounded-full" />}
      {SPARKLES.slice(0, sparkles).map(([x, y], i) => (
        <span key={i} aria-hidden className="trophy-sparkle absolute" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i * 0.37) % 2.4}s` }}>
          ✦
        </span>
      ))}
      <svg viewBox="0 0 200 230" role="img" aria-label={`Trophy, level ${level}`} className="trophy-cup relative h-full w-full">
        <defs>
          <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: "color-mix(in srgb, var(--metal) 55%, var(--trophy-ink))" }} />
            <stop offset="0.35" style={{ stopColor: "color-mix(in srgb, var(--metal) 55%, var(--trophy-shine))" }} />
            <stop offset="0.6" style={{ stopColor: "var(--metal)" }} />
            <stop offset="1" style={{ stopColor: "color-mix(in srgb, var(--metal) 60%, var(--trophy-ink))" }} />
          </linearGradient>
        </defs>
        {atLeast(level, "platinum") &&
          [1, -1].map((side) => (
            <g key={side} transform={side === -1 ? "translate(200 0) scale(-1 1)" : undefined}>
              {LEAVES.map((l, i) => (
                <ellipse key={i} cx={l.x} cy={l.y} rx="5" ry="11" transform={`rotate(${25 - l.r} ${l.x} ${l.y})`} style={{ fill: "color-mix(in srgb, var(--trophy-gold) 80%, var(--trophy-leaf))" }} />
              ))}
            </g>
          ))}
        {level === "hall" && <path d="M68 30 L76 8 L90 22 L100 4 L110 22 L124 8 L132 30 Z" style={{ fill: "var(--trophy-hall)", stroke: "var(--trophy-ink)", strokeWidth: 1.5 }} />}
        <g
          style={
            ready
              ? { fill: "none", stroke: "var(--metal)", strokeWidth: 3, strokeDasharray: "7 6" }
              : { fill: "url(#metal)", stroke: "color-mix(in srgb, var(--metal) 50%, var(--trophy-ink))", strokeWidth: 1.2 }
          }
        >
          <path d="M60 52 C 26 52 26 104 74 108" style={ready ? undefined : { fill: "none", stroke: "url(#metal)", strokeWidth: 9 }} />
          <path d="M140 52 C 174 52 174 104 126 108" style={ready ? undefined : { fill: "none", stroke: "url(#metal)", strokeWidth: 9 }} />
          <path d="M54 40 H146 V70 C146 104 124 126 100 126 C76 126 54 104 54 70 Z" />
          <rect x="50" y="32" width="100" height="10" rx="5" />
          <path d="M92 126 H108 L113 152 H87 Z" />
          <rect x="74" y="152" width="52" height="10" rx="3" />
        </g>
        {!ready && <path d="M66 46 C 64 76 72 98 86 112" style={{ fill: "none", stroke: "var(--trophy-shine)", strokeOpacity: 0.45, strokeWidth: 5, strokeLinecap: "round" }} />}
        {atLeast(level, "diamond") && <polygon points="100,62 113,80 100,98 87,80" style={{ fill: "var(--trophy-diamond)", stroke: "var(--trophy-shine)", strokeWidth: 2 }} />}
        {(level === "first" || level === "bronze" || level === "silver" || level === "gold") && (
          <path d="M100 66 l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1z" style={{ fill: "var(--trophy-shine)", fillOpacity: 0.85 }} />
        )}
        <rect x="58" y="162" width="84" height="44" rx="6" style={{ fill: "var(--trophy-ink)" }} />
        <rect x="70" y="172" width="60" height="24" rx="3" style={ready ? { fill: "none", stroke: "var(--metal)", strokeWidth: 1.5 } : { fill: "url(#metal)" }} />
        <text x="100" y="189.5" textAnchor="middle" className="font-serif" style={{ fontSize: 15, fontWeight: 600, fill: ready ? "var(--metal)" : "var(--trophy-ink)" }}>
          {finished}
        </text>
      </svg>
    </div>
  );
}
