/* Revisión local del cuerpo editable. Decoraciones visuales; nunca modifica el guion. */
(function(root){
 'use strict';
 const fold=text=>text.toLocaleLowerCase('es').normalize('NFC');
 root.PlanoWriterReview={create({P,active,load,characters,preferences,acceptName,onOpen,status}){
  let editor=null,timer=0,controller=null,epoch=0,destroyed=false;
  const cache=new WeakMap(),popup=document.createElement('div');popup.className='writer-review-popup';popup.hidden=true;popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Revisar escritura');document.body.append(popup);
  function hide(){popup.hidden=true;popup.replaceChildren();}
  function cancel(){clearTimeout(timer);controller?.abort();controller=null;epoch++;hide();}
  function publish(issues){if(!editor||destroyed)return;const decorations=issues.map((issue,index)=>P.Decoration.inline(issue.from,issue.to,{class:'writer-review-issue writer-review-'+issue.kind,'data-writer-issue':String(index),'aria-label':issue.message}));editor.dispatch(editor.state.tr.setMeta(plugin,{issues,decorations:P.DecorationSet.create(editor.state.doc,decorations)}).setMeta('addToHistory',false));}
  async function scan(){
   if(!editor||destroyed||!active()||root.PlanoTestDisableSpelling)return;
   const doc=editor.state.doc,token=epoch,job=new AbortController();controller=job;const blocks=[],missing=[];let speaker='';
   const selected=doc.resolve(editor.state.selection.from).parent;
   doc.forEach((node,pos)=>{const kind=node.attrs.kind;if(kind==='character'){speaker=node.textContent;return;}if(!['dialogue','parenthetical'].includes(kind))speaker='';if(!node.textContent.trim())return;const entry={node,pos,kind,speaker};blocks.push(entry);if(!cache.has(node)||cache.get(node).speaker!==speaker||cache.get(node).mode!==root.PlanoSpelling.cacheKey){node===selected?missing.unshift(entry):missing.push(entry);}});
   let lastPublished=0,finished=0;
   function display(final){
    if(token!==epoch||job.signal.aborted||destroyed||!active()||editor.state.doc!==doc)return;
    const names=new Set(characters().flatMap(name=>name.match(/[\p{L}\p{M}]+/gu)||[]).map(fold)),ignored=new Set(preferences().ignored||[]),issues=[];
    for(const {node,pos,speaker}of blocks){const entry=cache.get(node);if(entry?.speaker!==speaker)continue;for(const raw of entry.issues){
     const from=pos+1+raw.start,to=pos+1+raw.end,text=node.textContent.slice(raw.start,raw.end);
     if(ignored.has(raw.key)||raw.kind==='spelling'&&(names.has(fold(text))||doc.rangeHasMark(from,to,editor.state.schema.marks.character)))continue;
     issues.push({...raw,text,from,to});
    }}
    publish(issues);status(final?[root.PlanoSpelling.notice,issues.length?`${issues.length} ${issues.length===1?'aviso':'avisos'} de escritura`:'Sin avisos de escritura'].filter(Boolean).join(' · '):`Revisando escritura… ${finished}/${missing.length}`);
   }
   status('Revisando escritura…');
   try{
    if(missing.length){const store=(i,issues)=>cache.set(missing[i].node,{speaker:missing[i].speaker,issues,mode:root.PlanoSpelling.cacheKey});const results=await root.PlanoSpelling.checkBlocks(missing.map(({node,kind,speaker})=>({text:node.textContent,kind,speaker})),{load,signal:job.signal,onProgress(i,issues){store(i,issues);finished++;const now=performance.now();if(now-lastPublished>160){lastPublished=now;display(false);}}});for(let i=0;i<missing.length;i++)store(i,results[i]);}
    if(token!==epoch||job.signal.aborted||destroyed||!active()||editor.state.doc!==doc)return;
    display(true);
   }catch(error){if(error.name!=='AbortError'&&token===epoch&&!destroyed){status('Revisión no disponible · vuelve a activar la ortografía');}}
   finally{if(controller===job)controller=null;}
  }
  function refresh(){cancel();if(!editor||destroyed)return;if(!active()){if(plugin.getState(editor.state).issues.length)publish([]);status('');return;}if(!root.PlanoTestDisableSpelling)timer=setTimeout(scan,450);}
  function action(text,run){const button=document.createElement('button');button.type='button';button.textContent=text;button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('click',run);return button;}
  async function open(issue,target){
   cancel();onOpen();const token=epoch,doc=editor.state.doc,title=document.createElement('strong'),description=document.createElement('span'),options=document.createElement('div');popup.dataset.kind=issue.kind;title.textContent=issue.text;description.textContent=issue.message;options.className='writer-review-options';popup.append(title,description,options);popup.hidden=false;
   const close=action('Cerrar',hide);close.className='writer-review-close';popup.append(close);const rect=target.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(innerWidth-popup.offsetWidth-8,rect.left))+'px';popup.style.top=Math.max(8,Math.min(innerHeight-popup.offsetHeight-8,rect.bottom+7))+'px';
   const apply=value=>{if(editor.state.doc!==doc||!active()){hide();return;}const replacement=issue.kind==='punctuation'?value:root.PlanoLanguageReview.preserveCase(value,issue.text);editor.dispatch(editor.state.tr.insertText(replacement,issue.from,issue.to));hide();editor.focus();};
   if(issue.replacement!==undefined){for(const value of issue.suggestions?.length?issue.suggestions:[issue.replacement])options.append(action(value===''?`Eliminar «${issue.text}»`:`Usar «${value}»`,()=>apply(value)));return;}
   if(issue.kind!=='spelling')return;
   if(acceptName&&/^\p{Lu}/u.test(issue.text)){
    const accept=action('Aceptar como nombre propio',()=>{if(editor.state.doc!==doc||!active())return;if(acceptName(issue.text)){refresh();editor.focus();}else{description.textContent='No se pudo guardar el nombre. Comprueba el guardado del proyecto o el límite de palabras aceptadas.';}});accept.className='writer-review-accept';popup.insertBefore(accept,close);
   }
   const job=new AbortController();controller=job;
   try{const result=issue.suggestions?.length?[issue]:await root.PlanoSpelling.checkText(issue.text,{load,signal:job.signal});if(token!==epoch||destroyed||popup.hidden||editor.state.doc!==doc)return;for(const value of result.find(item=>item.kind==='spelling')?.suggestions?.slice(0,5)||[])options.append(action(value,()=>apply(value)));if(!options.children.length)options.textContent='Sin sugerencias disponibles.';}catch(error){if(token===epoch&&error.name!=='AbortError')options.textContent='No se pudieron cargar las sugerencias.';}
   finally{if(controller===job)controller=null;}
  }
  function outside(event){if(!popup.contains(event.target)&&!event.target.closest('[data-writer-issue]'))hide();}
  const plugin=new P.Plugin({state:{init:()=>({issues:[],decorations:P.DecorationSet.empty}),apply(tr,value){const result=tr.getMeta(plugin);if(result)return result;if(!tr.docChanged)return value;const issues=value.issues.flatMap(issue=>{const from=tr.mapping.map(issue.from,1),to=tr.mapping.map(issue.to,-1);return from<to&&tr.doc.textBetween(from,to)===issue.text?[{...issue,from,to}]:[];});return{issues,decorations:P.DecorationSet.create(tr.doc,issues.map((issue,index)=>P.Decoration.inline(issue.from,issue.to,{class:'writer-review-issue writer-review-'+issue.kind,'data-writer-issue':String(index),'aria-label':issue.message}))) };}},props:{decorations:state=>plugin.getState(state).decorations,handleClick(view,pos,event){const target=event.target.closest('[data-writer-issue]');if(!target)return false;const issue=plugin.getState(view.state).issues[Number(target.dataset.writerIssue)];if(!issue)return false;open(issue,target);return false;},handleKeyDown(view,event){if(event.key==='Escape'&&!popup.hidden){hide();return true;}return false;}},view(view){editor=view;document.addEventListener('pointerdown',outside);refresh();return{update(view,previous){if(view.state.doc!==previous.doc)refresh();},destroy(){destroyed=true;cancel();document.removeEventListener('pointerdown',outside);popup.remove();editor=null;}};}});
  return{plugin,refresh,hide:cancel};
 }};
})(globalThis);
