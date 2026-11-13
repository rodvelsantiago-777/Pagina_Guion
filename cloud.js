/* Proyectos privados: el token de Firebase solo viaja a nuestra función HTTPS.
 * Los borradores de nube permanecen en memoria; no se escriben PDF ni notas en localStorage. */
(function(root){
 'use strict';
 const config=root.PlanoCloudConfig||{},listeners=new Set(),drafts=new Map();
 const configured=/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(config.url||'')&&/^sb_publishable_[\w-]+$/.test(config.publishableKey||'');
 const endpoint=configured?config.url.replace(/\/$/,'')+'/functions/v1/plano-cloud':'';
 const PAYLOAD_LIMIT=350000;
 let owner='',epoch=0,current=null,pending=null,sequence=0,inflight=null,timer,error=null,status='idle';
 const reading=new Map(),preparedReads=new Map();
 const copy=value=>structuredClone(value),key=(uid,id)=>uid+':'+id;
 const failure=(code,message)=>Object.assign(new Error(message),{code});
 function notify(next=status){status=next;for(const entry of listeners)entry.listener(info(entry.payload));}
 function info(includePayload=true){const metadata=current&&Object.fromEntries(Object.entries(current).filter(([key])=>key!=='payload'));return{configured,owner,project:current?copy(includePayload?current:metadata):null,pending:Boolean(pending),status,error:error?.message||'',code:error?.code||'',drafts:drafts.size};}
 // pending ya es una copia privada: cada edición lo reemplaza, nunca lo modifica.
 function remember(){if(current&&pending)drafts.set(key(owner,current.id),{payload:pending,revision:current.revision});}
 function request(action,data={},binary=false){
  if(!['list','read','preferences_read','release_read','download'].includes(action))preparedReads.clear();
  if(binary||!['list','read','preferences_read','release_read'].includes(action))return send(action,data,binary);const tag=epoch+':'+action+':'+JSON.stringify(data);if(reading.has(tag))return reading.get(tag);const work=send(action,data,binary);reading.set(tag,work);const done=()=>{if(reading.get(tag)===work)reading.delete(tag);};work.then(done,done);return work;
 }
 async function send(action,data={},binary=false){
  if(!configured)throw failure('SETUP','El almacenamiento de la nube todavía no está configurado.');
  const expectedOwner=owner,expectedEpoch=epoch,user=root.PlanoAccounts.getUser();
  if(!user||user.id!==expectedOwner)throw failure('SESSION','Vuelve a iniciar sesión para acceder a tus proyectos.');
  if(navigator.onLine===false)throw failure('OFFLINE','Sin conexión. Los cambios pendientes siguen en esta pestaña.');
  const token=await root.PlanoAccounts.getAccessToken();
  const device=await root.PlanoAccountSession?.ensure(token);
  if(epoch!==expectedEpoch||owner!==expectedOwner)throw failure('CANCELLED','La cuenta ha cambiado.');
  const bundled=root.PlanoAccountSession?.take(action);if(bundled)return bundled;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const form=data instanceof FormData;
   const response=await fetch(endpoint+'?action='+action,{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+token,...(device?{'x-plano-session':device.secret}:{}),...(!form?{'Content-Type':'application/json'}:{})},body:form?data:JSON.stringify(data),signal:controller.signal,cache:'no-store',credentials:'omit'});
   if(!response.ok){
    let body;try{body=await response.json();}catch{}
    if(epoch!==expectedEpoch||owner!==expectedOwner)throw failure('CANCELLED','La cuenta ha cambiado.');
    if(['SESSION_REVOKED','ACCOUNT_DELETED'].includes(body?.code))document.dispatchEvent(new CustomEvent('plano-session-revoked',{detail:body.message}));
    throw failure(body?.code||'UNAVAILABLE',body?.message||'La nube no está disponible. Comprueba que se haya completado su instalación y que el proyecto esté activo.');
   }
   const result=binary?await response.blob():await response.json();
   if(epoch!==expectedEpoch||owner!==expectedOwner)throw failure('CANCELLED','La cuenta ha cambiado.');
   return result;
  }catch(reason){
   if(reason.code)throw reason;
   throw failure('NETWORK','No se pudo contactar con la nube. Tus cambios pendientes siguen en esta pestaña.');
  }finally{clearTimeout(timeout);}
 }
 function changeOwner(nextOwner){
  remember();reading.clear();preparedReads.clear();clearTimeout(timer);epoch++;owner=nextOwner||'';current=null;pending=null;inflight=null;sequence=0;error=null;notify('idle');
 }
 function attach(project){
  clearTimeout(timer);current=copy(project);pending=null;sequence=0;error=null;
  const draft=drafts.get(key(owner,project.id));
  if(draft){pending=copy(draft.payload);current.revision=draft.revision;sequence++;notify('pending');timer=setTimeout(()=>flush().catch(()=>{}),1500);return copy(pending);}
  notify('saved');return copy(project.payload||{version:1,annotations:[]});
 }
 function preview(project){return copy(drafts.get(key(owner,project.id))?.payload||project.payload||{version:1,annotations:[]});}
 function schedule(payload){
  if(!configured||!current)return;
  pending=copy(payload);sequence++;remember();clearTimeout(timer);
  if(error?.code==='CONFLICT')return;
  error=null;if(status!=='pending')notify('pending');timer=setTimeout(()=>flush().catch(()=>{}),1500);
 }
 async function savePayload(project,payload){
  // El título queda en el guion aunque falle la actualización del listado.
  // Conserva la revisión del primer guardado para que el reintento pueda continuar.
  const {project:saved}=await request('save',{id:project.id,revision:project.revision,payload});
  let record={...saved,payload:copy(payload)};
  const updateCurrent=()=>{if(current?.id===project.id)current={...current,...record};};
  updateCurrent();
  if(payload.projectName&&payload.projectName!==saved.project_name){
   try{
    const {project:renamed}=await request('rename_project',{id:project.id,revision:saved.revision,name:payload.projectName});
    record={...record,...renamed};
    updateCurrent();
   }catch(reason){
    reason.savedProject=record;
    reason.message='El guion se guardó. Reintenta para actualizar el título en la biblioteca.';
    throw reason;
   }
  }
  return record;
 }
 async function flush(){
  clearTimeout(timer);
  if(inflight)return inflight;
  if(!pending||!current)return;
  if(error?.code==='CONFLICT')throw error;
  const expectedEpoch=epoch,projectId=current.id;
  const work=(async()=>{
   const encoder=new TextEncoder(),bytes=value=>encoder.encode(JSON.stringify(value)).length;
   while(pending&&current?.id===projectId&&epoch===expectedEpoch){
    const snapshot=copy(pending),savedSequence=sequence;
    if(bytes(snapshot)>PAYLOAD_LIMIT){
     if(!snapshot.thumbnail)throw failure('TOO_LARGE','El guion y sus notas superan 350 KB. Descarga una copia antes de continuar.');
     delete snapshot.thumbnail;
     if(bytes(snapshot)>PAYLOAD_LIMIT)throw failure('TOO_LARGE','El guion y sus notas superan 350 KB. Descarga una copia antes de continuar.');
    }
    error=null;notify('saving');
    await savePayload(current,snapshot);
    if(epoch!==expectedEpoch)return;
    if(sequence===savedSequence){pending=null;drafts.delete(key(owner,projectId));notify('saved');}
    else remember();
   }
  })();
  inflight=work;
  try{return await work;}catch(reason){
   if(epoch===expectedEpoch){error=reason;remember();notify(reason.code==='CONFLICT'?'conflict':'error');}throw reason;
  }finally{if(epoch===expectedEpoch)inflight=null;}
 }
 async function createEditable(payload,name,projectName){await flush();return(await request('create_editable',{name,projectName,payload:{...payload,documentFormat:2}})).project;}
 async function commitPayload(project,payload){
  await flush();
  const attached=current?.id===project.id?current:null;
  try{
   const saved=await savePayload(attached||project,payload);
   if(attached&&current?.id===attached.id){
    if(pending)remember();
    notify(pending?'pending':'saved');
   }
   return saved;
  }catch(reason){
   if(reason.savedProject&&attached&&current?.id===attached.id){
    pending ||= copy(payload);sequence++;remember();error=reason;
    notify(reason.code==='CONFLICT'?'conflict':'error');
   }
   throw reason;
  }
 }
 async function convertEditable(project,payload){
  await flush();const revision=current?.id===project.id?current.revision:project.revision;
  const result=await request('convert_editable',{id:project.id,revision,payload:{...payload,documentFormat:2,fingerprint:project.fingerprint}});
  if(current?.id===project.id){current=copy(result.project);notify('saved');}return result.project;
 }
 function prefetch(project){
  if(!configured||!owner||project?.storage_kind!=='editable'||project.state!=='ready')return;
  const existing=preparedReads.get(project.id);
  if(existing&&existing.epoch===epoch&&existing.revision===project.revision&&Date.now()-existing.at<10000)return existing.work;
  const entry={epoch,revision:project.revision,at:Date.now(),work:request('read',{id:project.id})};preparedReads.set(project.id,entry);
  while(preparedReads.size>2)preparedReads.delete(preparedReads.keys().next().value);
  entry.work.catch(()=>{if(preparedReads.get(project.id)===entry)preparedReads.delete(project.id);});return entry.work;
 }
 async function open(id){
  const expectedEpoch=epoch;await flush();if(epoch!==expectedEpoch)throw failure('CANCELLED','La cuenta ha cambiado.');const entry=preparedReads.get(id);preparedReads.delete(id);
  const {project}=await(entry&&entry.epoch===epoch&&Date.now()-entry.at<10000?entry.work:request('read',{id}));
  if(epoch!==expectedEpoch)throw failure('CANCELLED','La cuenta ha cambiado.');
  if(project.storage_kind==='editable'){
   if(project.pdf_cleanup_pending){const clean=await request('cleanup_pdf',{id});if(epoch!==expectedEpoch)throw failure('CANCELLED','La cuenta ha cambiado.');Object.assign(project,clean.project);}
   return{project,file:null};
  }
  const blob=await request('download',{id},true);
  if(epoch!==expectedEpoch)throw failure('CANCELLED','La cuenta ha cambiado.');
  if(blob.size!==project.size_bytes)throw failure('DAMAGED','No se descargó el PDF completo. Inténtalo de nuevo.');
  return{project,file:new File([blob],project.name,{type:'application/pdf'})};
 }
 async function rename(project,name){
  await flush();const revision=current?.id===project.id?current.revision:project.revision;
  const result=await request('rename',{id:project.id,revision,name});
  if(current?.id===project.id){current={...current,...result.project};notify();}
  return result.project;
 }
 async function renameProject(project,name){
  await flush();const revision=current?.id===project.id?current.revision:project.revision;
  const result=await request('rename_project',{id:project.id,revision,name});
  if(current?.id===project.id){current={...current,...result.project};notify();}
  return result.project;
 }
 async function remove(project){
  await flush();const revision=current?.id===project.id?current.revision:project.revision;
  await request('delete',{id:project.id,revision});drafts.delete(key(owner,project.id));
  if(current?.id===project.id)detach();
 }
 function detach(){if(pending)throw failure('UNSAVED','Hay cambios sin guardar. Reintenta el guardado o exporta una copia antes de cerrar.');current=null;error=null;notify('idle');}
 async function reload(){
  if(!current)return;
  const id=current.id;const {project}=await request('read',{id});
  // Solo se llama después de la confirmación explícita de descartar el borrador local.
  drafts.delete(key(owner,id));pending=null;error=null;attach(project);return project;
 }
 function subscribe(listener,{payload=true}={}){const entry={listener,payload};listeners.add(entry);listener(info(payload));return()=>listeners.delete(entry);}
 function hasPending(){return Boolean(pending)||drafts.size>0;}
 root.addEventListener('beforeunload',event=>{if(hasPending()){event.preventDefault();event.returnValue='';}});
 root.addEventListener('online',()=>{if(pending&&error?.code!=='CONFLICT')flush().catch(()=>{});});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&pending&&error?.code!=='CONFLICT')flush().catch(()=>{});});
 root.PlanoCloud={configured,PAYLOAD_LIMIT,request,prefetch,changeOwner,attach,preview,schedule,flush,createEditable,commitPayload,convertEditable,open,rename,renameProject,remove,detach,reload,subscribe,info,hasPending,list:()=>request('list')};
})(globalThis);
