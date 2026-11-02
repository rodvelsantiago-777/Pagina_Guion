/* Biblioteca de cuenta, miniaturas privadas y estado de sincronización. */
(function(root){
 'use strict';
 const $=selector=>document.querySelector(selector),cloud=root.PlanoCloud;
 let hooks={},working=false,loadingVersion=0,projects=[],previewWork=null,renameTarget=null,renaming=false,libraryRequest=null,accountOwner='',selectedProject=null;
 const previews=new Map(),previewTried=new Set();
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
  if(state.status==='saved'&&state.project){const project=projects.find(p=>p.id===state.project.id);if(project&&state.project.revision>=project.revision){storageChanged=project.size_bytes!==state.project.size_bytes||project.storage_kind!==state.project.storage_kind;for(const key of ['size_bytes','storage_kind','revision','updated_at','name','project_name','pdf_cleanup_pending'])if(Object.hasOwn(state.project,key))project[key]=state.project[key];}}
  if(identityChanged||storageChanged)renderStorage();
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
   const title=document.createElement('strong');title.textContent=project.name.replace(/\.(pdf|plano)$/i,'');paper.append(title,...Array.from({length:5},()=>document.createElement('i')));node.replaceChildren(paper);
  }
 }
 function renderHome(){
  renderStorage();
  const add=$('#upload-button'),cards=[];
  for(const project of projects){
   const card=document.createElement('article');card.className='script-card project-folder';card.dataset.projectId=project.id;
   const open=button('',()=>openProject(project),'script-card-open');open.setAttribute('aria-label',`Abrir proyecto ${projectName(project)}`);open.title=`Abrir ${projectName(project)}`;open.disabled=project.state!=='ready';
   const preview=document.createElement('span');preview.className='script-card-preview';applyPreview(preview,project);
   const name=document.createElement('strong');name.className='script-card-name';name.textContent=projectName(project);
   const meta=document.createElement('span');meta.className='script-card-meta';meta.textContent=project.state==='ready'?'Guion · Cobertura · Guion técnico':'Subida sin completar';
   const folder=document.createElement('span');folder.className='project-folder-symbol';folder.append(icon('folder'));
   open.append(preview,folder,name,meta);
   const actions=document.createElement('div');actions.className='script-card-actions';
   const rename=button('Renombrar',()=>renameFile(project,'project'),'script-rename');rename.prepend(icon('edit'));rename.setAttribute('aria-label',`Cambiar nombre del proyecto ${projectName(project)}`);rename.disabled=project.state!=='ready';
   const remove=button('×',()=>deleteProject(project),'script-delete');remove.setAttribute('aria-label',`Eliminar proyecto ${projectName(project)}`);remove.title='Eliminar proyecto';
   actions.append(rename);if(project.id!=='local')actions.append(remove);
   card.append(open,actions);cards.push(card);
  }
  $('#home-projects').replaceChildren(...cards,add);
  if(selectedProject)selectedProject=projects.find(project=>project.id===selectedProject.id)||selectedProject;
  renderProject();
  queueMicrotask(pumpPreviews);
 }
 function renderProject(){
  const selected=selectedProject;
  $('#project-overview').hidden=!selected;$('#home-projects').hidden=Boolean(selected);
  $('.library-footnote').hidden=Boolean(selected);$('#return-editor').hidden=Boolean(selected)||!hooks.currentProject?.();
  $('#home-library-title').textContent=selected?'Dentro del proyecto':'Tus proyectos';
  $('#home-library-count').textContent=selected?'Tres apartados, una misma historia.':projects.length?`${projects.length} ${projects.length===1?'proyecto':'proyectos'}${cloud.configured?' en tu cuenta':''}`:'Tu próxima historia empieza con un «+».';
  if(atHome())$('#nav-editor').disabled=!selected&&!hooks.currentProject?.();
  $('#project-breadcrumb').hidden=!selected;
  if(!atHome())return;
  $('#page-title').textContent=selected?projectName(selected):'Tus proyectos.';
  $('#page-description').textContent=selected?'Del texto al rodaje. Elige dónde quieres continuar.':'Organiza cada historia en su propio proyecto.';
  $('#page-eyebrow').textContent=selected?'CARPETA DEL PROYECTO':'TU ESPACIO DE TRABAJO';
  $('#breadcrumb-current').textContent=selected?projectName(selected):'Mis proyectos';
  if(!selected)return;
  $('#project-breadcrumb-name').textContent=projectName(selected);
  $('#project-script-name').textContent=selected.name;
  $('#project-overview').dataset.projectId=selected.id;
 }
 function showProject(project=hooks.currentProject?.()){
  if(!project)return showRoot();
  selectedProject=projects.find(item=>item.id===project.id)||project;
  hooks.home();renderProject();
 }
 function showRoot(){selectedProject=null;hooks.home();renderProject();}
 function openStage(stage){
  if(!selectedProject)return false;
  const project=selectedProject;return task(()=>hooks.open(project.id,stage));
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
    updatePreview(current,result.thumbnail);renderStorage();
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
 function openProject(project){
  if(working||project.state!=='ready')return;
  if($('#cloud-library').open)$('#cloud-library').close();showProject(project);
 }
 function deleteProject(project){
  if(working||!confirm(`¿Eliminar el proyecto «${projectName(project)}»? Se borrarán su guion, sus planos y su guion técnico de la nube.`))return;
  task(async()=>{await cloud.remove(project);previews.delete(previewKey(project));if(selectedProject?.id===project.id)selectedProject=null;await hooks.deleted?.(project.id);await refresh(true);});
 }
 function renderModal(){
  $('#cloud-projects').replaceChildren();$('#cloud-empty').hidden=Boolean(projects.length);
  $('#cloud-library-count').textContent=`${projects.length} / ${storageLimits?.projectsPerUser||10} proyectos · Guiones editables`;
  for(const project of projects){
   const row=document.createElement('article');row.className='cloud-project';
   const content=document.createElement('div'),title=button(projectName(project),()=>openProject(project),'cloud-project-title');title.title=projectName(project);content.append(title);
   const detail=document.createElement('p');detail.textContent=project.state==='ready'?`${size(project)} · ${new Date(project.updated_at).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'})}`:'Subida pendiente de completar';content.append(detail);
   const actions=document.createElement('div');actions.className='cloud-project-actions';
   if(project.state==='ready')actions.append(button('Renombrar',()=>{$('#cloud-library').close();renameFile(project,'project');}));
   actions.append(button('Eliminar',()=>deleteProject(project),'cloud-delete'));row.append(content,actions);$('#cloud-projects').append(row);
  }
 }
 async function refresh(fresh=false){
  const expected=accountOwner;
  if(!cloud.configured){projects=hooks.currentProject?.()?[hooks.currentProject()]:[];renderHome();message();return;}
  if(!expected||root.PlanoAccounts.getUser()?.id!==expected)return;
  if(!fresh&&libraryRequest?.owner===expected)return libraryRequest.promise;
  const version=++loadingVersion;
  storageFailed=false;renderStorage();message('Cargando tus proyectos…');$('#drop-zone').setAttribute('aria-busy','true');
  const work=(async()=>{
   try{
    const result=await cloud.list();if(version!==loadingVersion||expected!==accountOwner)return;
    projects=result.projects;storageLimits=result.limits||null;storageLoaded=true;storageFailed=false;if(selectedProject&&!projects.some(project=>project.id===selectedProject.id))selectedProject=null;message();renderHome();renderModal();
   }catch(error){if(version===loadingVersion&&expected===accountOwner){storageFailed=true;renderStorage();message(error.message,true);}}
   finally{if(version===loadingVersion)$('#drop-zone').setAttribute('aria-busy','false');}
  })();
  libraryRequest={owner:expected,promise:work};
  try{return await work;}finally{if(libraryRequest?.promise===work)libraryRequest=null;}
 }
 function showHome(){if(atHome())return refresh();}
 function open(){if(!root.PlanoAccounts.getUser())return;sync(cloud.info());if(!$('#cloud-library').open)$('#cloud-library').showModal();refresh();}
 function renameFile(project=hooks.currentProject?.(),scope='file'){
  if(!project||working||renaming||hooks.canRename?.()===false)return;
  renameTarget={project,owner:accountOwner,scope};$('#rename-file-error').hidden=true;
  $('#rename-file-title').textContent=scope==='project'?'Nombre del proyecto':'Nombre del guion';
  $('#rename-file-form label').textContent=scope==='project'?'Nombre de la carpeta':'Nombre del guion';
  $('.rename-file-input-wrap span').hidden=scope==='project';
  const input=$('#rename-file-input');input.maxLength=scope==='project'?120:176;input.value=scope==='project'?projectName(project):project.name.replace(/\.(pdf|plano)$/i,'');input.setCustomValidity('');
  $('#rename-file-dialog').showModal();input.focus();input.select();
 }
 function closeOnIdentity(){
  loadingVersion++;libraryRequest=null;projects=[];selectedProject=null;previews.clear();previewTried.clear();renameTarget=null;storageLimits=null;storageLoaded=false;storageFailed=false;
  $('#cloud-projects').replaceChildren();renderHome();message();
  for(const id of ['#cloud-library','#rename-file-dialog'])if($(id).open)$(id).close();
 }
 function init(options){
  hooks=options;cloud.subscribe(sync,{payload:false});
  $('#project-root').addEventListener('click',showRoot);
  $('#project-rename').addEventListener('click',()=>renameFile(selectedProject,'project'));
  for(const entry of document.querySelectorAll('[data-project-stage]'))entry.addEventListener('click',()=>{
   const project=selectedProject;if(!project)return;
   task(async()=>{await hooks.open(project.id,entry.dataset.projectStage);});
  });
  $('#open-cloud').addEventListener('click',open);$('#close-cloud').addEventListener('click',()=>$('#cloud-library').close());
  $('#cloud-refresh').addEventListener('click',()=>task(refresh));$('#home-refresh').addEventListener('click',()=>task(refresh));
  $('#cloud-new').addEventListener('click',()=>{$('#cloud-library').close();if(hooks.newScript)hooks.newScript();else $('#file-input').click();});
  $('#cloud-retry-save').addEventListener('click',()=>task(()=>cloud.flush()));
  $('#cloud-export-draft').textContent='Exportar';
  $('#cloud-export-draft').addEventListener('click',event=>{if(!hooks.openExport?.(event.currentTarget))message('Abre el guion para exportarlo.');});
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
   const target=renameTarget,input=$('#rename-file-input'),isProject=target.scope==='project',base=isProject?input.value.trim():input.value.trim().replace(/\.(pdf|plano)$/i,'').trim(),name=isProject?base:base+'.plano';
   input.setCustomValidity(!base?'Escribe un nombre.':name.length>(isProject?120:180)||/[\u0000-\u001f\u007f]/.test(name)?'El nombre no es válido.':'');if(!input.reportValidity())return;
   renaming=true;input.disabled=true;$('#save-file-rename').disabled=true;$('#cancel-file-rename').disabled=true;$('#rename-file-error').hidden=true;
   try{
    await previewWork;if(target.owner!==accountOwner)return;
    const project=target.project.id==='local'?await hooks.renameLocal(name,isProject):await (isProject?cloud.renameProject:cloud.rename)(target.project,name);
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
 root.PlanoCloudLibrary={init,open,showHome,showProject,showRoot,openStage,selected:()=>selectedProject,renameFile,updatePreview,closeOnIdentity,finishPreview:()=>previewWork,refreshStatus:()=>sync(cloud.info())};
})(globalThis);
