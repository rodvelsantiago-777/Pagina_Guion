/* Revisión del PDF en español, independiente del corrector nativo de formularios. */
(function(root){
 'use strict';
 const version='es-4.0.0';
 const vocabulary=new Set(['travelling','travellings','dolly','zoom','pan','tilt','flashback','flashbacks','off','whip','steadycam','steadicam']);
 function validate(value){
  if(value===undefined)return{enabled:true,dictionary:'',ignored:[]};
  if(!value||typeof value!=='object'||typeof value.enabled!=='boolean'||!Array.isArray(value.ignored)||value.ignored.length>500||value.ignored.some(word=>typeof word!=='string'||word.length>60))throw Error('La configuración de ortografía no es válida.');
  return{enabled:value.enabled,dictionary:value.dictionary===version?version:'',ignored:[...new Set(value.ignored.map(word=>word.toLocaleLowerCase('es'))) ]};
 }
 async function wordsFrom(pages,scenes,ignored,signal){
  const words=[],skip=new Set([...vocabulary,...ignored]);
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.font='16px "Courier New",monospace';
  for(const [index,page]of pages.entries()){
   if(signal.aborted)throw new DOMException('Cancelado','AbortError');
   for(const [lineIndex,line]of page.lines.entries()){
    if(scenes.length&&!root.PlanoScenes.sceneAt(scenes,index+1,line.y))continue;
    if(line.text===line.text.toLocaleUpperCase('es'))continue;
    for(const [partIndex,part]of (line.parts||[]).entries()){
     if(/https?:|@|www\./i.test(part.text))continue;
     const total=context.measureText(part.text).width||1;
     for(const match of part.text.matchAll(/[\p{L}\p{M}]+/gu)){
      const word=match[0].normalize('NFC'),normalized=word.toLocaleLowerCase('es');
      if(word.length<3||word.length>40||word!==normalized||skip.has(normalized)||/[\d_]/.test(part.text[match.index-1]||'')||/[\d_]/.test(part.text[match.index+word.length]||''))continue;
      const x=Math.max(0,Math.min(1,part.x+part.width*context.measureText(part.text.slice(0,match.index)).width/total));
      const width=Math.min(1-x,part.width*context.measureText(word).width/total);
      const rect={x,y:Math.max(0,line.y),width,height:Math.min(line.height,1-line.y)};
      if(width>0&&rect.height>0)words.push({id:`spelling-${index+1}-${lineIndex}-${partIndex}-${match.index}`,word:normalized,parts:[{page:index+1,text:word,rects:[rect]}]});
     }
    }
   }
   if(index%4===3)await new Promise(resolve=>setTimeout(resolve,0));
  }canvas.width=canvas.height=0;return words;
 }
 async function scan({pages,scenes,ignored,load,signal}){
  const positions=await wordsFrom(pages,scenes,ignored,signal),words=[...new Set(positions.map(item=>item.word))].slice(0,20000);
  if(!words.length)return [];
  if(signal.aborted)throw new DOMException('Cancelado','AbortError');
  await load();
  if(signal.aborted)throw new DOMException('Cancelado','AbortError');
  const url=URL.createObjectURL(new Blob([root.PlanoSpanishWorkerSource],{type:'text/javascript'})),worker=new Worker(url);
  try{
   const result=await new Promise((resolve,reject)=>{
    const cancel=()=>reject(new DOMException('Cancelado','AbortError'));
    signal.addEventListener('abort',cancel,{once:true});
    worker.onmessage=event=>{signal.removeEventListener('abort',cancel);event.data.error?reject(Error(event.data.error)):resolve(event.data);};
    worker.onerror=()=>{signal.removeEventListener('abort',cancel);reject(Error('No se pudo iniciar el diccionario de español.'));};
    worker.postMessage({words});
   });
   // No llenar de marcas un guion que parece estar escrito en otro idioma.
   if(result.total>=10&&result.known/result.total<.35)return [];
   const wrong=new Set(result.wrong);return positions.filter(item=>wrong.has(item.word));
  }finally{worker.terminate();URL.revokeObjectURL(url);}
 }
 const api={version,validate,scan};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoSpelling=api;
})(globalThis);
