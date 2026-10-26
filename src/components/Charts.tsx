import { useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import "./charts.css";

type TrendPoint = { label: string; value: number };
type ComparisonRow = {
  label: string;
  home: number | null;
  away: number | null;
};

function percentile(value: number | null): number | null {
  return value === null || !Number.isFinite(value)
    ? null
    : Math.min(100, Math.max(0, value));
}

function numberLabel(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    value,
  );
}

function withUnit(value: number, unit: string): string {
  return `${numberLabel(value)}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;
}

/** A higher percentile always indicates a stronger measured team profile. */
export function PercentileBar({
  value,
  tone = "#1761ec",
  compact = false,
  label,
}: {
  value: number | null;
  tone?: string;
  compact?: boolean;
  label?: string;
}) {
  const score = percentile(value);
  const color = { "--chart-color": tone } as CSSProperties;

  return (
    <div
      className={`percentile-bar${compact ? " percentile-bar--compact" : ""}${score === null ? " percentile-bar--missing" : ""}`}
      style={color}
      role="img"
      aria-label={`${label ? `${label}: ` : ""}${score === null ? "No percentile available" : `${Math.round(score)} percentile points, higher is stronger`}`}
    >
      <svg
        className="percentile-bar__track"
        viewBox="0 0 100 8"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect
          x="0"
          y="0"
          width="100"
          height="8"
          rx="4"
          className="percentile-bar__background"
        />
        {[25, 50, 75].map((tick) => (
          <line
            key={tick}
            x1={tick}
            y1="1"
            x2={tick}
            y2="7"
            className="percentile-bar__tick"
          />
        ))}
        {score !== null && (
          <rect
            x="0"
            y="0"
            width={score}
            height="8"
            rx="4"
            className="percentile-bar__fill chart-reveal"
          />
        )}
      </svg>
      <span className="percentile-bar__value" aria-hidden="true">
        {score === null ? "—" : Math.round(score)}
      </span>
    </div>
  );
}

/** Values remain in their supplied metric, with no smoothing or fitted trend. */
export function TrendChart({
  points,
  color = "#1761ec",
  unit = "",
}: {
  points: TrendPoint[];
  color?: string;
  unit?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const circles = useRef<Array<SVGCircleElement | null>>([]);
  const validPoints = points.filter((point) => Number.isFinite(point.value));
  const style = { "--chart-color": color } as CSSProperties;

  if (validPoints.length === 0) {
    return (
      <div className="chart-empty" role="status">
        No trend observations available.
      </div>
    );
  }

  const width = 680;
  const height = 230;
  const left = 62;
  const right = width - 22;
  const top = 32;
  const bottom = height - 36;
  const values = validPoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding =
    max === min ? Math.max(Math.abs(max) * 0.15, 0.1) : (max - min) * 0.2;
  const domainMin = min - padding;
  const domainMax = max + padding;
  const xAt = (index: number) =>
    validPoints.length === 1
      ? (left + right) / 2
      : left + (index / (validPoints.length - 1)) * (right - left);
  const yAt = (value: number) =>
    bottom - ((value - domainMin) / (domainMax - domainMin)) * (bottom - top);
  const path = validPoints
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(point.value)}`,
    )
    .join(" ");
  const selectedIndex =
    activeIndex !== null && activeIndex < validPoints.length
      ? activeIndex
      : null;
  const selectedPoint =
    selectedIndex === null ? null : validPoints[selectedIndex];
  const tooltipX =
    selectedIndex === null
      ? left
      : Math.max(left, Math.min(right - 154, xAt(selectedIndex) - 77));
  const tooltipY =
    selectedPoint === null ? top : Math.max(3, yAt(selectedPoint.value) - 61);
  const labelStep = Math.max(1, Math.ceil((validPoints.length - 1) / 6));
  const ticks = [domainMin, (domainMin + domainMax) / 2, domainMax];

  function navigate(event: KeyboardEvent<SVGCircleElement>, index: number) {
    let nextIndex: number;
    if (event.key === "ArrowRight")
      nextIndex = Math.min(validPoints.length - 1, index + 1);
    else if (event.key === "ArrowLeft") nextIndex = Math.max(0, index - 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = validPoints.length - 1;
    else if (event.key === "Escape") {
      setActiveIndex(null);
      return;
    } else return;
    event.preventDefault();
    circles.current[nextIndex]?.focus();
  }

  return (
    <div className="chart-trend" style={style}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <title id={titleId}>
          Observed performance trend{unit ? ` (${unit})` : ""}
        </title>
        <desc id={descriptionId}>
          {validPoints.length} observations. Focus a point for its value; use
          left and right arrow keys to move between points.
        </desc>
        {ticks.map((tick, index) => (
          <g key={index} aria-hidden="true">
            <line
              x1={left}
              y1={yAt(tick)}
              x2={right}
              y2={yAt(tick)}
              className="chart-gridline"
            />
            <text
              x={left - 12}
              y={yAt(tick) + 4}
              textAnchor="end"
              className="chart-axis-label"
            >
              {numberLabel(tick)}
            </text>
          </g>
        ))}
        {domainMin < 0 && domainMax > 0 && (
          <line
            x1={left}
            y1={yAt(0)}
            x2={right}
            y2={yAt(0)}
            className="chart-zero-line"
            aria-hidden="true"
          />
        )}
        <path d={path} className="chart-trend__line" aria-hidden="true" />
        {validPoints.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle
              cx={xAt(index)}
              cy={yAt(point.value)}
              r={index === selectedIndex ? 5 : 3.5}
              className="chart-trend__point"
              aria-hidden="true"
            />
            <circle
              ref={(node) => {
                circles.current[index] = node;
              }}
              cx={xAt(index)}
              cy={yAt(point.value)}
              r="14"
              tabIndex={0}
              role="button"
              aria-label={`${point.label}: ${withUnit(point.value, unit)}`}
              className="chart-trend__target"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseLeave={() => {
                if (document.activeElement !== circles.current[index])
                  setActiveIndex(null);
              }}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => navigate(event, index)}
            />
            {(index % labelStep === 0 || index === validPoints.length - 1) && (
              <text
                x={xAt(index)}
                y={height - 10}
                textAnchor="middle"
                className="chart-axis-label"
                aria-hidden="true"
              >
                {point.label}
              </text>
            )}
          </g>
        ))}
        {selectedPoint !== null && selectedIndex !== null && (
          <g
            className="chart-trend__tooltip"
            pointerEvents="none"
            aria-hidden="true"
          >
            <line
              x1={xAt(selectedIndex)}
              y1={top}
              x2={xAt(selectedIndex)}
              y2={bottom}
              className="chart-trend__guide"
            />
            <rect x={tooltipX} y={tooltipY} width="154" height="50" rx="7" />
            <text
              x={tooltipX + 12}
              y={tooltipY + 18}
              className="chart-trend__tooltip-label"
            >
              {selectedPoint.label}
            </text>
            <text
              x={tooltipX + 12}
              y={tooltipY + 37}
              className="chart-trend__tooltip-value"
            >
              {withUnit(selectedPoint.value, unit)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/** Side-by-side percentile profiles. Colors identify the two teams. */
export function ComparisonChart({
  rows,
  homeLabel,
  awayLabel,
  homeColor = "#1761ec",
  awayColor = "#718087",
}: {
  rows: ComparisonRow[];
  homeLabel: string;
  awayLabel: string;
  homeColor?: string;
  awayColor?: string;
}) {
  if (rows.length === 0)
    return (
      <div className="chart-empty" role="status">
        No comparison categories available.
      </div>
    );

  return (
    <div className="chart-comparison">
      <div className="chart-comparison__legend" aria-hidden="true">
        <span>
          <i style={{ backgroundColor: homeColor }} />
          {homeLabel}
        </span>
        <span>
          <i style={{ backgroundColor: awayColor }} />
          {awayLabel}
        </span>
      </div>
      <div className="chart-comparison__rows">
        {rows.map((row, index) => (
          <div className="chart-comparison__row" key={`${row.label}-${index}`}>
            <div className="chart-comparison__label">{row.label}</div>
            <div className="chart-comparison__bars">
              <PercentileBar
                value={row.home}
                tone={homeColor}
                compact
                label={`${row.label}, ${homeLabel}`}
              />
              <PercentileBar
                value={row.away}
                tone={awayColor}
                compact
                label={`${row.label}, ${awayLabel}`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="chart-comparison__caption">
        League percentile · higher is stronger
      </div>
    </div>
  );
}
