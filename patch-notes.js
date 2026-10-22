/* Avisos de publicación por cuenta. Solo el recibo mínimo se cachea en el equipo. */
(function(root){
 'use strict';
 const categories={new:'Novedades',improved:'Mejoras',fixed:'Correcciones'};
 function receipt(value){
  return value&&typeof value.releaseId==='string'&&/^[a-zA-Z0-9._-]{1,100}$/.test(value.releaseId)&&typeof value.publishedAt==='string'&&Number.isFinite(Date.parse(value.publishedAt))?{releaseId:value.releaseId,publishedAt:value.publishedAt}:null;
 }
 function later(a,b){return !a?b:!b?a:Date.parse(b.publishedAt)>=Date.parse(a.publishedAt)?b:a;}
 function releases(value){
  if(value?.schema!==1||!Array.isArray(value.releases))return [];
  const ids=new Set();
  return value.releases.slice(0,20).filter(item=>{
   const clean=receipt({releaseId:item?.id,publishedAt:item?.publishedAt});
   if(!clean||ids.has(item.id)||!Array.isArray(item.sections))return false;
   ids.add(item.id);return true;
  }).map(item=>({id:item.id,publishedAt:item.publishedAt,version:String(item.version||'Actualización').slice(0,60),sections:item.sections.slice(0,3).filter(section=>Object.hasOwn(categories,section.category)&&Array.isArray(section.items)).map(section=>({category:section.category,items:section.items.filter(text=>typeof text==='string'&&text.trim()).slice(0,40).map(text=>text.slice(0,500))})).filter(section=>section.items.length)})).filter(item=>item.sections.length).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 }
 function unseen(feed,seen){
  if(!seen)return feed.slice(0,1);
  return feed.filter(item=>item.id!==seen.releaseId&&Date.parse(item.publishedAt)>Date.parse(seen.publishedAt));
 }
 root.PlanoPatchNotes={releases,unseen};
 if(typeof module==='object'&&module.exports)module.exports=root.PlanoPatchNotes;
 if(typeof document==='undefined')return;
 const $=selector=>document.querySelector(selector),dialog=$('#patch-notes-dialog'),cloud=root.PlanoCloud,key=uid=>'plano-release-seen-v1:'+encodeURIComponent(uid);
 let owner='',epoch=0,current=null,feed=[],feedPromise=null,feedStatus='idle',displayed=null,automatic=false;
 const read=uid=>{try{return JSON.parse(localStorage.getItem(key(uid)));}catch{return null;}};
 function remember(){if(!current)return;try{localStorage.setItem(key(owner),JSON.stringify({receipt:current.seen,pending:current.pending}));}catch{}}
 const launchers=['#open-patch-notes','#menu-patch-notes','#sidebar-patch-notes'];
 function buttons(){for(const id of launchers)if($(id))$(id).hidden=!owner;}
 async function loadFeed(force=false){
  if(force&&feedStatus!=='loading')feedPromise=null;
  if(!feedPromise)feedPromise=(async()=>{
   feedStatus='loading';
   try{
    const response=await fetch(new URL('release-notes.json',document.baseURI),{cache:'no-store',credentials:'same-origin'});
    if(!response.ok||Number(response.headers.get('content-length'))>150000)throw new Error('No disponible');
    const text=await response.text();if(text.length>150000)throw new Error('Demasiado grande');
    const data=JSON.parse(text);if(data?.schema!==1||!Array.isArray(data.releases))throw new Error('Formato inválido');
    feedStatus='ready';return releases(data);
   }catch{feedStatus='error';return [];}
  })();
  return feedPromise;
 }
 async function flush(){
  const session=current,expected=epoch;if(!session?.pending||!cloud?.configured||session.saving)return;
  session.saving=true;
  try{
   const pending=session.pending,result=await cloud.request('release_seen',pending);
   if(epoch!==expected)return;
   session.seen=later(session.seen,receipt(result.receipt));
   if(session.pending?.releaseId===pending.releaseId)session.pending=null;
   remember();
  }catch{/* El recibo queda pendiente por UID; nunca bloquea el trabajo del guion. */}
  finally{session.saving=false;}
 }
 function markSeen(){
  if(!displayed||displayed.owner!==owner||!current)return;
  const next={releaseId:displayed.release.id,publishedAt:displayed.release.publishedAt};displayed=null;
  if(current.seen?.releaseId===next.releaseId||Date.parse(current.seen?.publishedAt)>=Date.parse(next.publishedAt))return;
  current.seen=next;current.pending=next;remember();flush();
 }
 function render(items){
  const content=$('#patch-notes-content');content.replaceChildren();
  for(const item of items){
   const section=document.createElement('section');section.className='patch-release';
   const meta=document.createElement('div');meta.className='patch-release-meta';
   const version=document.createElement('strong');version.textContent=item.version;
   const date=document.createElement('time');date.dateTime=item.publishedAt;date.textContent=new Date(item.publishedAt).toLocaleDateString('es',{day:'numeric',month:'long',year:'numeric'});meta.append(version,date);section.append(meta);
   for(const group of item.sections){
    const heading=document.createElement('h3');heading.textContent=categories[group.category];
    const list=document.createElement('ul');for(const text of group.items){const li=document.createElement('li');li.textContent=text;list.append(li);}section.append(heading,list);
   }
   content.append(section);
  }
  $('#patch-notes-description').textContent=items.length>1?'Las mejoras publicadas desde tu última visita.':'Las mejoras de esta actualización.';
 }
 function show(manual=false){
  if(manual){openHistory();return;}
  if(!owner||!current||!feed.length||root.PlanoAccounts.getUser()?.id!==owner||document.body.classList.contains('auth-locked'))return;
  if(dialog.open||document.querySelector('dialog[open],[popover]:popover-open')||$('.app-shell').inert)return;
  if(!manual&&(!current.ready||document.body.classList.contains('is-editing')))return;
  const items=manual?feed:unseen(feed,current.seen);if(!items.length)return;
  automatic=true;render(items);displayed={owner,release:items[0]};
  $('#patch-notes-title').textContent='Lo nuevo en PLANO';$('#patch-notes-eyebrow').textContent='EL ESTUDIO, AL DÍA';$('#patch-notes-state').hidden=true;
  $('#patch-notes-footer').textContent='El estudio sigue mejorando.';$('#accept-patch-notes').textContent='Entendido';
  dialog.showModal();$('#accept-patch-notes').focus({preventScroll:true});
 }
 function renderHistory(){
  render(feed);$('#patch-notes-title').textContent='Notas de parche';$('#patch-notes-eyebrow').textContent='HISTORIAL DEL ESTUDIO';
  $('#patch-notes-description').textContent='Consulta las novedades, mejoras y correcciones de cada publicación.';
  $('#accept-patch-notes').textContent='Cerrar';$('#patch-notes-state').hidden=Boolean(feed.length);
  $('#patch-notes-state-message').textContent=feedStatus==='loading'?'Cargando las notas de parche…':feedStatus==='error'?'No pudimos cargar las notas. Puedes volver a intentarlo.':'Todavía no hay notas de parche publicadas.';
  $('#retry-patch-notes').hidden=feedStatus==='loading';
  $('#patch-notes-footer').textContent=feed.length?`${feed.length} ${feed.length===1?'publicación disponible':'publicaciones disponibles'}`:'Historial de actualizaciones';
  displayed=feed.length?{owner,release:feed[0]}:null;
 }
 async function openHistory(refresh=false){
  if(!owner||root.PlanoAccounts.getUser()?.id!==owner||document.body.classList.contains('auth-locked')||$('.app-shell').inert)return;
  if(!dialog.open&&document.querySelector('dialog[open],[popover]:popover-open'))return;
  const expected=epoch;automatic=false;
  const loading=loadFeed(refresh);renderHistory();
  if(!dialog.open){dialog.showModal();$('#accept-patch-notes').focus({preventScroll:true});}
  const loaded=await loading;if(expected!==epoch)return;feed=loaded;
  if(dialog.open&&!automatic)renderHistory();
 }
 async function changeAccount(){
  const next=root.PlanoAccounts.getUser()?.id||'';if(next===owner)return;
  displayed=null;if(dialog.open)dialog.close();owner=next;epoch++;current=null;buttons();if(!owner)return;
  const expected=epoch,cached=read(owner);current={seen:receipt(cached?.receipt),pending:receipt(cached?.pending),ready:false,saving:false};
  const session=current;feed=await loadFeed();if(epoch!==expected)return;buttons();if(dialog.open&&!automatic)renderHistory();if(!feed.length){session.ready=true;return;}
  try{if(cloud?.configured){const result=await cloud.request('release_read');if(epoch!==expected)return;session.seen=later(session.seen,receipt(result.receipt));}}
  catch{/* Sin conexión se conserva la lectura conocida de esta cuenta. */}
  if(epoch!==expected)return;session.ready=true;remember();flush();show();
 }
 for(const id of launchers)$(id)?.addEventListener('click',()=>show(true));
 $('#retry-patch-notes').addEventListener('click',()=>openHistory(true));
 for(const id of ['#close-patch-notes','#accept-patch-notes'])$(id).addEventListener('click',()=>{markSeen();dialog.close();});
 dialog.addEventListener('cancel',markSeen);
 dialog.addEventListener('close',markSeen);
 document.addEventListener('close',event=>{if(event.target!==dialog)requestAnimationFrame(()=>show());},true);
 document.addEventListener('toggle',event=>{if(event.newState==='closed'&&event.target.hasAttribute?.('popover'))requestAnimationFrame(()=>show());},true);
 document.addEventListener('plano-account-change',changeAccount);
 new MutationObserver(()=>{if(current?.ready)requestAnimationFrame(()=>show());}).observe(document.body,{attributes:true,attributeFilter:['class']});
 root.addEventListener('online',()=>flush());
 root.addEventListener('storage',event=>{
  if(!owner||event.key!==key(owner)||!current)return;
  const cached=read(owner);current.seen=later(current.seen,receipt(cached?.receipt));
  if(automatic&&dialog.open&&displayed&&current.seen?.releaseId===displayed.release.id){displayed=null;dialog.close();}
 });
 root.PlanoPatchNotes={...root.PlanoPatchNotes,flush,show:()=>show(true),info:()=>({owner,ready:current?.ready||false,seen:current?.seen||null,pending:Boolean(current?.pending)})};
 root.PlanoAccounts.ready.then(changeAccount);
})(globalThis);
