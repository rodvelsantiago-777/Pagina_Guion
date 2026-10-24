/* Corrector nativo y avisos locales de ortografía/redacción en los campos extensos. */
(function(root){
 'use strict';
 const controls=new WeakMap(),active=new Set(),scriptUrl=document.currentScript?.src||location.href;
 let engine=null;
 function disabled(){try{return root.PlanoTestDisableSpelling||root.opener?.PlanoTestDisableSpelling;}catch{return false;}}
 function load(){
  if(root.PlanoSpanishWorkerSource)return Promise.resolve();
  if(!engine)engine=new Promise((resolve,reject)=>{
   const script=document.createElement('script'),url=new URL('vendor/spanish-spelling.js',scriptUrl);url.search=new URL(scriptUrl).search;script.src=url.href;
   script.onload=resolve;script.onerror=()=>{script.remove();engine=null;reject(Error('No se pudo cargar el diccionario.'));};document.head.append(script);
  });return engine;
 }
 function attach(input){
  if(input.tagName!=='TEXTAREA'||controls.has(input))return;
  const panel=document.createElement('details');panel.className='writing-feedback';panel.hidden=true;
  const summary=document.createElement('summary'),list=document.createElement('div');list.className='writing-feedback-list';panel.append(summary,list);input.after(panel);
  panel.addEventListener('keydown',event=>{if(['Enter','Tab',' '].includes(event.key)&&!event.ctrlKey&&!event.metaKey)event.stopPropagation();});
  const state={input,panel,summary,list,timer:0,controller:null,revision:0,lastText:null};controls.set(input,state);active.add(state);
  function clear(){clearTimeout(state.timer);state.controller?.abort();state.controller=null;state.revision++;panel.hidden=true;state.lastText=null;}
  function button(text,action,label){const node=document.createElement('button');node.type='button';node.textContent=text;if(label)node.setAttribute('aria-label',label);node.addEventListener('pointerdown',event=>event.preventDefault());node.addEventListener('click',action);return node;}
  function show(issues,text){
   list.replaceChildren();panel.hidden=false;panel.open=Boolean(issues.length);panel.dataset.errors=String(Boolean(issues.length));
   summary.textContent=issues.length?`Revisar escritura · ${issues.length} ${issues.length===1?'aviso':'avisos'}`:'Sin avisos detectados';
   for(const issue of issues.slice(0,30)){
    const row=document.createElement('div');row.className='writing-feedback-issue';
    const locate=button(issue.text,()=>{if(input.value!==text)return;input.focus();input.setSelectionRange(issue.start,issue.end);},`Localizar «${issue.text}»`);locate.className='writing-feedback-fragment';
    const message=document.createElement('span');message.textContent=issue.message;row.append(locate,message);
    const options=issue.replacement?[issue.replacement]:(issue.suggestions||[]).slice(0,3);
    if(options.length){const fixes=document.createElement('div');fixes.className='writing-feedback-fixes';
     for(const value of options)fixes.append(button(`Usar «${value}»`,()=>{if(input.value!==text)return;input.setRangeText(value,issue.start,issue.end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}));row.append(fixes);
    }list.append(row);
   }
  }
  async function check(){
   if(disabled()||!input.isConnected||input.disabled||input.readOnly||!root.PlanoSpelling)return;
   const text=input.value;if(!text.trim()){clear();return;}
   if(state.lastText===text&&!panel.hidden)return;
   state.controller?.abort();state.controller=new AbortController();const revision=++state.revision;
   panel.hidden=false;panel.open=false;panel.dataset.errors='false';summary.textContent='Revisando ortografía y redacción…';list.replaceChildren();
   try{
    const issues=await root.PlanoSpelling.checkText(text,{load,signal:state.controller.signal});
    if(revision!==state.revision||!input.isConnected||input.value!==text)return;
    state.lastText=text;show(issues,text);
   }catch(error){if(error.name==='AbortError'||revision!==state.revision||!input.isConnected)return;summary.textContent='Revisión no disponible';panel.open=true;list.replaceChildren(button('Reintentar',()=>{state.lastText=null;check();}));}
  }
  function schedule(){clearTimeout(state.timer);state.controller?.abort();state.revision++;state.lastText=null;panel.hidden=true;state.timer=setTimeout(check,650);}
  state.clear=clear;state.schedule=schedule;
  input.addEventListener('input',schedule);input.addEventListener('focus',()=>{clearTimeout(state.timer);state.timer=setTimeout(check,150);});
  if(document.activeElement===input)schedule();
 }
 function enable(node){
  if(node.nodeType!==1)return;
  const controls=[...(node.matches('textarea,input')?[node]:[]),...node.querySelectorAll('textarea,input')];
  for(const input of controls){
   if(input.getAttribute('spellcheck')==='false'||input.tagName==='INPUT'&&input.type!=='text')continue;
   input.spellcheck=true;input.lang='es';
   if(!disabled())attach(input);
  }
 }
 enable(document.documentElement);
 new MutationObserver(records=>{
  for(const record of records)for(const node of record.addedNodes)enable(node);
  for(const state of active)if(!state.input.isConnected){state.clear();active.delete(state);}
 }).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('toggle',event=>{if(event.newState==='open'&&event.target.matches('dialog'))for(const input of event.target.querySelectorAll('textarea'))controls.get(input)?.schedule();},true);
 document.addEventListener('close',event=>{for(const input of event.target.querySelectorAll?.('textarea')||[])controls.get(input)?.clear();},true);
 document.addEventListener('plano-account-change',()=>{for(const state of active)state.clear();root.PlanoSpelling?.stop();});
})(globalThis);
