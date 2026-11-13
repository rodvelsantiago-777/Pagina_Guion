/* Páginas de cobertura del guion editable. Texto visible y seleccionable, sin rasterizar un PDF. */
(function(root){
 'use strict';
 const fontFamily='"PLANO Courier","Courier New",monospace';
 const bold=kind=>kind==='bold'||kind==='both';
 const italic=kind=>kind==='italic'||kind==='both';
 const font=(kind,size)=>`${italic(kind)?'italic ':''}${bold(kind)?'700 ':'400 '}${size}px ${fontFamily}`;
 async function render(page,layer,scale,{top=0,bottom=1,excluded=[]}={}){
  layer.classList.add('screenplay-text-surface');
  const measure=document.createElement('canvas').getContext('2d'),fragment=document.createDocumentFragment();
  for(const run of page.runs){
   const baseline=run.baseline/page.height,y=(run.baseline-run.size*.9)/page.height;
   if(baseline<=top||y>=bottom||excluded.some(row=>y<row.y+row.height*1.5&&baseline>row.y-row.height*.25))continue;
   const size=run.size*scale;
   const span=document.createElement('span');span.textContent=run.text;span.dir='ltr';
   Object.assign(span.style,{fontFamily,fontWeight:bold(run.kind)?'700':'400',fontStyle:italic(run.kind)?'italic':'normal',fontSize:size+'px',lineHeight:'1',left:run.x*scale+'px',textDecoration:run.underline?'underline':'none'});
   let ascent=size*.8,width=run.width*scale;
   if(measure){measure.font=font(run.kind,size);const metrics=measure.measureText(run.text);width=metrics.width||width;
    if(Number.isFinite(metrics.fontBoundingBoxAscent)&&Number.isFinite(metrics.fontBoundingBoxDescent))ascent=(size-metrics.fontBoundingBoxAscent-metrics.fontBoundingBoxDescent)/2+metrics.fontBoundingBoxAscent;
   }
   span.style.top=run.baseline*scale-ascent+'px';span.style.transform=`scaleX(${width?run.width*scale/width:1})`;
   fragment.append(span);
  }
  layer.replaceChildren(fragment);
 }
 // Las posiciones ya existen: no se vuelven a extraer de todas las páginas del PDF.
 function pages(surface){
  const measure=document.createElement('canvas').getContext('2d');let currentFont;
  return surface.map(page=>({width:page.width,height:page.height,lines:root.PlanoScenes.linesFromItems(page.runs.map(run=>{
   const nextFont=font(run.kind,run.size);
   if(measure&&nextFont!==currentFont){measure.font=nextFont;currentFont=nextFont;}
   run.width=measure?.measureText(run.text).width??run.text.length*run.size*.6;
   return{str:run.text,width:run.width,transform:[run.size,0,0,run.size,run.x,run.baseline]};
  }),{width:page.width,height:page.height,scale:1,transform:[1,0,0,1,0,0]},(_,matrix)=>matrix)}));
 }
 root.PlanoScreenplaySurface={render,pages};
})(globalThis);
