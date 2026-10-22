/* Biblioteca de cuenta, miniaturas privadas y estado de sincronización. */
(function(root){
 'use strict';
 const $=selector=>document.querySelector(selector),cloud=root.PlanoCloud;
 let hooks={},working=false,loadingVersion=0,projects=[],previewWork=null,renameTarget=null,renaming=false,libraryRequest=null,accountOwner='';
 const previews=new Map(),previewTried=new Set();
 const labels={idle:'Mis guiones',saved:'Guardado en la nube',pending:'Cambios pendientes',saving:'Guardando…',conflict:'Conflicto de versiones',error:'No se ha guardado'};
 const previewKey=project=>`${accountOwner}/${project.id}/${project.fingerprint}`;
 const atHome=()=>!document.body.classList.contains('is-editing');
 function sync(state){
  accountOwner=state.owner;
  $('#open-cloud').hidden=!cloud.configured;
  $('#open-cloud-label').textContent=labels[state.status];$('#open-cloud').dataset.syncState=state.status;
  $('#cloud-sync-alert').hidden=!state.error;$('#cloud-sync-error').textContent=state.error;
  $('#cloud-reload').hidden=state.code!=='CONFLICT';$('#cloud-retry-save').hidden=!state.pending||state.code==='CONFLICT';
  if(cloud.configured&&root.PlanoAccounts.getUser())$('#save-status').textContent=state.error||labels[state.status];
 }
 function message(text='',error=false){
  for(const id of ['#cloud-library-message','#home-library-message']){
   const node=$(id);node.textContent=text;node.hidden=!text;node.classList.toggle('is-error',error);
  }
 }
 function button(text,callback,className=''){
  const node=document.createElement('button');node.type='button';node.textContent=text;node.className=className;node.addEventListener('click',callback);return node;
 }
 function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#i-'+name);svg.append(use);svg.setAttribute('aria-hidden','true');return svg;}
 function size(project){return project.size_bytes<1048576?`${Math.max(1,Math.ceil(project.size_bytes/1024)).toLocaleString('es')} KB`:`${(project.size_bytes/1048576).toLocaleString('es',{maximumFractionDigits:1})} MB`;}
 function thumbnail(project){return previews.get(previewKey(project))||project.thumbnail;}
 function applyPreview(node,project){
  const image=thumbnail(project);
  if(root.PlanoScriptPreview.valid(image)){
   const img=document.createElement('img');img.src=image;img.alt='';img.decoding='async';node.replaceChildren(img);
  }else{
   const paper=document.createElement('span');paper.className='script-preview-fallback';paper.setAttribute('aria-hidden','true');
   const title=document.createElement('strong');title.textContent=project.name.replace(/\.pdf$/i,'');paper.append(title,...Array.from({length:5},()=>document.createElement('i')));node.replaceChildren(paper);
  }
 }
 function renderHome(){
  const add=$('#upload-button'),cards=[];
  for(const project of projects){
   const card=document.createElement('article');card.className='script-card';card.dataset.projectId=project.id;
   const open=button('',()=>openProject(project),'script-card-open');open.setAttribute('aria-label',project.name);open.title=`Abrir ${project.name}`;open.disabled=project.state!=='ready';
   const preview=document.createElement('span');preview.className='script-card-preview';applyPreview(preview,project);
   const name=document.createElement('strong');name.className='script-card-name';name.textContent=project.name.replace(/\.pdf$/i,'');
   const meta=document.createElement('span');meta.className='script-card-meta';meta.textContent=project.state==='ready'?`PDF · ${size(project)}`:'Subida sin completar';
   open.append(preview,name,meta);
   const actions=document.createElement('div');actions.className='script-card-actions';
   const rename=button('Renombrar',()=>renameFile(project),'script-rename');rename.prepend(icon('edit'));rename.setAttribute('aria-label',`Cambiar nombre de ${project.name}`);rename.disabled=project.state!=='ready';
   const remove=button('×',()=>deleteProject(project),'script-delete');remove.setAttribute('aria-label',`Eliminar ${project.name}`);remove.title='Eliminar guion';
   actions.append(rename);if(project.id!=='local')actions.append(remove);
   card.append(open,actions);cards.push(card);
  }
  $('#home-projects').replaceChildren(...cards,add);
  $('#home-library-count').textContent=projects.length?`${projects.length} ${projects.length===1?'guion':'guiones'}${cloud.configured?' en tu cuenta':''}`:'Tu próxima historia empieza con un «+».';
  queueMicrotask(pumpPreviews);
 }
 function updatePreview(project,image){
  if(!root.PlanoScriptPreview.valid(image))return;
  previews.set(previewKey(project),image);
  const existing=projects.find(item=>item.id===project.id&&item.fingerprint===project.fingerprint);
  if(existing){existing.thumbnail=image;for(const card of $('#home-projects').querySelectorAll('.script-card'))if(card.dataset.projectId===project.id)applyPreview(card.querySelector('.script-card-preview'),existing);}
 }
 function pumpPreviews(){
  if(!cloud.configured||working||renaming||previewWork||!atHome()||!root.PlanoAccounts.getUser())return;
  const project=projects.find(item=>item.state==='ready'&&!root.PlanoScriptPreview.valid(thumbnail(item))&&!previewTried.has(previewKey(item)));
  if(!project||!hooks.preview)return;
  const owner=accountOwner;previewTried.add(previewKey(project));
  const work=(async()=>{
   try{
    const result=await hooks.preview(project);if(owner!==accountOwner||!result)return;
    const current=projects.find(item=>item.id===project.id&&item.fingerprint===project.fingerprint);if(!current)return;
    if(result.project&&result.project.revision>=current.revision)Object.assign(current,result.project);
    updatePreview(current,result.thumbnail);
   }catch{/* La miniatura es opcional: un fallo nunca impide abrir el PDF. */}
  })();
  previewWork=work;work.finally(()=>{if(previewWork===work)previewWork=null;queueMicrotask(pumpPreviews);});
 }
 async function task(action){
  if(working)return;working=true;
  const owner=accountOwner,disabled=new Map();
  for(const container of [$('#cloud-library'),$('#drop-zone')]){
   container.setAttribute('aria-busy','true');
   for(const button of container.querySelectorAll('button')){disabled.set(button,button.disabled);if(button.id!=='close-cloud')button.disabled=true;}
  }
  try{
   // Terminar una miniatura antigua antes de leer o cambiar su revisión.
   await previewWork;
   if(owner!==accountOwner)return;
   await action();
  }catch(error){if(owner===accountOwner)message(error.message||'No se pudo completar la operación.',true);}
  finally{
   working=false;for(const container of [$('#cloud-library'),$('#drop-zone')])container.setAttribute('aria-busy','false');
   for(const [button,value] of disabled)if(button.isConnected)button.disabled=value;
   queueMicrotask(pumpPreviews);
  }
 }
 function openProject(project){return task(async()=>{
  if(project.state!=='ready')throw new Error('Esta subida no se completó. Elimínala y vuelve a subir el PDF.');
  await hooks.open(project.id);if($('#cloud-library').open)$('#cloud-library').close();
 });}
 function deleteProject(project){
  if(working||!confirm(`¿Eliminar «${project.name}» de tu cuenta? Se borrarán el PDF y sus anotaciones de la nube.`))return;
  task(async()=>{await cloud.remove(project);previews.delete(previewKey(project));await hooks.deleted?.(project.id);await refresh(true);});
 }
 function renderModal(){
  $('#cloud-projects').replaceChildren();$('#cloud-empty').hidden=Boolean(projects.length);
  $('#cloud-library-count').textContent=`${projects.length} / 10 guiones · PDF de hasta 10 MB`;
  for(const project of projects){
   const row=document.createElement('article');row.className='cloud-project';
   const content=document.createElement('div'),title=button(project.name,()=>openProject(project),'cloud-project-title');title.title=project.name;content.append(title);
   const detail=document.createElement('p');detail.textContent=project.state==='ready'?`${size(project)} · ${new Date(project.updated_at).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'})}`:'Subida pendiente de completar';content.append(detail);
   const actions=document.createElement('div');actions.className='cloud-project-actions';
   if(project.state==='ready')actions.append(button('Renombrar',()=>{
    const input=document.createElement('input');input.value=project.name;input.maxLength=180;input.setAttribute('aria-label','Nombre del proyecto');
    const form=document.createElement('form');form.className='cloud-rename';
    const save=document.createElement('button');save.type='submit';save.textContent='Guardar';
    const cancel=button('Cancelar',()=>form.replaceWith(title));form.append(input,save,cancel);title.replaceWith(form);input.focus();input.select();
    form.addEventListener('submit',event=>{event.preventDefault();if(!input.value.trim())return;task(async()=>{const updated=await cloud.rename(project,input.value.trim());hooks.renamed?.(updated);await refresh(true);});});
   }));
   actions.append(button('Eliminar',()=>deleteProject(project),'cloud-delete'));row.append(content,actions);$('#cloud-projects').append(row);
  }
 }
 async function refresh(fresh=false){
  const expected=accountOwner;
  if(!cloud.configured){projects=hooks.currentProject?.()?[hooks.currentProject()]:[];renderHome();message();return;}
  if(!expected||root.PlanoAccounts.getUser()?.id!==expected)return;
  if(!fresh&&libraryRequest?.owner===expected)return libraryRequest.promise;
  const version=++loadingVersion;
  message('Cargando tus guiones…');$('#drop-zone').setAttribute('aria-busy','true');
  const work=(async()=>{
   try{
    const result=await cloud.list();if(version!==loadingVersion||expected!==accountOwner)return;
    projects=result.projects;message();renderHome();renderModal();
   }catch(error){if(version===loadingVersion&&expected===accountOwner)message(error.message,true);}
   finally{if(version===loadingVersion)$('#drop-zone').setAttribute('aria-busy','false');}
  })();
  libraryRequest={owner:expected,promise:work};
  try{return await work;}finally{if(libraryRequest?.promise===work)libraryRequest=null;}
 }
 function showHome(){if(atHome())return refresh();}
 function open(){if(!root.PlanoAccounts.getUser())return;sync(cloud.info());if(!$('#cloud-library').open)$('#cloud-library').showModal();refresh();}
 function renameFile(project=hooks.currentProject?.()){
  if(!project||working||renaming||hooks.canRename?.()===false)return;
  renameTarget={project,owner:accountOwner};$('#rename-file-error').hidden=true;
  const input=$('#rename-file-input');input.value=project.name.replace(/\.pdf$/i,'');input.setCustomValidity('');
  $('#rename-file-dialog').showModal();input.focus();input.select();
 }
 function closeOnIdentity(){
  loadingVersion++;libraryRequest=null;projects=[];previews.clear();previewTried.clear();renameTarget=null;
  $('#cloud-projects').replaceChildren();renderHome();message();
  for(const id of ['#cloud-library','#rename-file-dialog'])if($(id).open)$(id).close();
 }
 function init(options){
  hooks=options;cloud.subscribe(sync);
  $('#open-cloud').addEventListener('click',open);$('#close-cloud').addEventListener('click',()=>$('#cloud-library').close());
  $('#cloud-refresh').addEventListener('click',()=>task(refresh));$('#home-refresh').addEventListener('click',()=>task(refresh));
  $('#cloud-new').addEventListener('click',()=>{$('#cloud-library').close();$('#file-input').click();});
  $('#cloud-retry-save').addEventListener('click',()=>task(()=>cloud.flush()));
  $('#cloud-export-draft').addEventListener('click',()=>{if(hooks.exportDraft?.())message('Copia de notas descargada.');else message('Abre el guion para exportar sus notas.');});
  $('#cloud-reload').addEventListener('click',()=>{
   if(!confirm('¿Recargar las anotaciones de la nube y descartar los cambios pendientes de esta pestaña? Descarga una copia antes si quieres conservarlos.'))return;
   task(async()=>{const project=await cloud.reload();await hooks.reload(project);message('Versión de la nube recuperada.');});
  });
  for(const id of ['#rename-current-file','#rename-file-menu'])$(id).addEventListener('click',()=>renameFile());
  $('#cancel-file-rename').addEventListener('click',()=>{if(!renaming)$('#rename-file-dialog').close();});
  $('#rename-file-dialog').addEventListener('cancel',event=>{if(renaming)event.preventDefault();});
  $('#rename-file-dialog').addEventListener('close',()=>{if(!$('#rename-file-dialog').open)renameTarget=null;});
  $('#rename-file-input').addEventListener('input',event=>event.target.setCustomValidity(''));
  $('#rename-file-form').addEventListener('submit',async event=>{
   event.preventDefault();if(!renameTarget||renaming||working)return;
   const target=renameTarget,input=$('#rename-file-input'),base=input.value.trim().replace(/\.pdf$/i,'').trim(),name=base+'.pdf';
   input.setCustomValidity(!base?'Escribe un nombre para el guion.':name.length>180?'El nombre es demasiado largo.':'');if(!input.reportValidity())return;
   renaming=true;input.disabled=true;$('#save-file-rename').disabled=true;$('#cancel-file-rename').disabled=true;$('#rename-file-error').hidden=true;
   try{
    await previewWork;if(target.owner!==accountOwner)return;
    const project=target.project.id==='local'?await hooks.renameLocal(name):await cloud.rename(target.project,name);
    if(target.owner!==accountOwner)return;
    hooks.renamed?.(project);$('#rename-file-dialog').close();await refresh(true);
   }catch(error){
    if(target.owner===accountOwner){$('#rename-file-error').textContent=error.message||'No se pudo guardar el nombre.';$('#rename-file-error').hidden=false;
     if(error.code==='CONFLICT'){await refresh(true);target.project=projects.find(item=>item.id===target.project.id)||target.project;}}
   }finally{renaming=false;input.disabled=false;$('#save-file-rename').disabled=false;$('#cancel-file-rename').disabled=false;queueMicrotask(pumpPreviews);}
  });
  if(cloud.configured){
   $('.local-badge').textContent='Biblioteca privada';
   $('.privacy-note').textContent='Tus guiones y planos se guardan de forma privada en tu cuenta.';
   $('.file-hint').textContent='Formato PDF · Hasta 10 MB por archivo';
   $('#auth-local-description').textContent='Tus guiones y planos, disponibles al iniciar sesión en tu cuenta.';
   $('#account-local-note').textContent='Verifica tu correo para activar la cuenta. El estudio guarda tus guiones de forma privada en la nube.';
   $('#account-storage-description').textContent='Los PDF y sus anotaciones se guardan en tu cuenta cuando el servidor confirma la sincronización. Puedes abrirlos desde otro dispositivo.';
  }
  document.addEventListener('plano-account-change',showHome);
  root.PlanoAccounts.ready.then(showHome);
 }
 root.PlanoCloudLibrary={init,open,showHome,renameFile,updatePreview,closeOnIdentity,finishPreview:()=>previewWork,refreshStatus:()=>sync(cloud.info())};
})(globalThis);
