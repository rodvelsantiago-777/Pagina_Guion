/* Equipo propio de cada guion, compartido por la ficha y las exportaciones. */
(function(root){
 'use strict';
 const fields={director:'Dirección',producer:'Productor/a',productionCompany:'Productora',assistantDirector:'Asistencia de dirección',cinematographer:'Dirección de fotografía',productionDesigner:'Diseño de producción',soundMixer:'Sonido'};
 function validate(value){
  if(value===undefined)return {};
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('La información del equipo no es válida.');
  const clean={};for(const key of Object.keys(fields)){
   if(value[key]===undefined)continue;
   if(typeof value[key]!=='string'||value[key].length>160)throw Error('Cada nombre del equipo admite hasta 160 caracteres.');
   if(value[key].trim())clean[key]=value[key].trim();
  }return clean;
 }
 function setup(actions){
  const dialog=document.createElement('dialog');dialog.id='crew-dialog';dialog.className='shot-name-dialog crew-dialog';dialog.setAttribute('aria-labelledby','crew-title');
  dialog.innerHTML='<form id="crew-form"><p class="dialog-eyebrow">EQUIPO DEL GUION</p><h2 id="crew-title">Equipo de producción</h2><p class="crew-hint">Estos datos se incluyen en el Excel y en el PDF completo de este guion.</p><div class="crew-fields"></div><div class="dialog-actions"><button type="button" id="cancel-crew" class="button button-secondary">Cancelar</button><button type="submit" class="button button-primary">Guardar equipo</button></div></form>';
  const form=dialog.querySelector('form');
  for(const [key,name]of Object.entries(fields)){
   const wrapper=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input');
   input.id='crew-'+key;input.name=key;input.type='text';input.maxLength=160;input.autocomplete='off';input.spellcheck=true;input.lang='es';
   label.htmlFor=input.id;label.textContent=name;wrapper.append(label,input);dialog.querySelector('.crew-fields').append(wrapper);
  }
  document.body.append(dialog);
  dialog.querySelector('#cancel-crew').addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;actions.save(validate(Object.fromEntries(new FormData(form))));dialog.close();});
  dialog.addEventListener('close',()=>actions.toggle(false));
  return{open(){if(!actions.canEdit())return;const crew=actions.get();for(const key of Object.keys(fields))form.elements.namedItem(key).value=crew[key]||'';actions.toggle(true);dialog.showModal();form.elements.namedItem('director').focus();},close(){if(dialog.open)dialog.close();}};
 }
 const api={fields,validate,setup};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoCrew=api;
})(globalThis);
