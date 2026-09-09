import { useEffect, useMemo, useRef, useState } from 'react';
import { drawPhase, phaseBounds, type PhaseData } from '../lib/phasePortrait';
export function PhasePortraitPlayer({data,names}:{data:PhaseData;names:string[]}) {
  const [frame,setFrame]=useState(0),[playing,setPlaying]=useState(false),[fps,setFps]=useState(12);
  const [x,setX]=useState(0),[y,setY]=useState(names.length>1?1:0);
  const [exported,setExported]=useState<number|null>(null),[error,setError]=useState('');
  const canvas=useRef<HTMLCanvasElement>(null),worker=useRef<Worker|null>(null);
  const view=useMemo(()=>({x,y,names}),[x,y,names]);
  const bounds=useMemo(()=>phaseBounds(data,view),[data,view]);
  useEffect(()=>{if(canvas.current)drawPhase(canvas.current.getContext('2d')!,960,620,data,frame,view,bounds);},[data,frame,view,bounds]);
  useEffect(()=>{if(!playing)return;const id=setInterval(()=>setFrame(i=>(i+1)%data.samples.length),1000/fps);return()=>clearInterval(id);},[playing,fps,data.samples.length]);
  useEffect(()=>()=>worker.current?.terminate(),[]);
  function exportGif(){
    setPlaying(false);setExported(0);setError('');
    const task=new Worker(new URL('../lib/phaseGif.worker.ts',import.meta.url),{type:'module'});worker.current=task;
    const fail=(message:string)=>{setError(message);setExported(null);task.terminate();};
    task.onerror=()=>fail('Не удалось создать GIF.');
    task.onmessage=event=>{
      if(event.data.type==='progress')setExported(event.data.completed);
      if(event.data.type==='error')fail(event.data.message);
      if(event.data.type==='done'){
        const url=URL.createObjectURL(new Blob([event.data.bytes],{type:'image/gif'}));
        const link=document.createElement('a');link.href=url;link.download='phase-portrait.gif';link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);setExported(null);task.terminate();
      }
    };
    task.postMessage({data,view,fps});
  }
  return <div className="phase-player">
    <div className="phase-controls">
      {names.length>1 && <>{(['x','y'] as const).map(axis=><label key={axis}>Ось {axis.toUpperCase()}<select disabled={exported!==null} value={axis==='x'?x:y} onChange={e=>(axis==='x'?setX:setY)(Number(e.target.value))}>{names.map((name,i)=><option key={name} value={i}>{name}</option>)}</select></label>)}</>}
      <label>Кадров/с<select disabled={exported!==null} value={fps} onChange={e=>setFps(Number(e.target.value))}>{[5,12,24].map(n=><option key={n}>{n}</option>)}</select></label>
    </div>
    <canvas ref={canvas} width={960} height={620} aria-label="Фазовый портрет вдоль отрезка"/>
    <div className="phase-playback"><button onClick={()=>setPlaying(p=>!p)}>{playing?'Пауза':'Воспроизвести'}</button>
      <input aria-label="Шаг фазового портрета" type="range" min={0} max={data.samples.length-1} value={frame} onChange={e=>{setPlaying(false);setFrame(Number(e.target.value));}}/>
      <span>{frame+1} / {data.samples.length}</span>
      <button disabled={exported!==null} onClick={exportGif}>Скачать GIF</button>
    </div>
    {exported!==null && <div className="tree-progress"><span>Создание GIF: {exported} / {data.samples.length}</span><progress value={exported} max={data.samples.length}/><button onClick={()=>{worker.current?.terminate();setExported(null);}}>Отменить</button></div>}
    {error && <p role="alert" className="tree-error">{error}</p>}
  </div>;
}
