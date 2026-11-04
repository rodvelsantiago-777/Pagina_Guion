/* Páginas de cobertura del guion editable. Texto visible y seleccionable, sin rasterizar un PDF. */
(function(root){
 'use strict';
 const fonts=new Map();
 async function family(run){
  if(!run.unicode)return '"PLANO Courier","Courier New",monospace';
  if(!fonts.has(run.kind))fonts.set(run.kind,(async()=>{
   const face=new FontFace('PLANO Coverage Unicode',root.PlanoPdfUnicode.face(run.kind),{weight:['bold','both'].includes(run.kind)?'700':'400',style:['italic','both'].includes(run.kind)?'italic':'normal'});
   await face.load();document.fonts.add(face);
  })().catch(error=>{fonts.delete(run.kind);throw error;}));
  await fonts.get(run.kind);return '"PLANO Coverage Unicode","Courier New",monospace';
 }
 async function render(page,layer,scale,{top=0,bottom=1,excluded=[]}={}){
  layer.classList.add('screenplay-text-surface');
  const measure=document.createElement('canvas').getContext('2d'),fragment=document.createDocumentFragment();
  for(const run of page.runs){
   const baseline=run.baseline/page.height,y=(run.baseline-run.size*.9)/page.height;
   if(baseline<=top||y>=bottom||excluded.some(row=>y<row.y+row.height*1.5&&baseline>row.y-row.height*.25))continue;
   const fontFamily=await family(run),bold=['bold','both'].includes(run.kind),italic=['italic','both'].includes(run.kind),size=run.size*scale;
   const span=document.createElement('span');span.textContent=run.text;span.dir='ltr';
   Object.assign(span.style,{fontFamily,fontWeight:bold?'700':'400',fontStyle:italic?'italic':'normal',fontSize:size+'px',lineHeight:'1',left:run.x*scale+'px',textDecoration:run.underline?'underline':'none'});
   let ascent=size*.8,width=run.width*scale;
   if(measure){measure.font=`${italic?'italic ':''}${bold?'bold ':''}${size}px ${fontFamily}`;const metrics=measure.measureText(run.text);width=metrics.width||width;
    if(Number.isFinite(metrics.fontBoundingBoxAscent)&&Number.isFinite(metrics.fontBoundingBoxDescent))ascent=(size-metrics.fontBoundingBoxAscent-metrics.fontBoundingBoxDescent)/2+metrics.fontBoundingBoxAscent;
   }
   span.style.top=run.baseline*scale-ascent+'px';span.style.transform=`scaleX(${width?run.width*scale/width:1})`;
   fragment.append(span);
  }
  layer.replaceChildren(fragment);
 }
 // Las posiciones ya existen: no se vuelven a extraer de todas las páginas del PDF.
 function pages(surface){return surface.map(page=>({width:page.width,height:page.height,lines:root.PlanoScenes.linesFromItems(page.runs.map(run=>({str:run.text,width:run.width,transform:[run.size,0,0,run.size,run.x,run.baseline]})),{width:page.width,height:page.height,scale:1,transform:[1,0,0,1,0,0]},(_,matrix)=>matrix)}));}
 root.PlanoScreenplaySurface={render,pages};
})(globalThis);
