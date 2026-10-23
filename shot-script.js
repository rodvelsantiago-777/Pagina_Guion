/* Duración orientativa y fragmentos: coordenadas del PDF original, independientes del zoom. */
(function(root){
 'use strict';
 const coverage=typeof module!=='undefined'&&module.exports?require('./coverage-lines.js'):root.PlanoCoverage;
 const clamp=value=>Math.max(0,Math.min(1,value));
 function merge(intervals){
  const result=[];
  for(const [a,b] of intervals.sort((a,b)=>a[0]-b[0])){
   const last=result.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else result.push([a,b]);
  }
  return result;
 }
 function duration(parts,pages){
  const ranges=new Map(),highlights=new Map();
  for(const item of parts){
   for(const number of coverage.pages(item)){
    const part=coverage.part(item,number);if(!ranges.has(number))ranges.set(number,[]);
    if(part.type==='line'){
     const top=Math.min(part.start.y,part.end.y),bottom=Math.max(part.start.y,part.end.y);
     ranges.get(number).push([top,bottom>top?bottom:Math.min(1,top+0.014)]);
    }
    else {if(!highlights.has(number))highlights.set(number,[]);highlights.get(number).push(...part.rects);}
   }
  }
  for(const [number,rects] of highlights){
     // Un fragmento de una sola línea cuenta según la fracción de texto cubierta.
     const top=Math.min(...rects.map(rect=>rect.y)),bottom=Math.max(...rects.map(rect=>rect.y+rect.height));
     const rows=(pages[number-1]?.lines||[]).filter(row=>row.y+row.height>top&&row.y<bottom);
     let fraction=1;
     if(rows.length===1){
      const row=rows[0],width=merge(rects.map(rect=>[Math.max(row.x,rect.x),Math.min(row.x+row.width,rect.x+rect.width)]).filter(([a,b])=>b>a)).reduce((sum,[a,b])=>sum+b-a,0);
      fraction=row.width?clamp(width/row.width):1;
     }
     ranges.get(number).push([top,top+(bottom-top)*fraction]);
  }
  const fraction=[...ranges.values()].reduce((sum,items)=>sum+merge(items).reduce((n,[a,b])=>n+clamp(b)-clamp(a),0),0);
  return fraction>0?Math.max(1,Math.round(fraction*60)):0;
 }
 function excerpt(parts,pages){
  const manual=parts.find(item=>Array.isArray(item.scriptSelection))?.scriptSelection;
  if(manual)return manual.map(part=>part.text).join('\n\n');
  const result=[],seen=new Set();
  for(const item of [...parts].sort((a,b)=>a.page-b.page)){
   if(item.type==='highlight'){if(item.text&&!seen.has(item.page+':'+item.text)){result.push(item.text);seen.add(item.page+':'+item.text);}continue;}
   for(const number of coverage.pages(item)){
    const part=coverage.part(item,number),top=Math.min(part.start.y,part.end.y),bottom=Math.max(part.start.y,part.end.y);
    for(const [index,row] of (pages[number-1]?.lines||[]).entries()){
     const key=number+':'+index;
     if(row.y+row.height>=top&&row.y<=bottom&&!seen.has(key)){result.push(row.text);seen.add(key);}
    }
   }
  }
  return result.join('\n');
 }
 function report(annotations,pages){
  const groups=new Map();for(const item of annotations){const key=item.shotId||item.id;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
  return new Map([...groups].map(([key,parts])=>[key,{estimatedSeconds:duration(parts,pages),scriptExcerpt:excerpt(parts,pages)}]));
 }
 function validateSelection(value,pageCount){
  if(!Array.isArray(value)||!value.length||value.length>100)throw new Error('El fragmento vinculado no es válido.');
  let length=0;
  return value.map(part=>{
   if(!part||!Number.isInteger(part.page)||part.page<1||part.page>pageCount||typeof part.text!=='string'||!part.text.trim()||(length+=part.text.length)>30000||!Array.isArray(part.rects)||!part.rects.length||part.rects.length>5000)throw new Error('El fragmento vinculado no es válido.');
   const rects=part.rects.map(rect=>{
    if(!rect||!['x','y','width','height'].every(key=>Number.isFinite(rect[key])&&rect[key]>=0&&rect[key]<=1)||rect.x+rect.width>1.001||rect.y+rect.height>1.001)throw new Error('El fragmento vinculado contiene posiciones inválidas.');
    return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
   });return{page:part.page,text:part.text.trim(),rects};
  });
 }
 const format=seconds=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
 const api={duration,excerpt,report,format,validateSelection};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PlanoShotScript=api;
})(globalThis);
