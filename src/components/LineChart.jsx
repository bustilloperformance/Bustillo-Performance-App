import { C } from '../theme';

// ============================================================
//  LINE CHART — branded SVG line chart (ported from the prototype).
//  data: [{ value, label }]
// ============================================================
export default function LineChart({ data, width = 600, height = 200, color = C.ink, secondColor = C.gold, fit = false }) {
  if (!data || data.length === 0) {
    return <div className="text-center py-8" style={{ color: C.moss, fontSize: '12px' }}>No data yet — log a session to begin.</div>;
  }

  const padding = { top: 20, right: 34, bottom: 34, left: 48 };
  const chartH = height - padding.top - padding.bottom;
  // Inset the plotted points from the axes so the first/last dots (and their
  // labels) don't sit on top of the axis — the first point was barely visible.
  const innerPadX = 16;
  const spanLeft = padding.left + innerPadX;
  const spanRight = width - padding.right - innerPadX;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  let yMin, yMax;
  if (max === min) {
    const pad = Math.max(2, Math.abs(max) * 0.2);
    yMin = max - pad; yMax = max + pad;
  } else {
    const pad = (max - min) * 0.1;
    yMin = min - pad; yMax = max + pad;
  }
  const yRange = yMax - yMin;

  const points = data.map((d, i) => ({
    x: data.length === 1 ? (spanLeft + spanRight) / 2 : spanLeft + (i / (data.length - 1)) * (spanRight - spanLeft),
    y: padding.top + chartH - ((d.value - yMin) / yRange) * chartH,
    ...d,
  }));
  const path = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
  const last = points[points.length - 1];

  return (
    // `fit` makes the chart fill a sized box instead of deriving its height
    // from its width. Without it, a wide container renders a proportionally
    // tall chart that overflows whatever cell it was given.
    <svg width="100%" {...(fit ? { height: '100%', preserveAspectRatio: 'xMidYMid meet' } : {})}
      viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={padding.left} x2={width - padding.right} y1={padding.top + chartH * t} y2={padding.top + chartH * t}
          stroke={C.sand} strokeWidth="0.5" strokeDasharray={t === 1 ? '0' : '2,4'} />
      ))}
      {[0, 0.5, 1].map((t) => (
        <text key={t} x={padding.left - 8} y={padding.top + chartH * t + 5} textAnchor="end" fontSize="14" fill={C.moss} fontFamily="JetBrains Mono">
          {Math.round(yMax - yRange * t)}
        </text>
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => {
        const isLast = i === points.length - 1;
        return isLast ? (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="6" fill={secondColor} />
            <circle cx={p.x} cy={p.y} r="11" fill="none" stroke={secondColor} strokeWidth="1" opacity="0.4" />
          </g>
        ) : <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} />;
      })}
      {/* First result: labelled above its dot so it reads clearly off the axis. */}
      {points.length > 1 && (
        <text x={points[0].x} y={points[0].y - 12} textAnchor="middle" fontSize="16" fill={C.ink} fontFamily="JetBrains Mono" fontWeight="700">{points[0].value}</text>
      )}
      <text x={last.x + 14} y={last.y + 5} fontSize="18" fill={C.ink} fontFamily="JetBrains Mono" fontWeight="700">{last.value}</text>
      {points.map((p, i) =>
        i % Math.ceil(points.length / 6) === 0 ? (
          <text key={`x${i}`} x={p.x} y={height - 8} textAnchor="middle" fontSize="13" fill={C.moss} fontFamily="JetBrains Mono">{p.label}</text>
        ) : null
      )}
    </svg>
  );
}
