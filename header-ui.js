/* Cabecera compacta: proyecto editable, guardado directo y cuenta en un solo menú. */
(function(root){
 'use strict';
 const $=selector=>document.querySelector(selector),nameButton=$('#file-name'),form=$('#project-title-form'),input=$('#project-title-input'),cloudButton=$('#open-cloud');
 let hooks={},editing=null,renaming=null,manual=null,cloudState=null,manualError='';
 const owner=()=>root.PlanoAccounts?.getUser()?.id||'';
 const project=()=>hooks.project?.()||null;
 const clean=value=>String(value||'').trim().replace(/\.(?:pdf|plano)$/i,'');
 const nameOf=value=>clean(value?.project_name||value?.name)||'Sin título';
 const shorten=value=>{const chars=Array.from(value);return chars.length>32?chars.slice(0,29).join('')+'...':value;};
 function refreshIdentity(){
  const user=root.PlanoAccounts?.getUser(),name=user?.name?.trim()||user?.email?.split('@')[0]||'Mi cuenta',words=name.match(/[\p{L}\p{M}]+/gu)||['P'];
  $('#header-avatar').textContent=(Array.from(words[0])[0]+(words.length>1?Array.from(words.at(-1))[0]:'')).toLocaleUpperCase('es');
  $('#header-account-name').textContent=name;$('#header-account-email').textContent=user?.email||'';
  $('#account-menu-toggle').title=user?`Cuenta de ${name}`:'Cuenta y preferencias';
 }
 function refreshCloud(){
  const state=cloudState||root.PlanoCloud?.info(false)||{},current=project(),same=!current||current.id===state.project?.id;
  let status=manual||renaming?'saving':manualError?'error':same?state.status:current?.state==='ready'?'saved':'idle';
  if(!['saved','saving','pending','error','conflict'].includes(status))status='idle';
  const labels={saved:'Guardado en la nube',saving:'Guardando proyecto…',pending:'Cambios pendientes de guardar',error:'No se pudo guardar',conflict:'Conflicto de versiones',idle:'Sin proyecto abierto'};
  cloudButton.dataset.syncState=status;cloudButton.setAttribute('aria-busy',String(status==='saving'));
  cloudButton.disabled=Boolean(manual||renaming)||!state.configured||!state.project||!same||hooks.canSave?.()===false;
  const description=manualError||state.error||labels[status];$('#open-cloud-label').textContent=description;
  cloudButton.title=description+' · Pulsar para guardar';cloudButton.setAttribute('aria-label','Guardar proyecto · '+description);
 }
 function refresh(){
  const value=project();document.body.classList.toggle('has-header-project',Boolean(value));$('.header-project').hidden=!value;
  if(editing&&(editing.owner!==owner()||editing.id!==value?.id))cancel();
  const name=nameOf(value);nameButton.textContent=shorten(name);nameButton.title=name;nameButton.setAttribute('aria-label','Cambiar nombre del proyecto '+name);
  refreshCloud();
 }
 function cancel(){editing=null;form.hidden=true;nameButton.hidden=false;input.disabled=false;input.setCustomValidity('');$('#project-title-error').textContent='';}
 function begin(){
  const value=project();if(!value||renaming||hooks.canEdit?.()===false)return;
  editing={id:value.id,owner:owner(),project:value};input.value=nameOf(value);input.disabled=false;input.setCustomValidity('');$('#project-title-error').textContent='';nameButton.hidden=true;form.hidden=false;input.focus();input.select();
 }
 async function commit(focusOnError=false){
  if(renaming)return renaming;
  if(!editing)return true;
  const edit=editing,name=clean(input.value),valid=name&&name.length<=120&&!/[\u0000-\u001f\u007f]/.test(name);
  if(!valid){const error=name?'El nombre admite hasta 120 caracteres.':'Escribe un nombre para el proyecto.';input.setCustomValidity(error);$('#project-title-error').textContent=error;hooks.error?.(error);if(focusOnError)input.focus({preventScroll:true});return false;}
  if(name===nameOf(edit.project)){cancel();refresh();return true;}
  input.disabled=true;manualError='';
  const work=(async()=>{
   try{
    await hooks.rename?.(edit.project,name);
    if(editing===edit&&edit.owner===owner()){cancel();refresh();}return true;
   }catch(error){
    if(editing===edit&&edit.owner===owner()){
     input.disabled=false;$('#project-title-error').textContent=error.message||'No se pudo guardar el nombre.';hooks.error?.($('#project-title-error').textContent);manualError=$('#project-title-error').textContent;if(focusOnError)input.focus({preventScroll:true});
    }return false;
   }
  })();renaming=work;refreshCloud();
  try{return await work;}finally{if(renaming===work)renaming=null;refreshCloud();}
 }
 async function save(){
  if(manual)return manual;
  if(!await commit(true))return false;
  if(hooks.canSave?.()===false)return false;
  manualError='';const expected=owner();
  const work=(async()=>{try{await hooks.save?.();return true;}catch(error){if(expected===owner()){manualError=error.message||'No se pudo guardar.';hooks.error?.(manualError);}return false;}})();
  manual=work;refreshCloud();try{return await work;}finally{if(manual===work)manual=null;refreshCloud();}
 }
 nameButton.addEventListener('click',begin);
 form.addEventListener('submit',event=>{event.preventDefault();commit(true);});
 input.addEventListener('blur',()=>{if(!input.disabled)commit();});
 input.addEventListener('input',()=>{input.setCustomValidity('');$('#project-title-error').textContent='';manualError='';});
 input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!renaming){cancel();nameButton.focus({preventScroll:true});}}});
 cloudButton.addEventListener('click',save);
 $('#project-menu').addEventListener('toggle',()=>$('#account-menu-toggle').setAttribute('aria-expanded',String($('#project-menu').open)));
 document.addEventListener('plano-account-change',()=>{cancel();manualError='';refreshIdentity();refresh();});
 root.PlanoHeader={init(value){hooks=value;refreshIdentity();refresh();},refresh,refreshIdentity,syncCloud(value){cloudState=value;if(value.status==='saved')manualError='';refreshCloud();},save,pending:()=>Boolean(renaming),nameOf,shorten};
 root.PlanoAccounts?.ready.then(refreshIdentity);
})(globalThis);
