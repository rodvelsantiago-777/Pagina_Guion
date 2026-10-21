/* Apariencia de cuenta. Solo los dos ajustes de UI tienen una caché local por UID;
 * PDF y anotaciones conservan su almacenamiento privado independiente. */
(function(root){
 'use strict';
 const appearance=root.PlanoAppearance,cloud=root.PlanoCloud;
 if(!appearance||!cloud?.configured)return;
 const guest=appearance.get(),cacheKey=uid=>'plano-appearance-account-v1:'+encodeURIComponent(uid);
 const sessions=new Map();
 let owner='',epoch=0,current=null,timer=null;
 const read=key=>{try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
 const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
 const nonempty=value=>Object.keys(value).length>0;
 function status(value){
  if(!current)return;
  current.status=value;
  const text=document.querySelector('#appearance-sync');
  if(!text)return;
  text.hidden=!owner;text.dataset.state=value;
  text.textContent={loading:'Recuperando tu tema…',saved:'Tema guardado en tu cuenta',pending:'Tema pendiente de guardar',saving:'Guardando tema…',error:'Tema sin sincronizar. Reintentar'}[value]||'';
  text.disabled=value!=='error';
 }
 function remember(){if(current)write(cacheKey(owner),{settings:current.settings,pending:current.pending});}
 function paint(){appearance.set(current.settings);remember();}
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>flush().catch(()=>{}),700);}
 async function load(){
  if(!current||current.loading)return;
  const session=current,expected=epoch;session.loading=true;status('loading');
  try{
   const result=await cloud.request('preferences_read');
   if(epoch!==expected)return;
   // Una elección hecha durante la lectura siempre gana a esa lectura.
   const remote=result.preferences;
   if(remote)session.settings={...appearance.defaults,...appearance.valid(remote),...session.pending};
   else{
    session.settings={...session.settings,...session.pending};
    // Migrar la apariencia anterior solo a la primera cuenta de este navegador.
    session.pending={...session.settings};
   }
   session.ready=true;paint();status(nonempty(session.pending)?'pending':'saved');
  }catch{if(epoch===expected){remember();status('error');}}
  finally{session.loading=false;}
 }
 async function flush(){
  clearTimeout(timer);
  if(!current)return;
  const session=current,expected=epoch;
  if(session.inflight)return session.inflight;
  const work=(async()=>{
   if(!session.ready)await load();
   if(epoch!==expected||!session.ready)return;
   while(nonempty(session.pending)&&epoch===expected){
    const patch={...session.pending},versions={...session.versions};status('saving');
    const result=await cloud.request('preferences_save',{patch});
    if(epoch!==expected)return;
    for(const key of Object.keys(patch))if(session.versions[key]===versions[key])delete session.pending[key];
    session.settings={...appearance.defaults,...appearance.valid(result.preferences),...session.pending};
    paint();status(nonempty(session.pending)?'pending':'saved');
   }
  })();
  session.inflight=work;
  try{await work;}catch{if(epoch===expected){remember();status('error');}}
  finally{if(session.inflight===work)session.inflight=null;}
 }
 function changeAccount(){
  const next=root.PlanoAccounts.getUser()?.id||'';
  if(next===owner)return;
  clearTimeout(timer);remember();owner=next;epoch++;
  appearance.manageAccount(Boolean(owner));
  if(!owner){current=null;appearance.set(guest);const text=document.querySelector('#appearance-sync');if(text)text.hidden=true;return;}
  const cached=read(cacheKey(owner));
  if(!sessions.has(owner)){
   const first=!read('plano-appearance-migrated-v1');
   const settings={...appearance.defaults,...(first?guest:{}),...appearance.valid(cached?.settings)};
   sessions.set(owner,{settings,pending:appearance.valid(cached?.pending),versions:{mode:0,preset:0},ready:false,loading:false,inflight:null});
   write('plano-appearance-migrated-v1',true);
  }
  const previous=sessions.get(owner);
  current={...previous,settings:{...previous.settings},pending:{...previous.pending},versions:{...previous.versions},ready:false,loading:false,inflight:null};
  sessions.set(owner,current);
  paint();flush();
 }
 document.addEventListener('plano-appearance-change',event=>{
  if(!current)return;
  const patch=appearance.valid(event.detail);
  Object.assign(current.settings,patch);Object.assign(current.pending,patch);
  for(const key of Object.keys(patch))current.versions[key]++;
  remember();status('pending');schedule();
 });
 document.addEventListener('plano-account-change',changeAccount);
 root.addEventListener('online',()=>flush());
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
 root.PlanoAccountAppearance={flush,info:()=>({owner,status:current?.status||'idle',pending:Boolean(current&&nonempty(current.pending))})};
 document.addEventListener('DOMContentLoaded',()=>{
  document.querySelector('#appearance-sync')?.addEventListener('click',()=>flush());
  root.PlanoAccounts.ready.then(changeAccount);
 });
})(globalThis);
