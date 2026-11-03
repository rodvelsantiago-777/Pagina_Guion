/* Revisión local del cuerpo editable. Decoraciones visuales; nunca modifica el guion. */
(function(root){
 'use strict';
 const fold=text=>text.toLocaleLowerCase('es').normalize('NFC');
 const lowercase=text=>text.replace(/\p{Lu}/gu,char=>{const value=char.toLocaleLowerCase('es');return value.length===char.length?value:char;});
 root.PlanoWriterReview={create({P,active,load,characters,preferences,onOpen,status}){
  let editor=null,timer=0,controller=null,epoch=0,destroyed=false;
  const cache=new WeakMap(),popup=document.createElement('div');popup.className='writer-review-popup';popup.hidden=true;popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Revisar escritura');document.body.append(popup);
  function hide(){popup.hidden=true;popup.replaceChildren();}
  function cancel(){clearTimeout(timer);controller?.abort();controller=null;epoch++;hide();}
  function publish(issues){if(!editor||destroyed)return;const decorations=issues.map((issue,index)=>P.Decoration.inline(issue.from,issue.to,{class:'writer-review-issue writer-review-'+issue.kind,'data-writer-issue':String(index),'aria-label':issue.message}));editor.dispatch(editor.state.tr.setMeta(plugin,{issues,decorations:P.DecorationSet.create(editor.state.doc,decorations)}).setMeta('addToHistory',false));}
  async function scan(){
   if(!editor||destroyed||!active()||root.PlanoTestDisableSpelling)return;
   const doc=editor.state.doc,token=epoch,job=new AbortController();controller=job;const blocks=[],missing=[];
   doc.forEach((node,pos)=>{if(!['action','dialogue','parenthetical'].includes(node.attrs.kind)||!node.textContent.trim())return;const entry={node,pos};blocks.push(entry);if(!cache.has(node))missing.push(entry);});
   status('Revisando escritura…');
   try{
    if(missing.length){const results=await root.PlanoSpelling.checkBlocks(missing.map(({node})=>lowercase(node.textContent)),{load,signal:job.signal});for(let i=0;i<missing.length;i++)cache.set(missing[i].node,results[i]);}
    if(token!==epoch||job.signal.aborted||destroyed||!active()||editor.state.doc!==doc)return;
    const names=new Set(characters().flatMap(name=>name.match(/[\p{L}\p{M}]+/gu)||[]).map(fold)),ignored=new Set(preferences().ignored||[]),issues=[];
    for(const {node,pos}of blocks)for(const raw of cache.get(node)||[]){
     const from=pos+1+raw.start,to=pos+1+raw.end,text=node.textContent.slice(raw.start,raw.end);
     if(ignored.has(raw.key)||raw.kind==='spelling'&&names.has(fold(text))||doc.rangeHasMark(from,to,editor.state.schema.marks.character))continue;
     issues.push({...raw,text,from,to});
    }
    publish(issues);status(issues.length?`${issues.length} ${issues.length===1?'aviso':'avisos'} de escritura`:'Sin avisos de escritura');
   }catch(error){if(error.name!=='AbortError'&&token===epoch&&!destroyed){status('Revisión no disponible · vuelve a activar la ortografía');}}
   finally{if(controller===job)controller=null;}
  }
  function refresh(){cancel();if(!editor||destroyed)return;if(!active()){if(plugin.getState(editor.state).issues.length)publish([]);status('');return;}if(!root.PlanoTestDisableSpelling)timer=setTimeout(scan,450);}
  function action(text,run){const button=document.createElement('button');button.type='button';button.textContent=text;button.addEventListener('pointerdown',event=>event.preventDefault());button.addEventListener('click',run);return button;}
  async function open(issue,target){
   cancel();onOpen();const token=epoch,doc=editor.state.doc,title=document.createElement('strong'),description=document.createElement('span'),options=document.createElement('div');title.textContent=issue.text;description.textContent=issue.message;options.className='writer-review-options';popup.append(title,description,options);popup.hidden=false;
   const close=action('Cerrar',hide);close.className='writer-review-close';popup.append(close);const rect=target.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(innerWidth-popup.offsetWidth-8,rect.left))+'px';popup.style.top=Math.max(8,Math.min(innerHeight-popup.offsetHeight-8,rect.bottom+7))+'px';
   const apply=value=>{if(editor.state.doc!==doc||!active()){hide();return;}let replacement=value;if(issue.text[0]===issue.text[0].toLocaleUpperCase('es'))replacement=replacement[0].toLocaleUpperCase('es')+replacement.slice(1);editor.dispatch(editor.state.tr.insertText(replacement,issue.from,issue.to));hide();editor.focus();};
   if(issue.replacement){options.append(action(`Usar «${issue.replacement}»`,()=>apply(issue.replacement)));return;}
   if(issue.kind!=='spelling')return;
   const job=new AbortController();controller=job;
   try{const result=await root.PlanoSpelling.checkText(lowercase(issue.text),{load,signal:job.signal});if(token!==epoch||destroyed||popup.hidden||editor.state.doc!==doc)return;for(const value of result[0]?.suggestions?.slice(0,5)||[])options.append(action(value,()=>apply(value)));if(!options.children.length)options.textContent='Sin sugerencias disponibles.';}catch(error){if(token===epoch&&error.name!=='AbortError')options.textContent='No se pudieron cargar las sugerencias.';}
   finally{if(controller===job)controller=null;}
  }
  function outside(event){if(!popup.contains(event.target)&&!event.target.closest('[data-writer-issue]'))hide();}
  const plugin=new P.Plugin({state:{init:()=>({issues:[],decorations:P.DecorationSet.empty}),apply(tr,value){const result=tr.getMeta(plugin);if(result)return result;if(!tr.docChanged)return value;const issues=value.issues.flatMap(issue=>{const from=tr.mapping.map(issue.from,1),to=tr.mapping.map(issue.to,-1);return from<to&&tr.doc.textBetween(from,to)===issue.text?[{...issue,from,to}]:[];});return{issues,decorations:P.DecorationSet.create(tr.doc,issues.map((issue,index)=>P.Decoration.inline(issue.from,issue.to,{class:'writer-review-issue writer-review-'+issue.kind,'data-writer-issue':String(index),'aria-label':issue.message}))) };}},props:{decorations:state=>plugin.getState(state).decorations,handleClick(view,pos,event){const target=event.target.closest('[data-writer-issue]');if(!target)return false;const issue=plugin.getState(view.state).issues[Number(target.dataset.writerIssue)];if(!issue)return false;open(issue,target);return false;},handleKeyDown(view,event){if(event.key==='Escape'&&!popup.hidden){hide();return true;}return false;}},view(view){editor=view;document.addEventListener('pointerdown',outside);refresh();return{update(view,previous){if(view.state.doc!==previous.doc)refresh();},destroy(){destroyed=true;cancel();document.removeEventListener('pointerdown',outside);popup.remove();editor=null;}};}});
  return{plugin,refresh,hide:cancel};
 }};
})(globalThis);
