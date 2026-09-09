import type { PhaseData } from './phasePortrait';
export function treeSvg(data:PhaseData & {variable:string}):string {
  const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
  let lo=Infinity,hi=-Infinity;
  for(const s of data.samples)for(const v of s.values){lo=Math.min(lo,v);hi=Math.max(hi,v);}
  if(!Number.isFinite(lo)){lo=-1;hi=1;}else if(lo===hi){lo--;hi++;}
  const margin=(hi-lo)*.04;lo-=margin;hi+=margin;
  const varying=Object.keys(data.parameters.start).filter(k=>data.parameters.start[k]!==data.parameters.end[k]);
  const axis=varying.length===1?varying[0]:'t',x0=axis==='t'?0:data.parameters.start[axis],x1=axis==='t'?1:data.parameters.end[axis];
  const fmt=(v:number)=>String(Number(v.toPrecision(4)));
  const parts=['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="620" viewBox="0 0 1200 620"><rect width="1200" height="620" fill="#151c29"/><g font-family="sans-serif" font-size="13" fill="#8e9db3">'];
  for(let i=0;i<=4;i++){const t=i/4,y=38+517*t;parts.push(`<path d="M76 ${y}H1170" stroke="#263041"/><text x="62" y="${y+4}" text-anchor="end">${fmt(hi-t*(hi-lo))}</text><text x="${76+1094*t}" y="581" text-anchor="middle">${fmt(x0+t*(x1-x0))}</text>`);}
  parts.push(`<text x="76" y="20" fill="#c3cedf">${escape(data.variable)}</text><text x="600" y="608" text-anchor="middle" fill="#c3cedf">${escape(axis)}</text></g>`);
  // One path per step keeps large vector exports compact.
  for(const s of data.samples){
    const x=(76+1094*s.t).toFixed(3);
    if(s.diverged)parts.push(`<path d="M${x} 551h2v4h-2z" fill="#e7ae69"/>`);
    if(s.values.length)parts.push(`<path fill="#90aaff" fill-opacity="0.62" d="${s.values.map(v=>`M${x} ${(38+517*(hi-v)/(hi-lo)).toFixed(3)}h1.4v1.4h-1.4z`).join('')}"/>`);
  }
  parts.push('</svg>');return parts.join('');
}
