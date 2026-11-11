/* Ficha del proyecto. Viaja con .plano; las exportaciones del guion quedan separadas. */
(function(root){
 'use strict';
 const S=typeof module==='object'&&module.exports?require('./screenplay.js'):root.PlanoScreenplay;
 const V=typeof module==='object'&&module.exports?require('./screenplay-versions.js'):root.PlanoScreenplayVersions;
 const formats={short:'Cortometraje',feature:'Largometraje'},limits={genre:120,target:160,country:80,language:80};
 function validate(value){
  if(value==null)return null;
  if(value.version!==1||!Object.hasOwn(formats,value.format)||typeof value.completed!=='boolean')throw Error('La ficha del proyecto no es válida.');
  const clean={version:1};
  for(const [key,max]of Object.entries(limits)){if(typeof value[key]!=='string'||value[key].length>max||/[\u0000-\u001f\u007f]/.test(value[key]))throw Error('Revisa los datos de la ficha del proyecto.');clean[key]=value[key].trim();}
  if(value.estimatedMinutes!==null&&(!Number.isFinite(value.estimatedMinutes)||value.estimatedMinutes<.1||value.estimatedMinutes>1440))throw Error('La duración estimada debe estar entre 0,1 y 1440 minutos.');
  return{...clean,format:value.format,estimatedMinutes:value.estimatedMinutes,completed:value.completed};
 }
 const empty=()=>({version:1,genre:'',format:'short',estimatedMinutes:null,target:'',country:'',language:'',completed:false});
 const pageCache=new WeakMap();
 function contentPages(script){
  if(!script?.doc)return 0;const cached=pageCache.get(script.doc);if(cached?.content===script.doc.content&&cached.revision===script.revision)return cached.pages;
  const pages=S.layout(script.doc).pages;let count=0;
  for(let index=0;index<pages.length;index++)if(pages[index].some(line=>!line.virtual&&line.text.trim()))count=index+1;
  pageCache.set(script.doc,{content:script.doc.content,revision:script.revision,pages:count});return count;
 }
 function duration(info,script){const pages=contentPages(script),automatic=Boolean(info?.completed);return{pages,automatic,minutes:automatic?pages:info?.estimatedMinutes??null};}
 const minutes=value=>value==null?'Por definir':value.toLocaleString('es',{maximumFractionDigits:2})+' min';
 function description(info,script){const value=duration(info,script);return value.automatic?`${minutes(value.minutes)} · ${value.pages} ${value.pages===1?'página de guion':'páginas de guion'}`:minutes(value.minutes)+' · estimación inicial';}
 const api={validate,empty,formats,contentPages,duration,description};if(typeof module==='object'&&module.exports){module.exports=api;return;}root.PlanoProjectInfo=api;
 api.editor=function({owner,create,save}){
  const dialog=document.createElement('dialog');dialog.id='new-script-dialog';dialog.className='project-info-dialog';dialog.setAttribute('aria-labelledby','new-script-title');
  dialog.innerHTML=`<form id="project-info-form"><header><div><p class="dialog-eyebrow" id="project-info-eyebrow">TU PRÓXIMA HISTORIA</p><h2 id="new-script-title">Nuevo proyecto</h2><p class="project-info-lead">Define la ficha de tu historia. Podrás completarla o ajustarla después.</p></div><button id="cancel-new-script" class="shot-close" type="button" aria-label="Cerrar ficha del proyecto">×</button></header>
   <div class="project-info-fields"><label class="project-info-wide">Nombre del proyecto<input id="project-info-name" required maxlength="120" autocomplete="off" placeholder="Título del proyecto"></label><label>Género<input id="project-info-genre" maxlength="120" list="project-genre-options" placeholder="Por ejemplo, terror"><datalist id="project-genre-options"><option>Drama</option><option>Comedia</option><option>Terror</option><option>Suspenso</option><option>Ciencia ficción</option><option>Documental</option><option>Acción</option><option>Romance</option><option>Fantasía</option><option>Animación</option></datalist></label><label>Formato<select id="project-info-format"><option value="short">Cortometraje</option><option value="feature">Largometraje</option></select></label>
   <fieldset class="project-info-wide project-info-authors"><legend>Autor o autores</legend><div id="project-info-authors"></div><button id="project-add-author" class="project-info-text-button" type="button">+ Añadir autor</button><p class="project-info-hint">Se usarán también en la portada del guion.</p></fieldset>
   <label><span>Duración estimada <span class="project-info-unit">(minutos)</span></span><input id="project-info-duration" type="number" inputmode="decimal" min="0.1" max="1440" step="any" placeholder="Por ejemplo, 10"></label><label>Target / público objetivo<input id="project-info-target" maxlength="160" placeholder="Por ejemplo, adolescentes"></label><label>País de origen<input id="project-info-country" maxlength="80" placeholder="Por ejemplo, Colombia"></label><label>Idioma original<input id="project-info-language" maxlength="80" placeholder="Por ejemplo, español (latino)"></label></div>
   <section id="project-completion" class="project-completion" hidden><label><input id="project-info-completed" type="checkbox"><span>Guion finalizado</span></label><p id="project-duration-preview" class="project-info-hint"></p><p id="project-finalization-notice" role="status" hidden></p></section>
   <section id="project-attachment" class="project-attachment"><div><strong>Guion existente <span>(opcional)</span></strong><p id="project-file-name">Si ya lo tienes escrito, puedes adjuntarlo aquí.</p></div><button id="project-attach-script" type="button">Adjuntar guion</button><button id="project-remove-script" class="project-info-text-button" type="button" hidden>Quitar</button><input id="project-info-file" type="file" hidden></section>
   <p id="project-info-error" class="project-info-error" role="alert" hidden></p><footer><button id="project-info-cancel" type="button" class="project-info-cancel">Cancelar</button><button id="create-project" type="submit" class="button button-primary">Crear proyecto</button></footer></form>`;
  document.body.append(dialog);const $=s=>dialog.querySelector(s),form=$('#project-info-form');let current=null,saving=false,planned=null;
  dialog.addEventListener('close',()=>{current=null;form.reset();$('#project-info-authors').replaceChildren();});
  function close(){if(!saving)dialog.close();}
  function authorRow(author){
   const row=document.createElement('div');row.className='project-author-row';row.dataset.id=author.id;row._author={...author};
   const name=document.createElement('input');name.value=author.name;name.required=true;name.maxLength=120;name.placeholder='Nombre y apellidos';name.setAttribute('aria-label','Nombre del autor');name.dataset.authorName='';name.autocomplete='off';name.lang='es';name.spellcheck=true;
   const email=document.createElement('input');email.type='text';email.inputMode='email';email.autocomplete='off';email.setAttribute('autocapitalize','none');email.spellcheck=false;email.maxLength=254;email.placeholder='Correo de contacto (opcional)';email.setAttribute('aria-label','Correo del autor');email.dataset.authorEmail='';email.value=author.email;
   const remove=document.createElement('button');remove.type='button';remove.className='project-author-remove';remove.textContent='×';remove.setAttribute('aria-label','Quitar autor');remove.addEventListener('click',()=>{row.remove();authorButtons();});row.append(name,email,remove);return row;
  }
  function authorButtons(){const rows=[...$('#project-info-authors').children];for(const row of rows)row.querySelector('button').disabled=rows.length===1;$('#project-add-author').disabled=rows.length>=8;}
  function updateDuration(){
   const complete=$('#project-info-completed').checked;$('#project-info-duration').readOnly=complete;
   if(current?.script&&complete)$('#project-info-duration').value=String(contentPages(current.script));
   $('#project-duration-preview').textContent=complete?'Duración automática: '+description({...empty(),completed:true},current?.script)+'. Una página de contenido equivale a un minuto; la portada no cuenta.':contentPages(current?.script)?'Al finalizar, la duración se calculará a partir de las páginas de contenido. Se conservará también tu estimación inicial.':'Añade contenido al guion para poder marcarlo como finalizado.';
   const notice=$('#project-finalization-notice');
   notice.hidden=!complete||!current?.script||Boolean(current.info?.completed);
   if(!notice.hidden){
    const number=V.number(current.script),latest=current.versions?.at(-1);
    const action=latest?.number===number?'Volverás a marcar la versión '+V.label(number)+' como finalizada.':'Se finalizará la versión '+V.label(number)+' y se guardará una copia en el historial.';
    notice.textContent=action+' Cuando vuelvas a editar el guion, trabajarás en '+V.label(number+1)+'.';
   }
   $('#create-project').textContent=!current?.project?'Crear proyecto':notice.hidden?'Guardar ficha':'Finalizar '+V.label(V.number(current.script));
  }
  function show(value={}){
   if(saving)return;const user=owner();if(!user)return;
   current={...value,owner:user.id};form.reset();$('#project-info-error').hidden=true;$('#project-info-file').value='';fileName();
   const editing=Boolean(value.project),info=validate(value.info)||empty();
   $('#project-info-name').value=value.name||'';for(const key of ['genre','format','target','country','language'])$('#project-info-'+key).value=info[key];
   planned=info.estimatedMinutes;$('#project-info-duration').value=planned??'';$('#project-info-duration').readOnly=false;
   const authors=value.script?.authors?.length?value.script.authors:[{id:S.id(),name:user.name||'',email:user.email||'',phone:'',contact:''}];$('#project-info-authors').replaceChildren(...authors.map(authorRow));authorButtons();
   $('#new-script-title').textContent=editing?'Ficha del proyecto':'Nuevo proyecto';$('#project-info-eyebrow').textContent=editing?'TU HISTORIA, EN DETALLE':'TU PRÓXIMA HISTORIA';$('#create-project').textContent=editing?'Guardar ficha':'Crear proyecto';$('#project-attachment').hidden=editing;$('#project-completion').hidden=!editing;
   $('#project-info-completed').checked=info.completed;$('#project-info-completed').disabled=!info.completed&&!contentPages(value.script);updateDuration();
   $('#project-info-file').accept=document.querySelector('#file-input').accept.replace('.plano,','');
   dialog.showModal();dialog.scrollTop=0;$('#project-info-name').focus();
  }
  function fileName(){const file=$('#project-info-file').files[0];$('#project-file-name').textContent=file?file.name:'Si ya lo tienes escrito, puedes adjuntarlo aquí.';$('#project-remove-script').hidden=!file;}
  $('#cancel-new-script').addEventListener('click',close);$('#project-info-cancel').addEventListener('click',close);dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  $('#project-add-author').addEventListener('click',()=>{if($('#project-info-authors').children.length>=8)return;const row=authorRow({id:S.id(),name:'',email:'',phone:'',contact:''});$('#project-info-authors').append(row);authorButtons();row.querySelector('input').focus();});
  $('#project-attach-script').addEventListener('click',()=>$('#project-info-file').click());$('#project-info-file').addEventListener('change',fileName);$('#project-remove-script').addEventListener('click',()=>{$('#project-info-file').value='';fileName();});
  $('#project-info-completed').addEventListener('change',()=>{if($('#project-info-completed').checked)planned=$('#project-info-duration').value===''?null:Number($('#project-info-duration').value);else $('#project-info-duration').value=planned??'';updateDuration();});
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(saving||!current||current.owner!==owner()?.id)return;
   try{
    const name=$('#project-info-name').value.trim();if(!name||name.length>120||/[\u0000-\u001f\u007f]/.test(name))throw Error('Escribe un nombre válido para el proyecto.');
    const authors=[...$('#project-info-authors').children].map(row=>({...row._author,name:row.querySelector('[data-author-name]').value.trim(),email:row.querySelector('[data-author-email]').value.trim()}));
    if(authors.some(a=>!a.name||a.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)))throw Error('Revisa los nombres y correos de los autores.');
    const completed=Boolean(current.project&&$('#project-info-completed').checked),info=validate({version:1,...Object.fromEntries(['genre','format','target','country','language'].map(key=>[key,$('#project-info-'+key).value])),estimatedMinutes:completed?planned:$('#project-info-duration').value===''?null:Number($('#project-info-duration').value),completed});
    const file=$('#project-info-file').files[0];if(file&&/\.plano$/i.test(file.name))throw Error('Para recuperar un proyecto .plano completo, usa Importar en Inicio.');
    saving=true;$('#project-info-error').hidden=true;for(const el of form.elements)el.disabled=true;$('#create-project').textContent='Guardando…';
    const creating=!current.project,result=await(current.project?save({...current,name,info,authors,updated:value=>Object.assign(current,value)}):create({name,info,authors,file}));if(result!==false&&current?.owner===owner()?.id){dialog.close();if(creating)document.querySelector('#writer-project-title')?.focus();}
   }catch(error){if(current?.owner===owner()?.id){$('#project-info-error').textContent=error.message||'No se pudo guardar la ficha.';$('#project-info-error').hidden=false;}}
   finally{saving=false;for(const el of form.elements)el.disabled=false;authorButtons();if(current){updateDuration();$('#project-info-completed').disabled=!current.info?.completed&&!contentPages(current.script);}}
  });
  return{dialog,show,get saving(){return saving;},close:()=>dialog.close()};
 };
 api.render=function(container,value,edit,history){
  container.replaceChildren();
  const info=value.info,script=value.script;
  const header=document.createElement('header'),summary=document.createElement('div'),title=document.createElement('h2'),status=document.createElement('p'),actions=document.createElement('div');
  title.textContent='Ficha del proyecto';
  summary.className='project-facts-summary';
  status.className='project-facts-state';
  status.textContent=(script?V.label(V.number(script))+' · ':'')+(info?.completed?'Guion finalizado':'Guion en desarrollo');
  summary.append(title,status);
  actions.className='project-facts-actions';
  for(const [text,callback] of [['Historial de versiones',history],['Editar ficha',edit]]){
   if(!callback)continue;
   const button=document.createElement('button');button.type='button';button.textContent=text;button.addEventListener('click',callback);actions.append(button);
  }
  header.append(summary,actions);container.append(header);
  const list=document.createElement('dl');
  for(const [label,text]of [['Género',info?.genre],['Formato',formats[info?.format]],['Autoría',script?.authors.map(a=>a.name).filter(Boolean).join(', ')],['Duración',info?description(info,script):null],['Target',info?.target],['País de origen',info?.country],['Idioma original',info?.language]]){
   const row=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=text||'Por definir';row.append(term,detail);list.append(row);
  }
  container.append(list);
 };
})(globalThis);
