/* Una única sesión de edición y guardado; la segunda ventana nunca escribe a la nube por su cuenta. */
(function(root){
 'use strict';
 if(document.body.dataset.detached==='true'){
  let connection=null;
  const content=document.getElementById('detached-content'),status=document.getElementById('detached-status');
  function unavailable(){
   root.PlanoTechnicalScript.clear();connection=null;content.replaceChildren();
   const text=document.createElement('p');text.className='detached-unavailable';text.textContent='El documento o la sesión del editor se cerró. Vuelve a abrir esta ventana desde Guion técnico.';content.append(text);status.textContent='Sin conexión con el editor';
  }
  root.PlanoDetachedView={
   invalidate:unavailable,
   lock(value){const view=document.getElementById('technical-view');if(view)view.inert=value;status.textContent=value?'Termina la acción pendiente en el editor.':'Conectado · los cambios se comparten al instante';},
   receive(data){
    if(!connection)return;
    document.getElementById('detached-title').textContent=data.name;document.title=data.name+' · Guion técnico — PLANO';
    document.documentElement.style.cssText=data.theme.style;document.documentElement.dataset.theme=data.theme.mode;document.documentElement.dataset.palette=data.theme.palette;
    root.PlanoTechnicalScript.render(data.sections,{displayName:item=>item.shotName,commit:connection.commit,remove:connection.remove,open:connection.open,history:data.history,future:data.future});
    root.PlanoDetachedView.lock(data.locked);
   }
  };
  try{
   const bridge=root.opener?.PlanoTechnicalWindow,token=new URL(location.href).searchParams.get('session');
   connection=bridge?.connect(root,token);
   if(!connection){unavailable();return;}
   const view=root.opener.document.getElementById('technical-view').cloneNode(true);view.hidden=false;view.querySelector('#technical-table-body').replaceChildren();content.replaceChildren(view);
   const icons=root.opener.document.querySelector('.icon-library');if(icons)document.body.prepend(icons.cloneNode(true));
   document.getElementById('technical-undo').addEventListener('click',()=>{if(PlanoTechnicalScript.finishEditing())connection?.undo(false);});
   document.getElementById('technical-redo').addEventListener('click',()=>{if(PlanoTechnicalScript.finishEditing())connection?.undo(true);});
   document.getElementById('technical-export-excel').disabled=false;document.getElementById('technical-export-excel').addEventListener('click',()=>{if(PlanoTechnicalScript.finishEditing())connection?.export();});
   document.getElementById('technical-crew').addEventListener('click',()=>{if(PlanoTechnicalScript.finishEditing())connection?.crew();});
   document.getElementById('back-to-coverage').addEventListener('click',()=>connection?.focus());
   document.getElementById('focus-main-editor').addEventListener('click',()=>connection?.focus());
   root.addEventListener('beforeunload',()=>{PlanoTechnicalScript.finishEditing(false);connection?.detach();});
   root.PlanoDetachedView.receive(connection.snapshot());
  }catch{unavailable();}
  return;
 }
 let hooks=null,child=null,session='',documentKey='',scheduled=false,epoch=0,lastLock=null;
 const usable=()=>child&&!child.closed&&hooks?.key()===documentKey;
 function invalidate(){
  epoch++;scheduled=false;
  if(child&&!child.closed){try{child.PlanoDetachedView?.invalidate();}catch{}}
  child=null;session='';documentKey='';lastLock=null;
 }
 function publish(){
  if(!usable())return;
  if(!scheduled){scheduled=true;const current=epoch;queueMicrotask(()=>{if(current!==epoch)return;scheduled=false;if(usable()){try{child.PlanoDetachedView?.receive(hooks.snapshot());}catch{invalidate();}}});}
 }
 root.PlanoTechnicalWindow={
  configure(value){hooks=value;},
  invalidate,publish,
  lock(value){if(value===lastLock)return;lastLock=value;if(usable()){try{child.PlanoDetachedView?.lock(value);}catch{invalidate();}}},
  open(){
   if(!hooks?.key()||!hooks.canEdit())return false;
   if(usable()){child.focus();publish();return true;}
   invalidate();session=crypto.randomUUID();documentKey=hooks.key();
   const url=new URL('technical-window.html',location.href);url.searchParams.set('session',session);
   child=root.open(url.href,'plano-technical-'+session,'popup,width=1340,height=850');if(!child){invalidate();return false;}return true;
  },
  connect(target,token){
   if(!usable()||child!==target||token!==session)return null;
   const key=documentKey;
   const valid=()=>usable()&&child===target&&hooks.key()===key;
   const mutate=action=>(...args)=>valid()&&hooks.canEdit()&&action(...args);
   return{snapshot:()=>valid()?hooks.snapshot():null,commit:mutate(hooks.commit),remove:mutate(hooks.remove),undo:mutate(hooks.undo),open:mutate(hooks.open),export:mutate(hooks.export),crew:mutate(hooks.crew),focus:()=>{if(valid())root.focus();},detach:()=>{if(valid())invalidate();}};
  }
 };
 root.addEventListener('beforeunload',invalidate);
 document.addEventListener('plano-appearance-change',publish);
})(globalThis);
