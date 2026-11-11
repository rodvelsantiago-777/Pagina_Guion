/* Redactor de guion local con ProseMirror. El texto se conserva como datos, nunca HTML arbitrario. */
(function(root){
 'use strict';
 const S=root.PlanoScreenplay,$=selector=>document.querySelector(selector);let hooks,view=null,draft=null,documentId='',initializedId='',part='title',panel='scenes',outlineTimer=0,analysisCache=null,namesCache=null,menu=null,menuIndex=-1,menuSuppressed=false,layoutCache=null,enginePromise=null,pendingCompose=false,generation=0,saveMessage='',localReview=null,findTool=null;
 const host=document.createElement('section');host.id='writing-view';host.className='writing-view';host.hidden=true;host.setAttribute('aria-label','Redactor de guion');
 host.innerHTML=`<div class="writer-toolbar" role="toolbar" aria-label="Herramientas de redacción"><button id="writer-panel-toggle" class="writer-icon" type="button" title="Escenas y personajes" aria-label="Mostrar escenas y personajes" aria-expanded="true">☰</button><div class="writer-marks"><button type="button" id="writer-bold" class="writer-icon" data-writer-mark="bold" title="Negrita (Ctrl+B)" aria-label="Negrita" aria-pressed="false"><b>B</b></button><button type="button" id="writer-italic" class="writer-icon" data-writer-mark="italic" title="Cursiva (Ctrl+I)" aria-label="Cursiva" aria-pressed="false"><i>I</i></button><button type="button" id="writer-underline" class="writer-icon" data-writer-mark="underline" title="Subrayado (Ctrl+U)" aria-label="Subrayado" aria-pressed="false"><u>U</u></button></div><span class="writer-divider"></span><button id="writer-undo" class="writer-icon" type="button" aria-label="Deshacer escritura" title="Deshacer (Ctrl+Z)">↶</button><button id="writer-redo" class="writer-icon" type="button" aria-label="Rehacer escritura" title="Rehacer (Ctrl+Mayús+Z)">↷</button><span class="writer-divider"></span><button id="writer-find-button" class="writer-icon" type="button" title="Buscar y reemplazar (Ctrl+F / Ctrl+H)" aria-label="Buscar y reemplazar" aria-expanded="false" aria-controls="writer-find-panel"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg></button><span class="writer-divider"></span><div id="writer-kind-toolbar" class="writer-kind-toolbar" role="group" aria-label="Tipos de texto del guion"></div></div><div class="writer-layout"><aside id="writer-navigation" class="writer-navigation" aria-label="Navegación del guion"><div class="writer-nav-tabs" role="tablist"><button id="writer-scenes-tab" role="tab" aria-selected="true" type="button">Escenas <span id="writer-scene-count">0</span></button><button id="writer-characters-tab" role="tab" aria-selected="false" type="button">Personajes <span id="writer-character-count">0</span></button></div><div id="writer-outline" class="writer-outline"></div><div class="writer-nav-foot">Enter continúa el guion.<br>Tab cambia el elemento.</div></aside><div id="writer-scroll" class="writer-scroll" tabindex="-1"><div id="writer-import-panel" class="writer-import-panel" hidden><p>Abre un guion editable para comenzar.</p></div><nav id="writer-body-navigation" class="writer-part-navigation" aria-label="Volver a la portada" hidden><span>Estás editando el guion.</span><button id="writer-title-tab" type="button" aria-controls="writer-title-paper">Ir a la portada <span aria-hidden="true">↑</span></button></nav><div id="writer-paper-area"><div id="writer-title-paper" class="writer-title-paper"></div><div id="writer-body-paper" class="writer-body-paper" hidden><div id="writer-page-chrome" class="writer-page-chrome" aria-hidden="true"></div><div id="writer-editor-mount"></div></div></div><nav id="writer-title-navigation" class="writer-part-navigation" aria-label="Continuar al guion"><span>Estás editando la página de título.</span><button id="writer-body-tab" type="button" aria-controls="writer-body-paper">Ir al guion <span aria-hidden="true">↓</span></button></nav></div></div><footer class="editor-status writer-status" aria-label="Estado y visualización del guion"><div class="status-info"><span id="writer-page-status">Portada</span><span id="writer-statistics">0 palabras</span><button id="writer-spelling" class="status-proofreading-button" type="button" aria-pressed="true" title="Activar o desactivar el corrector ortográfico del navegador">Español · Ortografía activada</button></div><span id="writer-format-status" class="status-format">Carta · Courier 12 pt</span><span id="writer-save-status" class="status-sync" role="status" aria-live="polite"></span><div class="status-zoom" role="group" aria-label="Zoom del redactor"><button id="writer-zoom-out" type="button" aria-label="Reducir zoom del redactor">−</button><input id="writer-zoom-range" class="status-zoom-range" type="range" min="30" max="250" step="1" value="100" aria-label="Zoom del redactor en porcentaje"><button id="writer-zoom-in" type="button" aria-label="Aumentar zoom del redactor">+</button><select id="writer-zoom" aria-label="Nivel de zoom del redactor"><option value="fit">100%</option><option value=".5">50%</option><option value=".75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select><button id="writer-fit" type="button" title="Ajustar el guion al ancho disponible">Ajustar</button></div></footer>`;
 $('#technical-view').before(host);
 const suggestion=document.createElement('div');suggestion.id='writer-suggestions';suggestion.className='writer-suggestions';suggestion.hidden=true;suggestion.setAttribute('role','listbox');suggestion.setAttribute('aria-label','Sugerencias de guion');document.body.append(suggestion);
 const selected=document.createElement('div');selected.id='writer-selection-actions';selected.className='writer-selection-actions';selected.hidden=true;const markSelection=document.createElement('button');markSelection.type='button';markSelection.textContent='Marcar personaje';selected.append(markSelection);document.body.append(selected);
 const kindKeys={scene:'Mod-Alt-e',action:'Mod-Alt-a',character:'Mod-p',parenthetical:'Mod-Alt-p',dialogue:'Mod-Alt-d',transition:'Mod-Alt-t',insert:'Mod-Alt-i',section:'Mod-Alt-s'};
 const kindIcons={scene:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 15 5-5 5 5 3-3 5 5M16 9h.01"/>',action:'<path d="m4 10 13-5v14L4 14zM4 10H2v4h2m3 1 2 6h4l-2-5M21 8v8"/>',character:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3z"/>',parenthetical:'<path d="M8 3C2 8 2 16 8 21M16 3c6 5 6 13 0 18"/>',dialogue:'<path d="M21 11a9 8 0 0 1-9 8H8l-5 3 1-6a8 8 0 0 1-1-5 9 8 0 0 1 18 0Z"/>',transition:'<path d="M3 7h17m-5-5 5 5-5 5M21 17H4m5-5-5 5 5 5"/>',insert:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8v8H8zM3 12h5m8 0h5"/>',section:'<path d="M4 5h16M4 12h16M4 19h16M8 3v18"/>'};
 const primaryModifier=/Mac|iPhone|iPad/.test(navigator.platform)?'Cmd':'Ctrl';
 for(const [index,[kind,name]]of Object.entries(S.kinds).entries()){
  const button=document.createElement('button');button.type='button';button.className='writer-kind-button';button.dataset.writerKind=kind;button.disabled=true;button.setAttribute('aria-label',name);button.setAttribute('aria-pressed','false');
  const shortcut=kindKeys[kind].replace('Mod',primaryModifier).replaceAll('-','+').replace(/[a-z]$/,letter=>letter.toUpperCase());
  button.title=`${name} · ${shortcut} · Alt+${index+1}`;button.setAttribute('aria-keyshortcuts',kindKeys[kind].replace('Mod',primaryModifier==='Cmd'?'Meta':'Control').replaceAll('-','+')+` Alt+${index+1}`);
  button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${kindIcons[kind]}</svg><span>${name}</span>`;
  button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('click',()=>applyKind(kind));$('#writer-kind-toolbar').append(button);
 }
 markSelection.id='writer-mark-character';markSelection.setAttribute('role','option');markSelection.setAttribute('aria-selected','false');selected.setAttribute('role','listbox');selected.setAttribute('aria-label','Personaje del texto seleccionado');
 function analysis(){if(!analysisCache||analysisCache.id!==draft.id||analysisCache.revision!==draft.revision)analysisCache={id:draft.id,revision:draft.revision,result:S.analyze(draft)};return analysisCache.result;}
 function revision(change){
  if(!draft)return;
  draft.revision++;
  if(draft.sourceLayout&&draft.sourceLayout.revision!==draft.revision)delete draft.sourceLayout;
  const edition=hooks.changed(S.validate(draft),change);
  if(edition!==undefined)draft.edition=edition;
  const stamp=$('#writer-screenplay-edition');
  if(stamp){
   const label='v'+(draft.edition??S.coverDetails(draft).edition);
   if(stamp.textContent!==label)stamp.textContent=label;
  }
 }
 function closeMenus(){suggestion.hidden=true;selected.hidden=true;menu=null;menuIndex=-1;markSelection.setAttribute('aria-selected','false');view?.dom.removeAttribute('aria-activedescendant');view?.dom.setAttribute('aria-expanded','false');}
 function setPart(value){if(value==='title')findTool?.close();part=value;$('#writer-title-paper').hidden=value!=='title';$('#writer-body-paper').hidden=value!=='body';$('#writer-title-navigation').hidden=value!=='title';$('#writer-body-navigation').hidden=value!=='body';closeMenus();syncToolbar();resize();localReview?.refresh();if(value==='body'){view?.focus();menuSuppressed=false;queueMicrotask(updateSuggestions);}}
 let proofreadingEnabled=true;
 function pageStatus(){if(!draft||!layoutCache)return;if(part==='title'){$('#writer-page-status').textContent='Portada';return;}const pos=view?.state.selection.from||1,block=layoutCache.blocks.find(block=>pos>=block.pos&&pos<block.pos+block.size)||layoutCache.blocks.at(-1);let page=0;if(block){const offset=Math.max(0,pos-block.pos-1);for(const line of block.lines){if(line.from>offset)break;page=line.page;}}$('#writer-page-status').textContent=`Página ${page+1} de ${layoutCache.pageCount}`;}
 function resize(){if(!draft||host.hidden)return;if(part==='title')requestAnimationFrame(()=>{for(const input of $('#writer-title-paper').querySelectorAll('textarea')){input.style.height='0px';input.style.height=Math.max(18,input.scrollHeight+2)+'px';}});const width=$('#writer-scroll').clientWidth,setting=$('#writer-zoom').value,zoom=setting==='fit'?Math.min(1.15,Math.max(.3,(width-48)/816)):+setting;$('#writer-paper-area').style.zoom=String(zoom);$('#writer-zoom-range').value=String(Math.round(zoom*100));$('#writer-zoom option[value=fit]').textContent=Math.round(zoom*100)+'%';$('#writer-zoom').title=setting==='fit'?'Ajustado al ancho disponible':'Zoom del redactor';$('#writer-zoom-out').disabled=zoom<=.3;$('#writer-zoom-in').disabled=zoom>=2.5;pageStatus();}
 function setZoom(value){if(!draft)return;const zoom=Math.max(.3,Math.min(2.5,Math.round(value*100)/100)),select=$('#writer-zoom');let option=Array.from(select.options).find(option=>option.value!=='fit'&&Math.abs(Number(option.value)-zoom)<.0001);if(!option){option=select.querySelector('[data-custom-zoom]')||document.createElement('option');option.dataset.customZoom='true';option.value=String(zoom);option.textContent=Math.round(zoom*100)+'%';if(!option.isConnected)select.append(option);}select.value=option.value;closeMenus();resize();}
 function setProofreading(enabled){const next=Boolean(enabled);if(next!==proofreadingEnabled){proofreadingEnabled=next;if(view)view.setProps({attributes:{...view.props.attributes,spellcheck:String(next)}});for(const input of host.querySelectorAll('textarea,input[type=text]'))input.spellcheck=next&&input.inputMode!=='email';localReview?.refresh();}else localReview?.refresh();$('#writer-spelling').setAttribute('aria-pressed',String(next));$('#writer-spelling').textContent=next&&root.PlanoSpelling.mode==='basic'?'Español · Revisión básica':`Español · Ortografía ${next?'activada':'desactivada'}`;}
 new ResizeObserver(resize).observe($('#writer-scroll'));
 function titleInput(value,label,callback,options={}){
  const input=document.createElement(options.multiline?'textarea':'input');if(!options.multiline)input.type='text';input.className=options.className||'';input.value=value;input.setAttribute('aria-label',label);input.placeholder=options.placeholder||label;input.maxLength=options.max||120;input.autocomplete='off';input.spellcheck=options.email?false:proofreadingEnabled;input.dataset.writingReview='native';input.lang='es';if(options.email){input.inputMode='email';input.autocapitalize='none';}input.addEventListener('input',()=>{if(callback){callback(input.value);revision();}if(options.multiline){input.style.height='auto';input.style.height=input.scrollHeight+'px';}});return input;
 }
 function renderTitle(focus){
  const paper=$('#writer-title-paper');paper.replaceChildren();
  const center=document.createElement('div');center.className='writer-title-center';
  const title=titleInput(draft.title,'Título del proyecto',null,{className:'writer-project-title',multiline:true});
  title.id='writer-project-title';
  title.addEventListener('keydown',event=>{
   if(event.isComposing||!['Enter','Escape'].includes(event.key))return;
   event.preventDefault();
   if(event.key==='Escape')title.value=draft.title;
   title.blur();
  });
  title.addEventListener('change',async()=>{
   if(title.value===draft.title)return;
   const id=draft.id;
   title.disabled=true;
   try{await hooks.titleChanged?.(title.value);}
   finally{
    if(draft?.id===id&&title.isConnected){title.value=draft.title;title.disabled=false;resize();}
   }
  });
  center.append(title);
  const by=document.createElement('div');by.className='writer-written-by';const byText=document.createElement('span');byText.textContent='Escrito por';const add=document.createElement('button');add.type='button';add.id='writer-add-author';add.textContent='+';add.title='Añadir autor';add.setAttribute('aria-label','Añadir autor');add.disabled=draft.authors.length>=8;add.addEventListener('click',()=>{const author={id:S.id(),name:'',email:'',phone:'',contact:''};draft.authors.push(author);revision();renderTitle(author.id);});by.append(byText,add);center.append(by);
  const details=S.coverDetails(draft),footer=document.createElement('div'),contacts=document.createElement('div');
  footer.className='writer-title-footer';contacts.className='writer-title-contacts';
  for(const [index,author]of draft.authors.entries()){
   const row=document.createElement('div');row.className='writer-author';const name=titleInput(author.name,`Nombre del autor ${index+1}`,value=>{author.name=value;contactName.textContent=value;},{placeholder:'Nombre del autor'});name.id='writer-author-'+author.id;row.append(name);
   if(draft.authors.length>1){const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Quitar autor '+(index+1));remove.addEventListener('click',()=>{draft.authors.splice(index,1);revision();renderTitle();});row.append(remove);}center.append(row);
   const contact=document.createElement('div');contact.className='writer-author-contact';contact.dataset.authorId=author.id;
   const contactName=document.createElement('strong');contactName.textContent=author.name;
   if(draft.authors.length>1)contact.append(contactName);
   for(const [key,label,max]of [['email','Correo de contacto',254],['phone','Teléfono (opcional)',80],['contact','Otros datos de contacto (opcional)',300]]){
    if(key==='phone'){
     const caption=document.createElement('span');caption.className='writer-contact-caption';caption.textContent='Contacto:';contact.append(caption);
    }
    const input=titleInput(details.contacts[index][key],`${label}, autor ${index+1}`,value=>{
     if(key==='contact'){
      const cover=S.coverDetails(draft);
      draft.copyright??=cover.copyright;
      draft.edition??=cover.edition;
     }
     author[key]=value;
    },{email:key==='email',max,multiline:key==='contact'});
    input.name='writer-contact-'+author.id+'-'+key;input.dataset.authorField=key;contact.append(input);
   }
   contacts.append(contact);
  }
  const stamp=document.createElement('div');stamp.className='writer-title-stamp';
  const copyright=titleInput(details.copyright,'Copyright',value=>draft.copyright=value.replace(/[\u0000-\u001f\u007f]/g,' '),{max:120,placeholder:'Añadir copyright',multiline:true});
  const edition=document.createElement('span');edition.id='writer-screenplay-edition';edition.textContent='v'+details.edition;
  stamp.append(copyright,edition);footer.append(contacts,stamp);
  paper.append(center,footer);
  for(const field of footer.querySelectorAll('textarea'))field.style.height=Math.max(field.scrollHeight,16)+'px';
  if(focus)$('#writer-author-'+focus).focus();
 }
 function chrome(){if(!layoutCache)return;if(view)view.dom.style.minHeight=layoutCache.totalHeight+'px';const parent=$('#writer-page-chrome');while(parent.children.length>layoutCache.pageCount)parent.lastElementChild.remove();for(let page=parent.children.length;page<layoutCache.pageCount;page++){const sheet=document.createElement('div');sheet.className='writer-page-outline';sheet.style.top=page*1084+'px';if(page){const number=document.createElement('span');number.textContent=(page+1)+'.';sheet.append(number);}parent.append(sheet);}}
 function schemaFor(P){return new P.Schema({nodes:{doc:{attrs:{screenplaySyntax:{default:1}},content:'paragraph+'},paragraph:{content:'text*',group:'block',attrs:{kind:{default:'action'},id:{default:null}},parseDOM:[{tag:'p',getAttrs:dom=>({kind:Object.hasOwn(S.kinds,dom.dataset.kind)?dom.dataset.kind:'action',id:S.id()})},{tag:'div',getAttrs:()=>({kind:'action',id:S.id()})}],toDOM:node=>['p',{'data-kind':node.attrs.kind,'data-block-id':node.attrs.id},0]},text:{group:'inline'}},marks:{bold:{parseDOM:[{tag:'strong'},{tag:'b',getAttrs:node=>node.style.fontWeight!=='normal'&&null},{style:'font-weight=700'}],toDOM:()=>['strong',0]},italic:{parseDOM:[{tag:'i'},{tag:'em'}],toDOM:()=>['em',0]},underline:{parseDOM:[{tag:'u'},{style:'text-decoration=underline'}],toDOM:()=>['u',0]},character:{attrs:{name:{}},inclusive:false,parseDOM:[{tag:'span[data-writer-character]',getAttrs:dom=>({name:dom.dataset.writerCharacter.slice(0,80)})}],toDOM:mark=>['span',{'data-writer-character':mark.attrs.name},0]}}});}
 async function prepare(){await Promise.all([!root.PlanoWriterReview?hooks.load('writer-review.js'):null,!root.PlanoWriterFind?hooks.load('writer-find.js'):null]);if(!root.PlanoProseMirror){enginePromise||=hooks.load('vendor/writer-engine.js').catch(error=>{enginePromise=null;throw error;});await enginePromise;}return root.PlanoProseMirror;}
 function pageDecorations(doc,P){
  layoutCache=S.layout(doc.toJSON());const decorations=[];
  const gap=(pos,height,key,continuation=null,left=144)=>P.Decoration.widget(pos,()=>{const span=document.createElement('span');span.className='writer-page-gap';span.style.height=height+'px';span.style.marginLeft=-left+'px';span.dataset.writerGap=key;if(continuation){for(const [text,x,top]of [['(MÁS)',345.6,0],[continuation.speaker,355.2,236]]){const label=document.createElement('span');label.className='writer-continuation';label.textContent=text;label.style.left=x+'px';label.style.top=top+'px';span.append(label);}}return span;},{side:-1,key:'gap-'+key,ignoreSelection:true});
  for(const block of layoutCache.blocks){
   const spec=S.types[block.kind],left=(spec.left-108)*4/3,width=spec.columns*9.6;
   const attributes={style:`margin-left:${left}px;width:${width}px;padding-top:${block.space*16}px;--scene-top:${block.space*16}px;`,class:'writer-paragraph'};
   if(block.sceneNumber)attributes['data-scene-number']=String(block.sceneNumber);
   if(block.kind==='parenthetical'||block.continued){const frame=(text,position,side,key)=>P.Decoration.widget(position,()=>{const span=document.createElement('span');span.className='writer-syntax-frame';span.dataset.generated=key;span.contentEditable='false';span.setAttribute('aria-hidden','true');span.textContent=text;return span;},{side,key:block.id+'-'+key,ignoreSelection:true});if(block.kind==='parenthetical'){decorations.push(frame('(',block.pos+1,-2,'parenthetical-open'),frame(')',block.pos+block.size-1,2,'parenthetical-close'));}else decorations.push(frame(" (CONT'D)",block.pos+block.size-1,2,'continued'));}
   if(!block.text&&block.kind!=='parenthetical')attributes['data-placeholder']=block.kind==='scene'?'INT. / EXT. LUGAR - DÍA / NOCHE':S.kinds[block.kind];
   decorations.push(P.Decoration.node(block.pos,block.pos+block.size,attributes));
   if(block.breakBefore)decorations.push(gap(block.pos,block.before*16+220,block.id+'-before'));
   for(const [index,line]of block.lines.entries())if(index||line.continuation){
    if(line.breakBefore){const decoration=gap(line.pos,line.continuation?252:220,block.id+'-'+index,line.continuation,spec.left*4/3);decorations.push(decoration);}
    else if(block.text[line.from-1]!=='\n')decorations.push(P.Decoration.widget(line.pos,()=>{const br=document.createElement('br');br.className='writer-line-wrap';return br;},{side:-1,key:'wrap-'+block.id+'-'+index,ignoreSelection:true}));
   }
  }
  return P.DecorationSet.create(doc,decorations);
 }
 function paragraph(){return view?.state.selection.$from.parent.type.name==='paragraph'?view.state.selection.$from.parent:null;}
 const foldCharacter=text=>S.canonical(text).normalize('NFD').replace(/\p{M}/gu,'');
 // El autocompletado necesita nombres, no todas las menciones y los diálogos del índice lateral.
 function knownCharacters(){
  if(namesCache?.id===draft.id&&namesCache.revision===draft.revision)return namesCache.names;
  const names=new Map(draft.characters.map(name=>[S.characterKey(name),S.cue(name)])),active=new Map();let speaker='';
  const add=value=>{const name=S.cue(value);if(!name||name.length>80||!/[\p{L}]/u.test(name))return;const key=S.characterKey(name),previous=active.get(key)||names.get(key);if(!previous||name.normalize('NFD').length>name.length&&previous.normalize('NFD').length===previous.length)active.set(key,name);else if(!active.has(key))active.set(key,previous);};
  for(const node of draft.doc.content){const kind=node.attrs.kind;if(kind==='scene')speaker='';if(kind==='character')speaker=S.cue(S.plain(node));else if(kind==='dialogue'&&speaker&&S.plain(node).trim())add(speaker);else if(!['dialogue','parenthetical'].includes(kind))speaker='';for(const mark of S.characterMarks(node))add(mark.name);}
  for(const [key,name]of active)names.set(key,name);
  const list=[...names.values()];namesCache={id:draft.id,revision:draft.revision,names:list};return list;
 }
 function knownCharacter(text){const key=foldCharacter(S.cue(text));return knownCharacters().find(name=>foldCharacter(S.cue(name))===key);}
 function characterMatches(text){const prefix=foldCharacter(text),names=knownCharacters();return names.filter(name=>foldCharacter(name).startsWith(prefix)).sort((a,b)=>Number(foldCharacter(b)===prefix)-Number(foldCharacter(a)===prefix));}
 function applyKind(kind){if(!view||part!=='body'||!Object.hasOwn(S.kinds,kind))return;closeMenus();menuSuppressed=false;const P=root.PlanoProseMirror;P.setBlockType(view.state.schema.nodes.paragraph,{kind,id:paragraph()?.attrs.id||S.id()})(view.state,view.dispatch,view);view.focus();}
 function enter(state,dispatch){
  const P=root.PlanoProseMirror;
  const current=state.selection.$from.parent,cueName=current.attrs.kind==='action'&&state.selection.empty&&state.selection.$from.parentOffset===current.content.size?knownCharacter(current.textContent):null,previous=cueName?'character':current.attrs.kind;
  if(!current.textContent&&previous!=='action'){P.setBlockType(state.schema.nodes.paragraph,{kind:previous==='parenthetical'?'dialogue':'action',id:current.attrs.id})(state,dispatch);return true;}
  const next={scene:'action',character:'parenthetical',parenthetical:'dialogue',dialogue:'action',transition:'scene',insert:'action',section:'action'}[previous]||'action';
  return P.splitBlock(state,tr=>{if(cueName){const start=state.selection.$from.start();tr.setNodeMarkup(start-1,null,{...current.attrs,kind:'character'});tr.removeMark(start,start+current.content.size,state.schema.marks.character);const text=S.cue(current.textContent)===S.canonical(current.textContent)?cueName:S.canonical(current.textContent);tr.insertText(text,start,start+current.content.size);}tr.setNodeMarkup(tr.selection.$from.before(),null,{kind:next,id:S.id()});dispatch(tr);});
 }
 async function mount(token){
  const P=await prepare();if(token!==generation||!draft)return false;const schema=schemaFor(P);analysisCache=null;if(view)view.destroy();
  const pagination=new P.Plugin({state:{init:(_,state)=>pageDecorations(state.doc,P),apply:(tr,value,old,state)=>tr.docChanged?pageDecorations(state.doc,P):value},props:{decorations:state=>pagination.getState(state)}});
  const identities=new P.Plugin({appendTransaction(transactions,old,state){if(!transactions.some(tr=>tr.docChanged))return null;const seen=new Set(),tr=state.tr;state.doc.forEach((node,pos)=>{if(!node.attrs.id||seen.has(node.attrs.id))tr.setNodeMarkup(pos,null,{...node.attrs,id:S.id()});seen.add(node.attrs.id);});return tr.docChanged?tr:null;}});
  // Los nodos de ProseMirror son inmutables: solo se vuelve a medir el párrafo editado.
  const sizes=new WeakMap(),encoder=new TextEncoder(),docBytes=encoder.encode('{"type":"doc","attrs":{"screenplaySyntax":1},"content":[]}').length;
  let sizeWarning=false;
  const limits=new P.Plugin({filterTransaction(tr){if(!tr.docChanged)return true;let chars=0,bytes=docBytes+Math.max(0,tr.doc.childCount-1);tr.doc.forEach(node=>{let size=sizes.get(node);if(!size){size={chars:node.textContent.length,bytes:encoder.encode(JSON.stringify(node.toJSON())).length};sizes.set(node,size);}chars+=size.chars;bytes+=size.bytes;});if(tr.doc.childCount>8000||chars>220000||bytes>300000){sizeWarning=true;$('#writer-save-status').textContent='Este cambio supera el tamaño admitido. El texto anterior se conserva; puedes descargarlo como PDF.';return false;}if(sizeWarning){sizeWarning=false;$('#writer-save-status').textContent=saveMessage;}return true;}});
  findTool=root.PlanoWriterFind.create({P,host,active:()=>Boolean(draft&&view&&!host.hidden),activate:()=>setPart('body'),onOpen:()=>{closeMenus();menuSuppressed=true;localReview?.hide();}});
  localReview=root.PlanoWriterReview.create({P,active:()=>proofreadingEnabled&&!host.hidden&&part==='body',load:()=>hooks.load('vendor/spanish-spelling.js'),characters:()=>knownCharacters(),preferences:()=>hooks.proofreading?.()||{ignored:[]},acceptName:word=>hooks.acceptName?.(word),onOpen:()=>{closeMenus();menuSuppressed=true;},status:text=>{$('#writer-spelling').title='Ortografía y redacción locales · Corrector del navegador'+(text?' · '+text:'');$('#writer-spelling').dataset.reviewStatus=text;if(text.startsWith('Revisión no disponible'))$('#writer-spelling').textContent='Español · Revisión no disponible';else if(text.startsWith('Revisión básica'))$('#writer-spelling').textContent='Español · Revisión básica';else $('#writer-spelling').textContent=`Español · Ortografía ${proofreadingEnabled?'activada':'desactivada'}`;}});
  const bindings={'Mod-b':P.toggleMark(schema.marks.bold),'Mod-i':P.toggleMark(schema.marks.italic),'Mod-u':P.toggleMark(schema.marks.underline),'Mod-z':P.undo,'Shift-Mod-z':P.redo,'Mod-y':P.redo,'Enter':enter,'Shift-Enter':(state,dispatch)=>{dispatch(state.tr.insertText('\n'));return true;},'Tab':()=>{const order=Object.keys(S.kinds),kind=paragraph()?.attrs.kind;applyKind(order[(order.indexOf(kind)+1)%order.length]);return true;},'Shift-Tab':()=>{const order=Object.keys(S.kinds),kind=paragraph()?.attrs.kind;applyKind(order[(order.indexOf(kind)+order.length-1)%order.length]);return true;}};
  for(const [index,kind]of Object.keys(S.kinds).entries())bindings['Alt-'+(index+1)]=()=>{applyKind(kind);return true;};
  for(const [kind,key]of Object.entries(kindKeys))bindings[key]=()=>{applyKind(kind);return true;};
  const characterReferences=new P.Plugin({appendTransaction(transactions,previous,state){if(!transactions.some(tr=>tr.docChanged))return null;const old=new Map();previous.doc.forEach(node=>old.set(node.attrs.id,node));const tr=state.tr;state.doc.forEach((node,pos)=>{if(old.get(node.attrs.id)===node)return;const valid=S.characterMarks(node.toJSON());node.forEach((piece,offset)=>{const mark=piece.marks.find(mark=>mark.type===schema.marks.character);if(mark&&!valid.some(group=>group.from<=offset&&group.to>=offset+piece.nodeSize&&S.characterKey(group.name)===S.characterKey(mark.attrs.name)))tr.removeMark(pos+1+offset,pos+1+offset+piece.nodeSize,schema.marks.character);});});return tr.docChanged?tr:null;}});
  const syntaxFrames=new P.Plugin({appendTransaction(transactions,previous,state){if(!transactions.some(tr=>tr.docChanged)||transactions.every(tr=>tr.getMeta('screenplay-syntax')))return null;const old=new Map();previous.doc.forEach(node=>{if(node.attrs.kind==='parenthetical')old.set(node.attrs.id,node);});const edits=[];state.doc.forEach((node,pos)=>{if(node.attrs.kind!=='character'&&node.attrs.kind!=='parenthetical')return;const text=node.textContent;if(node.attrs.kind==='character'){const range=S.syntaxRange('character',text);if(range.to<text.length)edits.push({pos,node,range});}else if(node.attrs.kind==='parenthetical'&&!(old.get(node.attrs.id)?.attrs.kind==='parenthetical'&&/^\s*\([\s\S]*\)\s*$/.test(old.get(node.attrs.id).textContent))){const range=S.syntaxRange('parenthetical',text);if(range.from||range.to<text.length)edits.push({pos,node,range});}});if(!edits.length)return null;const tr=state.tr;for(const {pos,node,range}of edits.reverse())tr.replaceWith(pos+1,pos+1+node.content.size,node.cut(range.from,range.to).content);return tr.setMeta('screenplay-syntax',true);}});
  view=new P.EditorView($('#writer-editor-mount'),{state:P.EditorState.create({schema,doc:schema.nodeFromJSON(draft.doc),plugins:[limits,identities,characterReferences,syntaxFrames,P.history(),pagination,localReview.plugin,findTool.plugin,P.keymap(bindings),P.keymap(P.baseKeymap)]}),attributes:{class:'writer-editor ProseMirror',spellcheck:String(proofreadingEnabled),lang:'es',role:'textbox','aria-label':'Contenido del guion','aria-multiline':'true','aria-autocomplete':'list','aria-controls':'writer-suggestions writer-selection-actions','aria-expanded':'false'},dispatchTransaction(transaction){
   const beforeDoc=transaction.docChanged?view.state.doc.toJSON():null,result=view.state.applyTransaction(transaction);view.updateState(result.state);
   if(result.transactions.some(tr=>tr.docChanged)){
    draft.doc=view.state.doc.toJSON();revision({beforeDoc,transactions:result.transactions});chrome();clearTimeout(outlineTimer);outlineTimer=setTimeout(renderOutline,180);
   }syncToolbar();queueMicrotask(updateSuggestions);
  },handleKeyDown(editor,event){
   if(paragraph()?.attrs.kind==='parenthetical'&&editor.state.selection.empty&&((event.key==='Backspace'&&editor.state.selection.$from.parentOffset===0)||(event.key==='Delete'&&editor.state.selection.$from.parentOffset===paragraph().content.size)))return true;
   if(event.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return false;
   if(!selected.hidden){
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){markSelection.setAttribute('aria-selected','true');view.dom.setAttribute('aria-activedescendant',markSelection.id);return true;}
    if(event.key==='Enter'&&markSelection.getAttribute('aria-selected')==='true'){markCharacter();return true;}
    if(event.key==='Escape'){closeMenus();menuSuppressed=true;return true;}
   }
   if(menu&&!suggestion.hidden&&['ArrowDown','ArrowUp','Enter','Escape','Tab'].includes(event.key)){
    if(event.key==='Escape'){closeMenus();menuSuppressed=true;return true;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){menuIndex=menuIndex<0?(event.key==='ArrowDown'?0:menu.items.length-1):(menuIndex+(event.key==='ArrowDown'?1:menu.items.length-1))%menu.items.length;renderMenu();return true;}
    if(menuIndex<0){closeMenus();menuSuppressed=true;return false;}
    choose(menu.items[menuIndex]);return true;
   }return false;
  },handleTextInput(editor,from,to,text){const node=paragraph();if(node?.attrs.kind!=='parenthetical')return false;const start=editor.state.selection.$from.start(),end=editor.state.selection.$from.end();if(text==='('&&from===start||text===')'&&to===end)return true;const range=S.syntaxRange('parenthetical',text);if(range.from||range.to<text.length){editor.dispatch(editor.state.tr.insertText(text.slice(range.from,range.to),from,to));return true;}return false;},handleDOMEvents:{pointerdown(editor,event){if(event.target===editor.dom){event.preventDefault();editor.dispatch(editor.state.tr.setSelection(P.TextSelection.atEnd(editor.state.doc)));editor.focus();return true;}return false;},compositionstart(){pendingCompose=true;return false;},compositionend(){pendingCompose=false;setTimeout(updateSuggestions,0);return false;},input(){menuSuppressed=false;return false;}}});
  documentId=draft.id;chrome();renderOutline();syncToolbar();
 }
 function syncToolbar(){
  pageStatus();const editing=Boolean(draft&&view&&part==='body');for(const button of host.querySelectorAll('[data-writer-kind]')){button.disabled=!editing;button.setAttribute('aria-pressed',String(editing&&button.dataset.writerKind===(paragraph()?.attrs.kind||'action')));}for(const button of host.querySelectorAll('[data-writer-mark]')){button.disabled=!editing;if(editing){const mark=view.state.schema.marks[button.dataset.writerMark],selection=view.state.selection,active=selection.empty?mark.isInSet(view.state.storedMarks||selection.$from.marks()):view.state.doc.rangeHasMark(selection.from,selection.to,mark);button.setAttribute('aria-pressed',String(Boolean(active)));}}
  $('#writer-undo').disabled=!editing||!root.PlanoProseMirror.undo(view.state);$('#writer-redo').disabled=!editing||!root.PlanoProseMirror.redo(view.state);
 }
 function positionPopup(node,rect){node.style.left=Math.max(10,Math.min(innerWidth-node.offsetWidth-10,rect.left))+'px';node.style.top=Math.max(10,Math.min(innerHeight-node.offsetHeight-10,rect.bottom+8))+'px';}
 function renderMenu(){suggestion.replaceChildren();for(const [index,item]of menu.items.entries()){const button=document.createElement('button');button.id='writer-suggestion-'+index;button.type='button';button.setAttribute('role','option');button.setAttribute('aria-selected',String(index===menuIndex));button.textContent=item.label;button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('click',()=>choose(item));suggestion.append(button);}suggestion.hidden=false;view.dom.setAttribute('aria-expanded','true');if(menuIndex>=0)view.dom.setAttribute('aria-activedescendant','writer-suggestion-'+menuIndex);else view.dom.removeAttribute('aria-activedescendant');positionPopup(suggestion,view.coordsAtPos(view.state.selection.from));}
 function choose(item){if(!menu||!view)return;const context=menu;closeMenus();menuSuppressed=true;let tr=view.state.tr.insertText(item.value,context.from,context.to);if(item.character){const name=knownCharacter(item.value)||S.canonical(item.value);tr=tr.addMark(context.from,context.from+item.value.length,view.state.schema.marks.character.create({name}));if(!draft.characters.includes(name))draft.characters.push(name);}view.dispatch(tr);view.focus();}
 function updateSuggestions(){
  if(!draft||!view||part!=='body'||host.hidden||pendingCompose||view.composing)return;if(findTool?.isOpen()){closeMenus();return;}
  const {selection}=view.state;if(!selection.empty){closeMenus();if(selection.$from.sameParent(selection.$to)&&selection.to-selection.from<=80&&!view.state.doc.rangeHasMark(selection.from,selection.to,view.state.schema.marks.character)){const text=view.state.doc.textBetween(selection.from,selection.to).trim();if(text&&/\p{L}/u.test(text)){markSelection.textContent=`Marcar personaje «${knownCharacter(text)||text}»`;selected.hidden=false;view.dom.setAttribute('aria-expanded','true');positionPopup(selected,view.coordsAtPos(selection.from));}}return;}
  selected.hidden=true;if(menuSuppressed){closeMenus();return;}
  const node=paragraph();if(!node)return;const text=node.textContent,offset=selection.$from.parentOffset,before=text.slice(0,offset),start=selection.$from.start(),items=[];let from=start,to=start+text.length;
  const fold=foldCharacter,known=knownCharacters();
  if(node.attrs.kind==='scene'){
   if(!before||/^(?:I|IN|INT\.?|E|EX|EXT\.?|INT\.?\/?E?X?T?\.?)$/i.test(before)){for(const value of ['INT. ','EXT. ','INT./EXT. '])if(value.startsWith(before.toUpperCase()))items.push({label:value,value});}
   else if(before.includes(' - ')){from=start+before.lastIndexOf(' - ')+3;const prefix=before.slice(before.lastIndexOf(' - ')+3).toUpperCase();for(const value of ['DÍA','NOCHE','TARDE','MAÑANA','MADRUGADA','AMANECER','ATARDECER','CONTINUO','MÁS TARDE'])if(fold(value).startsWith(fold(prefix))&&value!==prefix)items.push({label:value,value});}
   if(!items.length&&before.length>2)for(const scene of analysis().scenes)if(scene.id!==node.attrs.id&&scene.title.toUpperCase().startsWith(before.toUpperCase())&&scene.title!==before)items.push({label:scene.title,value:scene.title});
  }else if(node.attrs.kind==='character'){const prefix=S.canonical(before);for(const name of known)if(fold(name).startsWith(fold(prefix))&&name!==prefix)items.push({label:name,value:name});}
  else if(node.attrs.kind==='action'){
   if(!/[\p{L}\p{M}'’-]$/u.test(before)||/[\p{L}\p{M}]/u.test(text[offset]||'')){closeMenus();return;}
   const words=[...before.matchAll(/[\p{L}][\p{L}\p{M}'’-]*/gu)].slice(-6);
   for(const word of words){const fragment=before.slice(word.index);if(!/^[\p{L}\p{M}'’ -]+$/u.test(fragment)||fragment.length<2||fragment.length>80)continue;const a=start+word.index,b=start+offset;if(view.state.doc.rangeHasMark(a,b,view.state.schema.marks.character))continue;const matches=characterMatches(fragment);if(matches.length){from=a;to=b;for(const value of matches)items.push({label:`Marcar personaje «${value}»`,value,character:true});break;}}
   if(!items.length){const match=/(?:^|\s)([\p{Lu}][\p{Lu}\p{M}'’-]*(?:[ ][\p{Lu}][\p{Lu}\p{M}'’-]*){0,2})$/u.exec(before);if(match&&match[1].length>=2&&match[1].length<=60){from=start+before.length-match[1].length;to=start+offset;const value=match[1];if(!view.state.doc.rangeHasMark(from,to,view.state.schema.marks.character))items.push({label:`Marcar personaje «${value}»`,value,character:true});}}
  }
  if(!items.length){closeMenus();return;}menu={items:[...new Map(items.map(item=>[item.value,item])).values()].slice(0,8),from,to};menuIndex=-1;renderMenu();
 }
 function jump(id,range){findTool?.close();setPart('body');let pos=-1;view.state.doc.forEach((node,at)=>{if(node.attrs.id===id)pos=at+1;});if(pos<0)return;view.dispatch(view.state.tr.setSelection(root.PlanoProseMirror.TextSelection.create(view.state.doc,pos+(range?.from||0),pos+(range?.to??range?.from??0))));view.focus();const element=view.dom.querySelector(`[data-block-id="${id}"]`);element?.scrollIntoView({behavior:'smooth',block:'center'});if(innerWidth<800)host.classList.remove('writer-panel-mobile-open');closeMenus();}
 function renderOutline(){
  if(!draft||host.hidden)return;const result=analysis(),container=$('#writer-outline');$('#writer-scene-count').textContent=result.scenes.length;$('#writer-character-count').textContent=result.characters.length;container.replaceChildren();
  const item=(text,id,range)=>{const button=document.createElement('button');button.type='button';button.textContent=text;button.addEventListener('click',()=>jump(id,range));return button;};
  if(panel==='scenes')for(const scene of result.scenes){const button=item(scene.title,scene.id),number=document.createElement('span');number.className='writer-scene-number';number.textContent=String(scene.number).padStart(2,'0');button.prepend(number);container.append(button);}
  else for(const character of result.characters){const details=document.createElement('details');details.className='writer-character';const summary=document.createElement('summary');summary.textContent=character.name;const count=document.createElement('small'),mentions=character.mentions.reduce((sum,row)=>sum+(row.ranges?.length||1),0);count.textContent=`${mentions} ${mentions===1?'mención':'menciones'} · ${character.dialogues.length} ${character.dialogues.length===1?'diálogo':'diálogos'}`;summary.append(count);details.append(summary);for(const [label,rows]of [['Menciones',character.mentions],['Diálogos',character.dialogues]])if(rows.length){const title=document.createElement('strong');title.className='writer-reference-heading';title.textContent=label;details.append(title);for(const row of rows){const button=item(row.text,row.id,row.ranges?.[0]);button.title=row.scene;const scene=document.createElement('small');scene.textContent=row.scene;button.prepend(scene);details.append(button);}}if(!character.mentions.length&&!character.dialogues.length){const empty=document.createElement('p');empty.textContent='Sin fragmentos asociados todavía.';details.append(empty);}container.append(details);}
  if(!container.children.length){const empty=document.createElement('p');empty.className='writer-outline-empty';empty.textContent=panel==='scenes'?'Las escenas aparecerán aquí al escribir sus encabezados.':'Los nombres de diálogo y los personajes que marques aparecerán aquí.';container.append(empty);}
  const words=draft.doc.content.reduce((sum,node)=>sum+(S.plain(node).match(/\S+/g)||[]).length,0);$('#writer-statistics').textContent=`${words.toLocaleString('es')} palabras`;
 }
 function markCharacter(){if(!view||view.state.selection.empty)return;const {from,to}=view.state.selection,text=view.state.doc.textBetween(from,to),name=knownCharacter(text)||S.canonical(text);if(!name||name.length>80||!draft.characters.includes(name)&&draft.characters.length>=500||view.state.doc.rangeHasMark(from,to,view.state.schema.marks.character))return;if(!draft.characters.includes(name))draft.characters.push(name);const tr=view.state.tr.addMark(from,to,view.state.schema.marks.character.create({name}));tr.setSelection(root.PlanoProseMirror.TextSelection.create(tr.doc,to));view.dispatch(tr);closeMenus();menuSuppressed=true;view.focus();}
 markSelection.addEventListener('pointerdown',event=>event.preventDefault());markSelection.addEventListener('click',markCharacter);
 for(const button of host.querySelectorAll('[data-writer-mark]')){button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('click',()=>{if(view)root.PlanoProseMirror.toggleMark(view.state.schema.marks[button.dataset.writerMark])(view.state,view.dispatch,view);view?.focus();});}
 $('#writer-find-button').addEventListener('click',()=>findTool?.open());
 $('#writer-undo').addEventListener('click',()=>{if(view)root.PlanoProseMirror.undo(view.state,view.dispatch);view?.focus();});$('#writer-redo').addEventListener('click',()=>{if(view)root.PlanoProseMirror.redo(view.state,view.dispatch);view?.focus();});
 $('#writer-title-tab').addEventListener('click',()=>{setPart('title');requestAnimationFrame(()=>{if(part!=='title'||host.hidden)return;const button=$('#writer-body-tab');$('#writer-title-navigation').scrollIntoView({block:'end'});button.focus({preventScroll:true});});});$('#writer-body-tab').addEventListener('click',()=>{setPart('body');if(view){const P=root.PlanoProseMirror;view.dispatch(view.state.tr.setSelection(P.TextSelection.atStart(view.state.doc)));view.focus();}menuSuppressed=true;closeMenus();$('#writer-scroll').scrollTop=0;});$('#writer-zoom').addEventListener('change',resize);
 $('#writer-zoom-range').addEventListener('input',event=>setZoom(Number(event.target.value)/100));
 for(const [id,delta]of [['#writer-zoom-out',-.1],['#writer-zoom-in',.1]]){$(id).addEventListener('pointerdown',event=>event.preventDefault());$(id).addEventListener('click',()=>setZoom(Number($('#writer-paper-area').style.zoom||1)+delta));}
 $('#writer-fit').addEventListener('click',()=>{$('#writer-zoom').value='fit';resize();});
 $('#writer-spelling').addEventListener('pointerdown',event=>event.preventDefault());$('#writer-spelling').addEventListener('click',()=>hooks.toggleProofreading?.());
 for(const [name,id]of [['scenes','#writer-scenes-tab'],['characters','#writer-characters-tab']])$(id).addEventListener('click',()=>{panel=name;$('#writer-scenes-tab').setAttribute('aria-selected',String(name==='scenes'));$('#writer-characters-tab').setAttribute('aria-selected',String(name==='characters'));renderOutline();});
 $('#writer-panel-toggle').addEventListener('click',()=>{if(innerWidth<800){host.classList.toggle('writer-panel-mobile-open');$('#writer-panel-toggle').setAttribute('aria-expanded',String(host.classList.contains('writer-panel-mobile-open')));}else{host.classList.toggle('writer-panel-closed');$('#writer-panel-toggle').setAttribute('aria-expanded',String(!host.classList.contains('writer-panel-closed')));}resize();});
 let popupFrame=0;
 function positionOpenMenus(){if(popupFrame)return;popupFrame=requestAnimationFrame(()=>{popupFrame=0;if(!view||part!=='body'||suggestion.hidden&&selected.hidden)return;const rect=view.coordsAtPos(view.state.selection.from),bounds=$('#writer-scroll').getBoundingClientRect();if(rect.bottom<bounds.top||rect.top>bounds.bottom){closeMenus();return;}if(!suggestion.hidden)positionPopup(suggestion,rect);if(!selected.hidden)positionPopup(selected,rect);});}
 $('#writer-scroll').addEventListener('scroll',positionOpenMenus,{passive:true});window.addEventListener('resize',positionOpenMenus,{passive:true});
 document.addEventListener('pointerdown',event=>{if(!suggestion.contains(event.target)&&!selected.contains(event.target)&&!view?.dom.contains(event.target))closeMenus();});
  root.PlanoWriter={init(actions){hooks=actions;root.PlanoCloud.subscribe(info=>{const labels={saved:'Guardado en tu cuenta',saving:'Guardando…',pending:'Cambios pendientes',error:'No se ha guardado',conflict:'Conflicto de versiones'};saveMessage=info.error||labels[info.status]||'';$('#writer-save-status').textContent=saveMessage;},{payload:false});},async open(value){
  const token=++generation;
  closeMenus();if(!value)throw Error('El proyecto necesita convertirse a editable antes de abrir el redactor.');$('#writer-format-status').textContent='Carta · Courier 12 pt';
  const next=S.validate(value),fresh=next.id!==initializedId;let replaced=false;$('#writer-import-panel').hidden=true;$('#writer-paper-area').hidden=false;
  if(next.id!==documentId||!view){draft=next;await mount(token);if(token!==generation)return;replaced=true;}else if(next.revision!==draft.revision){draft=next;await mount(token);if(token!==generation)return;replaced=true;}
  if(fresh){renderTitle();setPart('title');initializedId=next.id;if(innerWidth<800)host.classList.add('writer-panel-closed');$('#writer-project-title').focus({preventScroll:true});$('#writer-project-title').select();}else if(replaced){renderTitle();setPart(part);}
  resize();renderOutline();localReview?.refresh();
 },hide(){clearTimeout(outlineTimer);closeMenus();localReview?.hide();findTool?.close();},close(){generation++;analysisCache=null;namesCache=null;closeMenus();clearTimeout(outlineTimer);view?.destroy();localReview=null;findTool=null;view=null;draft=null;documentId='';initializedId='';layoutCache=null;$('#writer-title-paper').replaceChildren();$('#writer-outline').replaceChildren();$('#writer-page-chrome').replaceChildren();$('#writer-save-status').textContent='';},setProofreading,get:()=>draft?S.validate(draft):null,body:()=>setPart('body'),markCharacter,view:()=>view,syncTitle(script){
  if(draft?.id!==script.id)return;
  draft={...draft,title:script.title,revision:script.revision,edition:script.edition,sourceLayout:script.sourceLayout};
  const input=$('#writer-project-title'),stamp=$('#writer-screenplay-edition');
  if(input)input.value=draft.title;
  if(stamp)stamp.textContent='v'+S.coverDetails(draft).edition;
  resize();
 }};
})(globalThis);
