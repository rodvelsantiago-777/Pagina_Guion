/* Marcas editoriales independientes de los planos, sobre el PDF original. */
(function(root){
 'use strict';
 const script=typeof module!=='undefined'&&module.exports?require('./shot-script.js'):root.PlanoShotScript;
 const color='#d94f54';
 function validate(value,pageCount){
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>1000)throw new Error('La lista de correcciones no es válida.');
  const ids=new Set();
  return value.map(item=>{
   if(!item||typeof item.id!=='string'||!item.id||item.id.length>120||ids.has(item.id))throw new Error('Hay correcciones inválidas o repetidas.');
   ids.add(item.id);return{id:item.id,createdAt:String(item.createdAt||'').slice(0,100),parts:script.validateSelection(item.parts,pageCount)};
  });
 }
 function create(parts,pageCount){
  return validate([{id:'correction-'+(root.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),createdAt:new Date().toISOString(),parts}],pageCount)[0];
 }
 const annotations=items=>items.flatMap(item=>item.parts.map(part=>({...part,id:'review-'+item.id,correctionId:item.id,type:'highlight',correction:true,color})));
 function zigzags(rects,{width,height}){
  const rows=[];
  for(const rect of rects){
   if(rect.width<=0||rect.height<=0)continue;
   const baseline=(rect.y+rect.height)*height;
   let row=rows.find(row=>Math.abs(row.baseline-baseline)<Math.max(2,rect.height*height*.25));
   if(!row){row={baseline,intervals:[]};rows.push(row);}
   row.intervals.push([Math.max(0,rect.x*width),Math.min(width,(rect.x+rect.width)*width)]);
  }
  return rows.flatMap(row=>{
   const merged=[];for(const [a,b] of row.intervals.sort((a,b)=>a[0]-b[0])){const previous=merged.at(-1);if(previous&&a<=previous[1]+1)previous[1]=Math.max(previous[1],b);else merged.push([a,b]);}
   const y=Math.max(2,Math.min(height-2,row.baseline+1));
   return merged.filter(([a,b])=>b>a).map(([a,b])=>{
    const points=[{x:a/width,y:y/height}];let index=0;
    for(let x=a+2.5;x<b;x+=2.5)points.push({x:x/width,y:(y+(index++%2? -1.25:1.25))/height});
    points.push({x:b/width,y:y/height});return points;
   });
  });
 }
 const api={color,validate,create,annotations,zigzags};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PlanoCorrections=api;
})(globalThis);
