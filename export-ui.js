/* Un único punto de exportación por ventana, con destinos y alcances explícitos. */
(function(root){
 'use strict';
 root.PlanoExportUI={init({button,dialog,beforeOpen=()=>true,hasShots=()=>false,run=null}){
  let anchor=button;
  const close=()=>{if(dialog.open)dialog.close();};
  function open(target=button){if(!beforeOpen())return false;anchor=target;for(const id of ['export-excel','export-technical-pdf']){const item=dialog.querySelector('#'+id);if(item)item.disabled=!hasShots();}if(!dialog.open)dialog.showModal();anchor.setAttribute('aria-expanded','true');return true;}
  button.addEventListener('click',()=>open());dialog.querySelector('[data-export-close]').addEventListener('click',close);
  // Cierra antes de que el exportador desactive el botón durante la descarga.
  dialog.addEventListener('click',event=>{const action=event.target.closest('[data-export-action]');if(!action||action.disabled)return;close();if(run)run(action.dataset.exportAction);},true);
  dialog.addEventListener('close',()=>{anchor?.setAttribute('aria-expanded','false');if(anchor?.isConnected)anchor.focus({preventScroll:true});});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();});
  return{open,close};
 }};
})(globalThis);
