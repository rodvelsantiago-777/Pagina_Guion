/* WriterDuet WDZ: instantáneas e historial causal local, sin conexiones ni producción. */
(function(root){
 'use strict';
 const maxBytes=20*1024*1024;
 function checkZip(bytes){
  if(bytes.length<22||bytes.length>maxBytes)throw Error('Selecciona un .wdz de hasta 20 MB.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
  if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error('El WDZ no es un ZIP compatible.');
  const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);let offset=start,total=0;
  if(!count||count>3000||view.getUint16(end+8,true)!==count||start+size!==end)throw Error('El contenedor WDZ es demasiado grande, está dividido o está dañado.');
  for(let i=0;i<count;i++){
   if(offset+46>end||view.getUint32(offset,true)!==0x02014b50)throw Error('El WDZ está incompleto.');
   const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),packed=view.getUint32(offset+20,true),length=view.getUint32(offset+24,true),local=view.getUint32(offset+42,true);
   if(flags&1||![0,8].includes(method)||view.getUint16(offset+34,true))throw Error('El WDZ está cifrado o usa una compresión no compatible.');
   total+=length;if(length>64*1024*1024||total>128*1024*1024||local+30>start||packed>bytes.length)throw Error('El WDZ descomprimido supera el tamaño admitido.');
   if(view.getUint32(local,true)!==0x04034b50||local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true)+packed>start)throw Error('El WDZ contiene entradas dañadas.');
   offset+=46+view.getUint16(offset+28,true)+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);if(offset>end)throw Error('El índice WDZ está incompleto.');
  }
  if(offset!==end)throw Error('El índice WDZ está dañado.');
 }
 function textEntry(entry,max){return new Promise((resolve,reject)=>{
  let length=0,done=false;const chunks=[],stream=entry.internalStream('uint8array');
  stream.on('data',chunk=>{if(done)return;length+=chunk.length;if(length>max){done=true;stream.pause();reject(Error('El texto descomprimido del WDZ es demasiado grande.'));return;}chunks.push(chunk);}).on('error',error=>{if(!done){done=true;reject(error);}}).on('end',()=>{
   if(done)return;done=true;const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let encoding=bytes[0]===255&&bytes[1]===254?'utf-16le':bytes[0]===254&&bytes[1]===255?'utf-16be':'utf-8';
   try{resolve(new TextDecoder(encoding,{fatal:true}).decode(bytes));}catch{reject(Error('El WDZ contiene texto con codificación dañada.'));}
  }).resume();
 });}

 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value),dangerous=new Set(['__proto__','constructor','prototype']);
 const types={scene:'Slugline',action:'Action',character:'EditDialogName',parenthetical:'EditDialogParen',dialogue:'EditDialogContent',transition:'Transition',insert:'Shot',section:'Act'};
 const known=new Set([...Object.values(types),'Text','EndAct','EditDialogLyric','Sequence']),omitted=new Set(['Note','Outline','Image']);
 function json(text){if(typeof text!=='string'||text.length>8*1024*1024)throw Error('El JSON interno del WDZ supera el tamaño admitido.');try{return JSON.parse(text.replace(/^\ufeff/,''),(key,value)=>{if(dangerous.has(key))throw Error();return value;});}catch{throw Error('El WDZ contiene JSON dañado o claves no seguras.');}}
 const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
 function vector(text){
  if(typeof text!=='string'||text.length>4096)throw Error('La versión del texto WDZ no es válida.');const result=new Map();
  for(const item of text.split(';').filter(Boolean)){const match=/^([-\w]{1,64}):(\d{1,12})$/.exec(item);if(!match||result.has(match[1]))throw Error('La versión del texto WDZ no es válida.');result.set(match[1],Number(match[2]));}if(result.size>128)throw Error('El WDZ contiene demasiadas versiones simultáneas.');return result;
 }
 const equal=(a,b)=>a.size===b.size&&[...a].every(([key,value])=>b.get(key)===value);
 function textOf(line,updates,budget){
  const cache=line.cache;if(cache!==undefined&&(!object(cache)||typeof cache.t!=='string'||typeof cache.v!=='string'))throw Error('La caché de texto del WDZ no es válida.');
  // Los LF de cache.t son envoltura visual; los offsets del historial no los cuentan.
  let text=cache?cache.t.replace(/\r?\n/g,''):'',version=vector(cache?.v||'');const undo=new Map(),batches=[];
  for(const key of ['content','.c'])if(line[key]!==undefined){if(!object(line[key]))throw Error('El historial de un párrafo WDZ no es válido.');for(const id of Object.keys(line[key]).sort())batches.push(typeof line[key][id]==='string'?json(line[key][id]):line[key][id]);}
  batches.push(...updates);
  for(const batch of batches){
   if(!Array.isArray(batch)||!Array.isArray(batch[1]))throw Error('El WDZ contiene una operación de texto no compatible.');
   for(const change of batch[1]){
    if(++budget.steps>100000||!Array.isArray(change)||!Array.isArray(change[1]))throw Error('El historial de texto WDZ es demasiado grande o no es válido.');
    const [kind,params]=change,[actorValue,base,position,value]=params,actor=String(actorValue),context=vector(base),clock=(context.get(actor)||0)+1;
    if(!['number','string'].includes(typeof actorValue)||!/^[-\w]{1,64}$/.test(actor))throw Error('El autor de una operación WDZ no es válido.');if((version.get(actor)||0)>=clock)continue;
    if(!equal(context,version))throw Error('Este WDZ contiene ediciones simultáneas que no se pueden reconstruir con seguridad. Expórtalo desde WriterDuet como FDX y vuelve a importarlo.');
    budget.cost+=text.length;if(budget.cost>128*1024*1024)throw Error('El historial de edición WDZ supera el tamaño de procesamiento admitido.');
    let stack=undo.get(actor);if(!stack){stack=[];undo.set(actor,stack);}
    function apply(at,length,insert){if(!Number.isSafeInteger(at)||!Number.isSafeInteger(length)||at<0||length<0||at+length>text.length||typeof insert!=='string')throw Error('Una operación WDZ apunta fuera del texto.');text=text.slice(0,at)+insert+text.slice(at+length);if(text.length>2*1024*1024)throw Error('Un párrafo WDZ es demasiado grande.');}
    if(kind==='u'){
     const inverse=stack.pop();if(!inverse||[...version].some(([key,value])=>key!==actor&&(inverse.version.get(key)||0)!==value))throw Error('El WDZ necesita un historial anterior para deshacer. Expórtalo como FDX desde WriterDuet.');apply(inverse.at,inverse.length,inverse.insert);
    }else if(kind==='i'||kind==='d'){
     const length=kind==='d'?value:0,insert=kind==='i'?value:'';if(typeof insert!=='string'||!Number.isSafeInteger(position)||!Number.isSafeInteger(length)||position<0||length<0||position+length>text.length)throw Error('Una operación WDZ apunta fuera del texto.');
     const removed=text.slice(position,position+length);budget.written+=removed.length+insert.length;if(budget.written>32*1024*1024)throw Error('El texto del historial WDZ supera el tamaño admitido.');stack.push({at:position,length:insert.length,insert:removed,version:new Map(version)});apply(position,length,insert);
    }else throw Error('El WDZ utiliza una operación de edición no compatible. Expórtalo como FDX desde WriterDuet.');
    version.set(actor,clock);
   }
  }return text;
 }
 function rich(raw,defaults={}){
  if(typeof raw!=='string'||raw.length>2*1024*1024)throw Error('El texto WDZ supera el tamaño admitido.');const state={b:defaults.bold===2,i:defaults.italic===2,u:defaults.underline===2},ranges={b:[],i:[],u:[]},starts={},codes={1:['b',true],2:['b',false],3:['i',true],4:['i',false],5:['u',true],6:['u',false]};let text='';for(const key of ['b','i','u'])if(state[key])starts[key]=0;
  for(const value of raw){const code=value.charCodeAt(0),mark=codes[code];if(mark){const [key,on]=mark;if(on&&!state[key])starts[key]=text.length;if(!on&&state[key]&&text.length>starts[key])ranges[key].push({start:starts[key],end:text.length-1});state[key]=on;}else{if(code<32&&![9,10,13].includes(code))throw Error('El WDZ utiliza marcas de texto no compatibles. Expórtalo como FDX desde WriterDuet.');text+=value;}}
  for(const key of ['b','i','u'])if(state[key]&&text.length>starts[key])ranges[key].push({start:starts[key],end:text.length-1});if(text.length>220000)throw Error('Un párrafo WDZ supera el tamaño de texto admitido.');return{text,attributes:{textAttributes:Object.fromEntries(Object.entries(ranges).filter(([,ranges])=>ranges.length))}};
 }
 function encode(node){let raw='';for(const run of node.content||[]){const marks=new Set((run.marks||[]).map(m=>m.type));raw+=(marks.has('bold')?'\x01':'')+(marks.has('italic')?'\x03':'')+(marks.has('underline')?'\x05':'')+run.text+(marks.has('underline')?'\x06':'')+(marks.has('italic')?'\x04':'')+(marks.has('bold')?'\x02':'');}return raw;}
 async function read(file,{user={},select,onWarning=()=>{}}={}){
  if(!file.size||file.size>maxBytes)throw Error('Selecciona un .wdz de hasta 20 MB.');const bytes=new Uint8Array(await file.arrayBuffer());checkZip(bytes);if(!root.JSZip||!root.PlanoJson)throw Error('No se cargó el lector WriterDuet.');let zip;try{zip=await root.JSZip.loadAsync(bytes);}catch{throw Error('El WDZ está dañado o cifrado.');}
  const indices=Object.keys(zip.files).filter(path=>/(?:^|\/)script\.json$/.test(path)&&!zip.files[path].dir);if(indices.length!==1)throw Error('No se encontró un único script.json de WriterDuet.');const index=indices[0],base=index.slice(0,index.lastIndexOf('/')+1);
  function entry(name){if(!name||name.startsWith('/')||name.includes('\\')||/[:\u0000-\u001f%?#]/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('El WDZ contiene una ruta no segura.');const entry=zip.file(name);if(!entry||entry.dir||entry.unsafeOriginalName&&entry.unsafeOriginalName!==name)throw Error('Falta una instantánea local del WDZ; no se han solicitado archivos de Internet.');return entry;}
  const manifest=json(await textEntry(entry(index),8*1024*1024));if(!object(manifest)||!object(manifest.b))throw Error('El WDZ no contiene documentos compatibles.');if(manifest.encryption)throw Error('Los proyectos WDZ cifrados no son compatibles.');if(Object.keys(manifest.b).length>1000)throw Error('El WDZ contiene demasiados documentos.');
  const drafts=manifest.f?.branch_details?.list||{},candidates=Object.entries(manifest.b).filter(([id,b])=>object(b)&&object(b.h)&&id!=='titlePage'&&!b.private&&!b.details?.private&&!b.details?.removed&&b.details?.is_live!==false&&!drafts[id]?.draft).map(([id,b])=>({id,title:typeof b.details?.name==='string'?b.details.name.slice(0,176):'Guion'}));
  if(!candidates.length)throw Error('El WDZ no contiene un guion público activo.');let chosen=candidates[0];if(candidates.length>1){if(!select)throw Error('El WDZ contiene varios documentos. Elige cuál importar.');const id=await select(candidates.map(c=>({...c})));chosen=candidates.find(c=>c.id===id);if(!chosen)throw Error('Importación WriterDuet cancelada.');}
  const budget={steps:0,cost:0,written:0},loaded=new Map();let custom=false;
  async function branch(id,cover=false){
   const source=manifest.b[id];if(!source||cover&&(source.private||source.details?.private||source.details?.removed||source.details?.is_live===false))return[];if(!object(source.h))throw Error('El historial del documento WDZ no es válido.');const keys=Object.keys(source.h).sort();if(keys.length>50000)throw Error('El WDZ contiene demasiado historial.');let anchor=-1;
   for(let i=0;i<keys.length;i++){const op=source.h[keys[i]];if(!object(op))throw Error('El historial WDZ no es válido.');if(op.a==='cp'||op.a==='s'&&!op.l)anchor=i;}
   if(anchor<0)throw Error('Falta la instantánea inicial del documento WDZ.');const first=source.h[keys[anchor]];let snapshot;
   if(first.a==='cp'){
    if(typeof first.checkpointUrl!=='string'||first.checkpointUrl.length>4096)throw Error('El WDZ contiene una referencia de instantánea no compatible.');const path=base+await hash(first.checkpointUrl);if(!loaded.has(path))loaded.set(path,json(await textEntry(entry(path),8*1024*1024)));snapshot=loaded.get(path).checkpoint;
   }else snapshot=typeof first.v==='string'?json(first.v):first.v;
   if(!object(snapshot)||!object(snapshot.data))throw Error('La instantánea del guion WDZ no es válida.');const data=structuredClone(snapshot.data),formatting=structuredClone(snapshot.formatting||{}),updates=new Map();
   for(const key of keys.slice(anchor+1)){
    const op=source.h[key];if(typeof op.l!=='string'||op.l.length>1000)throw Error('Una ruta del historial WDZ no es válida.');const parts=op.l.replace(/\/$/,'').split('/');if(parts.some(p=>dangerous.has(p)))throw Error('Una ruta del historial WDZ no es segura.');if(!['data','formatting'].includes(parts[0]))continue;
    const value=typeof op.v==='string'?json(op.v):op.v;
    if(parts[0]==='data'){
     const id=parts[1];if(!id||id.length>256)throw Error('Un párrafo WDZ tiene un identificador inválido.');if(parts[2]==='.h')continue;
     if(parts[2]==='.c'){if(!updates.has(id))updates.set(id,[]);updates.get(id).push(value);continue;}
     if(parts.length===2){if(!object(value))throw Error('Un párrafo WDZ no es válido.');if(op.a==='u')data[id]={...data[id],...value};else{data[id]=value;updates.delete(id);}}
     else if(parts.length===3&&['type','removed','cache','content','.c','al'].includes(parts[2])){if(!object(data[id]))data[id]={};data[id][parts[2]]=value;}
     else if(parts[2]==='cache'||parts[2]==='content')throw Error('El WDZ utiliza una actualización de párrafo no compatible.');
    }else{
     let target=formatting;const route=parts.slice(1);if(!route.length){if(!object(value))throw Error('El formato WDZ no es válido.');if(op.a!=='u')for(const name of Object.keys(formatting))delete formatting[name];for(const [name,item]of Object.entries(value))formatting[name]=item;continue;}for(const name of route.slice(0,-1)){if(!object(target[name]))target[name]={};target=target[name];}const field=route.at(-1);if(field&&field!=='.')target[field]=op.a==='u'&&object(value)?{...target[field],...value}:value;
    }
   }
   if(Object.keys(data).length>40000)throw Error('El WDZ contiene demasiados párrafos e historial borrado.');const rows=[];
   for(const id of Object.keys(data).sort()){
    const line=data[id];if(!object(line)||line.removed)continue;let type=line.type;if(typeof type!=='string'||type.length>120)throw Error('Un párrafo WDZ no tiene un tipo válido.');if(omitted.has(type))continue;
    if(!cover&&!known.has(type)){const entry=formatting.custom_line_types?.list?.[type];if(omitted.has(entry?.behaves_like))continue;type=known.has(entry?.behaves_like)?entry.behaves_like:'Action';custom=true;}
    if(type==='EditDialogLyric')type='EditDialogContent';if(type==='Sequence')type='Act';const decoded=rich(textOf(line,updates.get(id)||[],budget),formatting.types?.[line.type]);rows.push({type,...decoded});if(rows.length>(cover?1000:8000))throw Error('El WDZ contiene demasiados párrafos de escritura.');
   }return rows;
  }
  const lines=await branch(chosen.id),titleLines=await branch('titlePage',true),extension=manifest.planoWriting,signature=await hash(JSON.stringify({lines,titleLines}));let data={lines,titlePage:{lines:titleLines}};
  if(object(extension)&&extension.version===1){
   const sameBody=extension.bodySignature===await hash(JSON.stringify(lines)),sameCover=extension.coverSignature===await hash(JSON.stringify(titleLines)),sameAll=extension.signature===signature;
   if(sameBody||sameCover||sameAll){
    const portable=JSON.parse(root.PlanoJson.write(root.PlanoJson.parse(JSON.stringify(data),{name:file.name.replace(/\.wdz$/i,'')+'.json',user})));
    if(sameBody||sameAll){if(!Array.isArray(extension.references)||extension.references.length!==lines.length)throw Error('Los datos de escritura propios del WDZ no son válidos.');portable.lines=lines.map((line,i)=>({...line,...(extension.references[i]?.length?{characterReferences:extension.references[i]}:{})}));portable.characters=extension.characters;}
    if(sameCover||sameAll)portable.titlePage=extension.titlePage;data=portable;
   }
  }
  const result=root.PlanoJson.parse(JSON.stringify(data),{name:(typeof manifest.script_info?.script_title==='string'?manifest.script_info.script_title:file.name.replace(/\.wdz$/i,''))+'.json',user});if(custom)onWarning('Los elementos personalizados sin equivalencia se han conservado como acción.');return result;
 }
 async function write(value){
  const S=root.PlanoScreenplay,script=S.forExport(value);if(!script||!root.JSZip||!root.PlanoJson)throw Error('No se pudo preparar el WDZ.');const portable=JSON.parse(root.PlanoJson.write(script)),time=Date.now(),local='plano-'+S.id().replace(/-/g,''),client='plano',details={is_live:true,removed:false,visible:true},bodyFormatting={script_font:'Courier New',already_set_defaults:2,types:{},alignment:{types:{}},margins:{pages:{pageMargins:{top:96,bottom:96,left:144,right:96}}},postv4:{margins:{columns:{column:{'0':{types:{}}}}}}};
  for(const [kind,type]of Object.entries(types)){const spec=S.types[kind],left=spec.left*4/3-144,width=spec.columns*9.6;bodyFormatting.types[type]={default_column:0,...(spec.upper?{caps:2}:{})};bodyFormatting.alignment.types[type]=spec.right?'right':'left';bodyFormatting.postv4.margins.columns.column['0'].types[type]={left,right:Math.max(0,576-left-width),width:'auto'};}
  const coverFormatting={...structuredClone(bodyFormatting),types:{},alignment:{types:{}},custom_line_types:{list:{}}};for(const type of ['Title','Author','Address','Phone','Text']){coverFormatting.types[type]={default_column:0};coverFormatting.alignment.types[type]=['Title','Author'].includes(type)?'center':'left';if(type!=='Text')coverFormatting.custom_line_types.list[type]={custom_type:true,name:type,typeId:type,behaves_like:'Text',enter:'Text',tab:'Text'};}
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',idFor=i=>i===0?'bbb0a':'bbd'+[Math.floor(i/2704)%52,Math.floor(i/52)%52,i%52].map(n=>alphabet[n]).join('')+'0plano';
  const pushAlphabet='-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
  function historyKey(index){let stamp=time,suffix=index;const prefix=Array(8),tail=Array(12);for(let i=7;i>=0;i--){prefix[i]=pushAlphabet[stamp%64];stamp=Math.floor(stamp/64);}for(let i=11;i>=0;i--){tail[i]=pushAlphabet[suffix%64];suffix=Math.floor(suffix/64);}return prefix.join('')+tail.join('');}
  function document(name,nodes,formatting,cover=false){
   const data={},h={},rows=[];for(const [i,node]of nodes.entries()){const id=idFor(i),type=cover?node.type:types[node.attrs.kind],raw=cover?encode({content:root.PlanoJson.parse(JSON.stringify({lines:[{type:'Action',text:node.text,attributes:node.attributes}]})).doc.content[0].content}):encode(node);data[id]={type,...(cover?{al:['Title','Author'].includes(type)||node.text==='Escrito por:'?'center':'left'}:{})};rows.push({type,...rich(raw)});h[historyKey(i)]={l:'data/'+id+'/.c/.',v:JSON.stringify([0,[['i',[0,'',0,raw]]],time]),c:client,t:time,u:local};}
   h['-']={a:'s',l:'',v:JSON.stringify({formatting,settings:{script_language:'es-ES'},data}),z:0,c:client,t:time,u:local};return{branch:{users:{[local]:{owner:true,admin:true,writer:true}},private:null,details:{...details,name,order:cover?'D':'C',...(cover?{branchType:'empty'}:{})},h},rows};
  }
  const coverNodes=[];let contactAuthor=-1;for(const line of portable.titlePage.lines){if(script.authors.length>1&&line.authorField&&line.authorField!=='name'&&line.authorIndex!==contactAuthor){contactAuthor=line.authorIndex;const name=script.authors[contactAuthor].name;if(name)coverNodes.push({type:'Text',text:name,attributes:{textAttributes:{}}});}coverNodes.push({...line,type:line.type==='Texto'?'Text':line.type});}
  const main=document(script.title,script.doc.content,bodyFormatting),cover=document('Página de título',coverNodes,coverFormatting,true),signature=await hash(JSON.stringify({lines:main.rows,titleLines:cover.rows})),bodySignature=await hash(JSON.stringify(main.rows)),coverSignature=await hash(JSON.stringify(cover.rows));
  const manifest={f:{branch_details:{list:{'-':{draft:false},titlePage:{draft:false}}}},script_info:{is_group:false,project_name:script.title,script_title:script.title,script_author:local,writerNotes:false},encryption:null,user_data:{},clients:{list:{},num_clients:0,user_info:{}},extras:{version:{major:'7',minor:'0',trivial:'664'},user_key:local,users:{[local]:{user_name:'PLANO'}},active_branch_id:'-'},b:{'-':main.branch,titlePage:cover.branch},planoWriting:{version:1,signature,bodySignature,coverSignature,titlePage:portable.titlePage,characters:portable.characters,references:portable.lines.map(line=>line.characterReferences||[])}};
  const text=JSON.stringify(manifest);if(new TextEncoder().encode(text).length>8*1024*1024)throw Error('El WDZ exportado supera el tamaño de escritura admitido.');const zip=new root.JSZip();zip.file('script.json',text);return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
 }
 root.PlanoWdz={read,write};
})(globalThis);
