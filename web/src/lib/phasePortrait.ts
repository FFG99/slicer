export interface PhaseSample { t:number; values:number[]; diverged:boolean; states?:number[][] }
export interface PhaseData {
  samples:PhaseSample[];
  parameters:{start:Record<string,number>;end:Record<string,number>};
}
export interface PhaseView { x:number; y:number; names:string[]; }
export function phasePoints(sample:PhaseSample,view:PhaseView):[number,number][] {
  const states=sample.states ?? [];
  if(view.names.length===1)return states.slice(1).map((s,i)=>[states[i][0],s[0]]);
  return states.map(s=>[s[view.x],s[view.y]]);
}
export function phaseBounds(data:PhaseData,view:PhaseView) {
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(const sample of data.samples)for(const [x,y] of phasePoints(sample,view)) {
    xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);
  }
  if(!Number.isFinite(xmin))return [-1,1,-1,1];
  const dx=(xmax-xmin || 1)*.08,dy=(ymax-ymin || 1)*.08;
  return [xmin-dx,xmax+dx,ymin-dy,ymax+dy];
}
export function drawPhase(ctx:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,w:number,h:number,
  data:PhaseData,index:number,view:PhaseView,bounds:number[]) {
  const sample=data.samples[index], [xmin,xmax,ymin,ymax]=bounds;
  const left=70,right=25,top=62,bottom=55,pw=w-left-right,ph=h-top-bottom;
  ctx.fillStyle='#151c29';ctx.fillRect(0,0,w,h);
  ctx.font='12px sans-serif';ctx.fillStyle='#c3cedf';ctx.textAlign='left';
  const fmt=(v:number)=>Number(v.toPrecision(4)).toString();
  ctx.fillText(Object.keys(data.parameters.start).map(k=>`${k} = ${fmt(data.parameters.start[k]+sample.t*(data.parameters.end[k]-data.parameters.start[k]))}`).join('   ·   '),left,24);
  ctx.fillText(view.names.length===1 ? `${view.names[0]}ₙ₊₁` : view.names[view.y],left,top-13);
  for(let i=0;i<=4;i++) {
    const t=i/4;
    ctx.strokeStyle='#293448';ctx.beginPath();ctx.moveTo(left,top+t*ph);ctx.lineTo(w-right,top+t*ph);ctx.stroke();
    ctx.fillStyle='#8e9db3';ctx.textAlign='right';ctx.fillText(fmt(ymax-t*(ymax-ymin)),left-10,top+t*ph+4);
    ctx.textAlign='center';ctx.fillText(fmt(xmin+t*(xmax-xmin)),left+t*pw,h-bottom+22);
  }
  ctx.fillStyle='#c3cedf';ctx.fillText(view.names.length===1 ? `${view.names[0]}ₙ` : view.names[view.x],w/2,h-10);
  ctx.fillStyle='#a5baf0';
  for(const [x,y] of phasePoints(sample,view))ctx.fillRect(left+(x-xmin)/(xmax-xmin)*pw,top+(ymax-y)/(ymax-ymin)*ph,2,2);
  if(sample.diverged){ctx.fillStyle='#e7ae69';ctx.fillText('Траектория убежала',w/2,h/2);}
  else if(phasePoints(sample,view).length===0){ctx.fillStyle='#c3cedf';ctx.fillText('Недостаточно точек для портрета',w/2,h/2);}
}
