/* Avisos de publicación por cuenta. Solo el recibo mínimo se cachea en el equipo. */
(function(root){
 'use strict';
 const categories={new:'Novedades',improved:'Mejoras',fixed:'Correcciones'};
 const topics={writing:'Redactor de guion',projects:'Proyectos, importación y exportación',account:'Cuenta y seguridad',production:'Cobertura y guion técnico',review:'Corrector de español',performance:'Rendimiento y estabilidad',interface:'Interfaz y navegación',releases:'Notas de versión'};
 function editorialMetadata(value){
  if(!value||!Object.hasOwn(topics,value.topic))return{};
  return{topic:value.topic,order:Number.isInteger(value.order)&&value.order>=0&&value.order<=1000?value.order:500,...(typeof value.id==='string'&&/^[a-zA-Z0-9._-]{1,100}$/.test(value.id)?{id:value.id}:{})};
 }
 function receipt(value){
  return value&&typeof value.releaseId==='string'&&/^[a-zA-Z0-9._-]{1,100}$/.test(value.releaseId)&&typeof value.publishedAt==='string'&&Number.isFinite(Date.parse(value.publishedAt))?{releaseId:value.releaseId,publishedAt:value.publishedAt}:null;
 }
 function later(a,b){return !a?b:!b?a:Date.parse(b.publishedAt)>=Date.parse(a.publishedAt)?b:a;}
 function releaseDay(value){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  return ['year','month','day'].map(key=>parts.find(part=>part.type===key).value).join('-');
 }
 const semver=value=>typeof value==='string'&&/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(value);
 const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];};
 const increment=value=>{const parts=value.split('.').map(Number);parts[2]++;return parts.join('.');};
 function versionConfig(value){return{initialVersion:semver(value?.initialVersion)?value.initialVersion:'0.1.0',milestones:(Array.isArray(value?.milestones)?value.milestones:[]).filter(item=>/^\d{4}-\d{2}-\d{2}$/.test(item?.day||'')&&semver(item.version)).slice(0,100).map(item=>({day:item.day,version:item.version})).sort((a,b)=>a.day.localeCompare(b.day))};}
 function noteItem(value){
  if(typeof value==='string')return value.trim().slice(0,500)||null;
  if(!value||typeof value.text!=='string'||!value.text.trim())return null;
  const meta=editorialMetadata(value),details=[...new Set((Array.isArray(value.details)?value.details:[]).filter(text=>typeof text==='string'&&text.trim()).slice(0,30).map(text=>text.trim().slice(0,160)))];
  return details.length?{text:value.text.trim().slice(0,200),details,...meta}:meta.topic?{text:value.text.trim().slice(0,500),...meta}:null;
 }
 function organize(release){
  const groups=new Map(),keys=Object.keys(topics),seen=new Set();let position=0;
  for(const section of release.sections||[])for(const raw of section.items||[]){
   const note=noteItem(raw);if(!note)continue;
   const signature=typeof note==='string'?note:note.text+(note.details?.length?'\n'+note.details.join('\n'):'');if(seen.has(signature))continue;seen.add(signature);
   const topic=typeof note==='object'&&note.topic,key=topic||section.category;
   if(!groups.has(key))groups.set(key,{id:key,title:topics[topic]||categories[section.category]||'Otros cambios',rank:topic?keys.indexOf(topic):keys.length+Object.keys(categories).indexOf(section.category),items:[]});
   groups.get(key).items.push({note,order:typeof note==='object'&&Number.isInteger(note.order)?note.order:500,position:position++});
  }
  return [...groups.values()].sort((a,b)=>a.rank-b.rank).map(({id,title,items})=>({id,title,items:items.sort((a,b)=>a.order-b.order||a.position-b.position).map(item=>item.note)}));
 }
 function releases(value){
  if(value?.schema!==1||!Array.isArray(value.releases))return [];
  const ids=new Set(),days=new Map(),config=versionConfig(value.versioning);
  for(const item of value.releases.slice(0,2000)){
   const clean=receipt({releaseId:item?.id,publishedAt:item?.publishedAt}),key=item?.id+'|'+item?.publishedAt;
   if(!clean||ids.has(key)||!Array.isArray(item.sections))continue;
   ids.add(key);const day=releaseDay(item.publishedAt),version=semver(item.version)&&item.version!==day.replaceAll('-','.')?item.version:null;
   let group=days.get(day);
   const commit=/^[a-f0-9]{40}$/.test(item.commit||'')?item.commit:/^[a-f0-9]{40}$/.test(item.id)?item.id:null;
   if(!group){group={id:'day-'+day,day,commit,publishedAt:item.publishedAt,version,sections:[]};days.set(day,group);}
   if(Date.parse(item.publishedAt)>Date.parse(group.publishedAt)){group.publishedAt=item.publishedAt;group.commit=commit;}
   if(version&&(!group.version||compare(version,group.version)>0))group.version=version;
   for(const section of item.sections.slice(0,3)){
    if(!Object.hasOwn(categories,section?.category)||!Array.isArray(section.items))continue;
    let target=group.sections.find(part=>part.category===section.category);
    if(!target){target={category:section.category,items:[]};group.sections.push(target);}
    for(const raw of section.items.slice(0,200)){
     const content=noteItem(raw);if(!content)continue;
     const existing=typeof content==='object'&&target.items.find(note=>typeof note==='object'&&note.text===content.text);
     if(existing){if(content.details)existing.details=[...new Set([...(existing.details||[]),...content.details])].slice(0,30);continue;}
     if(group.sections.reduce((count,part)=>count+part.items.length,0)<200&&!target.items.some(note=>JSON.stringify(note)===JSON.stringify(content)))target.items.push(content);
    }
   }
  }
  const ordered=[...days.values()].map(item=>({...item,sections:item.sections.filter(section=>section.items.length).sort((a,b)=>Object.keys(categories).indexOf(a.category)-Object.keys(categories).indexOf(b.category))})).filter(item=>item.sections.length).sort((a,b)=>a.day.localeCompare(b.day));
  let previous=null,previousDay='';
  for(const item of ordered){
   const milestone=config.milestones.filter(mark=>mark.day<=item.day&&mark.day>previousDay).at(-1);
   let version=item.version;
   if(milestone&&(!version||compare(version,milestone.version)<0))version=milestone.version;
   if(!version)version=previous?increment(previous):config.initialVersion;
   if(previous&&compare(version,previous)<=0)version=increment(previous);
   item.version=version;previous=version;previousDay=item.day;
  }
  return ordered.reverse().slice(0,200);
 }
 function unseen(feed,seen){
  if(!seen)return feed.slice(0,1);
  return feed.filter(item=>item.id!==seen.releaseId&&Date.parse(item.publishedAt)>Date.parse(seen.publishedAt));
 }
 root.PlanoPatchNotes={releases,unseen,releaseDay,versionConfig,organize,editorialMetadata,noteItem};
 if(typeof module==='object'&&module.exports)module.exports=root.PlanoPatchNotes;
 if(typeof document==='undefined')return;
 const $=selector=>document.querySelector(selector),dialog=$('#patch-notes-dialog'),cloud=root.PlanoCloud,key=uid=>'plano-release-seen-v1:'+encodeURIComponent(uid);
 let owner='',epoch=0,current=null,feed=[],feedPromise=null,feedStatus='idle',displayed=null,automatic=false;
 let publishedVersion='';
 function paintVersion(value){
  const meta=document.querySelector('meta[name="plano-version"]');publishedVersion=semver(value)?value:semver(meta?.content)?meta.content:'0.2.1';
  if(meta)meta.content=publishedVersion;
  for(const label of document.querySelectorAll('[data-app-version]'))label.textContent='v'+publishedVersion;
 }
 const read=uid=>{try{return JSON.parse(localStorage.getItem(key(uid)));}catch{return null;}};
 function remember(){if(!current)return;try{localStorage.setItem(key(owner),JSON.stringify({receipt:current.seen,pending:current.pending}));}catch{}}
 const launcher=$('#open-patch-notes'),library=$('#drop-zone');
 function buttons(){launcher.hidden=!owner;}
 async function loadFeed(force=false){
  if(force&&feedStatus!=='loading')feedPromise=null;
  if(!feedPromise)feedPromise=(async()=>{
   feedStatus='loading';
   try{
    const response=await fetch(new URL('release-notes.json',document.baseURI),{cache:'no-store',credentials:'same-origin'});
    if(!response.ok||Number(response.headers.get('content-length'))>150000)throw new Error('No disponible');
    const text=await response.text();if(text.length>150000)throw new Error('Demasiado grande');
    const data=JSON.parse(text);if(data?.schema!==1||!Array.isArray(data.releases))throw new Error('Formato inválido');
    const history=releases(data);paintVersion(history[0]?.version);feedStatus='ready';return history;
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
   const section=document.createElement('section');section.className='patch-release';section.dataset.releaseId=item.id;
   const meta=document.createElement('div');meta.className='patch-release-meta';
   const version=document.createElement('strong');version.textContent=item.version;
   const date=document.createElement('time');date.dateTime=item.publishedAt;date.textContent=new Date(item.publishedAt).toLocaleDateString('es',{timeZone:'America/Bogota',day:'numeric',month:'long',year:'numeric'});meta.append(version,date);section.append(meta);
   for(const group of organize(item)){
    const area=document.createElement('div');area.className='patch-topic';area.dataset.topic=group.id;
    const heading=document.createElement('h3');heading.textContent=group.title;
    const list=document.createElement('ul');for(const note of group.items){const li=document.createElement('li');li.textContent=typeof note==='string'?note:note.text;if(typeof note==='object'){if(note.id)li.dataset.noteId=note.id;if(note.details?.length){const details=document.createElement('ul');for(const text of note.details){const detail=document.createElement('li');detail.textContent=text;details.append(detail);}li.append(details);}}list.append(li);}area.append(heading,list);section.append(area);
   }
   content.append(section);
  }
  $('#patch-notes-description').textContent=items.length>1?'Historial de actualizaciones, de la más reciente a la más antigua.':'Las mejoras de esta actualización.';
 }
 function show(manual=false){
  if(manual){openHistory();return;}
  if(!owner||!current||!feed.length||root.PlanoAccounts.getUser()?.id!==owner||document.body.classList.contains('auth-locked'))return;
  if(dialog.open||document.querySelector('dialog[open],[popover]:popover-open:not(#report-launch)')||$('.app-shell').inert)return;
  if(!current.ready||library.hidden||document.body.classList.contains('is-editing'))return;
  if(!unseen(feed,current.seen).length)return;
  automatic=true;render(feed);displayed={owner,release:feed[0]};
  $('#patch-notes-title').textContent='Lo nuevo en PLANO';$('#patch-notes-eyebrow').textContent='EL ESTUDIO, AL DÍA';$('#patch-notes-state').hidden=true;
  $('#patch-notes-footer').textContent=`${feed.length} ${feed.length===1?'publicación disponible':'publicaciones disponibles'}`;$('#accept-patch-notes').textContent='Entendido';
  dialog.showModal();dialog.scrollTop=0;$('#accept-patch-notes').focus({preventScroll:true});
 }
 function renderHistory(){
  render(feed);$('#patch-notes-title').textContent='Notas de parche';$('#patch-notes-eyebrow').textContent='HISTORIAL DEL ESTUDIO';
  $('#patch-notes-description').textContent='Consulta cada publicación, de la más reciente a la más antigua.';
  $('#accept-patch-notes').textContent='Cerrar';$('#patch-notes-state').hidden=Boolean(feed.length);
  $('#patch-notes-state-message').textContent=feedStatus==='loading'?'Cargando las notas de parche…':feedStatus==='error'?'No pudimos cargar las notas. Puedes volver a intentarlo.':'Todavía no hay notas de parche publicadas.';
  $('#retry-patch-notes').hidden=feedStatus==='loading';
  $('#patch-notes-footer').textContent=feed.length?`${feed.length} ${feed.length===1?'publicación disponible':'publicaciones disponibles'}`:'Historial de actualizaciones';
  displayed=feed.length?{owner,release:feed[0]}:null;
 }
 async function openHistory(refresh=true){
  if(!owner||root.PlanoAccounts.getUser()?.id!==owner||document.body.classList.contains('auth-locked')||$('.app-shell').inert)return;
  if(!dialog.open&&document.querySelector('dialog[open],[popover]:popover-open:not(#report-launch)'))return;
  const expected=epoch;automatic=false;
  const loading=loadFeed(refresh);renderHistory();
  if(!dialog.open){dialog.showModal();dialog.scrollTop=0;$('#accept-patch-notes').focus({preventScroll:true});}
  const loaded=await loading;if(expected!==epoch)return;feed=loaded;
  if(dialog.open&&!automatic){renderHistory();dialog.scrollTop=0;}
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
 launcher.addEventListener('click',()=>show(true));
 $('#retry-patch-notes').addEventListener('click',()=>openHistory(true));
 for(const id of ['#close-patch-notes','#accept-patch-notes'])$(id).addEventListener('click',()=>{markSeen();dialog.close();});
 dialog.addEventListener('cancel',markSeen);
 dialog.addEventListener('close',markSeen);
 document.addEventListener('close',event=>{if(event.target!==dialog)requestAnimationFrame(()=>show());},true);
 document.addEventListener('toggle',event=>{if(event.newState==='closed'&&event.target.hasAttribute?.('popover'))requestAnimationFrame(()=>show());},true);
 document.addEventListener('plano-account-change',changeAccount);
 const navigation=new MutationObserver(()=>{if(current?.ready)requestAnimationFrame(()=>show());});
 navigation.observe(document.body,{attributes:true,attributeFilter:['class']});
 navigation.observe(library,{attributes:true,attributeFilter:['hidden']});
 root.addEventListener('online',()=>flush());
 root.addEventListener('storage',event=>{
  if(!owner||event.key!==key(owner)||!current)return;
  const cached=read(owner);current.seen=later(current.seen,receipt(cached?.receipt));
  if(automatic&&dialog.open&&displayed&&current.seen?.releaseId===displayed.release.id){displayed=null;dialog.close();}
 });
 paintVersion();root.PlanoPatchNotes={...root.PlanoPatchNotes,version:()=>publishedVersion,flush,show:()=>show(true),info:()=>({owner,ready:current?.ready||false,seen:current?.seen||null,pending:Boolean(current?.pending)})};
 root.PlanoAccounts.ready.then(changeAccount);
})(globalThis);
