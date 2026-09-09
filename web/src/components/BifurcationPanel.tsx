import { useEffect, useRef, useState } from "react";
import { treeSvg } from "../lib/treeSvg";
import { PhasePortraitPlayer } from "./PhasePortraitPlayer";
import { createPortal } from "react-dom";
import { NumberInput } from "./NumberInput";
import type { SystemDefinition } from "../types";

export type ParameterPoint = { x: number; y: number };
interface TreeResult {
  system: string; variable: string;
  parameters: {start: Record<string,number>; end: Record<string,number>; inherit: boolean};
  samples: {t: number; values: number[]; diverged: boolean; states?:number[][]}[];
}
export function BifurcationPanel({system, info, axes, points, fixed, onSelect, onClose, initialView="tree"}: {
  initialView?: "tree"|"phase";
  system: string; info: SystemDefinition; axes: {x:string;y:string}; points: ParameterPoint[];
  fixed: Record<string,number>; onSelect:()=>void; onClose:()=>void;
}) {
  const [endpoints,setEndpoints]=useState(()=>points.map(point=>Object.fromEntries(
    info.parameters.map(name=>[name,name===axes.x?point.x:name===axes.y?point.y:fixed[name]])
  ) as Record<string,number>));
  const [resultView,setResultView]=useState(initialView);
  const [variable,setVariable]=useState(info.variables[0]);
  const [steps,setSteps]=useState(400);
  const [transient,setTransient]=useState(100000);
  const [keep,setKeep]=useState(1000);
  const [threshold,setThreshold]=useState(1e6);
  const [initial,setInitial]=useState(()=>info.variables.map((_,i)=>info.default_starting_point?.[i] ?? 0.2));
  const [resetAfterEscape,setResetAfterEscape]=useState(false);
  const [inherit,setInherit]=useState(false);
  const [completed,setCompleted]=useState(0);
  const controller=useRef<AbortController|null>(null);
  const [exporting,setExporting]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<TreeResult|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const canvas=useRef<HTMLCanvasElement>(null);
  const requestVersion=useRef(0);
  useEffect(()=>{requestVersion.current++; setResult(null);setBusy(false);setError('');},[points,system]);
  useEffect(()=>()=>{requestVersion.current++;controller.current?.abort();},[]);
  useEffect(()=>{
    if (!result || !canvas.current) return;
    const c=canvas.current,ctx=c.getContext('2d')!;
    const w=c.width,h=c.height,left=76,right=30,top=38,bottom=65;
    const pw=w-left-right,ph=h-top-bottom;
    ctx.fillStyle='#151c29';ctx.fillRect(0,0,w,h);
    let lo=Infinity,hi=-Infinity;
    for(const sample of result.samples) for(const v of sample.values){lo=Math.min(lo,v);hi=Math.max(hi,v);}
    if(!Number.isFinite(lo)){lo=-1;hi=1;} else if(lo===hi){lo-=1;hi+=1;}
    const margin=0.04*(hi-lo);lo-=margin;hi+=margin;
    const varying=Object.keys(result.parameters.start).filter(k=>result.parameters.start[k]!==result.parameters.end[k]);
    const axis=varying.length===1?varying[0]:'t';
    const x0=axis==='t'?0:result.parameters.start[axis],x1=axis==='t'?1:result.parameters.end[axis];
    const format=(v:number)=>Number(v.toPrecision(4)).toString();
    ctx.font='13px system-ui, sans-serif';ctx.lineWidth=1;
    for(let i=0;i<=4;i++){
      const t=i/4;
      ctx.strokeStyle='#263041';ctx.beginPath();ctx.moveTo(left,top+ph*t);ctx.lineTo(w-right,top+ph*t);ctx.stroke();
      ctx.fillStyle='#8e9db3';ctx.textAlign='right';ctx.fillText(format(hi-t*(hi-lo)),left-14,top+ph*t+4);
      ctx.textAlign='center';ctx.fillText(format(x0+t*(x1-x0)),left+pw*t,h-bottom+26);
    }
    ctx.fillStyle='#c3cedf';ctx.textAlign='left';ctx.fillText(result.variable,left,20);
    ctx.textAlign='center';ctx.fillText(axis,w/2,h-12);
    ctx.fillStyle='rgba(144,170,255,0.62)';
    for(const sample of result.samples)for(const v of sample.values)ctx.fillRect(left+pw*sample.t,top+ph*(hi-v)/(hi-lo),1.4,1.4);
    ctx.fillStyle='#e7ae69';
    for(const sample of result.samples)if(sample.diverged)ctx.fillRect(left+pw*sample.t,top+ph-4,2,4);
  },[result,resultView]);
  async function compute(){
    const version=++requestVersion.current;
    setBusy(true);setError('');setResult(null);setCompleted(0);
    controller.current?.abort();
    controller.current=new AbortController();
    try{
      const ic=initial;
      if(ic.length!==info.variables.length || !ic.every(Number.isFinite))throw new Error(`Нужно ${info.variables.length} чисел для ${info.variables.join(', ')}`);
      if(endpoints.some(endpoint=>info.parameters.some(name=>!Number.isFinite(endpoint[name]))))
        throw new Error('Задайте конечные численные значения всех параметров в A и B.');
      if(info.parameters.every(name=>endpoints[0][name]===endpoints[1][name]))
        throw new Error('Параметры в A и B должны отличаться хотя бы по одному значению.');
      const response=await fetch('/api/bifurcation/compute?stream=true',{signal:controller.current.signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system,start:endpoints[0],end:endpoints[1],variable,initial_conditions:ic,steps,num_iter_transient:transient,num_iter_attractor:keep,escape_threshold:threshold,include_states:true,inherit,reset_after_escape:resetAfterEscape})});
      if(!response.ok){
        const body=await response.json().catch(()=>null);
        const detail=body?.detail;
        const message=typeof detail==='string' ? detail : Array.isArray(detail)
          ? detail.map((item:{msg?:string})=>item.msg?.replace(/^Value error, /,'')).filter(Boolean).join(' ')
          : '';
        throw new Error(message || 'Не удалось построить дерево. Попробуйте уменьшить число итераций.');
      }
      if(!response.body)throw new Error('Сервер не вернул поток расчёта.');
      const reader=response.body.getReader(),decoder=new TextDecoder();
      let pending='',received=false;
      try {
        while(true){
          const {value,done}=await reader.read();
          pending+=decoder.decode(value,{stream:!done});
          let newline;
          while((newline=pending.indexOf('\n'))>=0){
            const line=pending.slice(0,newline);pending=pending.slice(newline+1);
            if(!line.trim())continue;
            const event=JSON.parse(line);
            if(event.type==='error')throw new Error(event.message);
            if(version!==requestVersion.current)continue;
            if(event.type==='progress')setCompleted(event.completed);
            if(event.type==='result'){received=true;setResult(event.data as TreeResult);}
          }
          if(done)break;
        }
        if(!received && version===requestVersion.current)throw new Error('Соединение прервано до завершения расчёта.');
      } finally {reader.releaseLock();}
    }catch(e){if(version===requestVersion.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(version===requestVersion.current)setBusy(false);}
  }
  function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob);download(url,name);setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function saveHdf5(){
    setExporting(true);setError('');
    try{
      const response=await fetch('/api/bifurcation/export/hdf5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...result,variables:info.variables})});
      if(!response.ok)throw new Error('Не удалось сохранить HDF5.');
      saveBlob(await response.blob(),'bifurcation.h5');
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setExporting(false);}
  }
  function download(url:string,name:string){const a=document.createElement('a');a.href=url;a.download=name;a.click();}
  return createPortal(<dialog ref={dialog} className={`tree-dialog${result ? ' tree-dialog-result' : ''}`} aria-label="Бифуркационное дерево" aria-busy={busy} onCancel={onClose}>
    <header className="tree-heading"><button className="tree-close" aria-label="Закрыть дерево" onClick={onClose}>×</button></header>
    {!result ? <>
      <div className="tree-route"><span>Параметры отрезка</span><button disabled={busy} onClick={onSelect}>Выбрать заново</button></div>
      <div className="tree-endpoints">
        {endpoints.map((endpoint,i)=><fieldset key={i} className="tree-initial"><legend>{i===0?'Начало · A':'Конец · B'}</legend><div className="tree-fields">
          {info.parameters.map(name=><NumberInput key={name} label={`${name} · ${i===0?'A':'B'}`} disabled={busy} value={endpoint[name]}
            onChange={value=>setEndpoints(current=>current.map((item,j)=>j===i?{...item,[name]:value}:item))}/>)}
        </div></fieldset>)}
      </div>
      <fieldset className="tree-initial"><legend>Начальные условия</legend><div className="tree-fields">
        {info.variables.map((name,i)=><NumberInput key={name} disabled={busy} label={`${name}₀`} value={initial[i]} onChange={value=>setInitial(current=>current.map((v,j)=>j===i?value:v))}/>)}
      </div></fieldset>
      <div className="tree-fields">
        <label>{initialView==='phase' ? 'Переменная для дерева' : 'Переменная дерева'}<select disabled={busy} value={variable} onChange={e=>setVariable(e.target.value)}>{info.variables.map(v=><option key={v}>{v}</option>)}</select></label>

        <NumberInput disabled={busy} label="Точек на отрезке" value={steps} integer min={2} onChange={setSteps}/>
        <NumberInput disabled={busy} label="Порог убегания" value={threshold} min={1e-9} onChange={setThreshold}/>
        <NumberInput disabled={busy} label="Переходных итераций" value={transient} integer min={0} onChange={setTransient}/>
        <NumberInput disabled={busy} label={initialView==='phase' ? 'Точек фазового портрета' : 'Итераций в дереве'} value={keep} integer min={1} onChange={setKeep}/>
      </div>
      <p className="tree-hint">Переходные итерации не отображаются на графике.</p>
      <label className="tree-inherit"><input disabled={busy} type="checkbox" checked={inherit} onChange={e=>setInherit(e.target.checked)}/> Наследовать начальные условия</label>
      {inherit && <div className="tree-fields" style={{marginTop:16}}><label>После убегания траектории
        <select disabled={busy} value={resetAfterEscape ? 'reset' : 'inherit'} onChange={e=>setResetAfterEscape(e.target.value==='reset')}>
          <option value="inherit">Наследовать полученное состояние</option>
          <option value="reset">Вернуться к заданным НУ</option>
        </select>
      </label></div>}
      {(steps*keep>1000000 || steps*(transient+keep)>100000000) && <p className="tree-hint" role="status">Большой объём данных: расчёт и отображение дерева могут занять длительное время.</p>}
      {error && <p className="tree-error" role="alert">{error}</p>}
      {busy && <div className="tree-progress" role="status" aria-live="polite">
        <span>{completed} / {steps} шагов · {Math.floor(completed / steps * 100)}%{completed===steps ? " · Подготовка графика…" : ""}</span>
        <progress aria-label="Вычисление бифуркационного дерева" value={completed} max={steps}/>
      </div>}
      <footer className="tree-footer"><button className="tree-primary" disabled={busy} onClick={()=>void compute()}>{busy?'Построение…':initialView==='phase'?'Рассчитать портреты':'Построить дерево'}</button></footer>
    </> : <>
      <div className="phase-tabs"><button aria-pressed={resultView==='tree'} onClick={()=>setResultView('tree')}>Дерево</button><button aria-pressed={resultView==='phase'} onClick={()=>setResultView('phase')}>Фазовый портрет</button></div>
      {resultView==='phase' ? <PhasePortraitPlayer data={result} names={info.variables}/> : <canvas ref={canvas} width={1200} height={620} aria-label="График бифуркационного дерева"/>}
      {resultView==='tree' && result.samples.some(s=>s.diverged) && <p className="tree-hint">Золотистые отметки — убегание траектории.</p>}
      <footer className="tree-footer tree-result-actions"><button onClick={()=>setResult(null)}>Настройки</button><div>
        {resultView==='tree' && <button onClick={()=>saveBlob(new Blob([treeSvg(result)],{type:'image/svg+xml'}),'bifurcation.svg')}>Скачать SVG</button>}
        <button disabled={exporting} onClick={()=>void saveHdf5()}>{exporting?'Сохранение…':'Скачать HDF5'}</button>
      </div></footer>
      {error && <p className="tree-error" role="alert">{error}</p>}
    </>}
  </dialog>,document.body);
}
