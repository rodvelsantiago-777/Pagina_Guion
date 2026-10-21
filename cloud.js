/* Proyectos privados: el token de Firebase solo viaja a nuestra función HTTPS.
 * Los borradores de nube permanecen en memoria; no se escriben PDF ni notas en localStorage. */
(function(root){
 'use strict';
 const config=root.PlanoCloudConfig||{},listeners=new Set(),drafts=new Map();
 const configured=/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(config.url||'')&&/^sb_publishable_[\w-]+$/.test(config.publishableKey||'');
 const endpoint=configured?config.url.replace(/\/$/,'')+'/functions/v1/plano-cloud':'';
 const FILE_LIMIT=10485760,PAYLOAD_LIMIT=350000;
 let owner='',epoch=0,current=null,pending=null,sequence=0,inflight=null,timer,error=null,status='idle';
 const copy=value=>structuredClone(value),key=(uid,id)=>uid+':'+id;
 const failure=(code,message)=>Object.assign(new Error(message),{code});
 function notify(next=status){status=next;for(const listener of listeners)listener(info());}
 function info(){return{configured,owner,project:current?copy(current):null,pending:Boolean(pending),status,error:error?.message||'',code:error?.code||'',drafts:drafts.size};}
 function remember(){if(current&&pending)drafts.set(key(owner,current.id),{payload:copy(pending),revision:current.revision});}
 async function request(action,data={},binary=false){
  if(!configured)throw failure('SETUP','El almacenamiento de la nube todavía no está configurado.');
  const expectedOwner=owner,expectedEpoch=epoch,user=root.PlanoAccounts.getUser();
  if(!user||user.id!==expectedOwner)throw failure('SESSION','Vuelve a iniciar sesión para acceder a tus proyectos.');
  if(navigator.onLine===false)throw failure('OFFLINE','Sin conexión. Los cambios pendientes siguen en esta pestaña.');
  const token=await root.PlanoAccounts.getAccessToken();
  if(epoch!==expectedEpoch||owner!==expectedOwner)throw failure('CANCELLED','La cuenta ha cambiado.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const form=data instanceof FormData;
   const response=await fetch(endpoint+'?action='+action,{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+token,...(!form?{'Content-Type':'application/json'}:{})},body:form?data:JSON.stringify(data),signal:controller.signal,cache:'no-store',credentials:'omit'});
   if(!response.ok){
    let body;try{body=await response.json();}catch{}
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
  remember();clearTimeout(timer);epoch++;owner=nextOwner||'';current=null;pending=null;inflight=null;sequence=0;error=null;notify('idle');
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
  if(error?.code==='CONFLICT'){notify('conflict');return;}
  error=null;notify('pending');timer=setTimeout(()=>flush().catch(()=>{}),1500);
 }
 async function flush(){
  clearTimeout(timer);
  if(inflight)return inflight;
  if(!pending||!current)return;
  if(error?.code==='CONFLICT')throw error;
  const expectedEpoch=epoch,projectId=current.id;
  const work=(async()=>{
   while(pending&&current?.id===projectId&&epoch===expectedEpoch){
    const snapshot=copy(pending),savedSequence=sequence;
    if(new TextEncoder().encode(JSON.stringify(snapshot)).length>PAYLOAD_LIMIT)throw failure('TOO_LARGE','Las anotaciones superan 350 KB. Exporta una copia antes de continuar.');
    error=null;notify('saving');
    const {project}=await request('save',{id:projectId,revision:current.revision,payload:snapshot});
    if(epoch!==expectedEpoch)return;
    current={...current,...project};
    if(sequence===savedSequence){pending=null;drafts.delete(key(owner,projectId));notify('saved');}
    else remember();
   }
  })();
  inflight=work;
  try{return await work;}catch(reason){
   if(epoch===expectedEpoch){error=reason;remember();notify(reason.code==='CONFLICT'?'conflict':'error');}throw reason;
  }finally{if(epoch===expectedEpoch)inflight=null;}
 }
 async function importFile(file){
  if(file.size>FILE_LIMIT)throw failure('TOO_LARGE','El límite gratuito es de 10 MB por PDF.');
  await flush();const form=new FormData();form.append('name',file.name);form.append('file',file);
  const {project}=await request('create',form);return project;
 }
 async function open(id){
  await flush();const {project}=await request('read',{id});
  const blob=await request('download',{id},true);
  if(blob.size!==project.size_bytes)throw failure('DAMAGED','No se descargó el PDF completo. Inténtalo de nuevo.');
  return{project,file:new File([blob],project.name,{type:'application/pdf'})};
 }
 async function rename(project,name){
  await flush();const revision=current?.id===project.id?current.revision:project.revision;
  const result=await request('rename',{id:project.id,revision,name});
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
 function subscribe(listener){listeners.add(listener);listener(info());return()=>listeners.delete(listener);}
 function hasPending(){return Boolean(pending)||drafts.size>0;}
 root.addEventListener('beforeunload',event=>{if(hasPending()){event.preventDefault();event.returnValue='';}});
 root.addEventListener('online',()=>{if(pending&&error?.code!=='CONFLICT')flush().catch(()=>{});});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&pending&&error?.code!=='CONFLICT')flush().catch(()=>{});});
 root.PlanoCloud={configured,FILE_LIMIT,request,changeOwner,attach,preview,schedule,flush,importFile,open,rename,remove,detach,reload,subscribe,info,hasPending,list:()=>request('list')};
})(globalThis);
