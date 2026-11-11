/* Biblioteca de cuenta, miniaturas privadas y estado de sincronización. */
(function(root){
 'use strict';
 const $=selector=>document.querySelector(selector),cloud=root.PlanoCloud;
 let hooks={},working=false,loadingVersion=0,projects=[],previewWork=null,renameTarget=null,renaming=false,libraryRequest=null,accountOwner='',selectedProject=null,lastLoaded=0;
 const previews=new Map(),previewTried=new Set();
 let factsVersion=0;
 let storageLimits=null,storageLoaded=false,storageFailed=false;
 const storageSize=bytes=>bytes===0?'0 KB':bytes<1000?`${bytes} B`:`${(bytes/(bytes<1000000?1000:1000000)).toLocaleString('es',{maximumFractionDigits:2})} ${bytes<1000000?'KB':'MB'}`;
 function renderStorage(){
  const box=$('#account-storage'),meter=$('#storage-meter'),summary=$('#storage-summary'),policy=$('#storage-policy'),freshness=$('#storage-freshness'),legacy=$('#storage-legacy');
  box.hidden=!cloud.configured||!accountOwner||root.PlanoAccounts.getUser()?.id!==accountOwner;
  if(box.hidden){summary.textContent='';meter.value=0;meter.hidden=true;policy.textContent='';freshness.textContent='';legacy.textContent='';legacy.hidden=true;return;}
  box.dataset.state=storageFailed?(storageLoaded?'stale':'error'):storageLoaded?'ready':'loading';
  if(!storageLoaded){summary.textContent=storageFailed?'No se pudo consultar el almacenamiento':'Calculando almacenamiento…';meter.hidden=true;policy.textContent='';freshness.textContent='';legacy.hidden=true;return;}
  const maxProjects=Number.isSafeInteger(storageLimits?.projectsPerUser)&&storageLimits.projectsPerUser>0&&storageLimits.projectsPerUser<=10000?storageLimits.projectsPerUser:10,perProject=cloud.PAYLOAD_LIMIT,capacity=maxProjects*perProject;
  if(!Number.isSafeInteger(capacity)||capacity<=0||projects.some(p=>!Number.isSafeInteger(p.size_bytes)||p.size_bytes<0)){summary.textContent='El almacenamiento no está disponible';meter.hidden=true;policy.textContent='';freshness.textContent='';legacy.hidden=true;return;}
  let used=0,pdfBytes=0,pdfs=0;for(const project of projects){if(project.storage_kind==='pdf'||!project.storage_kind&&/\.pdf$/i.test(project.name)){pdfBytes+=project.size_bytes;pdfs++;}else used+=project.size_bytes;}
  const remaining=Math.max(0,capacity-used);summary.textContent=`${storageSize(used)} usados · ${storageSize(remaining)} disponibles`;
  meter.max=capacity;meter.value=Math.min(used,capacity);meter.hidden=false;meter.setAttribute('aria-valuetext',`${storageSize(used)} usados de ${storageSize(capacity)}; ${storageSize(remaining)} disponibles para guiones`);
  policy.textContent=`${projects.length} de ${maxProjects} proyectos · Máximo ${storageSize(perProject)} por proyecto`;policy.title='La capacidad se distribuye por proyecto; el espacio libre de uno no amplía el límite de otro.';
  freshness.textContent=storageFailed?'Sin actualizar · Última consulta':'';
  legacy.hidden=!pdfs;legacy.textContent=pdfs?`Además: ${pdfs} ${pdfs===1?'PDF antiguo':'PDF antiguos'} · ${storageSize(pdfBytes)}. Se convierten al abrirlos.`:'';
 }
 const labels={idle:'Mis proyectos',saved:'Guardado en la nube',pending:'Cambios pendientes',saving:'Guardando…',conflict:'Conflicto de versiones',error:'No se ha guardado'};
 const projectName=project=>project.project_name||project.name.replace(/\.(pdf|plano)$/i,'');
 const previewKey=project=>`${accountOwner}/${project.id}/${project.fingerprint}`;
 const atHome=()=>!document.body.classList.contains('is-editing');
 function sync(state){
  const identityChanged=accountOwner!==state.owner;let storageChanged=false;
  if(identityChanged){storageLimits=null;storageLoaded=false;storageFailed=false;}
  accountOwner=state.owner;
  if(state.status==='saved'&&state.project){const project=projects.find(p=>p.id===state.project.id);if(!project)lastLoaded=0;if(project&&state.project.revision>=project.revision){storageChanged=project.size_bytes!==state.project.size_bytes||project.storage_kind!==state.project.storage_kind;for(const key of ['size_bytes','storage_kind','revision','updated_at','name','project_name','pdf_cleanup_pending'])if(Object.hasOwn(state.project,key))project[key]=state.project[key];}}
  if(identityChanged||storageChanged)renderStorage();
  $('#open-cloud').hidden=!cloud.configured;
  $('#open-cloud-label').textContent=labels[state.status];$('#open-cloud').dataset.syncState=state.status;
  root.PlanoHeader?.syncCloud(state);
  $('#cloud-sync-alert').hidden=!state.error;$('#cloud-sync-error').textContent=state.error;
  $('#cloud-reload').hidden=state.code!=='CONFLICT';$('#cloud-retry-save').hidden=!state.pending||state.code==='CONFLICT';
  if(cloud.configured&&root.PlanoAccounts.getUser())$('#save-status').textContent=state.error||labels[state.status];
 }
 function message(text='',error=false){
  for(const id of ['#home-library-message']){
   const node=$(id);node.textContent=text;node.hidden=!text;node.classList.toggle('is-error',error);
  }
 }
 function button(text,callback,className=''){
  const node=document.createElement('button');node.type='button';node.textContent=text;node.className=className;node.addEventListener('click',callback);return node;
 }
 function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','#i-'+name);svg.append(use);svg.setAttribute('aria-hidden','true');return svg;}
 function thumbnail(project){return previews.get(previewKey(project))||project.thumbnail||project.payload?.thumbnail;}
 function previewImage(image){
  if(!root.PlanoScreenplay.validThumbnail(image))return null;
  const img=document.createElement('img');
  img.src=image;
  img.alt='';
  img.decoding='async';
  return img;
 }
 function applyPreview(node,project){
  const img=previewImage(thumbnail(project));
  if(img){
   node.replaceChildren(img);
  }else{
   const paper=document.createElement('span');paper.className='script-preview-fallback';paper.setAttribute('aria-hidden','true');
   const title=document.createElement('strong');title.textContent=project.name.replace(/\.(pdf|plano)$/i,'');paper.append(title,...Array.from({length:5},()=>document.createElement('i')));node.replaceChildren(paper);
  }
 }
 function renderProjectCover(project){
  const preview=$('#project-banner-preview'),image=thumbnail(project),shown=preview.firstElementChild;
  if(shown&&(shown.getAttribute('src')===image||shown.matches('svg')&&!root.PlanoScreenplay.validThumbnail(image)))return;
  preview.replaceChildren(previewImage(image)||icon('folder'));
 }
 const projectDate=new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',year:'numeric'});
 function projectSummary(project){
  if(project.state!=='ready')return 'Subida sin completar';
  if(project.storage_kind==='pdf')return 'PDF original';
  return Number.isFinite(Date.parse(project.updated_at))?'Editado el '+projectDate.format(new Date(project.updated_at)):'Guion editable';
 }
 function renderHome(){
  renderStorage();
  const cards=[],openProjectInfo=hooks.currentProject?.(),pending=cloud.info(false).pending;
  for(const project of projects){
   const title=project.id===openProjectInfo?.id&&(pending||project.id==='local')?openProjectInfo.project_name:projectName(project);
   const card=document.createElement('article');card.className='script-card project-folder';card.dataset.projectId=project.id;
   const open=button('',()=>openProject(project),'script-card-open');open.setAttribute('aria-label',`Abrir proyecto ${title}`);open.title=`Abrir ${title}`;open.disabled=project.state!=='ready';
   const preview=document.createElement('span');preview.className='script-card-preview';applyPreview(preview,project);
   const name=document.createElement('strong');name.className='script-card-name';name.textContent=title;
   const meta=document.createElement('span');meta.className='script-card-meta';meta.textContent=projectSummary(project);
   const folder=document.createElement('span');folder.className='project-folder-symbol';folder.append(icon('folder'));
   const info=document.createElement('span');info.className='script-card-info';
   const copy=document.createElement('span');copy.className='script-card-copy';copy.append(name,meta);
   info.append(folder,copy,icon('arrow'));
   open.append(preview,info);
   const actions=document.createElement('div');actions.className='script-card-actions';
   const rename=button('Renombrar',()=>renameFile(project,'project'),'script-rename');rename.prepend(icon('edit'));rename.setAttribute('aria-label',`Cambiar nombre del proyecto ${title}`);rename.disabled=project.state!=='ready';
   const remove=button('',()=>deleteProject(project),'script-delete');
   remove.append(icon('trash'));remove.setAttribute('aria-label',`Eliminar proyecto ${title}`);remove.title='Eliminar proyecto';
   actions.append(rename);if(project.id!=='local')actions.append(remove);
   card.append(open,actions);cards.push(card);
  }
  const grid=$('#home-projects');
  if(cards.length)grid.replaceChildren(...cards);
  else{
   const empty=document.createElement('p');empty.className='home-empty-projects';empty.textContent='Aún no tienes proyectos.';
   grid.replaceChildren(empty);
  }
  if(selectedProject)selectedProject=projects.find(project=>project.id===selectedProject.id)||selectedProject;
  renderProject();
  queueMicrotask(pumpPreviews);
 }
 function renderProject(){
  const selected=selectedProject;
  const inProject=Boolean(selected),facts=$('#project-facts');
  $('#drop-zone').hidden=inProject;
  $('.page-footer').hidden=inProject;
  $('#project-overview').hidden=!inProject;
  $('#project-breadcrumb').hidden=!inProject;
  $('#project-rename').hidden=!inProject;
  $('#workspace-banner').dataset.view=inProject?'project':'library';
  $('#library-banner-icon').hidden=inProject;
  $('#project-banner-preview').hidden=!inProject;
  $('#home-project-actions').hidden=inProject;
  $('#home-library-count').hidden=inProject||!projects.length;
  facts.hidden=!inProject;
  $('#return-editor').hidden=!hooks.currentProject?.();
  $('#home-library-count').textContent=`${projects.length} ${projects.length===1?'proyecto':'proyectos'}${cloud.configured?' en tu cuenta':''}`;
  if(!selected){factsVersion++;facts.replaceChildren();$('#project-banner-preview').replaceChildren();}
  root.PlanoHeader?.refresh();
  if(!atHome())return;
  $('#page-title').textContent=selected?projectName(selected):'Mis proyectos';
  if(!selected)return;
  $('#project-overview').dataset.projectId=selected.id;
  renderProjectCover(selected);
  const version=++factsVersion,owner=accountOwner;
  const loading=document.createElement('p');loading.className='project-facts-empty';loading.textContent='Cargando ficha del proyecto…';facts.replaceChildren(loading);
  Promise.resolve(hooks.projectDetails?.(selected)).then(value=>{
   if(version!==factsVersion||owner!==accountOwner||selectedProject?.id!==selected.id||!value)return;
   if(atHome()){
    $('#page-title').textContent=value.name;
    renderProjectCover(thumbnail(value.project)?value.project:selected);
   }
   root.PlanoProjectInfo.render(facts,value,()=>task(()=>hooks.editProject(selected)),
    value.script?()=>task(()=>hooks.openVersionHistory(selected)):null);
  }).catch(()=>{if(version!==factsVersion||owner!==accountOwner)return;loading.textContent='No se pudo consultar la ficha.';const retry=button('Reintentar',renderProject,'project-info-text-button');facts.append(retry);});
 }
 function showProject(project=hooks.currentProject?.()){
  if(!project)return showRoot();
  selectedProject=projects.find(item=>item.id===project.id)||project;
  if(hooks.currentProject?.()?.id!==selectedProject.id)cloud.prefetch?.(selectedProject)?.catch(()=>{});
  message();
  hooks.home();renderProject();
 }
 function showRoot(){selectedProject=null;message();hooks.home();renderProject();}
 function openStage(stage){
  if(!selectedProject)return false;
  const project=selectedProject;return task(()=>hooks.open(project.id,stage));
 }
 function updatePreview(project,image){
  if(!root.PlanoScreenplay.validThumbnail(image))return;
  previews.set(previewKey(project),image);
  if(atHome()&&selectedProject?.id===project.id)renderProjectCover(project);
  const existing=projects.find(item=>item.id===project.id&&item.fingerprint===project.fingerprint);
  if(existing){existing.thumbnail=image;for(const card of $('#home-projects').querySelectorAll('.script-card'))if(card.dataset.projectId===project.id)applyPreview(card.querySelector('.script-card-preview'),existing);}
 }
 function pumpPreviews(){
  if(!cloud.configured||working||renaming||previewWork||selectedProject||!atHome()||!root.PlanoAccounts.getUser())return;
  const project=projects.find(item=>item.state==='ready'&&item.storage_kind==='editable'&&!root.PlanoScreenplay.validThumbnail(thumbnail(item))&&!previewTried.has(previewKey(item)));
  if(!project||!hooks.preview)return;
  const owner=accountOwner;previewTried.add(previewKey(project));
  const work=(async()=>{
   try{
    const result=await hooks.preview(project);if(owner!==accountOwner||!result)return;
    const current=projects.find(item=>item.id===project.id&&item.fingerprint===project.fingerprint);if(!current)return;
    if(result.project&&result.project.revision>=current.revision)Object.assign(current,result.project);
    updatePreview(current,result.thumbnail);renderStorage();
   }catch{/* La miniatura es opcional: un fallo nunca impide abrir el PDF. */}
  })();
  previewWork=work;work.finally(()=>{if(previewWork===work)previewWork=null;queueMicrotask(pumpPreviews);});
 }
 async function task(action){
  if(working)return;working=true;
  const owner=accountOwner,disabled=new Map();
  const containers=[$('#upload-view'),$('.page-heading'),$('#cloud-sync-alert')];
  for(const container of containers){
   container.setAttribute('aria-busy','true');
   for(const button of container.querySelectorAll('button')){disabled.set(button,button.disabled);button.disabled=true;}
  }
  try{
   // Las miniaturas solo leen; nunca bloquean una apertura ni modifican revisiones.
   if(owner!==accountOwner)return;
   await action();
  }catch(error){if(owner===accountOwner)message(error.message||'No se pudo completar la operación.',true);}
  finally{
   working=false;for(const container of containers)container.setAttribute('aria-busy','false');
   for(const [button,value] of disabled)if(button.isConnected)button.disabled=value;
   queueMicrotask(pumpPreviews);
  }
 }
 function openProject(project){
  if(working||project.state!=='ready')return;
  showProject(project);
 }
 function deleteProject(project){
  if(working||!confirm(`¿Eliminar el proyecto «${projectName(project)}»? Se borrarán su guion, sus planos y su guion técnico de la nube.`))return;
  task(async()=>{await cloud.remove(project);previews.delete(previewKey(project));if(selectedProject?.id===project.id)selectedProject=null;await hooks.deleted?.(project.id);await refresh(true);});
 }
 async function refresh(fresh=false){
  const expected=accountOwner;
  if(!cloud.configured){projects=hooks.currentProject?.()?[hooks.currentProject()]:[];renderHome();message();return;}
  if(!expected||root.PlanoAccounts.getUser()?.id!==expected)return;
  if(!fresh&&libraryRequest?.owner===expected)return libraryRequest.promise;
  if(!fresh&&storageLoaded&&Date.now()-lastLoaded<15000){renderHome();return;}
  const version=++loadingVersion;
  storageFailed=false;$('#home-loading').hidden=projects.length>0||storageLoaded;$('#home-projects').hidden=!$('#home-loading').hidden;renderStorage();
  if(!selectedProject)message('Cargando tus proyectos…');
  $('#drop-zone').setAttribute('aria-busy','true');
  const work=(async()=>{
   try{
    const result=await cloud.list();if(version!==loadingVersion||expected!==accountOwner)return;
    lastLoaded=Date.now();projects=result.projects;storageLimits=result.limits||null;storageLoaded=true;storageFailed=false;if(selectedProject&&!projects.some(project=>project.id===selectedProject.id))selectedProject=null;
    if(!selectedProject)message();
    renderHome();
   }catch(error){if(version===loadingVersion&&expected===accountOwner){storageFailed=true;renderStorage();if(!selectedProject)message(error.message,true);}}
   finally{if(version===loadingVersion){$('#home-loading').hidden=true;$('#home-projects').hidden=false;$('#drop-zone').setAttribute('aria-busy','false');}}
  })();
  libraryRequest={owner:expected,promise:work};
  try{return await work;}finally{if(libraryRequest?.promise===work)libraryRequest=null;}
 }
 function showHome(){if(atHome())return refresh();}
 function renameFile(project=hooks.currentProject?.(),scope='file'){
  if(!project||working||renaming||hooks.canRename?.()===false)return;
  renameTarget={project,owner:accountOwner,scope};$('#rename-file-error').hidden=true;
  $('#rename-file-title').textContent=scope==='project'?'Nombre del proyecto':'Nombre del guion';
  $('#rename-file-form label').textContent=scope==='project'?'Nombre de la carpeta':'Nombre del guion';
  $('.rename-file-input-wrap span').hidden=scope==='project';
  const input=$('#rename-file-input');
  input.maxLength=scope==='project'?120:176;
  input.value=scope==='project'?projectName(project):project.name.replace(/\.(pdf|plano)$/i,'');
  if(scope==='project'&&atHome()&&selectedProject?.id===project.id)input.value=$('#page-title').textContent;
  input.setCustomValidity('');
  $('#rename-file-dialog').showModal();input.focus();input.select();
 }
 async function renameProjectInline(project,name){
  if(!project||working||renaming||hooks.canRename?.()===false)throw Error('Termina la operación actual antes de cambiar el nombre.');
  if(typeof name!=='string'||!name.trim()||name.length>120||/[\u0000-\u001f\u007f]/.test(name))throw Error('El nombre del proyecto no es válido.');
  const expected=accountOwner;renaming=true;
  try{
   if(expected!==accountOwner)throw Error('La cuenta ha cambiado.');
   const result=await hooks.renameProject(project,name.trim());
   if(expected!==accountOwner)throw Error('La cuenta ha cambiado.');
   hooks.projectRenamed?.(result);projectUpdated(result);return result;
  }finally{renaming=false;queueMicrotask(pumpPreviews);}
 }
 function closeOnIdentity(){
  factsVersion++;
  loadingVersion++;lastLoaded=0;libraryRequest=null;projects=[];selectedProject=null;previews.clear();previewTried.clear();renameTarget=null;storageLimits=null;storageLoaded=false;storageFailed=false;
  renderHome();message();
  for(const id of ['#rename-file-dialog'])if($(id).open)$(id).close();
 }
 function init(options){
  hooks=options;cloud.subscribe(sync,{payload:false});
  $('#project-root').addEventListener('click',showRoot);
  $('#project-rename').addEventListener('click',()=>renameFile(selectedProject,'project'));
  for(const entry of document.querySelectorAll('[data-project-stage]'))entry.addEventListener('click',()=>openStage(entry.dataset.projectStage));
  $('#home-refresh').addEventListener('click',()=>task(()=>refresh(true)));
  $('#cloud-retry-save').addEventListener('click',()=>task(()=>cloud.flush()));
  $('#cloud-export-draft').textContent='Exportar';
  $('#cloud-export-draft').addEventListener('click',event=>{if(!hooks.openExport?.(event.currentTarget))message('Abre el guion para exportarlo.');});
  $('#cloud-reload').addEventListener('click',()=>{
   if(!confirm('¿Recargar las anotaciones de la nube y descartar los cambios pendientes de esta pestaña? Descarga una copia antes si quieres conservarlos.'))return;
   task(async()=>{const project=await cloud.reload();await hooks.reload(project);message('Versión de la nube recuperada.');});
  });
  $('#cancel-file-rename').addEventListener('click',()=>{if(!renaming)$('#rename-file-dialog').close();});
  $('#rename-file-dialog').addEventListener('cancel',event=>{if(renaming)event.preventDefault();});
  $('#rename-file-dialog').addEventListener('close',()=>{if(!$('#rename-file-dialog').open)renameTarget=null;});
  $('#rename-file-input').addEventListener('input',event=>event.target.setCustomValidity(''));
  $('#rename-file-form').addEventListener('submit',async event=>{
   event.preventDefault();if(!renameTarget||renaming||working)return;
   const target=renameTarget,input=$('#rename-file-input'),isProject=target.scope==='project',base=root.PlanoScreenplay.projectTitle(input.value),name=isProject?base:base+'.plano';
   input.setCustomValidity(!base?'Escribe un nombre.':name.length>(isProject?120:180)||/[\u0000-\u001f\u007f]/.test(name)?'El nombre no es válido.':'');if(!input.reportValidity())return;
   renaming=true;input.disabled=true;$('#save-file-rename').disabled=true;$('#cancel-file-rename').disabled=true;$('#rename-file-error').hidden=true;
   try{
    if(target.owner!==accountOwner)return;
    const project=isProject?await hooks.renameProject(target.project,name):target.project.id==='local'?await hooks.renameLocal(name):await cloud.rename(target.project,name);
    if(target.owner!==accountOwner)return;
    if(isProject){hooks.projectRenamed?.(project);if(selectedProject?.id===project.id)selectedProject={...selectedProject,...project};}
    else hooks.renamed?.(project);
    $('#rename-file-dialog').close();await refresh(true);
   }catch(error){
    if(target.owner===accountOwner){$('#rename-file-error').textContent=error.message||'No se pudo guardar el nombre.';$('#rename-file-error').hidden=false;
     if(error.code==='CONFLICT'){await refresh(true);target.project=projects.find(item=>item.id===target.project.id)||target.project;}}
   }finally{renaming=false;input.disabled=false;$('#save-file-rename').disabled=false;$('#cancel-file-rename').disabled=false;queueMicrotask(pumpPreviews);}
  });
  if(cloud.configured){
   $('.local-badge').textContent='Biblioteca privada';
   $('.privacy-note').textContent='Tus guiones y planos se guardan de forma privada en tu cuenta.';
   $('.file-hint').textContent='Guion Fountain, WDZ, FDX, Celtx, DOCX, RTF, HTML, JSON, CSV, TXT o PDF · Proyecto completo .plano';
   $('#auth-local-description').textContent='Tus guiones y planos, disponibles al iniciar sesión en tu cuenta.';
   $('#account-local-note').textContent='Verifica tu correo para activar la cuenta. El estudio guarda tus guiones de forma privada en la nube.';
   $('#account-storage-description').textContent='Se guarda el guion editable y sus planos. Los PDF nuevos se convierten en el navegador; los antiguos se retiran después de confirmar su conversión.';
  }
  document.addEventListener('plano-account-change',showHome);
  root.PlanoAccounts.ready.then(showHome);
 }
 function projectUpdated(project){
  const record=projects.find(item=>item.id===project.id);
  if(record&&record.revision>project.revision)return;
  if(record)for(const key of ['name','project_name','size_bytes','revision','updated_at','storage_kind','thumbnail'])if(Object.hasOwn(project,key))record[key]=project[key];
  if(selectedProject?.id===project.id)selectedProject=record||{...selectedProject,...project};
  if(atHome())renderHome();
 }
 root.PlanoCloudLibrary={init,showHome,showProject,showRoot,openStage,selected:()=>selectedProject,renameFile,renameProjectInline,updatePreview,closeOnIdentity,finishPreview:()=>previewWork,refreshProject:renderProject,projectUpdated,refreshStatus:()=>sync(cloud.info(false))};
})(globalThis);
