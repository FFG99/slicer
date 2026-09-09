import { GIFEncoder, applyPalette } from 'gifenc';
import { drawPhase, phaseBounds, type PhaseData, type PhaseView } from './phasePortrait';
self.onmessage=(event:MessageEvent<{data:PhaseData;view:PhaseView;fps:number}>)=>{
  try {
    const {data,view,fps}=event.data,w=640,h=480;
    const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d')!;
    const palette=[[21,28,41],[41,52,72],[142,157,179],[195,206,223],[165,186,240],[231,174,105]];
    const gif=GIFEncoder(),bounds=phaseBounds(data,view);
    for(let i=0;i<data.samples.length;i++){
      drawPhase(ctx,w,h,data,i,view,bounds);
      gif.writeFrame(applyPalette(ctx.getImageData(0,0,w,h).data,palette),w,h,{palette,delay:1000/fps,repeat:0});
      self.postMessage({type:'progress',completed:i+1});
    }
    gif.finish();const bytes=gif.bytes();
    self.postMessage({type:'done',bytes});
  }catch(error){self.postMessage({type:'error',message:String(error)});}
};
