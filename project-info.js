/* Ficha del proyecto. Viaja con .plano; las exportaciones del guion quedan separadas. */
(function(root){
 'use strict';
 const S=typeof module==='object'&&module.exports?require('./screenplay.js'):root.PlanoScreenplay;
 const V=typeof module==='object'&&module.exports?require('./screenplay-versions.js'):root.PlanoScreenplayVersions;
 const formats={short:'Cortometraje',feature:'Largometraje'},limits={genre:120,target:160,country:80,language:80};
 const genreAliases={
  drama:'drama',dramatico:'drama',comedia:'comedy',humor:'comedy',
  terror:'horror',horror:'horror',suspenso:'thriller',suspense:'thriller',thriller:'thriller',
  'ciencia ficcion':'scifi',scifi:'scifi','sci fi':'scifi',documental:'documentary',
  accion:'action',aventura:'action',romance:'romance',romantico:'romance',romantica:'romance',
  fantasia:'fantasy',fantastico:'fantasy',fantastica:'fantasy',animacion:'animation'
 };
 const genrePattern=new RegExp('\\b(?:'+Object.keys(genreAliases).join('|')+')\\b');
 function genreAccent(genre){
  const normalized=typeof genre==='string'?genre.slice(0,limits.genre).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' '):'';
  return genreAliases[normalized.match(genrePattern)?.[0]]||'';
 }
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
 const api={validate,empty,formats,contentPages,duration,description,emoji,genreAccent};if(typeof module==='object'&&module.exports){module.exports=api;return;}root.PlanoProjectInfo=api;
 api.paintIcon=function(container,value){
  const symbol=emoji(value);
  if(symbol){
   const glyph=document.createElement('span');glyph.className='project-emoji';glyph.textContent=symbol;container.replaceChildren(glyph);return;
  }
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS(svg.namespaceURI,'use');
  use.setAttribute('href','#i-folder');svg.append(use);container.replaceChildren(svg);
 };
 api.editor=function({owner,create,save,loadEmojis}){
  const genres=['Drama','Comedia','Terror','Suspenso','Ciencia ficción','Documental','Acción','Romance','Fantasía','Animación'];
  const dialog=document.createElement('dialog');dialog.id='new-script-dialog';dialog.className='project-info-dialog';dialog.setAttribute('aria-labelledby','new-script-title');
  dialog.innerHTML=`<form id="project-info-form"><header><div><p class="dialog-eyebrow" id="project-info-eyebrow">TU PRÓXIMA HISTORIA</p><h2 id="new-script-title">Nuevo proyecto</h2><p class="project-info-lead">Define la ficha de tu historia. Podrás completarla o ajustarla después.</p></div><button id="cancel-new-script" class="shot-close" type="button" aria-label="Cerrar ficha del proyecto">×</button></header>
   <div class="project-info-fields"><div class="project-identity project-info-wide"><div class="project-icon-field"><span>Icono</span><button id="project-icon-button" type="button" title="Elegir icono del proyecto" aria-label="Elegir icono del proyecto" aria-expanded="false" aria-controls="project-emoji-picker" popovertarget="project-emoji-picker"><span id="project-icon-preview" aria-hidden="true"></span></button></div><label>Nombre del proyecto<input id="project-info-name" required maxlength="120" autocomplete="off" placeholder="Título del proyecto"></label>
   <section id="project-emoji-picker" class="compact-popover project-emoji-picker" popover="auto" data-align="start" aria-label="Elegir emoji del proyecto">
    <div id="project-emoji-categories" class="project-emoji-categories" role="group" aria-label="Categorías de emojis"></div>
    <label class="project-emoji-search"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="project-emoji-search" type="search" placeholder="Buscar emoji" aria-label="Buscar emoji" autocomplete="off" spellcheck="false" maxlength="80"></label>
    <div class="project-emoji-heading"><h3 id="project-emoji-title">Caras y emociones</h3><button id="project-emoji-tones" type="button" aria-pressed="false" hidden>Tonos de piel</button></div>
    <div id="project-emoji-scroll" class="project-emoji-scroll"><p id="project-emoji-status" role="status" hidden></p><div id="project-emoji-grid" class="project-emoji-grid" role="group" aria-labelledby="project-emoji-title"></div></div>
    <footer class="project-emoji-footer"><button id="project-emoji-reset" type="button"><svg aria-hidden="true"><use href="#i-folder"/></svg>Usar carpeta</button></footer>
   </section></div>
   <div class="project-genre-field">
    <label for="project-info-genre">Género</label>
    <div class="project-genre-input"><input id="project-info-genre" type="text" maxlength="120" placeholder="Elige o escribe un género" autocomplete="off" writingsuggestions="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="project-genre-options"><button id="project-genre-toggle" type="button" tabindex="-1" popovertarget="project-genre-options" aria-label="Mostrar géneros"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg></button></div>
    <ul id="project-genre-options" class="compact-popover project-genre-options" popover="auto" data-align="start" role="listbox" aria-label="Géneros"></ul>
   </div>
   <label>Formato<select id="project-info-format" autocomplete="off"><option value="short">Cortometraje</option><option value="feature">Largometraje</option></select></label>
   <fieldset class="project-info-wide project-info-authors"><legend>Autor o autores</legend><div id="project-info-authors"></div><button id="project-add-author" class="project-info-text-button" type="button">+ Añadir autor</button><p class="project-info-hint">Se usarán también en la portada del guion.</p></fieldset>
   <label><span>Duración estimada <span class="project-info-unit">(minutos)</span></span><input id="project-info-duration" type="number" inputmode="decimal" min="0.1" max="1440" step="any" placeholder="Por ejemplo, 10"></label><label>Target / público objetivo<input id="project-info-target" maxlength="160" placeholder="Por ejemplo, adolescentes"></label><label>País de origen<input id="project-info-country" maxlength="80" placeholder="Por ejemplo, Colombia"></label><label>Idioma original<input id="project-info-language" maxlength="80" placeholder="Por ejemplo, español (latino)"></label></div>
   <section id="project-attachment" class="project-attachment"><div><strong>Guion existente <span>(opcional)</span></strong><p id="project-file-name">Si ya lo tienes escrito, puedes adjuntarlo aquí.</p></div><button id="project-attach-script" type="button">Adjuntar guion</button><button id="project-remove-script" class="project-info-text-button" type="button" hidden>Quitar</button><input id="project-info-file" type="file" hidden></section>
   <p id="project-info-error" class="project-info-error" role="alert" hidden></p><footer><button id="project-info-cancel" type="button" class="project-info-cancel">Cancelar</button><button id="create-project" type="submit" class="button button-primary">Crear proyecto</button></footer></form>`;
  document.body.append(dialog);const $=s=>dialog.querySelector(s),form=$('#project-info-form');let current=null,saving=false;
  const iconButton=$('#project-icon-button'),picker=$('#project-emoji-picker'),search=$('#project-emoji-search');
  const grid=$('#project-emoji-grid'),scroller=$('#project-emoji-scroll'),status=$('#project-emoji-status'),tones=$('#project-emoji-tones');
  const categories=[
   ['Caras y emociones','smile'],['Personas y gestos','people'],['Animales y naturaleza','paw'],
   ['Comida y bebida','cup'],['Actividades','ball'],['Viajes y lugares','car'],
   ['Objetos','bulb'],['Símbolos','symbols'],['Banderas','flag']
  ];
  const categoryButtons=categories.map(([label,icon])=>{
   const button=document.createElement('button');button.type='button';button.title=label;
   button.setAttribute('aria-label',label);button.setAttribute('aria-pressed','false');
   button.innerHTML=`<svg aria-hidden="true"><use href="#i-${icon}"/></svg>`;
   button.addEventListener('click',()=>{category=label;search.value='';filterEmojis();});
   return button;
  });
  $('#project-emoji-categories').append(...categoryButtons);
  let symbol='',category=categories[0][0],catalog=null,allEmojis=[],matches=[];
  const searchKey=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es');
  const genreInput=$('#project-info-genre'),genreToggle=$('#project-genre-toggle'),genreList=$('#project-genre-options');
  let activeGenre=-1;
  function hideGenres(){
   root.PlanoPopover.hide(genreList);
   genreInput.removeAttribute('aria-activedescendant');
   activeGenre=-1;
  }
  function showGenres(filter=''){
   const query=searchKey(filter.trim()),options=genres.filter(genre=>searchKey(genre).includes(query));
   if(!options.length){hideGenres();return;}
   activeGenre=-1;genreInput.removeAttribute('aria-activedescendant');
   genreList.replaceChildren(...options.map((genre,index)=>{
    const option=document.createElement('li');option.id='project-genre-option-'+index;
    option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.textContent=genre;
    return option;
   }));
   genreList.style.width=genreInput.getBoundingClientRect().width+'px';
   if(genreList.matches(':popover-open'))root.PlanoPopover.place(genreList);
   else root.PlanoPopover.show(genreList,genreInput);
  }
  function selectGenre(option){
   genreInput.value=option.textContent;
   hideGenres();genreInput.focus({preventScroll:true});
  }
  genreToggle.addEventListener('click',event=>{
   event.preventDefault();genreInput.focus({preventScroll:true});
   if(genreList.matches(':popover-open'))hideGenres();
   else showGenres();
  });
  genreInput.addEventListener('input',event=>{if(!event.isComposing)showGenres(genreInput.value);});
  genreInput.addEventListener('click',()=>{if(!genreList.matches(':popover-open'))showGenres();});
  genreInput.addEventListener('blur',event=>{if(event.relatedTarget!==genreToggle)hideGenres();});
  genreList.addEventListener('toggle',()=>{
   if(!genreList.matches(':popover-open')){genreInput.removeAttribute('aria-activedescendant');activeGenre=-1;}
  });
  genreList.addEventListener('mousedown',event=>event.preventDefault());
  genreList.addEventListener('click',event=>{
   const option=event.target.closest('[role=option]');
   if(option)selectGenre(option);
  });
  genreInput.addEventListener('keydown',event=>{
   if(event.isComposing)return;
   if(event.key==='Enter'&&genreList.matches(':popover-open')){
    event.preventDefault();
    if(activeGenre>=0)selectGenre(genreList.children[activeGenre]);
    else hideGenres();
    return;
   }
   if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
   event.preventDefault();
   if(!genreList.matches(':popover-open'))showGenres();
   const count=genreList.childElementCount;
   if(!count)return;
   genreList.children[activeGenre]?.setAttribute('aria-selected','false');
   activeGenre=event.key==='ArrowDown'?(activeGenre+1)%count:activeGenre<=0?count-1:activeGenre-1;
   const option=genreList.children[activeGenre];
   option.setAttribute('aria-selected','true');genreInput.setAttribute('aria-activedescendant',option.id);
   option.scrollIntoView({block:'nearest'});
  });
  function setIcon(value){
   symbol=emoji(value);api.paintIcon($('#project-icon-preview'),symbol);
   iconButton.setAttribute('aria-label',symbol?'Cambiar icono del proyecto '+symbol:'Elegir icono del proyecto');
  }
  function hidePicker(focus=false){
   if(picker.matches(':popover-open'))root.PlanoPopover.hide(picker,focus);
  }
  function selectIcon(value){setIcon(value);hidePicker(true);}
  function appendEmojis(){
   const start=grid.childElementCount;
   grid.append(...matches.slice(start,start+120).map(({value,label},offset)=>{
    const button=document.createElement('button');button.type='button';button.className='project-emoji';button.textContent=value;
    button.title=label;button.setAttribute('aria-label',label);button.dataset.emoji=value;button.tabIndex=start+offset===0?0:-1;
    if(value===symbol)button.setAttribute('aria-current','true');
    return button;
   }));
  }
  function filterEmojis(){
   const words=searchKey(search.value.trim()).split(/\s+/).filter(Boolean);
   const searching=words.length>0;
   $('#project-emoji-title').textContent=searching?'Resultados':category;
   categoryButtons.forEach((button,index)=>button.setAttribute('aria-pressed',String(!searching&&categories[index][0]===category)));
   if(!catalog)return;
   const entries=searching?allEmojis.filter(entry=>words.every(word=>entry.keywords.includes(word))):catalog[category];
   const hasTones=entries.some(entry=>entry.tone),showTones=tones.getAttribute('aria-pressed')==='true';
   tones.hidden=!hasTones;
   matches=showTones?entries:entries.filter(entry=>!entry.tone);
   grid.replaceChildren();scroller.scrollTop=0;appendEmojis();
   status.hidden=matches.length>0;
   if(!status.hidden)status.textContent='Sin coincidencias';
  }
  iconButton.addEventListener('click',async event=>{
   event.preventDefault();
   if(picker.matches(':popover-open')){hidePicker();return;}
   search.value='';category=categories[0][0];tones.setAttribute('aria-pressed','false');
   root.PlanoPopover.show(picker,iconButton);
   if(catalog){filterEmojis();return;}
   filterEmojis();grid.replaceChildren();status.textContent='Cargando emojis…';status.hidden=false;
   try{
    await loadEmojis();
    if(!catalog){
     catalog=Object.fromEntries(categories.map(([group])=>[group,root.PlanoProjectEmojiData[group].map(([value,label,keywords])=>({
      value,label,keywords:searchKey(label+' '+keywords),tone:/\p{Emoji_Modifier}/u.test(value)
     }))]));
     allEmojis=Object.values(catalog).flat();
    }
    if(picker.matches(':popover-open'))filterEmojis();
   }catch{if(picker.matches(':popover-open'))status.textContent='No se pudo cargar el catálogo. Cierra el selector y vuelve a abrirlo.';}
  });
  search.addEventListener('input',event=>{if(!event.isComposing)filterEmojis();});
  search.addEventListener('keydown',event=>{
   if(event.isComposing)return;
   if(event.key==='Enter')event.preventDefault();
   if(event.key==='ArrowDown'&&grid.firstElementChild){event.preventDefault();grid.querySelector('[tabindex="0"]')?.focus();}
  });
  tones.addEventListener('click',()=>{tones.setAttribute('aria-pressed',String(tones.getAttribute('aria-pressed')!=='true'));filterEmojis();});
  scroller.addEventListener('scroll',()=>{
   if(grid.childElementCount<matches.length&&scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<96)appendEmojis();
  },{passive:true});
  grid.addEventListener('click',event=>{const button=event.target.closest('button[data-emoji]');if(button)selectIcon(button.dataset.emoji);});
  grid.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
   event.preventDefault();
   const columns=getComputedStyle(grid).gridTemplateColumns.split(' ').length;
   const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-columns,ArrowDown:columns}[event.key];
   const index=Array.prototype.indexOf.call(grid.children,event.target),target=index+step;
   if(target<0||target>=matches.length)return;
   if(target>=grid.childElementCount)appendEmojis();
   event.target.tabIndex=-1;grid.children[target].tabIndex=0;grid.children[target].focus();
  });
  $('#project-emoji-reset').addEventListener('click',()=>selectIcon(''));
  dialog.addEventListener('close',()=>{hidePicker();hideGenres();current=null;form.reset();$('#project-info-authors').replaceChildren();});
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
  $('#cancel-new-script').addEventListener('click',close);$('#project-info-cancel').addEventListener('click',close);dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
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
    saving=true;hidePicker();hideGenres();$('#project-info-error').hidden=true;for(const el of form.elements)el.disabled=true;$('#create-project').textContent='Guardando…';
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
