import type { ElevationSample, RouteMode } from '@kansai-u-3d/core';

interface ElevationSparklineProps {
  profile: ElevationSample[];
  totalDistanceM: number;
  mode: RouteMode;
  usesShureiBridge?: boolean;
}

const MODE_STROKE: Record<RouteMode, string> = {
  shortest: '#C85A3A',
  gentle: '#2B8A6E',
  'step-free': '#1F7A8C',
};

export function ElevationSparkline({
  profile,
  totalDistanceM,
  mode,
  usesShureiBridge = false,
}: ElevationSparklineProps) {
  if (profile.length < 2) {
    return null;
  }

  const width = 320;
  const height = 78;
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
    return {
      x,
      y,
      isSteps: s.isSteps,
      isBridge: s.isBridge,
      isEscalator: s.isEscalator,
      elev: s.elevationM,
    };
  });

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${(padX + innerW).toFixed(1)} ${(height - padBottom).toFixed(1)} L ${padX.toFixed(1)} ${(height - padBottom).toFixed(1)} Z`;

  const strokeColor = MODE_STROKE[mode];
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

        {coords.map((c, i) => {
          if (c.isSteps) {
            return (
              <circle
                key={`step-${i}`}
                cx={c.x}
                cy={c.y}
                r="2.7"
                fill="#FAF7F2"
                stroke="#C85A3A"
                strokeWidth="1.6"
              />
            );
          }
          if (c.isEscalator) {
            return (
              <circle
                key={`esc-${i}`}
                cx={c.x}
                cy={c.y}
                r="2.6"
                fill="#E6F6F0"
                stroke="#2B8A6E"
                strokeWidth="1.6"
              />
            );
          }
          if (c.isBridge) {
            return (
              <circle
                key={`br-${i}`}
                cx={c.x}
                cy={c.y}
                r="2.4"
                fill="#E2F4FA"
                stroke="#1F7A8C"
                strokeWidth="1.5"
              />
            );
          }
          return null;
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#666F7B]">
        <span>出発 {minE.toFixed(1)}m〜最大 {maxE.toFixed(1)}m</span>
        <div className="flex items-center gap-2.5">
          {coords.some((c) => c.isSteps) && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full border border-[#C85A3A] bg-[#FAF7F2]" />
              階段
            </span>
          )}
          {coords.some((c) => c.isEscalator) && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full border border-[#2B8A6E] bg-[#E6F6F0]" />
              エスカレーター
            </span>
          )}
          {coords.some((c) => c.isBridge) && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full border border-[#1F7A8C] bg-[#E2F4FA]" />
              {usesShureiBridge ? '高架（秀麗橋）' : '高架デッキ'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

