/* Celtx clásico: contenedor ZIP, índice RDF y HTML de escritura. Sin datos de producción. */
(function(root){
 'use strict';
 const RDF='http://www.w3.org/1999/02/22-rdf-syntax-ns#',CX='http://celtx.com/NS/v1/',DC='http://purl.org/dc/elements/1.1/',maxBytes=20*1024*1024;
 const escape=text=>String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function checkZip(bytes){
  if(bytes.length<22||bytes.length>maxBytes)throw Error('Selecciona un .celtx clásico de hasta 20 MB.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
  if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error('El Celtx no es un ZIP compatible.');
  const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);let offset=start,total=0;
  if(!count||count>3000||view.getUint16(end+8,true)!==count||start+size!==end)throw Error('El contenedor Celtx es demasiado grande, está dividido o está dañado.');
  for(let i=0;i<count;i++){
   if(offset+46>end||view.getUint32(offset,true)!==0x02014b50)throw Error('El Celtx está incompleto.');
   const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),packed=view.getUint32(offset+20,true),length=view.getUint32(offset+24,true),local=view.getUint32(offset+42,true);
   if(flags&1||![0,8].includes(method)||view.getUint16(offset+34,true))throw Error('El Celtx está cifrado o usa una compresión no compatible.');
   total+=length;if(length>64*1024*1024||total>128*1024*1024||local+30>start||packed>bytes.length)throw Error('El Celtx descomprimido supera el tamaño admitido.');
   if(view.getUint32(local,true)!==0x04034b50||local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true)+packed>start)throw Error('El Celtx contiene entradas dañadas.');
   offset+=46+view.getUint16(offset+28,true)+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);if(offset>end)throw Error('El índice Celtx está incompleto.');
  }
  if(offset!==end)throw Error('El índice Celtx está dañado.');
 }
 function textEntry(entry,max){return new Promise((resolve,reject)=>{
  let length=0,done=false;const chunks=[],stream=entry.internalStream('uint8array');
  stream.on('data',chunk=>{if(done)return;length+=chunk.length;if(length>max){done=true;stream.pause();reject(Error('El texto descomprimido del Celtx es demasiado grande.'));return;}chunks.push(chunk);}).on('error',error=>{if(!done){done=true;reject(error);}}).on('end',()=>{
   if(done)return;done=true;const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
   const prefix=new TextDecoder('windows-1252').decode(bytes.subarray(0,4096));if(encoding==='utf-8'){const declared=/<\?xml[^>]*encoding\s*=\s*["']([^"']+)/i.exec(prefix)||/<meta\b[^>]*charset\s*=\s*["']?\s*([\w-]+)/i.exec(prefix);if(declared)encoding=declared[1];}
   try{resolve(new TextDecoder(encoding,{fatal:true}).decode(bytes));}catch{reject(Error('El Celtx contiene texto con codificación dañada.'));}
  }).resume();
 });}
 function safePath(value){
  if(typeof value!=='string'||!value||value.length>512)throw Error('El Celtx contiene una ruta de guion no válida.');
  let path;try{path=decodeURIComponent(value).replace(/\\/g,'/');}catch{throw Error('El Celtx contiene una ruta de guion no válida.');}
  if(/[:\u0000-\u001f?#%]/.test(path)||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('El Celtx contiene una ruta externa o no segura.');return path;
 }
 function entry(zip,path){const file=zip.file(path);if(!file||file.dir)throw Error('Falta un documento de escritura indicado en el Celtx.');if(file.unsafeOriginalName&&safePath(file.unsafeOriginalName)!==path)throw Error('El Celtx contiene una ruta no segura.');return file;}
 function graph(text){
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('El índice Celtx contiene declaraciones XML no permitidas.');
  const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror')||doc.documentElement.namespaceURI!==RDF||doc.documentElement.localName!=='RDF')throw Error('El índice RDF del Celtx está dañado.');
  const nodes=Array.from(doc.documentElement.children);if(nodes.length>15000)throw Error('El índice Celtx es demasiado complejo.');
  const subjects=new Map();for(const node of nodes){const id=node.getAttributeNS(RDF,'about');if(id){if(!subjects.has(id))subjects.set(id,[]);subjects.get(id).push(node);}}
  function get(parts,ns,name){for(const node of parts){const attribute=node.getAttributeNS(ns,name);if(attribute)return attribute;for(const child of node.children)if(child.namespaceURI===ns&&child.localName===name)return child.getAttributeNS(RDF,'resource')||child.textContent;}return '';}
  const scripts=[];for(const [id,parts]of subjects)if(get(parts,CX,'doctype')===CX+'ScriptDocument'){const path=get(parts,CX,'localFile');if(path)scripts.push({id,path:safePath(path),title:get(parts,DC,'title')||'Guion'});}
  return scripts;
 }
 function parseHtml(html,{name='Sin título',user={}}={}){
  const S=root.PlanoScreenplay,template=document.createElement('template');template.innerHTML=html;const content=template.content;
  if(content.querySelectorAll('*').length>50000)throw Error('El guion Celtx contiene demasiados elementos.');
  const meta=new Map(Array.from(content.querySelectorAll('meta[name]'),el=>[el.getAttribute('name').toLowerCase(),el.getAttribute('content')||''])),own=meta.get('plano.celtxversion')==='1';
  // Celtx termina cada párrafo con un BR del editor, que no forma parte del texto.
  for(const p of content.querySelectorAll('p')){let last=p.lastChild;while(last?.nodeType===3&&!last.textContent.trim()){const previous=last.previousSibling;last.remove();last=previous;}if(last?.nodeName==='BR')last.remove();p.style.whiteSpace='pre-wrap';}
  const script=root.PlanoHtml.parse(template.innerHTML,{name:name.replace(/\.celtx$/i,'')+'.html',user});
  if(own){
   let authors,characters;try{authors=JSON.parse(meta.get('plano.authors'));characters=JSON.parse(meta.get('plano.characters'));}catch{throw Error('Los datos de escritura del Celtx no son válidos.');}
   if(!Array.isArray(authors)||authors.length>8||!Array.isArray(characters)||characters.length>500)throw Error('La portada o los personajes del Celtx no son válidos.');
   script.authors=authors.map(a=>({id:S.id(),name:a?.name,email:a?.email,phone:a?.phone,contact:a?.contact}));script.characters=characters;
  }else if(meta.get('author')?.trim()||meta.get('cx.contact')?.trim()||meta.get('dc.source')?.trim()||meta.get('dc.rights')?.trim()){
   const names=(meta.get('author')||'').split(/\r?\n/).map(n=>n.trim()).filter(Boolean);if(names.length>8)throw Error('El Celtx contiene demasiados autores.');
   if(names.length)script.authors=names.map(name=>({id:S.id(),name,email:'',phone:'',contact:''}));
   if(!script.authors.length)script.authors=[{id:S.id(),name:'',email:'',phone:'',contact:''}];
   const author=script.authors[0];for(const line of [meta.get('cx.contact'),meta.get('dc.source'),meta.get('dc.rights')].filter(Boolean).join('\n').split(/\r?\n/).map(l=>l.trim()).filter(Boolean)){
    const email=line.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/);if(email&&!author.email)author.email=email[0];else if(/^\+?[\d\s().-]{7,}$/.test(line)&&!author.phone)author.phone=line;else if(!script.authors.some(a=>a.name===line))author.contact+=(author.contact?'\n':'')+line;
   }
  }
  return S.validate(script);
 }
 async function read(file,{user={},select}={}){
  if(!file.size||file.size>maxBytes)throw Error('Selecciona un .celtx clásico de hasta 20 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());checkZip(bytes);if(!root.JSZip||!root.PlanoHtml)throw Error('No se cargó el lector Celtx.');
  let zip;try{zip=await root.JSZip.loadAsync(bytes);}catch{throw Error('El archivo Celtx está dañado o cifrado.');}
  const indices=Object.keys(zip.files).filter(path=>/(?:^|\/)project\.rdf$/.test(path)&&!zip.files[path].dir);if(indices.length!==1)throw Error('No se encontró un único proyecto Celtx clásico (project.rdf).');
  const index=safePath(indices[0]),base=index.slice(0,index.lastIndexOf('/')+1),candidates=graph(await textEntry(entry(zip,index),2*1024*1024));
  if(!candidates.length)throw Error('El Celtx no contiene un documento de guion compatible.');
  const paths=new Set();for(const candidate of candidates){candidate.path=base+candidate.path;if(paths.has(candidate.path))throw Error('El índice Celtx repite un documento de guion.');paths.add(candidate.path);entry(zip,candidate.path);}
  let selected=candidates[0];if(candidates.length>1){if(!select)throw Error('El Celtx contiene varios guiones. Elige uno para importar.');const id=await select(candidates.map(c=>({...c})));selected=candidates.find(c=>c.id===id);if(!selected)throw Error('Importación Celtx cancelada.');}
  const html=await textEntry(entry(zip,selected.path),5*1024*1024);return parseHtml(html,{name:file.name,user});
 }
 function inline(runs){return(runs||[]).map(run=>{let text=escape(run.text).replace(/\n/g,'<br>');for(const mark of run.marks||[])text=mark.type==='bold'?'<strong>'+text+'</strong>':mark.type==='italic'?'<em>'+text+'</em>':mark.type==='underline'?'<u>'+text+'</u>':mark.type==='character'?'<span data-character="'+escape(mark.attrs.name)+'">'+text+'</span>':text;return text;}).join('');}
 async function write(value){
  const S=root.PlanoScreenplay,script=S.validate(value);if(!script||!root.JSZip)throw Error('No se pudo preparar el Celtx.');
  const token=()=>S.id().replace(/-/g,''),project='http://celtx.com/project/'+token(),folder='http://celtx.com/res/'+token(),components='http://celtx.com/res/'+token(),document='http://celtx.com/res/'+token(),sequence='http://celtx.com/res/'+token(),catalog='http://celtx.com/res/'+token(),members='http://celtx.com/res/'+token(),file='script-'+token()+'.html';
  const classes={scene:'sceneheading',action:'action',character:'character',parenthetical:'parenthetical',dialogue:'dialog',transition:'transition',insert:'shot',section:'action'},scenes=[],paragraphs=[];
  for(const node of script.doc.content){const id='s'+token();if(node.attrs.kind==='scene')scenes.push({id,title:S.plain(node)});paragraphs.push('<p class="'+classes[node.attrs.kind]+'" data-kind="'+node.attrs.kind+'" data-preserve="1"'+(!paragraphs.length?' data-screenplay="1"':'')+' id="'+id+'">'+inline(node.content)+'<br></p>');}
  const authors=script.authors.map(({name,email,phone,contact})=>({name,email,phone,contact})),meta=(name,value)=>'<meta name="'+name+'" content="'+escape(value)+'">',names=authors.map(a=>a.name).filter(Boolean).join('\n'),contacts=authors.map(a=>[a.name,a.email,a.phone,a.contact].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
  const css='@page{size:letter;margin:1in 1in 1in 1.5in}body{font:12pt/1 "Courier New",Courier,monospace;color:#000;background:#fff}p{white-space:pre-wrap;margin:0 0 12pt}.sceneheading,.character,.transition,.shot{text-transform:uppercase}.character{margin-left:2.2in;width:3.8in}.dialog{margin-left:1in;width:3.5in}.parenthetical{margin-left:1.6in;width:2.5in}.transition{text-align:right}.sceneheading{font-weight:bold}';
  const html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+escape(script.title)+'</title>'+meta('Author',names)+meta('CX.contact',contacts)+meta('CX.byline','Escrito por')+meta('DC.source','')+meta('DC.rights','')+meta('CX.sceneNumbering','none')+meta('CX.showPageNumbers','true')+meta('CX.showFirstPageNumber','false')+meta('PLANO.celtxVersion','1')+meta('PLANO.authors',JSON.stringify(authors))+meta('PLANO.characters',JSON.stringify(script.characters))+'<link rel="stylesheet" type="text/css" href="chrome://celtx/content/editor.css"><link rel="stylesheet" type="text/css" href="chrome://celtx/content/style/film/USLetter/Normal.css"><style id="leftheading">p.sceneheading:before{display:none!important}</style><style id="rightheading">p.sceneheading:after{display:none!important}</style><style id="charnumbers">.character:before{display:none!important}</style><style>'+css+'</style></head><body>'+paragraphs.join('\n')+'</body></html>';
  const rdf='<?xml version="1.0" encoding="UTF-8"?>\n<RDF:RDF xmlns:RDF="'+RDF+'" xmlns:cx="'+CX+'" xmlns:dc="'+DC+'">'+
   '<cx:Project RDF:about="'+project+'" cx:fileVersion="1.4" dc:title="'+escape(script.title)+'"><cx:components RDF:resource="'+components+'"/></cx:Project><RDF:Seq RDF:about="'+components+'"><RDF:li RDF:resource="'+folder+'"/></RDF:Seq>'+
   '<RDF:Description RDF:about="'+folder+'" cx:projectRoot="true" dc:title="'+escape(script.title)+'"/><RDF:Seq RDF:about="'+folder+'"><RDF:li RDF:resource="'+catalog+'"/><RDF:li RDF:resource="'+document+'"/></RDF:Seq>'+
   '<cx:Document RDF:about="'+catalog+'" dc:title="Master Catalog" cx:size="0"><cx:doctype RDF:resource="'+CX+'CatalogDocument"/><cx:filter RDF:resource="celtx:filter:all"/><cx:members RDF:resource="'+members+'"/></cx:Document><RDF:Seq RDF:about="'+members+'"/>'+
   '<cx:Document RDF:about="'+document+'" dc:title="'+escape(script.title)+'" cx:localFile="'+file+'"><cx:doctype RDF:resource="'+CX+'ScriptDocument"/><cx:scenes RDF:resource="'+sequence+'"/></cx:Document><RDF:Seq RDF:about="'+sequence+'">'+scenes.map(s=>'<RDF:li RDF:resource="'+document+'/'+s.id+'"/>').join('')+'</RDF:Seq>'+scenes.map((s,i)=>'<RDF:Description RDF:about="'+document+'/'+s.id+'" cx:sceneid="'+s.id+'" dc:title="'+escape(s.title)+'" cx:ordinal="'+(i+1)+'" cx:sortord="'+String(i+1).padStart(4,'0')+'"/>').join('')+'</RDF:RDF>';
  const zip=new root.JSZip();zip.file('project.rdf',rdf);zip.file('local.rdf','<?xml version="1.0"?><RDF:RDF xmlns:RDF="'+RDF+'"/>');zip.file(file,html);return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
 }
 root.PlanoCeltx={read,write};
})(globalThis);
