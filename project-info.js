/* Ficha del proyecto. Viaja con .plano; las exportaciones del guion quedan separadas. */
(function(root){
 'use strict';
 const S=typeof module==='object'&&module.exports?require('./screenplay.js'):root.PlanoScreenplay;
 const V=typeof module==='object'&&module.exports?require('./screenplay-versions.js'):root.PlanoScreenplayVersions;
 const formats={short:'Cortometraje',feature:'Largometraje'},limits={genre:120,target:160,country:80,language:80};
 // Un icono puede incluir tono de piel, selectores de presentación o una secuencia unida.
 const emojiPattern=/^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\u{1F3F4}[\u{E0061}-\u{E007A}]+\u{E007F}|\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*)$/u;
 function emoji(value){
  const text=typeof value==='string'&&value.length<=64?value.trim():'';
  return emojiPattern.test(text)?text:'';
 }
 function validate(value){
  if(value==null)return null;
  if(value.version!==1||!Object.hasOwn(formats,value.format)||typeof value.completed!=='boolean')throw Error('La ficha del proyecto no es válida.');
  const clean={version:1};
  const symbol=emoji(value.emoji);if(symbol)clean.emoji=symbol;
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
 const api={validate,empty,formats,contentPages,duration,description,emoji};if(typeof module==='object'&&module.exports){module.exports=api;return;}root.PlanoProjectInfo=api;
 api.paintIcon=function(container,value){
  const symbol=emoji(value);
  if(symbol){
   const glyph=document.createElement('span');glyph.className='project-emoji';glyph.textContent=symbol;container.replaceChildren(glyph);return;
  }
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');
  use.setAttribute('href','#i-folder');svg.append(use);container.replaceChildren(svg);
 };
 api.editor=function({owner,create,save,loadEmojis}){
  const dialog=document.createElement('dialog');dialog.id='new-script-dialog';dialog.className='project-info-dialog';dialog.setAttribute('aria-labelledby','new-script-title');
  dialog.innerHTML=`<form id="project-info-form"><header><div><p class="dialog-eyebrow" id="project-info-eyebrow">TU PRÓXIMA HISTORIA</p><h2 id="new-script-title">Nuevo proyecto</h2><p class="project-info-lead">Define la ficha de tu historia. Podrás completarla o ajustarla después.</p></div><button id="cancel-new-script" class="shot-close" type="button" aria-label="Cerrar ficha del proyecto">×</button></header>
   <div class="project-info-fields"><div class="project-identity project-info-wide"><div class="project-icon-field"><span>Icono</span><button id="project-icon-button" type="button" title="Elegir icono del proyecto" aria-label="Elegir icono del proyecto" aria-expanded="false" aria-controls="project-emoji-picker"><span id="project-icon-preview" aria-hidden="true"></span></button></div><label>Nombre del proyecto<input id="project-info-name" required maxlength="120" autocomplete="off" placeholder="Título del proyecto"></label>
   <section id="project-emoji-picker" class="project-emoji-picker" aria-label="Elegir emoji del proyecto" hidden>
    <div class="project-emoji-controls"><input id="project-emoji-search" type="search" placeholder="Buscar o pegar un emoji" aria-label="Buscar o pegar un emoji" autocomplete="off" spellcheck="false" maxlength="80"><select id="project-emoji-category" aria-label="Categoría de emojis" disabled></select></div>
    <div id="project-emoji-grid" class="project-emoji-grid" role="group" aria-label="Emojis disponibles"></div>
    <div class="project-emoji-footer"><button id="project-emoji-reset" type="button" class="project-info-text-button">Usar carpeta</button><span id="project-emoji-status" role="status"></span><button id="project-emoji-prev" type="button" aria-label="Emojis anteriores" disabled>‹</button><button id="project-emoji-next" type="button" aria-label="Más emojis" disabled>›</button></div>
   </section></div><label>Género<input id="project-info-genre" maxlength="120" list="project-genre-options" placeholder="Por ejemplo, terror"><datalist id="project-genre-options"><option>Drama</option><option>Comedia</option><option>Terror</option><option>Suspenso</option><option>Ciencia ficción</option><option>Documental</option><option>Acción</option><option>Romance</option><option>Fantasía</option><option>Animación</option></datalist></label><label>Formato<select id="project-info-format"><option value="short">Cortometraje</option><option value="feature">Largometraje</option></select></label>
   <fieldset class="project-info-wide project-info-authors"><legend>Autor o autores</legend><div id="project-info-authors"></div><button id="project-add-author" class="project-info-text-button" type="button">+ Añadir autor</button><p class="project-info-hint">Se usarán también en la portada del guion.</p></fieldset>
   <label><span>Duración estimada <span class="project-info-unit">(minutos)</span></span><input id="project-info-duration" type="number" inputmode="decimal" min="0.1" max="1440" step="any" placeholder="Por ejemplo, 10"></label><label>Target / público objetivo<input id="project-info-target" maxlength="160" placeholder="Por ejemplo, adolescentes"></label><label>País de origen<input id="project-info-country" maxlength="80" placeholder="Por ejemplo, Colombia"></label><label>Idioma original<input id="project-info-language" maxlength="80" placeholder="Por ejemplo, español (latino)"></label></div>
   <section id="project-attachment" class="project-attachment"><div><strong>Guion existente <span>(opcional)</span></strong><p id="project-file-name">Si ya lo tienes escrito, puedes adjuntarlo aquí.</p></div><button id="project-attach-script" type="button">Adjuntar guion</button><button id="project-remove-script" class="project-info-text-button" type="button" hidden>Quitar</button><input id="project-info-file" type="file" hidden></section>
   <p id="project-info-error" class="project-info-error" role="alert" hidden></p><footer><button id="project-info-cancel" type="button" class="project-info-cancel">Cancelar</button><button id="create-project" type="submit" class="button button-primary">Crear proyecto</button></footer></form>`;
  document.body.append(dialog);const $=s=>dialog.querySelector(s),form=$('#project-info-form');let current=null,saving=false;
  const iconButton=$('#project-icon-button'),picker=$('#project-emoji-picker'),search=$('#project-emoji-search'),category=$('#project-emoji-category');
  const grid=$('#project-emoji-grid'),status=$('#project-emoji-status'),prev=$('#project-emoji-prev'),next=$('#project-emoji-next');
  const perPage=42;
  let symbol='',page=0,catalog=null,allEmojis=[],matches=[];
  const searchKey=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');
  function setIcon(value){
   symbol=emoji(value);api.paintIcon($('#project-icon-preview'),symbol);
   iconButton.setAttribute('aria-label',symbol?'Cambiar icono del proyecto '+symbol:'Elegir icono del proyecto');
  }
  function hidePicker(focus=false){
   picker.hidden=true;iconButton.setAttribute('aria-expanded','false');
   if(focus)iconButton.focus({preventScroll:true});
  }
  function selectIcon(value){setIcon(value);hidePicker(true);}
  function renderEmojis(){
   const start=page*perPage,end=Math.min(matches.length,start+perPage);
   grid.replaceChildren(...matches.slice(start,end).map(([value,label])=>{
    const button=document.createElement('button');button.type='button';button.className='project-emoji';button.textContent=value;button.title=label;button.setAttribute('aria-label',label);button.dataset.emoji=value;button.disabled=saving;return button;
   }));
   prev.disabled=saving||page===0;next.disabled=saving||end>=matches.length;
   status.textContent=matches.length?`${start+1}–${end} de ${matches.length}`:'Sin coincidencias';
  }
  function filterEmojis(){
   if(!catalog)return;
   const words=searchKey(search.value.trim()).split(/\s+/).filter(Boolean);
   const entries=category.value?catalog[category.value]:allEmojis;
   matches=words.length?entries.filter(entry=>words.every(word=>entry[2].includes(word))):entries;
   page=0;renderEmojis();
  }
  iconButton.addEventListener('click',async()=>{
   if(!picker.hidden){hidePicker();return;}
   picker.hidden=false;iconButton.setAttribute('aria-expanded','true');search.value='';search.focus();
   if(catalog){filterEmojis();return;}
   grid.replaceChildren();category.disabled=true;prev.disabled=next.disabled=true;status.textContent='Cargando emojis…';
   try{
    await loadEmojis();
    if(!catalog){
     catalog=Object.fromEntries(Object.entries(root.PlanoProjectEmojiData).map(([group,items])=>[group,items.map(([value,label,keywords])=>[value,label,searchKey(label+' '+keywords)])]));
     allEmojis=Object.values(catalog).flat();
     category.replaceChildren(new Option('Todos',''),...Object.keys(catalog).map(label=>new Option(label,label)));
    }
    if(dialog.open&&!picker.hidden){category.disabled=saving;filterEmojis();}
   }catch{if(dialog.open&&!picker.hidden)status.textContent='Puedes pegar un emoji del teclado.';}
  });
  search.addEventListener('input',event=>{if(event.isComposing)return;const value=emoji(search.value);if(value)selectIcon(value);else filterEmojis();});
  search.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing)event.preventDefault();});
  category.addEventListener('change',filterEmojis);
  grid.addEventListener('click',event=>{const button=event.target.closest('button[data-emoji]');if(button)selectIcon(button.dataset.emoji);});
  prev.addEventListener('click',()=>{page--;renderEmojis();if(prev.disabled)next.focus();});
  next.addEventListener('click',()=>{page++;renderEmojis();if(next.disabled)prev.focus();});
  $('#project-emoji-reset').addEventListener('click',()=>selectIcon(''));
  dialog.addEventListener('close',()=>{current=null;form.reset();$('#project-info-authors').replaceChildren();});
  function close(){if(!saving)dialog.close();}
  function authorRow(author){
   const row=document.createElement('div');row.className='project-author-row';row.dataset.id=author.id;row._author={...author};
   const name=document.createElement('input');name.value=author.name;name.required=true;name.maxLength=120;name.placeholder='Nombre y apellidos';name.setAttribute('aria-label','Nombre del autor');name.dataset.authorName='';name.autocomplete='off';name.lang='es';name.spellcheck=true;
   const email=document.createElement('input');email.type='text';email.inputMode='email';email.autocomplete='off';email.setAttribute('autocapitalize','none');email.spellcheck=false;email.maxLength=254;email.placeholder='Correo de contacto (opcional)';email.setAttribute('aria-label','Correo del autor');email.dataset.authorEmail='';email.value=author.email;
   const remove=document.createElement('button');remove.type='button';remove.className='project-author-remove';remove.textContent='×';remove.setAttribute('aria-label','Quitar autor');remove.addEventListener('click',()=>{row.remove();authorButtons();});row.append(name,email,remove);return row;
  }
  function authorButtons(){const rows=[...$('#project-info-authors').children];for(const row of rows)row.querySelector('button').disabled=rows.length===1;$('#project-add-author').disabled=rows.length>=8;}
  function show(value={}){
   if(saving)return;const user=owner();if(!user)return;
   current={...value,owner:user.id};form.reset();$('#project-info-error').hidden=true;$('#project-info-file').value='';fileName();
   const editing=Boolean(value.project),info=validate(value.info)||empty();
   setIcon(info.emoji);hidePicker();
   $('#project-info-name').value=value.name||'';for(const key of ['genre','format','target','country','language'])$('#project-info-'+key).value=info[key];
   $('#project-info-duration').value=info.estimatedMinutes??'';
   const authors=value.script?.authors?.length?value.script.authors:[{id:S.id(),name:user.name||'',email:user.email||'',phone:'',contact:''}];$('#project-info-authors').replaceChildren(...authors.map(authorRow));authorButtons();
   $('#new-script-title').textContent=editing?'Ficha del proyecto':'Nuevo proyecto';$('#project-info-eyebrow').textContent=editing?'TU HISTORIA, EN DETALLE':'TU PRÓXIMA HISTORIA';$('#create-project').textContent=editing?'Guardar ficha':'Crear proyecto';$('#project-attachment').hidden=editing;
   $('#project-info-file').accept=document.querySelector('#file-input').accept.replace('.plano,','');
   dialog.showModal();dialog.scrollTop=0;$('#project-info-name').focus();
  }
  function fileName(){const file=$('#project-info-file').files[0];$('#project-file-name').textContent=file?file.name:'Si ya lo tienes escrito, puedes adjuntarlo aquí.';$('#project-remove-script').hidden=!file;}
  $('#cancel-new-script').addEventListener('click',close);$('#project-info-cancel').addEventListener('click',close);dialog.addEventListener('cancel',event=>{if(saving||!picker.hidden)event.preventDefault();if(!saving&&!picker.hidden)hidePicker(true);});
  $('#project-add-author').addEventListener('click',()=>{if($('#project-info-authors').children.length>=8)return;const row=authorRow({id:S.id(),name:'',email:'',phone:'',contact:''});$('#project-info-authors').append(row);authorButtons();row.querySelector('input').focus();});
  $('#project-attach-script').addEventListener('click',()=>$('#project-info-file').click());$('#project-info-file').addEventListener('change',fileName);$('#project-remove-script').addEventListener('click',()=>{$('#project-info-file').value='';fileName();});
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(saving||!current||current.owner!==owner()?.id)return;
   try{
    const name=$('#project-info-name').value.trim();if(!name||name.length>120||/[\u0000-\u001f\u007f]/.test(name))throw Error('Escribe un nombre válido para el proyecto.');
    const authors=[...$('#project-info-authors').children].map(row=>({...row._author,name:row.querySelector('[data-author-name]').value.trim(),email:row.querySelector('[data-author-email]').value.trim()}));
    if(authors.some(a=>!a.name||a.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)))throw Error('Revisa los nombres y correos de los autores.');
    const duration=$('#project-info-duration').value;
    const info=validate({version:1,emoji:symbol,...Object.fromEntries(['genre','format','target','country','language'].map(key=>[key,$('#project-info-'+key).value])),estimatedMinutes:duration===''?null:Number(duration),completed:Boolean(current.info?.completed)});
    const file=$('#project-info-file').files[0];if(file&&/\.plano$/i.test(file.name))throw Error('Para recuperar un proyecto .plano completo, usa Importar en Inicio.');
    saving=true;hidePicker();$('#project-info-error').hidden=true;for(const el of form.elements)el.disabled=true;$('#create-project').textContent='Guardando…';
    const creating=!current.project,result=await(current.project?save({...current,name,info,authors,updated:value=>Object.assign(current,value)}):create({name,info,authors,file}));if(result!==false&&current?.owner===owner()?.id){dialog.close();if(creating)document.querySelector('#writer-project-title')?.focus();}
   }catch(error){if(current?.owner===owner()?.id){$('#project-info-error').textContent=error.message||'No se pudo guardar la ficha.';$('#project-info-error').hidden=false;}}
   finally{saving=false;for(const el of form.elements)el.disabled=false;authorButtons();if(current)$('#create-project').textContent=current.project?'Guardar ficha':'Crear proyecto';}
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
