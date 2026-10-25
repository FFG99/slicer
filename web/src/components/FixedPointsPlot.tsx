import { useEffect, useRef } from "react";
import { fixedPointLegend, fixedPointStyle } from "../lib/fixedPoints";
import type { FixedPointResult } from "../lib/fixedPoints";

const width = 1200, height = 700;
const left = 100, right = 1155, top = 50, bottom = 620;
const radius = 1.15;

function plotData(result: FixedPointResult, coordinate: number) {
  const points = result.samples.flatMap((s, sampleIndex) => s.points.map((point, rootIndex) => ({
    ...point, sampleIndex, rootIndex, t: s.t ?? (result.offset + sampleIndex) / Math.max(1, result.total - 1),
  })));
  let lo = Infinity, hi = -Infinity;
  for (const point of points) { lo = Math.min(lo, point.state[coordinate]); hi = Math.max(hi, point.state[coordinate]); }
  if (!Number.isFinite(lo)) { lo = -1; hi = 1; } else if (lo === hi) { lo -= 1; hi += 1; }
  const margin = (hi - lo) * .05; lo -= margin; hi += margin;
  const first = result.samples[0]?.parameter ?? 0, last = result.samples.at(-1)?.parameter ?? 1;
  const legend = fixedPointLegend(result);
  const px = (t: number) => left + 24 + (right - left - 48) * t;
  const py = (v: number) => bottom - (bottom - top) * (v - lo) / (hi - lo);
  const legendHeight = legend.length * 27 + 12;
  const legendWidth = Math.max(196, ...legend.map(item => item.code.length * 9 + 60));
  const corners = [[right - legendWidth - 14, top + 14], [left + 14, top + 14], [right - legendWidth - 14, bottom - legendHeight - 14], [left + 14, bottom - legendHeight - 14]];
  const overlap = ([x, y]: number[]) => points.filter(p => px(p.t) >= x - 8 && px(p.t) <= x + legendWidth + 8 && py(p.state[coordinate]) >= y - 8 && py(p.state[coordinate]) <= y + legendHeight + 8).length;
  const [legendX, legendY] = corners.reduce((best, next) => overlap(next) < overlap(best) ? next : best);
  return { points, lo, hi, first, last, legend,
    px, py, legendX, legendY, legendWidth,
  };
}
const format = (value: number) => String(Number(value.toPrecision(5)));

export function fixedPointsSvg(result: FixedPointResult, coordinate: number): string {
  const { points, lo, hi, first, last, px, py, legend, legendX, legendY, legendWidth } = plotData(result, coordinate);
  const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/><g font-family="sans-serif" font-size="15" fill="#202020">`];
  parts.push(`<path d="M${left} ${top}V${bottom}H${right}V${top}Z" fill="none" stroke="#303030"/>`);
  for (let i = 0; i <= 5; i++) {
    const t = i / 5, y = bottom - (bottom - top) * t;
    parts.push(`<path d="M${left - 5} ${y}H${left}M${px(t)} ${bottom}v5" stroke="#303030"/><text x="${left - 12}" y="${y + 5}" text-anchor="end">${format(lo + t * (hi - lo))}</text><text x="${px(t)}" y="${bottom + 28}" text-anchor="middle">${format(first + t * (last - first))}</text>`);
  }
  parts.push(`<text x="600" y="29" text-anchor="middle" font-size="20">Бифуркационная диаграмма</text><text x="600" y="681" text-anchor="middle" font-size="18">${escape(result.parameter)}</text><text transform="translate(28 335) rotate(-90)" text-anchor="middle" font-size="18">${escape(result.variables[coordinate])}</text></g>`);
  for (const point of points) parts.push(`<circle cx="${px(point.t).toFixed(3)}" cy="${py(point.state[coordinate]).toFixed(3)}" r="${radius}" fill="${fixedPointStyle(point).color}"/>`);
  parts.push(`<g font-family="sans-serif" font-size="15"><rect x="${legendX}" y="${legendY}" width="${legendWidth}" height="${legend.length * 27 + 12}" rx="4" fill="#ffffff" fill-opacity="0.95" stroke="#cccccc"/>`);
  legend.forEach((item, i) => parts.push(`<rect x="${legendX + 12}" y="${legendY + 13 + i * 27}" width="23" height="13" fill="${item.color}"/><text x="${legendX + 45}" y="${legendY + 25 + i * 27}" fill="#202020">${escape(item.code)}</text>`));
  parts.push('</g></svg>'); return parts.join('');
}

export function FixedPointsPlot({ result, coordinate, selected, onSelect }: {
  result: FixedPointResult; coordinate: number; selected: [number, number] | null; onSelect: (sample: number, root: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const positions = useRef<{ x: number; y: number; sample: number; root: number }[]>([]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const { points, lo, hi, first, last, px, py, legend, legendX, legendY, legendWidth } = plotData(result, coordinate);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    positions.current = [];
    ctx.font = '15px system-ui, sans-serif'; ctx.lineWidth = 1;
    ctx.strokeStyle = '#303030'; ctx.strokeRect(left, top, right - left, bottom - top);
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, y = bottom - (bottom - top) * t;
      ctx.beginPath(); ctx.moveTo(left - 5, y); ctx.lineTo(left, y); ctx.moveTo(px(t), bottom); ctx.lineTo(px(t), bottom + 5); ctx.stroke();
      ctx.fillStyle = '#202020'; ctx.textAlign = 'right'; ctx.fillText(format(lo + t * (hi - lo)), left - 12, y + 5);
      ctx.textAlign = 'center'; ctx.fillText(format(first + t * (last - first)), px(t), bottom + 28);
    }
    ctx.fillStyle = '#202020'; ctx.textAlign = 'center'; ctx.font = '20px system-ui, sans-serif'; ctx.fillText('Бифуркационная диаграмма', 600, 29);
    ctx.font = '18px system-ui, sans-serif'; ctx.fillText(result.parameter, 600, 681);
    ctx.save(); ctx.translate(28, 335); ctx.rotate(-Math.PI / 2); ctx.fillText(result.variables[coordinate], 0, 0); ctx.restore();
    for (const point of points) {
      const x = px(point.t), y = py(point.state[coordinate]);
      const chosen = selected?.[0] === point.sampleIndex && selected[1] === point.rootIndex;
      positions.current.push({ x, y, sample: point.sampleIndex, root: point.rootIndex });
      ctx.fillStyle = fixedPointStyle(point).color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      if (chosen) { ctx.strokeStyle = '#303030'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.fillStyle = 'rgba(255, 255, 255, .95)'; ctx.fillRect(legendX, legendY, legendWidth, legend.length * 27 + 12);
    ctx.strokeStyle = '#cccccc'; ctx.strokeRect(legendX, legendY, legendWidth, legend.length * 27 + 12);
    ctx.font = '15px system-ui, sans-serif'; ctx.textAlign = 'left';
    legend.forEach((item, i) => {
      ctx.fillStyle = item.color; ctx.fillRect(legendX + 12, legendY + 13 + i * 27, 23, 13);
      ctx.fillStyle = '#202020'; ctx.fillText(item.code, legendX + 45, legendY + 25 + i * 27);
    });
  }, [result, coordinate, selected]);
  return <canvas ref={canvas} width={width} height={height} aria-label="График бифуркационной диаграммы" onClick={event => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * width / rect.width, y = (event.clientY - rect.top) * height / rect.height;
    let nearest: typeof positions.current[number] | undefined, distance = 16 ** 2;
    for (const p of positions.current) { const d = (x - p.x) ** 2 + (y - p.y) ** 2; if (d < distance) { distance = d; nearest = p; } }
    if (nearest) onSelect(nearest.sample, nearest.root);
  }} />;
}
