const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/** Renders a simple weight-over-time line chart into `container`. `points`
 *  is [{timestamp, weightLbs, reps}], ascending by timestamp. No external
 *  charting library — this is the only place SVG is hand-built for the app. */
export function renderProgressionChart(container, points) {
  container.replaceChildren();
  if (points.length === 0) {
    const empty = document.createElement("p");
    empty.className = "chart-empty";
    empty.textContent = "No logged sets for this exercise yet.";
    container.appendChild(empty);
    return;
  }

  const width = 640;
  const height = 280;
  const margin = { top: 16, right: 16, bottom: 32, left: 48 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const minTs = points[0].timestamp;
  const maxTs = points[points.length - 1].timestamp;
  const tsRange = Math.max(maxTs - minTs, 1);
  const minW = Math.min(...points.map((p) => p.weightLbs));
  const maxW = Math.max(...points.map((p) => p.weightLbs));
  const wPad = Math.max((maxW - minW) * 0.15, 5);
  const yMin = Math.max(0, minW - wPad);
  const yMax = maxW + wPad;
  const wRange = Math.max(yMax - yMin, 1);

  const x = (ts) => margin.left + ((ts - minTs) / tsRange) * plotWidth;
  const y = (w) => margin.top + plotHeight - ((w - yMin) / wRange) * plotHeight;

  const svg = el("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "progression-chart",
    role: "img",
    "aria-label": "Weight progression over time",
  });

  // Y-axis gridlines + labels (4 bands).
  const bands = 4;
  for (let i = 0; i <= bands; i++) {
    const w = yMin + (wRange * i) / bands;
    const gy = y(w);
    svg.appendChild(
      el("line", { x1: margin.left, x2: width - margin.right, y1: gy, y2: gy, class: "chart-grid" }),
    );
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", margin.left - 8);
    label.setAttribute("y", gy + 4);
    label.setAttribute("class", "chart-axis-label");
    label.setAttribute("text-anchor", "end");
    label.textContent = Math.round(w);
    svg.appendChild(label);
  }

  // X-axis labels: first and last date, plus a middle one if there's room.
  const dateFmt = (ts) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const xLabels = points.length > 2 ? [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]] : points;
  for (const p of xLabels) {
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", x(p.timestamp));
    label.setAttribute("y", height - margin.bottom + 20);
    label.setAttribute("class", "chart-axis-label");
    label.setAttribute("text-anchor", "middle");
    label.textContent = dateFmt(p.timestamp);
    svg.appendChild(label);
  }

  // Line.
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.timestamp).toFixed(1)} ${y(p.weightLbs).toFixed(1)}`)
    .join(" ");
  svg.appendChild(el("path", { d: pathD, class: "chart-line", fill: "none" }));

  // Points with a native tooltip (title) — no JS hover handling needed.
  for (const p of points) {
    const circle = el("circle", { cx: x(p.timestamp), cy: y(p.weightLbs), r: 4, class: "chart-point" });
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = `${dateFmt(p.timestamp)} — ${p.weightLbs} lbs${p.reps != null ? ` × ${p.reps}` : ""}`;
    circle.appendChild(title);
    svg.appendChild(circle);
  }

  container.appendChild(svg);
}
