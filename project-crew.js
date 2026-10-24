/* Equipo ordenado por guion. Lee también las fichas de equipo anteriores. */
(function(root){
 'use strict';
 const fields={director:'Dirección',producer:'Producción',assistantDirector:'Asistencia de dirección',cinematographer:'Dirección de fotografía',productionDesigner:'Diseño de producción',soundMixer:'Sonido'},limit=40;
 function validate(value){
  if(value===undefined)return {};
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('La información del equipo no es válida.');
  if(value.roles!==undefined){
   if(!Array.isArray(value.roles)||value.roles.length>limit)throw Error('El equipo admite hasta 40 cargos.');
   const ids=new Set();return{roles:value.roles.map(role=>{
    if(!role||typeof role.id!=='string'||!/^[-\w]{1,80}$/.test(role.id)||ids.has(role.id))throw Error('Hay cargos inválidos o repetidos.');
    if(typeof role.label!=='string'||!role.label.trim()||role.label.length>80)throw Error('Cada cargo necesita un título de hasta 80 caracteres.');
    if(typeof role.name!=='string'||role.name.length>160)throw Error('Cada nombre del equipo admite hasta 160 caracteres.');
    ids.add(role.id);return{id:role.id,label:role.label.trim().replace(/\s+/g,' '),name:role.name.trim().replace(/\s+/g,' ')};
   })};
  }
  const clean={};for(const key of [...Object.keys(fields),'productionCompany']){
   if(value[key]===undefined)continue;
   if(typeof value[key]!=='string'||value[key].length>160)throw Error('Cada nombre del equipo admite hasta 160 caracteres.');
   if(value[key].trim())clean[key]=value[key].trim();
  }return clean;
 }
 function entries(value){
  const crew=validate(value);if(crew.roles)return crew.roles;
  const roles=Object.entries(fields).map(([id,label])=>({id,label,name:crew[id]||''}));
  // Conserva la empresa anterior sin repetir los rótulos ambiguos de producción.
  if(crew.productionCompany){if(!crew.producer)roles[1].name=crew.productionCompany;else roles.splice(2,0,{id:'productionCompany',label:'Empresa',name:crew.productionCompany});}
  return roles.map(role=>({...role,name:role.name.replace(/\s+/g,' ')}));
 }
 function setup(actions){
  const dialog=document.createElement('dialog');dialog.id='crew-dialog';dialog.className='shot-name-dialog crew-dialog';dialog.setAttribute('aria-labelledby','crew-title');
  dialog.innerHTML='<form id="crew-form"><p class="dialog-eyebrow">EQUIPO DEL GUION</p><h2 id="crew-title">Equipo de producción</h2><p class="crew-hint">Elige cómo aparece cada cargo y su orden en el Excel y el PDF completo. Arrastra una fila o utiliza las flechas.</p><div class="crew-headings" aria-hidden="true"><span>Cargo</span><span>Nombre</span></div><div class="crew-fields"></div><div class="crew-add-row"><button type="button" id="add-crew-role" class="button button-secondary">+ Añadir cargo</button><span id="crew-count" role="status"></span></div><div class="dialog-actions"><button type="button" id="cancel-crew" class="button button-secondary">Cancelar</button><button type="submit" class="button button-primary">Guardar equipo</button></div></form>';
  const form=dialog.querySelector('form'),list=dialog.querySelector('.crew-fields'),add=dialog.querySelector('#add-crew-role');let roles=[],dragging=null;
  function read(){for(const row of list.children){const role=roles.find(item=>item.id===row.dataset.roleId);role.label=row.querySelector('.crew-role-label').value;role.name=row.querySelector('.crew-person-name').value;}}
  function move(id,target){read();const index=roles.findIndex(role=>role.id===id);if(index<0||target<0||target>=roles.length)return;const [role]=roles.splice(index,1);roles.splice(target,0,role);render();list.querySelector(`[data-role-id="${id}"] .crew-role-label`).focus();}
  function render(){
   list.replaceChildren();
   for(const [index,role]of roles.entries()){
    const row=document.createElement('div');row.className='crew-role-row';row.dataset.roleId=role.id;
    const handle=document.createElement('span');handle.className='crew-drag-handle';handle.textContent='⠿';handle.draggable=true;handle.title='Arrastrar cargo';handle.setAttribute('aria-hidden','true');row.append(handle);
    for(const [kind,value,max]of [['label',role.label,80],['name',role.name,160]]){
     const label=document.createElement('label'),input=document.createElement('input');label.className='crew-'+kind+'-field';
     const title=document.createElement('span');title.className='sr-only';title.textContent=kind==='label'?`Cargo ${index+1}`:`Nombre del cargo ${index+1}`;
     input.id=kind==='name'?'crew-'+role.id:'crew-role-'+role.id;input.className=kind==='name'?'crew-person-name':'crew-role-label';input.type='text';input.value=value;input.maxLength=max;input.autocomplete='off';input.spellcheck=true;input.lang='es';input.required=kind==='label';input.placeholder=kind==='label'?'Ej. Sonidista':'Nombre';label.append(title,input);row.append(label);
    }
    const tools=document.createElement('div');tools.className='crew-row-tools';
    for(const [text,name,action,disabled]of [['↑','Subir cargo',()=>move(role.id,index-1),index===0],['↓','Bajar cargo',()=>move(role.id,index+1),index===roles.length-1],['×','Quitar cargo',()=>{read();roles.splice(index,1);render();(list.children[Math.min(index,roles.length-1)]?.querySelector('input')||add).focus();},false]]){
     const button=document.createElement('button');button.type='button';button.textContent=text;button.title=name;button.setAttribute('aria-label',name+' '+(index+1));button.disabled=disabled;button.addEventListener('click',action);tools.append(button);
    }row.append(tools);
    handle.addEventListener('dragstart',event=>{dragging=role.id;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',role.id);row.classList.add('is-dragging');});
    handle.addEventListener('dragend',()=>{dragging=null;row.classList.remove('is-dragging');for(const child of list.children)child.classList.remove('is-drop-target');});
    row.addEventListener('dragover',event=>{if(!dragging||dragging===role.id)return;event.preventDefault();event.dataTransfer.dropEffect='move';row.classList.add('is-drop-target');});
    row.addEventListener('dragleave',event=>{if(!row.contains(event.relatedTarget))row.classList.remove('is-drop-target');});
    row.addEventListener('drop',event=>{if(!dragging)return;event.preventDefault();const id=dragging;dragging=null;move(id,index);});list.append(row);
   }
   add.disabled=roles.length>=limit;dialog.querySelector('#crew-count').textContent=`${roles.length} / ${limit} cargos`;
  }
  document.body.append(dialog);
  add.addEventListener('click',()=>{if(roles.length>=limit)return;read();const id=crypto.randomUUID();roles.push({id,label:'',name:''});render();document.getElementById('crew-role-'+id).focus();});
  dialog.querySelector('#cancel-crew').addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',event=>{event.preventDefault();if(!form.reportValidity())return;read();for(const row of list.children){const input=row.querySelector('.crew-role-label');input.setCustomValidity(input.value.trim()?'':'Escribe el nombre del cargo.');}if(!form.reportValidity())return;actions.save(validate({roles}));dialog.close();});
  form.addEventListener('input',event=>event.target.setCustomValidity?.(''));
  dialog.addEventListener('close',()=>{roles=[];dragging=null;list.replaceChildren();actions.toggle(false);});
  return{open(){if(!actions.canEdit())return;roles=entries(actions.get());render();actions.toggle(true);dialog.showModal();(list.querySelector('.crew-person-name')||add).focus();},close(){if(dialog.open)dialog.close();}};
 }
 const api={fields,limit,validate,entries,setup};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoCrew=api;
})(globalThis);
