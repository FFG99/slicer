import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cancelRun, createRun, downloadRunArtifact, getFixedPoints, getRun, getSystem } from "../api/client";
import { fixedPointConditionLabels, fixedPointEndpoints, fixedPointLegend, fixedPointStyle, supportsFixedPointDiagram } from "../lib/fixedPoints";
import type { FixedPointResult } from "../lib/fixedPoints";
import type { Run, SystemDefinition } from "../types";
import { NumberInput } from "./NumberInput";
import { FixedPointsPlot, fixedPointsSvg } from "./FixedPointsPlot";

const defaults = { steps: 400, seeds_per_axis: 7, max_iterations: 40, tolerance: 1e-10, derivative_step: 1e-5, stability_tolerance: 1e-6 };

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  try { const body = JSON.parse(message); if (typeof body.detail === 'string') return body.detail; } catch { /* use the original message */ }
  return message;
}
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FixedPointsPanel({ system, info, start, end, initialRun, onSelect, onClose }: {
  system: string; info: SystemDefinition; start: Record<string, number>; end: Record<string, number>;
  initialRun?: Run; onSelect?: () => void; onClose: () => void;
}) {
  const p = initialRun?.parameters;
  const [endpoints, setEndpoints] = useState([start, end]);
  const [lower, setLower] = useState(() => p?.state_min as number[] ?? info.variables.map(() => -2));
  const [upper, setUpper] = useState(() => p?.state_max as number[] ?? info.variables.map(() => 2));
  const [settings, setSettings] = useState(() => ({ ...defaults, ...p } as typeof defaults));
  const [coordinate, setCoordinate] = useState(0), [sampleIndex, setSampleIndex] = useState(0);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [run, setRun] = useState<Run | null>(initialRun ?? null);
  const [result, setResult] = useState<FixedPointResult | null>(null);
  const [submitting, setSubmitting] = useState(false), [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(!initialRun || initialRun.status !== 'done');
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  const runId = run?.id;
  const busy = submitting || run?.status === 'queued' || run?.status === 'running';
  useEffect(() => { active.current = true; dialog.current?.showModal(); return () => { active.current = false; }; }, []);
  useEffect(() => {
    if (!runId) return;
    let live = true, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const current = await getRun(runId!);
        if (!live) return;
        setRun(current);
        if (current.status === 'done') {
          const data = await getFixedPoints(current.id);
          if (live) { setResult(data); setShowSettings(false); }
        } else if (current.status === 'failed') setError(current.error_message ?? 'Не удалось построить диаграмму.');
        else if (current.status === 'queued' || current.status === 'running') timer = setTimeout(() => void poll(), 800);
      } catch (e) { if (live) setError(errorText(e)); }
    }
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [runId]);

  async function compute() {
    setSubmitting(true); setError(''); setResult(null); setSelected(null); setSampleIndex(0); setInspecting(false);
    try {
      const numericSettings = Object.fromEntries(Object.keys(defaults).map(key => [key, settings[key as keyof typeof defaults]]));
      const created = await createRun({ calculation_type: 'fixed_point_diagram', system, parameters: {
        ...numericSettings, start: endpoints[0], end: endpoints[1], state_min: lower, state_max: upper,
      } });
      if (active.current) setRun(created);
    } catch (e) { if (active.current) setError(errorText(e)); }
    finally { if (active.current) setSubmitting(false); }
  }
  async function download() {
    if (!runId) return;
    setExporting(true); setError('');
    try { save(await downloadRunArtifact(runId), 'bifurcation-diagram.h5'); }
    catch (e) { if (active.current) setError(errorText(e)); }
    finally { if (active.current) setExporting(false); }
  }
  const sample = result?.samples[sampleIndex];
  const chosen = selected && result?.samples[selected[0]]?.points[selected[1]];
  const select = (sample: number, root: number) => { setSelected([sample, root]); setSampleIndex(sample); setInspecting(true); };
  return createPortal(<dialog ref={dialog} className={`tree-dialog fixed-points-dialog${result && !showSettings ? ' tree-dialog-result' : ''}`} aria-label="Бифуркационная диаграмма" aria-busy={busy} onCancel={onClose}>
    <header className="tree-heading"><h2>Бифуркационная диаграмма</h2><button className="tree-close" aria-label="Закрыть диаграмму" onClick={onClose}>×</button></header>
    {showSettings ? <>
      <div className="tree-route"><span>Параметры отрезка</span>{onSelect && <button disabled={busy} onClick={onSelect}>Выбрать заново</button>}</div>
      <div className="tree-endpoints">{endpoints.map((endpoint, i) => <fieldset key={i} className="tree-initial"><legend>{i === 0 ? 'Начало · A' : 'Конец · B'}</legend><div className="tree-fields">
        {info.parameters.map(name => <NumberInput key={name} label={`${name} · ${i === 0 ? 'A' : 'B'}`} disabled={busy} value={endpoint[name]} onChange={value => setEndpoints(current => current.map((item, j) => j === i ? { ...item, [name]: value } : item))} />)}
      </div></fieldset>)}</div>
      <fieldset className="tree-initial"><legend>Область поиска неподвижных точек</legend><div className="tree-fields">
        {info.variables.map((name, k) => <div key={name} className="fixed-points-bounds"><NumberInput label={`${name} min`} disabled={busy} value={lower[k]} onChange={value => setLower(current => current.map((v, i) => i === k ? value : v))} /><NumberInput label={`${name} max`} disabled={busy} value={upper[k]} onChange={value => setUpper(current => current.map((v, i) => i === k ? value : v))} /></div>)}
      </div></fieldset>
      <div className="tree-fields"><label>Переменная диаграммы<select disabled={busy} value={coordinate} onChange={e => setCoordinate(Number(e.target.value))}>{info.variables.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label>
        <NumberInput label="Точек на отрезке" disabled={busy} integer min={2} max={1000} value={settings.steps} onChange={steps => setSettings(s => ({ ...s, steps }))} />
        <NumberInput label="Начальных приближений на ось" disabled={busy} integer min={2} max={32} value={settings.seeds_per_axis} onChange={seeds_per_axis => setSettings(s => ({ ...s, seeds_per_axis }))} />
      </div>
      <details className="fixed-points-accuracy"><summary>Точность и метод Ньютона</summary><div className="tree-fields">
        {([['max_iterations', 'Максимум итераций', 1, 100], ['tolerance', 'Допуск решения', 1e-13, 1e-4], ['derivative_step', 'Шаг производной', 1e-7, 1e-2], ['stability_tolerance', 'Допуск |μ| ≈ 1', 1e-9, .01]] as const).map(([key, label, min, max]) => <NumberInput key={key} label={label} disabled={busy} integer={key === 'max_iterations'} min={min} max={max} value={settings[key]} onChange={value => setSettings(s => ({ ...s, [key]: value }))} />)}
      </div>{info.variables.length === 1 && <p className="tree-hint">Для 1D дополнительно локализуются корни по смене знака F(x) − x и по стационарным точкам невязки, затем уточняются методом Ньютона.</p>}</details>
      <p className="tree-hint">Метод Ньютона ищет F(x, p) = x из сетки приближений и решений предыдущего шага. Цвет показывает тип неподвижной точки по мультипликаторам. Полнота поиска не гарантируется.</p>
      {busy && <div className="tree-progress" role="status"><span>{run?.status === 'queued' ? 'Ожидание расчёта' : 'Построение диаграммы'} · {Math.floor((run?.progress ?? 0) * 100)}%</span><progress aria-label="Вычисление бифуркационной диаграммы" value={run?.progress ?? 0} max={1} /></div>}
      <footer className="tree-footer"><button className="tree-primary" disabled={busy} onClick={() => void compute()}>{busy ? 'Построение…' : 'Построить диаграмму'}</button>{busy && runId && <button onClick={() => void cancelRun(runId).then(setRun).catch(e => setError(errorText(e)))}>Остановить</button>}{result && <button onClick={() => setShowSettings(false)}>К результату</button>}</footer>
    </> : result ? <>
      <div className="tree-fields fixed-points-result-controls"><label>Переменная диаграммы<select value={coordinate} onChange={e => setCoordinate(Number(e.target.value))}>{result.variables.map((name, i) => <option key={name} value={i}>{name}</option>)}</select></label></div>
      <FixedPointsPlot result={result} coordinate={coordinate} selected={selected} onSelect={select} />
      <div className="fixed-points-legend">{fixedPointLegend(result).map(item => <span key={item.code} title={item.label}><i style={{ background: item.color }} />{item.code}</span>)}</div>
      <p className="tree-hint">{result.samples.reduce((total, s) => total + s.points.length, 0)} точек · {result.total} значений параметра. Нажмите на точку, чтобы увидеть её тип и мультипликаторы.</p>
      {result.parameter === 't' && <p className="tree-hint">t = 0 — начало A, t = 1 — конец B; параметры меняются линейно вдоль отрезка.</p>}
      <details className="fixed-points-inspector" open={inspecting} onToggle={event => setInspecting(event.currentTarget.open)}><summary>Точки и мультипликаторы</summary>
      <label className="field">Срез по параметру<select value={sampleIndex} onChange={e => { setSampleIndex(Number(e.target.value)); setSelected(null); }}>{result.samples.map((s, i) => <option key={i} value={i}>{result.parameter} = {s.parameter.toPrecision(8)} · {s.points.length} решений</option>)}</select></label>
      {sample && <>
        {sample.model_parameters && <p className="tree-hint">{Object.entries(sample.model_parameters).map(([name, value]) => `${name} = ${value.toPrecision(9)}`).join(' · ')}</p>}
        <div className="fixed-points-table"><table><thead><tr><th>Состояние</th><th>Тип</th><th>Мультипликаторы</th><th>Невязка</th><th>Особые условия</th></tr></thead><tbody>{sample.points.map((point, i) => <tr key={i}><td><button onClick={() => select(sampleIndex, i)}>{point.state.map(v => v.toPrecision(8)).join('; ')}</button></td><td><span className="fixed-points-type" title={fixedPointStyle(point).label}><i style={{ background: fixedPointStyle(point).color }} />{fixedPointStyle(point).code}</span></td><td>{point.multipliers.map(([re, im]) => `${re.toPrecision(7)}${im ? ` ${im < 0 ? '−' : '+'} ${Math.abs(im).toPrecision(5)}i` : ''}`).join('; ')}</td><td>{point.residual.toExponential(2)}</td><td>{point.conditions.map(c => fixedPointConditionLabels[c] ?? c).join('; ')}</td></tr>)}</tbody></table></div>
        <p className="tree-hint">Запусков: {sample.attempts} · Не сошлись: {sample.failed_attempts} · Не вычислены производные: {sample.invalid_derivatives}</p>
      </>}
      {chosen && <p className="tree-hint">Выбрано: {result.variables.map((name, k) => `${name} = ${chosen.state[k].toPrecision(12)}`).join('; ')} · невязка {chosen.residual.toExponential(4)}</p>}
      <p className="tree-hint">Условия μ ≈ ±1 и комплексная пара |μ| ≈ 1 — кандидаты на бифуркации. При μ = +1 матрица Ньютона вырождается; негиперболические точки требуют дополнительной проверки.</p>
      </details>
      <footer className="tree-footer tree-result-actions"><button onClick={() => setShowSettings(true)}>Настройки</button><div><button onClick={() => save(new Blob([fixedPointsSvg(result, coordinate)], { type: 'image/svg+xml' }), 'bifurcation-diagram.svg')}>Скачать SVG</button><button disabled={exporting} onClick={() => void download()}>{exporting ? 'Сохранение…' : 'Скачать HDF5'}</button></div></footer>
    </> : <p role="status">Загрузка диаграммы…</p>}
    {error && <p className="tree-error" role="alert">{error}</p>}
  </dialog>, document.body);
}

export function SavedFixedPointsPanel({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [saved, setSaved] = useState<{ run: Run; info: SystemDefinition } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true; setSaved(null); setError('');
    void getRun(runId).then(async run => {
      if (run.calculation_type !== 'fixed_point_diagram') throw new Error('Расчёт не является бифуркационной диаграммой.');
      const systems = await getSystem(run.system), info = systems[run.system];
      if (!info || !supportsFixedPointDiagram(info.variables.length)) throw new Error('Диаграммы доступны только для отображений 1D и 2D.');
      if (live) setSaved({ run, info });
    }).catch(e => { if (live) setError(errorText(e)); });
    return () => { live = false; };
  }, [runId]);
  if (!saved) return <p role={error ? 'alert' : 'status'}>{error || 'Загрузка диаграммы…'} <button onClick={onClose}>Закрыть</button></p>;
  const [start, end] = fixedPointEndpoints(saved.run.parameters);
  return <FixedPointsPanel key={runId} system={saved.run.system} info={saved.info} start={start} end={end} initialRun={saved.run} onClose={onClose} />;
}
