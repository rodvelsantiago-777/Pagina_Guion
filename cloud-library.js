/* Biblioteca y estado de sincronización. Se conecta al editor sin guardar documentos locales. */
(function(root){
 'use strict';
 const $=selector=>document.querySelector(selector),cloud=root.PlanoCloud;
 let hooks={},working=false,loadingVersion=0;
 const labels={idle:'Mis proyectos',saved:'Guardado en la nube',pending:'Cambios pendientes',saving:'Guardando…',conflict:'Conflicto de versiones',error:'No se ha guardado'};
 function sync(state){
  $('#open-cloud').hidden=!cloud.configured;
  $('#open-cloud-label').textContent=labels[state.status];$('#open-cloud').dataset.syncState=state.status;
  $('#cloud-sync-alert').hidden=!state.error;$('#cloud-sync-error').textContent=state.error;
  $('#cloud-reload').hidden=state.code!=='CONFLICT';$('#cloud-retry-save').hidden=!state.pending||state.code==='CONFLICT';
  if(cloud.configured&&root.PlanoAccounts.getUser()){
   $('#save-status').textContent=state.error||labels[state.status];
  }
 }
 function message(text='',error=false){$('#cloud-library-message').textContent=text;$('#cloud-library-message').hidden=!text;$('#cloud-library-message').classList.toggle('is-error',error);}
 async function task(action){
  if(working)return;working=true;$('#cloud-library').setAttribute('aria-busy','true');
  for(const button of $('#cloud-library').querySelectorAll('button'))button.disabled=button.id!=='close-cloud';
  try{await action();}catch(error){message(error.message||'No se pudo completar la operación.',true);}
  finally{working=false;$('#cloud-library').setAttribute('aria-busy','false');for(const button of $('#cloud-library').querySelectorAll('button'))button.disabled=false;}
 }
 function button(text,callback,className=''){const node=document.createElement('button');node.type='button';node.textContent=text;node.className=className;node.addEventListener('click',callback);return node;}
 async function refresh(){
  const version=++loadingVersion,expected=cloud.info().owner;
  message('Cargando tus proyectos…');$('#cloud-projects').replaceChildren();
  try{
   const {projects}=await cloud.list();if(version!==loadingVersion||expected!==cloud.info().owner)return;
   message();$('#cloud-empty').hidden=Boolean(projects.length);
   $('#cloud-library-count').textContent=`${projects.length} / 10 proyectos · PDF de hasta 10 MB`;
   for(const project of projects){
    const row=document.createElement('article');row.className='cloud-project';
    const content=document.createElement('div'),title=button(project.name,()=>task(async()=>{
     if(project.state!=='ready')throw new Error('Esta subida no se completó. Elimínala y vuelve a subir el PDF.');
     await hooks.open(project.id);$('#cloud-library').close();
    }),'cloud-project-title');
    title.title=project.name;content.append(title);
    const size=project.size_bytes<1048576?`${Math.max(1,Math.ceil(project.size_bytes/1024)).toLocaleString('es')} KB`:`${(project.size_bytes/1048576).toLocaleString('es',{maximumFractionDigits:1})} MB`;
    const detail=document.createElement('p');detail.textContent=project.state==='ready'?`${size} · ${new Date(project.updated_at).toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'})}`:'Subida pendiente de completar';content.append(detail);
    const actions=document.createElement('div');actions.className='cloud-project-actions';
    if(project.state==='ready')actions.append(button('Renombrar',()=>{
     const input=document.createElement('input');input.value=project.name;input.maxLength=180;input.setAttribute('aria-label','Nombre del proyecto');
     const form=document.createElement('form');form.className='cloud-rename';
     const save=document.createElement('button');save.type='submit';save.textContent='Guardar';
     const cancel=button('Cancelar',()=>form.replaceWith(title));form.append(input,save,cancel);title.replaceWith(form);input.focus();input.select();
     form.addEventListener('submit',event=>{event.preventDefault();if(!input.value.trim())return;task(async()=>{const updated=await cloud.rename(project,input.value.trim());hooks.renamed?.(updated);await refresh();});});
    }));
    actions.append(button('Eliminar',()=>{
     if(!confirm(`¿Eliminar «${project.name}» de tu cuenta? Se borrarán el PDF y sus anotaciones de la nube.`))return;
     task(async()=>{await cloud.remove(project);await hooks.deleted?.(project.id);await refresh();});
    },'cloud-delete'));
    row.append(content,actions);$('#cloud-projects').append(row);
   }
  }catch(error){if(version===loadingVersion&&expected===cloud.info().owner)message(error.message,true);}
 }
 function open(){if(!root.PlanoAccounts.getUser())return;sync(cloud.info());if(!$('#cloud-library').open)$('#cloud-library').showModal();refresh();}
 function closeOnIdentity(){loadingVersion++;$('#cloud-projects').replaceChildren();if($('#cloud-library').open)$('#cloud-library').close();}
 function init(options){
  hooks=options;cloud.subscribe(sync);
  $('#open-cloud').addEventListener('click',open);$('#close-cloud').addEventListener('click',()=>$('#cloud-library').close());
  $('#cloud-refresh').addEventListener('click',()=>task(refresh));
  $('#cloud-new').addEventListener('click',()=>{$('#cloud-library').close();$('#file-input').click();});
  $('#cloud-retry-save').addEventListener('click',()=>task(()=>cloud.flush()));
  $('#cloud-export-draft').addEventListener('click',()=>{if(hooks.exportDraft?.())message('Copia de notas descargada.');else message('Abre el guion para exportar sus notas.');});
  $('#cloud-reload').addEventListener('click',()=>{
   if(!confirm('¿Recargar las anotaciones de la nube y descartar los cambios pendientes de esta pestaña? Descarga una copia antes si quieres conservarlos.'))return;
   task(async()=>{const project=await cloud.reload();await hooks.reload(project);message('Versión de la nube recuperada.');});
  });
  if(cloud.configured){
   $('.local-badge').textContent='Proyectos en la nube';
   $('.privacy-note').textContent='Tus PDF y planos se guardan de forma privada en tu cuenta cuando el servidor confirma la subida.';
   $('.file-hint').textContent='Formato PDF · Hasta 10 MB por archivo';
   $('#auth-local-description').textContent='Tus guiones y planos, disponibles al iniciar sesión en tu cuenta.';
   $('#account-local-note').textContent='Verifica tu correo para activar la cuenta. El estudio guarda tus proyectos de forma privada en la nube.';
   $('#account-storage-description').textContent='Los PDF y sus anotaciones se guardan en tu cuenta cuando el servidor confirma la sincronización. Puedes abrirlos desde otro dispositivo.';
  }
 }
 root.PlanoCloudLibrary={init,open,closeOnIdentity,refreshStatus:()=>sync(cloud.info())};
})(globalThis);
