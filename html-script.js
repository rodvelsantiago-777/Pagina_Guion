/* HTML de escritura. El archivo se lee en una plantilla inerte y nunca se inserta en la aplicación. */
(function(root){
  'use strict';
  const S=root.PlanoScreenplay,maxBytes=5*1024*1024;
  const aliases={scene:['scene','slugline','sceneheading','sceneheader','escena'],action:['action','accion','scenedescription'],character:['character','editdialogname','personaje'],parenthetical:['parenthetical','editdialogparen','parentesis','acotacion'],dialogue:['dialogue','dialog','editdialogcontent','dialogo'],transition:['transition','transicion'],insert:['shot','insert','inserto'],section:['section','sequence','seccion','act','endact']};
  const norm=text=>(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const coverTypes=new Set(['title','titulo','author','autor','address','email','phone','copyright','contact','contactname','writtenby']);
  const dangerous='script,style,link,iframe,frame,frameset,object,embed,applet,template,noscript,svg,math,canvas,img,picture,video,audio,source,track,base,form,input,button,select,textarea';
  const extras='.pdf_extra,.scene_num,.page_num,.skeletonPlus,.split_character_name,[data-layout-only],.comment,.comments,.annotations,[data-type="Note"],[data-type="Image"]';
  const blockTags=new Set(['P','DIV','H1','H2','H3','H4','H5','H6','LI','PRE','BLOCKQUOTE','TD','TH','SECTION','ARTICLE','MAIN','HEADER','FOOTER']);
  const properties=['font-weight','font-style','text-decoration','text-decoration-line','text-transform','text-align','margin-left','text-indent','white-space','display','visibility','break-before','page-break-before'];
  const scene=text=>/^(?:(?:ESCENA|SCENE)\s*)?(?:\d+[A-Z]?[.)]?\s*)?(?:INT\.?\s*[/.-]\s*EXT\.?|EXT\.?\s*[/.-]\s*INT\.?|INT\.?|EXT\.?|I\/E\.?)\s/i.test(text);
  function typeOf(element){const values=[element.getAttribute('data-kind'),element.getAttribute('data-type'),...element.classList].filter(Boolean).map(value=>norm(value.replace(/^screeny-/i,'')));for(const value of values)for(const [kind,names]of Object.entries(aliases))if(names.includes(value))return kind;return null;}
  function cssReader(fragment,enabled){
    const rules=[],cache=new WeakMap();
    if(enabled&&root.CSSStyleSheet){
      for(const tag of fragment.querySelectorAll('style')){
        try{const sheet=new CSSStyleSheet();sheet.replaceSync(tag.textContent);function scan(list){for(const rule of list){if(rules.length>=3000)break;if(rule.type===1&&rule.selectorText.length<300){const values={};for(const key of properties){const value=rule.style.getPropertyValue(key);if(value)values[key]=value;}if(Object.keys(values).length)rules.push({selector:rule.selectorText,values});}else if(rule.type===4&&/^(?:all|print)(?:\s|$)/.test(rule.conditionText))scan(rule.cssRules);}}scan(sheet.cssRules);}catch{/* El estilo visual no impide recuperar el texto. */}
      }
    }
    function get(element){if(cache.has(element))return cache.get(element);const value={};for(const rule of rules){try{if(element.matches(rule.selector))Object.assign(value,rule.values);}catch{}}
      for(const key of properties){const inline=element.style?.getPropertyValue(key);if(inline)value[key]=inline;}cache.set(element,value);return value;}
    return get;
  }
  function sliceRuns(runs,start,end){let offset=0;return runs.flatMap(run=>{const a=Math.max(0,start-offset),b=Math.min(run.text.length,end-offset);offset+=run.text.length;return b>a?[{...run,text:run.text.slice(a,b)}]:[];});}
  function mergeRuns(runs){const result=[];for(const run of runs){if(!run.text)continue;const last=result.at(-1);if(last&&JSON.stringify(last.marks||[])===JSON.stringify(run.marks||[]))last.text+=run.text;else result.push({...run});}return result;}
  function runsFrom(nodes,element,css,pre,own){
    const runs=[];let count=0;
    function append(text,format,explicit=false){if(!text)return;if(!pre&&!explicit)text=text.replace(/[\t\r\n\f ]+/g,' ');if(format.transform==='uppercase')text=text.toLocaleUpperCase('es');else if(format.transform==='lowercase')text=text.toLocaleLowerCase('es');count+=text.length;if(count>220000)throw Error('Un párrafo HTML supera el tamaño admitido.');const marks=['bold','italic','underline'].filter(key=>format[key]).map(type=>({type}));if(format.character)marks.push({type:'character',attrs:{name:S.canonical(format.character)}});runs.push({type:'text',text,...(marks.length?{marks}:{})});}
    function formatFor(node,parent){const value={...parent},style=css(node),tag=node.tagName;if(['B','STRONG'].includes(tag)||node.classList.contains('format_b'))value.bold=true;if(['I','EM'].includes(tag)||node.classList.contains('format_i'))value.italic=true;if(tag==='U'||node.classList.contains('format_u'))value.underline=true;
      if(!own||node!==element){if(style['font-weight'])value.bold=/bold|bolder/.test(style['font-weight'])||Number(style['font-weight'])>=600;if(style['font-style'])value.italic=/italic|oblique/.test(style['font-style']);const decoration=style['text-decoration-line']||style['text-decoration'];if(decoration)value.underline=decoration.includes('underline');}
      const reference=node.getAttribute('data-character');if(reference&&reference.length<=80)value.character=reference;
      if(!own&&style['text-transform'])value.transform=style['text-transform'];
      return value;
    }
    function walk(node,format,depth){if(depth>256)throw Error('El HTML tiene demasiados niveles anidados.');if(node.nodeType===3){append(node.nodeValue,format);return;}if(node.nodeType!==1)return;
      const style=css(node);if(node.hidden||node.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden'||node.matches(dangerous+','+extras))return;
      if(node.tagName==='BR'){if(!node.hasAttribute('data-soft-break'))append('\n',format,true);return;}
      const next=formatFor(node,format);for(const child of node.childNodes)walk(child,next,depth+1);
    }
    const ancestors=[];for(let current=element;current;current=current.parentElement)ancestors.unshift(current);let format={};for(const current of ancestors)format=formatFor(current,format);for(const node of nodes)walk(node,format,0);
    if(!pre){let space=false;for(const run of runs){if(space&&run.text.startsWith(' '))run.text=run.text.slice(1);if(run.text)space=run.text.endsWith(' ');}}
    let merged=mergeRuns(runs);
    if(!pre){let text=merged.map(r=>r.text).join(''),start=text.search(/\S/);if(start<0)return[];merged=sliceRuns(merged,start,text.trimEnd().length);}
    return merged;
  }
  function cover(rows,fallback,user){
    const titleRow=rows.find(row=>['title','titulo'].includes(row.rawType))||rows.find(row=>row.text),title=titleRow?.text||fallback,authors=[];let naming=false,contacts=false,active=0;
    for(const row of rows){const text=row.text;if(!text||row===titleRow)continue;
      if(/^(?:escrito por|written by|guion de|by)\s*:?$/i.test(text)){naming=true;continue;}
      const existing=authors.findIndex(a=>a.name===text);if(existing>=0){active=existing;contacts=true;continue;}
      const email=text.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/),phone=/^\+?[\d\s().-]{7,}$/.test(text),label=/^(?:contacto|contact|e-?mail|correo(?: electr[oó]nico)?|tel[eé]fono)\s*:?$/i.test(text);
      if(email||phone||label||/^(?:copyright|©|v\d|versi[oó]n)/i.test(text))contacts=true;
      if(['author','autor'].includes(row.rawType)||naming&&!contacts){authors.push({id:S.id(),name:text,email:'',phone:'',contact:''});continue;}
      if(!authors.length)authors.push({id:S.id(),name:user.name||'',email:'',phone:'',contact:''});if(label)continue;
      if(email)authors[active].email=email[0];else if(phone)authors[active].phone=text;else authors[active].contact+=(authors[active].contact?'\n':'')+text;
    }
    if(!authors.length)authors.push({id:S.id(),name:user.name||'',email:user.email||'',phone:'',contact:''});return{title,authors};
  }
  function parse(html,{name='Sin título.html',user={}}={}){
    if(typeof html!=='string'||!html.length||html.length>maxBytes)throw Error('Selecciona un HTML con texto de hasta 5 MB.');
    if(!/<(?:html|body|p|div|h[1-6]|section|pre|article|main)\b/i.test(html))throw Error('El archivo no contiene un guion HTML válido.');
    // No hay browsing context: tampoco se solicitan imágenes, hojas de estilo o iframes.
    const template=document.createElement('template');template.innerHTML=html;const fragment=template.content;
    if(fragment.querySelectorAll('*').length>50000)throw Error('El HTML contiene demasiados elementos.');
    const title=fragment.querySelector('title')?.textContent.trim(),registry=fragment.querySelector('meta[name="screenplay-characters"]')?.getAttribute('content');
    const writer=Boolean(fragment.querySelector('.edit_lines.scene_object')),own=Boolean(fragment.querySelector('[data-screenplay="1"]')),css=cssReader(fragment,!writer);
    fragment.querySelectorAll(dangerous+','+extras+',meta,title').forEach(node=>node.remove());
    const rows=[];
    function add(element,nodes=Array.from(element.childNodes)){
      if(rows.length>=12000)throw Error('El HTML contiene demasiados párrafos.');
      for(let current=element;current;current=current.parentElement){const props=css(current);if(current.hidden||current.getAttribute('aria-hidden')==='true'||props.display==='none'||props.visibility==='hidden')return;}
      const style=css(element);if(element.hidden||element.getAttribute('aria-hidden')==='true'||style.display==='none'||style.visibility==='hidden')return;
      const rawType=norm(element.getAttribute('data-type')||Array.from(element.classList).find(c=>/^screeny-/i.test(c))?.replace(/^screeny-/i,'')||(/Title|Titulo/i.test(element.className)?'Title':''));
      const kind=typeOf(element),pre=writer||own&&element.hasAttribute('data-preserve')||element.tagName==='PRE'||/^pre/.test(style['white-space']||'');
      let runs=runsFrom(nodes,element,css,pre,own),text=runs.map(r=>r.text).join('');if(!text.trim()&&!(own&&kind))return;
      if(writer){runs=sliceRuns(runs,text.length-text.trimStart().length,text.trimEnd().length);text=runs.map(r=>r.text).join('');}
      const key=own?element.getAttribute('data-block'):writer?element.getAttribute('data-line-id'):null,last=rows.at(-1);
      if(key&&last?.key===key&&kind===last.kind){if(own)last.runs=mergeRuns([...last.runs,...runs]);else if(last.text!==text)last.runs=mergeRuns([...last.runs,{type:'text',text:' '},...runs]);last.text=last.runs.map(r=>r.text).join('');return;}
      rows.push({element,runs,text,kind,rawType,key,cover:Boolean(element.closest('.title_page_with_content,.title-page,[data-title-page]')),align:style['text-align']|| (element.classList.contains('align_right')?'right':element.classList.contains('align_center')?'center':''),left:style['margin-left']||'',pageBreak:/page|always/.test(style['break-before']||style['page-break-before']||'')});
    }
    if(writer){for(const el of fragment.querySelectorAll('.edit_lines.scene_object'))add(el);}
    else if(own){for(const el of fragment.querySelectorAll('[data-type],[data-kind]'))if(typeOf(el)||coverTypes.has(norm(el.getAttribute('data-type'))))add(el);}
    else{
      function flow(container,depth=0){if(depth>256)throw Error('El HTML tiene demasiados niveles anidados.');let pending=[];const flush=()=>{if(pending.length){add(container,pending);pending=[];}};
        for(const node of container.childNodes){if(node.nodeType===1&&blockTags.has(node.tagName)){flush();const nested=Array.from(node.children).some(child=>blockTags.has(child.tagName));if(nested)flow(node,depth+1);else add(node);}else pending.push(node);}flush();}
      const wrapper=fragment.ownerDocument.createElement('div');while(fragment.firstChild)wrapper.append(fragment.firstChild);flow(wrapper);
    }
    if(!rows.length)throw Error('El HTML no contiene texto de guion.');
    const firstScene=rows.findIndex(r=>r.kind==='scene'||scene(r.text)),firstBody=rows.findIndex(r=>r.kind),label=rows.findIndex(r=>/^(?:escrito por|written by|guion de|by)\s*:?$/i.test(r.text)),hasCover=rows.some(r=>r.cover||['title','titulo'].includes(r.rawType))||label>=0&&(firstScene<0||label<firstScene);
    let start=0;if(hasCover){const outside=rows.findIndex((r,i)=>i>0&&!r.cover&&rows[0].cover);start=outside>=0?outside:firstScene>=0?firstScene:firstBody>=0?firstBody:rows.length;}
    const fallback=(title||name.replace(/\.html?$/i,'')||'Sin título'),portada=hasCover?cover(rows.slice(0,start),fallback,user):{title:fallback,authors:S.create(fallback,user).authors},script=S.create(portada.title,user);script.title=portada.title;script.authors=portada.authors;
    let previous='';const nodes=[];
    for(const row of rows.slice(start)){
      let kind=row.kind,text=row.text,runs=row.runs;
      if(/^(?:INSERT|INSERTO|VOLVEMOS A ESCENA|BACK TO SCENE)\b/i.test(text))kind='insert';else if(scene(text))kind='scene';
      if(!kind){if(/^(?:CORTE A(?: NEGRO)?|FUNDIDO(?: A NEGRO)?|FADE (?:IN|OUT)|CUT TO|DISSOLVE TO|FIN|THE END)\s*[:.!]?$/i.test(text)||row.align==='right')kind='transition';else if(/^\(.*\)$/s.test(text))kind='parenthetical';else{const left=parseFloat(row.left)||0,indent=/in$/.test(row.left)?left*72:/cm$/.test(row.left)?left*28.35:/mm$/.test(row.left)?left*2.835:/px$/.test(row.left)?left*.75:left;
          if(indent>=130&&text===text.toLocaleUpperCase('es')&&text.length<100)kind='character';else if(indent>=40&&['character','parenthetical','dialogue'].includes(previous))kind='dialogue';else kind='action';}}
      if(!own&&S.types[kind].upper)runs=runs.map(run=>({...run,text:run.text.toLocaleUpperCase('es')}));
      nodes.push({type:'paragraph',attrs:{id:S.id(),kind},...(runs.length?{content:runs}:{})});previous=kind;
    }
    if(nodes.length)script.doc.content=nodes;else if(!hasCover)throw Error('El HTML no contiene texto de guion.');
    if(own&&registry){let names;try{names=JSON.parse(registry);}catch{throw Error('La lista de personajes del HTML no es válida.');}if(!Array.isArray(names)||names.length>500)throw Error('La lista de personajes del HTML no es válida.');script.characters=names;}
    return S.validate(script);
  }
  function decode(bytes){
    if(!bytes.length||bytes.length>maxBytes)throw Error('Selecciona un HTML con texto de hasta 5 MB.');let encoding='utf-8';
    if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';
    else{const prefix=new TextDecoder('windows-1252').decode(bytes.subarray(0,4096)),declared=/<meta\b[^>]*charset\s*=\s*["']?\s*([\w-]+)/i.exec(prefix);if(declared)encoding=declared[1];}
    try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{if(encoding!=='utf-8')throw Error('La codificación del HTML no es compatible o está dañada.');return new TextDecoder('windows-1252').decode(bytes);}
  }
  async function read(file,options={}){if(!file.size||file.size>maxBytes)throw Error('Selecciona un HTML con texto de hasta 5 MB.');return parse(decode(new Uint8Array(await file.arrayBuffer())),{name:file.name,...options});}
  const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function inline(runs){return runs.map(run=>{let text=escape(run.text).replace(/\n/g,'<br>');for(const mark of run.marks||[])text=mark.type==='bold'?'<strong>'+text+'</strong>':mark.type==='italic'?'<em>'+text+'</em>':mark.type==='underline'?'<u>'+text+'</u>':mark.type==='character'?'<span data-character="'+escape(mark.attrs.name)+'">'+text+'</span>':text;return text;}).join('');}
  function write(value){
    const script=S.forExport(value);if(!script)throw Error('No hay un guion para exportar.');
    const css=`@page{size:letter;margin:0}*{box-sizing:border-box}html{background:#e8e8e8;color:#000}body{margin:0;font:12pt/12pt "Courier New",Courier,monospace}.document{width:8.5in;margin:24px auto}.sheet{position:relative;width:8.5in;height:11in;margin-bottom:24px;background:#fff;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.cover{display:flex;flex-direction:column;min-height:11in;height:auto;padding:1in 1in 1in 1.5in}.title-area{padding-top:2.5in;text-align:center}.title-area h1{font:700 12pt/12pt "Courier New",Courier,monospace;margin:0 0 24pt;white-space:pre-wrap;overflow-wrap:anywhere}.title-area p{margin:0 0 12pt;white-space:pre-wrap;overflow-wrap:anywhere}.contacts{margin-top:auto;padding-top:24pt;white-space:pre-wrap;overflow-wrap:anywhere}.contacts p{margin:0}.contact-group+.contact-group{margin-top:12pt}.script-block{position:absolute;margin:0;line-height:12pt;white-space:pre-wrap;overflow-wrap:anywhere;overflow:hidden}.scene,.section{font-weight:bold}.page-number{position:absolute;right:1in;top:.5in}.scene-number{position:absolute;font-weight:bold}.virtual{position:absolute;white-space:pre;margin:0}@media print{html,body{background:#fff}.document{width:8.5in;margin:0}.sheet{margin:0;break-inside:avoid;page-break-inside:avoid}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}@media screen and (max-width:840px){.document{margin:12px}}`;
    let html='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>'+escape(script.title||'Sin título')+'</title><meta name="screenplay-characters" content="'+escape(JSON.stringify(script.characters))+'"><style>'+css+'</style></head><body><main class="document" data-screenplay="1">';
    html+='<section class="sheet cover title-page" data-title-page><div class="title-area"><h1 data-type="Title">'+escape(script.title||'Sin título')+'</h1>';
    if(script.authors.some(a=>a.name.trim()))html+='<p data-type="WrittenBy">Escrito por</p>';
    for(const author of script.authors)if(author.name.trim())html+='<p data-type="Author">'+escape(author.name)+'</p>';html+='</div><div class="contacts">';
    for(const author of script.authors){if(!author.email&&!author.phone&&!author.contact)continue;html+='<div class="contact-group">';if(script.authors.length>1&&author.name)html+='<p data-type="ContactName">'+escape(author.name)+'</p>';for(const [key,type]of [['email','Address'],['phone','Phone'],['contact','Contact']])if(author[key])html+='<p data-type="'+type+'">'+escape(author[key]).replace(/\n/g,'<br>')+'</p>';html+='</div>';}
    html+='</div></section>';
    const layout=S.layout(script.doc,{literal:true}),numbers=new Map();let number=0;for(const block of layout.blocks)if(block.kind==='scene'&&block.text.trim())numbers.set(block.id,++number);
    const pageContent=layout.pages.map(()=>[]);
    for(const [index,block]of layout.blocks.entries()){
      const node=script.doc.content[index],parts=[];for(const line of block.lines){let part=parts.at(-1);if(!part||part.page!==line.page){part={page:line.page,row:line.row,from:line.from,lines:0};parts.push(part);}part.lines++;}
      for(const [partIndex,part]of parts.entries()){const to=parts[partIndex+1]?.from??S.plain(node).length,spec=S.types[block.kind],style=`top:${S.format.top+part.row*12}pt;left:${spec.left}pt;width:${spec.columns*7.2+1}pt;height:${part.lines*12+.02}pt;${spec.upper?'text-transform:uppercase;':''}${spec.right?'text-align:right;':''}`;
        pageContent[part.page].push(`<p class="script-block ${block.kind}" data-kind="${block.kind}" data-preserve="1" data-block="p${index+1}" style="${style}">${inline(S.runs(node,part.from,to))}</p>`);
        if(partIndex===0&&numbers.has(block.id)){const top=S.format.top+part.row*12;for(const side of ['left','right'])pageContent[part.page].push(`<span class="scene-number" data-layout-only aria-hidden="true" style="top:${top}pt;${side==='left'?'left:54pt':'right:72pt'}">${numbers.get(block.id)}</span>`);}
      }
    }
    for(const [index,page]of layout.pages.entries()){
      html+='<section class="sheet screenplay-page" data-page="'+(index+1)+'" aria-label="Página '+(index+1)+'">';if(index)html+='<span class="page-number" data-layout-only aria-hidden="true">'+(index+1)+'.</span>';
      for(const row of page)if(row.virtual)html+=`<p class="virtual" data-layout-only aria-hidden="true" style="top:${S.format.top+row.row*12}pt;left:${row.left}pt">${escape(row.text)}</p>`;
      html+=pageContent[index].join('')+'</section>';
    }
    return html+'</main></body></html>';
  }
  root.PlanoHtml={parse,read,decode,write};
})(globalThis);
