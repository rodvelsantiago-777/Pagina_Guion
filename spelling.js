/* Revisión local del guion y sus fichas. El texto nunca sale del navegador. */
(function(root){
 'use strict';
 const version='es-lingotweaker-0.2.8-1';
 const scriptUrl=typeof document!=='undefined'?document.currentScript?.src||location.href:'';
 const review=typeof module==='object'&&module.exports?require('./language-review.js'):root.PlanoLanguageReview;
 let contextSource=()=>({names:[],ignored:[]});
 const documentContext=()=>contextSource();
 function filterNames(issues,{names=[],ignored=[]}){const known=review.nameWords(names),skip=new Set(ignored.map(word=>word.toLocaleLowerCase('es').normalize('NFC')));return issues.filter(issue=>!skip.has(issue.key)&&!(issue.kind==='spelling'&&known.has(issue.text.toLocaleLowerCase('es').normalize('NFC'))));}
 function validate(value){
  if(value===undefined)return{enabled:true,dictionary:'',ignored:[]};
  if(!value||typeof value!=='object'||typeof value.enabled!=='boolean'||!Array.isArray(value.ignored)||value.ignored.length>500||value.ignored.some(word=>typeof word!=='string'||word.length>60))throw Error('La configuración de ortografía no es válida.');
  return{enabled:value.enabled,dictionary:value.dictionary===version?version:'',ignored:[...new Set(value.ignored.map(word=>word.toLocaleLowerCase('es'))) ]};
 }
 let worker=null,workerUrl='',loading=null,epoch=0,sequence=0,idle=0;
 let fullWorker=null,fullLoading=null,fullIdle=0,fullReject=null,unavailableUntil=0,mode='loading',ruleCount=0;
 const fullPending=new Map();
 const pending=new Map(),aborted=()=>new DOMException('Cancelado','AbortError');
 function stop(error=aborted()){
  stopFull(error);stopBasic(error);unavailableUntil=0;mode='loading';
 }
 function stopBasic(error=aborted()){
  epoch++;clearTimeout(idle);worker?.terminate();worker=null;loading=null;
  if(workerUrl)URL.revokeObjectURL(workerUrl);workerUrl='';
  for(const item of pending.values()){item.cleanup();item.reject(error);}pending.clear();
 }
 function stopFull(error){
  clearTimeout(fullIdle);fullWorker?.terminate();fullWorker=null;fullLoading=null;fullReject?.(error);fullReject=null;
  for(const item of fullPending.values()){item.cleanup();item.reject(error);}fullPending.clear();
 }
 function fullRelax(){clearTimeout(fullIdle);if(!fullPending.size)fullIdle=setTimeout(()=>stopFull(aborted()),300000);}
 function prepareFull(){
  if(unavailableUntil>Date.now())return Promise.reject(Error('Revisión completa temporalmente no disponible.'));
  if(fullLoading)return fullLoading;
  if(!/^https?:/.test(scriptUrl)||typeof Worker!=='function'||!root.PlanoLanguageEngine)return Promise.reject(Error('La revisión completa necesita abrir la página mediante HTTP o HTTPS.'));
  const url=new URL('vendor/spanish-review/worker.js',scriptUrl);url.search=new URL(scriptUrl).search;
  const task=new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>fail(Error('No se pudo iniciar la revisión completa a tiempo.')),45000);fullReject=error=>{clearTimeout(timeout);reject(error);};
   let active;
   function fail(error){if(active&&active!==fullWorker)return;clearTimeout(timeout);unavailableUntil=Date.now()+120000;mode='basic';stopFull(error);reject(error);}
   try{active=fullWorker=new Worker(url,{type:'module',name:'PLANO · Revisión de español'});}catch(error){fail(error);return;}
   active.onmessage=({data})=>{
    if(active!==fullWorker)return;
    if(data.fatal){fail(Error(data.fatal));return;}
    if(data.ready){clearTimeout(timeout);fullReject=null;mode='complete';ruleCount=data.rules;resolve(active);fullRelax();return;}
    const item=fullPending.get(data.id);if(!item)return;if(data.issues){item.progress?.(data.index,data.issues);return;}fullPending.delete(data.id);item.cleanup();
    if(data.error){mode='basic';unavailableUntil=Date.now()+120000;stopFull(Error(data.error));item.reject(Error(data.error));}else{mode='complete';item.resolve(data.results);fullRelax();}
   };
   active.onerror=()=>fail(Error('No se pudo ejecutar el motor español.'));
  });
  fullLoading=task;task.catch(()=>{if(fullLoading===task)fullLoading=null;});return task;
 }
 async function complete(blocks,signal,progress){
  if(signal.aborted)throw aborted();const active=await prepareFull();if(signal.aborted)throw aborted();clearTimeout(fullIdle);
  return new Promise((resolve,reject)=>{
   const id=++sequence,timeout=setTimeout(()=>{mode='basic';unavailableUntil=Date.now()+120000;stopFull(Error('La revisión completa tardó demasiado.'));},Math.min(180000,30000+blocks.length*180));
   const cancel=()=>{fullPending.delete(id);active.postMessage({cancel:id});cleanup();reject(aborted());fullRelax();};
   const cleanup=()=>{clearTimeout(timeout);signal.removeEventListener('abort',cancel);};
   fullPending.set(id,{resolve,reject,cleanup,progress});signal.addEventListener('abort',cancel,{once:true});active.postMessage({id,blocks});
  });
 }
 function relax(){clearTimeout(idle);if(!pending.size)idle=setTimeout(()=>stopBasic(),20000);}
 async function prepare(load){
  if(!loading){
   const generation=epoch;
   const task=(async()=>{
    await load();if(generation!==epoch)throw aborted();
    workerUrl=URL.createObjectURL(new Blob([root.PlanoSpanishWorkerSource],{type:'text/javascript'}));worker=new Worker(workerUrl);
    worker.onmessage=event=>{const item=pending.get(event.data.id);if(!item)return;pending.delete(event.data.id);item.cleanup();event.data.error?item.reject(Error(event.data.error)):item.resolve(event.data);relax();};
    worker.onerror=()=>stopBasic(Error('No se pudo iniciar el diccionario de español.'));relax();return worker;
   })();loading=task;task.catch(()=>{if(loading===task)loading=null;});
  }return loading;
 }
 async function checkWords(words,{load,signal,suggestions=false}){
  if(!words.length)return{wrong:[],known:0,total:0,suggestions:{}};
  if(signal.aborted)throw aborted();const active=await prepare(load);if(signal.aborted)throw aborted();clearTimeout(idle);
  return new Promise((resolve,reject)=>{
   const id=++sequence,timeout=setTimeout(()=>stopBasic(Error('La revisión tardó demasiado. Inténtalo de nuevo.')),30000);
   const cancel=()=>{pending.delete(id);cleanup();reject(aborted());relax();};
   const cleanup=()=>{clearTimeout(timeout);signal.removeEventListener('abort',cancel);};
   pending.set(id,{resolve,reject,cleanup});signal.addEventListener('abort',cancel,{once:true});active.postMessage({id,words,suggest:suggestions});
  });
 }
 async function checkText(text,{load,signal,context:currentContext}){
  const [issues]=await checkBlocks([text],{load,signal,suggestions:true});return filterNames(issues,currentContext||documentContext());
 }
 async function checkBlocks(values,{load,signal=new AbortController().signal,suggestions=false,onProgress}){
  const blocks=values.map(value=>typeof value==='string'?{text:value}:value);if(!blocks.length)return[];
  const supplemental=block=>[...review.syntax(block.text),...review.contextual(block.text,block),...review.punctuation(block.text)];
  try{
   return await complete(blocks,signal,onProgress);
  }catch(error){if(error.name==='AbortError'||signal.aborted)throw aborted();mode='basic';}
  const words=[...new Set(blocks.flatMap(block=>review.candidates(block.text).map(item=>item.lookup)))].slice(0,20000);
  const result=await checkWords(words,{load,signal,suggestions});
  return blocks.map(block=>[...supplemental(block),...review.spelling(block.text,result)].sort((a,b)=>a.start-b.start||a.kind.localeCompare(b.kind)));
 }
 async function blocksFrom(pages,scenes,signal){
  const blocks=[];let speaker='',continuedParenthetical=false;
  for(const [index,page]of pages.entries()){
   if(signal.aborted)throw aborted();let current=null,previous=null;
   for(const [lineIndex,line]of page.lines.entries()){
    const heading=root.PlanoScenes.isSceneHeading(line.text),cue=!heading&&!/^\s*\(/.test(line.text)&&line.text===line.text.toLocaleUpperCase('es')&&line.text.length<=60&&line.x>.33;
    if(scenes.length&&!root.PlanoScenes.sceneAt(scenes,index+1,line.y)){current=null;previous=null;speaker='';continuedParenthetical=false;continue;}
    if(cue){current=null;previous=null;speaker=line.text;continuedParenthetical=false;continue;}
    if(/^\s*\(M[AÁ]S\)\s*$/i.test(line.text)){current=null;previous=null;continue;}
    if(heading){speaker='';continuedParenthetical=false;}
    if(line.x<.25)continuedParenthetical=false;
    const parenthetical=/^\s*\(/.test(line.text)||continuedParenthetical,kind=parenthetical?'parenthetical':heading?'scene':'text';
    if(!parenthetical&&line.x<.25)speaker='';
    if(current&&(current.kind!==kind||parenthetical&&!continuedParenthetical||current.speaker!==speaker))current=null;
    if(heading||previous&&root.PlanoScenes.isSceneHeading(previous.text)){current=null;previous=null;}
    if(previous&&line.y-previous.y>Math.max(line.height,previous.height)*2.3)current=null;
    if(!current){current={page:index+1,index:lineIndex,text:'',lines:[],kind,speaker};blocks.push(current);}
    if(current.text)current.text+='\n';
    current.lines.push({line,start:current.text.length});current.text+=line.text;previous=line;continuedParenthetical=parenthetical&&!/\)\s*$/.test(line.text);
   }
   if(index%4===3)await new Promise(resolve=>setTimeout(resolve,0));
  }return blocks;
 }
 function geometry(block,issue,context){
  const rects=[];
  for(const {line,start}of block.lines){
   if(issue.end<=start||issue.start>=start+line.text.length)continue;
   let cursor=0;
   const parts=line.parts?.length?line.parts:[{text:line.text,x:line.x,width:line.width}];
   for(const part of parts){
    const text=part.text.replace(/\s+/g,' ').trim(),at=line.text.indexOf(text,cursor);if(at<0)continue;cursor=at+text.length;
    const a=Math.max(0,issue.start-start-at),b=Math.min(text.length,issue.end-start-at);if(a>=b)continue;
    const total=context.measureText(text).width||1;
    const x=Math.max(0,Math.min(1,part.x+part.width*context.measureText(text.slice(0,a)).width/total));
    const width=Math.min(1-x,part.width*context.measureText(text.slice(a,b)).width/total);
    if(width>0&&line.height>0)rects.push({x,y:Math.max(0,line.y),width,height:Math.min(line.height,1-line.y)});
   }
  }return rects.length?[{page:block.page,text:issue.text,rects}]:[];
 }
 async function scan({pages,scenes,ignored,load,signal}){
  const blocks=await blocksFrom(pages,scenes,signal);
  const names=review.nameWords([...documentContext().names,...pages.flatMap(page=>page.lines.filter(line=>!root.PlanoScenes.isSceneHeading(line.text)&&line.text===line.text.toLocaleUpperCase('es')&&line.text.length<=60&&line.x>.33).map(line=>line.text))]);
  const results=await checkBlocks(blocks.map(({text,kind,speaker})=>({text,kind,speaker})),{load,signal}),skip=new Set(ignored),found=[];
  const lastOnPage=new Map();for(const block of blocks)lastOnPage.set(block.page,block);
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');context.font='16px "Courier New",monospace';
  try{
   for(const [index,block]of blocks.entries())for(const issue of results[index]){
    // El texto extraído se corta por página. La revisión del editor conserva el párrafo completo.
    if(issue.kind==='punctuation'&&((/^missing-open-/.test(issue.rule)&&(/\(CONT[’']?D\)/i.test(block.speaker)||block.page>1&&block.index<=1))||(/^(?:missing-close-|unclosed-sign)/.test(issue.rule)&&block.page<pages.length&&lastOnPage.get(block.page)===block)))continue;
    if(skip.has(issue.key)||issue.kind==='spelling'&&names.has(issue.text.toLocaleLowerCase('es').normalize('NFC')))continue;
    const parts=geometry(block,issue,context);if(!parts.length)continue;
    found.push({id:`${issue.kind}-${block.page}-${block.index}-${issue.start}-${review.hash(issue.key)}`,source:issue.kind==='punctuation'?'syntax':issue.kind,...(issue.kind==='punctuation'?{category:'punctuation'}:{}),word:issue.text.slice(0,60),ignoreKey:issue.key,message:issue.message,parts});
   }
  }finally{canvas.width=canvas.height=0;}
  return found;
 }
 const api={get version(){return mode==='basic'?version+'-basic':version;},validate,scan,checkText,checkBlocks,stop,get mode(){return mode;},get cacheKey(){return mode==='basic'&&Date.now()>=unavailableUntil?'basic-retry':mode;},get rules(){return ruleCount;},get notice(){return mode==='basic'?'Revisión básica · motor completo no disponible':'';},context:documentContext,configureContext(source){contextSource=source;}};if(typeof module==='object'&&module.exports)module.exports=api;else{root.PlanoSpelling=api;root.addEventListener('beforeunload',()=>stop());}
})(globalThis);
