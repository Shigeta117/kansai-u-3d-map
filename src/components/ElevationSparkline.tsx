import type { ElevationSample, RouteMode } from '@/domain/types';

interface ElevationSparklineProps {
  profile: ElevationSample[];
  totalDistanceM: number;
  mode: RouteMode;
}

export function ElevationSparkline({
  profile,
  totalDistanceM,
  mode,
}: ElevationSparklineProps) {
  if (profile.length < 2) {
    return null;
  }

  const width = 320;
  const height = 76;
  const padX = 8;
  const padTop = 10;
  const padBottom = 14;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;

  let minE = Infinity;
  let maxE = -Infinity;
  for (const s of profile) {
    if (s.elevationM < minE) minE = s.elevationM;
    if (s.elevationM > maxE) maxE = s.elevationM;
  }
  const spanE = Math.max(4, maxE - minE);
  const safeDist = Math.max(1, totalDistanceM);

  const coords = profile.map((s) => {
    const x = padX + (s.distanceM / safeDist) * innerW;
    const y = padTop + (1 - (s.elevationM - minE) / spanE) * innerH;
    return { x, y, isSteps: s.isSteps, elev: s.elevationM };
  });

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${(padX + innerW).toFixed(1)} ${(height - padBottom).toFixed(1)} L ${padX.toFixed(1)} ${(height - padBottom).toFixed(1)} Z`;

  const strokeColor = mode === 'gentle' ? '#2B8A6E' : '#C85A3A';
  const startElev = profile[0]?.elevationM ?? 0;
  const endElev = profile[profile.length - 1]?.elevationM ?? 0;

  return (
    <div className="rounded-xl border border-[#E3DDD1] bg-[#F5F1E8]/80 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-[#5F6875]">
        <span>標高プロフィール（高低差）</span>
        <span className="tabular-nums text-[#1D2430]">
          {startElev.toFixed(1)}m → {endElev.toFixed(1)}m
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[68px] w-full overflow-visible"
        aria-label="ルートの標高断面図"
      >
        <defs>
          <linearGradient id={`elev-grad-${mode}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.03" />
          </linearGradient>
        </defs>

        <line
          x1={padX}
          y1={height - padBottom}
          x2={padX + innerW}
          y2={height - padBottom}
          stroke="#D8D0C1"
          strokeWidth="1"
        />

        <path d={areaPath} fill={`url(#elev-grad-${mode})`} />
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {coords.map((c, i) =>
          c.isSteps ? (
            <circle
              key={i}
              cx={c.x}
              cy={c.y}
              r="2.6"
              fill="#FAF7F2"
              stroke="#B85D19"
              strokeWidth="1.5"
            />
          ) : null,
        )}

        <circle cx={coords[0]?.x} cy={coords[0]?.y} r="3.4" fill="#2B8A6E" />
        <circle
          cx={coords[coords.length - 1]?.x}
          cy={coords[coords.length - 1]?.y}
          r="3.4"
          fill="#C85A3A"
        />

        <text
          x={padX}
          y={height - 2}
          fontSize="9"
          fill="#6C7480"
          className="tabular-nums"
        >
          0m
        </text>
        <text
          x={padX + innerW}
          y={height - 2}
          fontSize="9"
          textAnchor="end"
          fill="#6C7480"
          className="tabular-nums"
        >
          {Math.round(totalDistanceM)}m
        </text>
      </svg>
    </div>
  );
}

