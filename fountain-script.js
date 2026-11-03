/* Fountain de escritura: sintaxis de texto, sin HTML, servicios ni datos de producción. */
(function(root){
 'use strict';
 const S=typeof module==='object'&&module.exports?require('./screenplay.js'):root.PlanoScreenplay,maxBytes=2*1024*1024;
 const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value),norm=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,''),punct=char=>{const n=char?.charCodeAt(0);return n>=33&&n<=47||n>=58&&n<=64||n>=91&&n<=96||n>=123&&n<=126;};
 const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');
 function decode(bytes){
  if(!bytes.length||bytes.length>maxBytes)throw Error('Selecciona un Fountain de texto de hasta 2 MB.');let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';
  let text;try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{if(encoding!=='utf-8')throw Error('La codificación del Fountain está dañada.');text=new TextDecoder('windows-1252').decode(bytes);}return text;
 }
 function normalized(text){if(typeof text!=='string'||new TextEncoder().encode(text).length>maxBytes)throw Error('Selecciona un Fountain de texto de hasta 2 MB.');if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw Error('El archivo contiene datos binarios; selecciona un Fountain de texto.');return text.replace(/^\ufeff/,'').replace(/\r\n?|\u2028|\u2029/g,'\n');}
 function merge(runs){const result=[];for(const run of runs){if(!run.text)continue;const previous=result.at(-1);if(previous&&JSON.stringify(previous.marks||[])===JSON.stringify(run.marks||[]))previous.text+=run.text;else result.push(run);}return result;}
 function inlineLine(text){
  const skip=new Uint8Array(text.length),events=new Map(),stack=[];let count=0;
  const event=(at,type,delta)=>{if(!events.has(at))events.set(at,[]);events.get(at).push({type,delta});};
  for(let i=0;i<text.length;){
   if(text[i]==='\\'&&punct(text[i+1])){skip[i]=1;i+=2;continue;}
   const char=text[i];if(char!=='*'&&char!=='_'){i++;continue;}let end=i+1;while(text[end]===char)end++;const total=end-i;
   if(total>32||char==='_'&&(total!==1||/[\p{L}\p{N}]/u.test(text[i-1]||'')&&/[\p{L}\p{N}]/u.test(text[end]||''))){i=end;continue;}if(++count>50000)throw Error('El Fountain contiene demasiadas marcas de énfasis.');
   const canOpen=end<text.length&&!/\s/.test(text[end]),canClose=i>0&&!/\s/.test(text[i-1]);let at=i,left=total;
   while(left&&canClose&&stack.length){const opener=stack.at(-1);if(opener.char!==char||opener.size>left||opener.end>=i)break;stack.pop();const type=char==='_'?'underline':opener.size===2?'bold':'italic';for(let k=opener.at;k<opener.end;k++)skip[k]=1;for(let k=at;k<at+opener.size;k++)skip[k]=1;event(opener.end,type,1);event(at,type,-1);at+=opener.size;left-=opener.size;}
   if(canOpen)while(left){const size=char==='*'&&left>=2?2:1;if(stack.length>128)throw Error('El énfasis del Fountain tiene demasiados niveles.');stack.push({char,size,at,end:at+size});at+=size;left-=size;}
   i=end;
  }
  const active={bold:0,italic:0,underline:0},runs=[];let buffer='',key='',marks=[],length=0;
  function flush(){if(buffer){runs.push({type:'text',text:buffer,...(marks.length?{marks}:{})});buffer='';}}
  for(let i=0;i<text.length;){for(const item of events.get(i)||[])active[item.type]+=item.delta;if(skip[i]){i++;continue;}const next=['bold','italic','underline'].filter(type=>active[type]>0),nextKey=next.join(',');if(nextKey!==key){flush();key=nextKey;marks=next.map(type=>({type}));}const value=String.fromCodePoint(text.codePointAt(i));length+=value.length;if(length>220000)throw Error('El Fountain supera el tamaño de guion admitido.');buffer+=value;i+=value.length;}flush();return merge(runs);
 }
 function inline(text){const result=[];for(const [i,line]of text.split('\n').entries()){if(i)result.push({type:'text',text:'\n'});result.push(...inlineLine(line));}return merge(result);}
 const plain=text=>inline(text).map(run=>run.text).join('');
 function hidden(text){
  const parts=[];let start=0,i=0,work=0;
  while(i<text.length){if(text[i]==='\\'&&punct(text[i+1])){i+=2;continue;}const note=text.startsWith('[[',i),bone=text.startsWith('/*',i);if(!note&&!bone){i++;continue;}const close=text.indexOf(note?']]':'*/',i+2);if(close<0)break;
   if((work+=close-i)>16*1024*1024)throw Error('Las notas del Fountain son demasiado complejas.');if(note&&/\n[ \t]*\n/.test(text.slice(i+2,close))){i+=2;continue;}
   const end=close+2,lineStart=text.lastIndexOf('\n',i-1)+1,next=text.indexOf('\n',end),lineEnd=next<0?text.length:next,whole=!text.slice(lineStart,i).trim()&&!text.slice(end,lineEnd).trim();
   parts.push(text.slice(start,whole?lineStart:i));start=whole?(next<0?text.length:next+1):end;i=start;
  }parts.push(text.slice(start));return parts.join('');
 }
 const titleKeys=new Set(['title','titulo','credit','credito','author','authors','autor','autores','source','fuente','draftdate','fecha','fechadeborrador','date','contact','contacto','copyright','email','correo','phone','telefono','notes','notas']);
 function titlePage(text,name,user){
  const lines=text.split('\n'),fields=[];let index=0,offset=0,current=null,started=false;while(index<lines.length&&!lines[index].trim()){offset+=lines[index].length+1;index++;}const first=/^([^:\n]{1,80}):(?:[ \t]*(.*))?$/.exec(lines[index]||'');
  if(!first||!titleKeys.has(norm(first[1])))return{title:name,authors:S.create(name,user).authors,start:0,exists:false};
  while(index<lines.length){const line=lines[index];if(!line){offset++;index++;break;}const entry=/^([^:\n]{1,80}):(?:[ \t]*(.*))?$/.exec(line);if(entry&&!/^[ \t]/.test(line)){current={key:norm(entry[1]),values:entry[2]?[entry[2]]:[]};fields.push(current);started=true;}else if(current&&/^(?: {3,}|\t)/.test(line))current.values.push(line.replace(/^(?: {3,}|\t)/,''));else break;offset+=line.length+1;index++;}
  const title=fields.find(f=>['title','titulo'].includes(f.key)),authors=[];for(const field of fields)if(['author','authors','autor','autores'].includes(field.key))for(const value of field.values){const name=plain(value).trim();if(name)authors.push({id:S.id(),name,email:'',phone:'',contact:''});}
  if(!authors.length)authors.push({id:S.id(),name:user.name||'',email:'',phone:'',contact:''});let active=0;
  for(const field of fields){if(['title','titulo','credit','credito','author','authors','autor','autores','notes','notas'].includes(field.key))continue;if(!['contact','contacto','email','correo','phone','telefono','copyright','source','fuente','draftdate','fecha','fechadeborrador','date'].includes(field.key))continue;
   for(const value of field.values){const line=plain(value).trim();if(!line)continue;const existing=authors.findIndex(a=>a.name===line);if(existing>=0){active=existing;continue;}const email=line.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/),phone=/^\+?[\d\s().-]{7,}$/.test(line),label=/^(?:contacto|contact|e-?mail|correo|tel[eé]fono)\s*:?$/i.test(line);if(label)continue;
    if(email&&!authors[active].email)authors[active].email=email[0];else if(phone&&!authors[active].phone)authors[active].phone=line;else authors[active].contact+=(authors[active].contact?'\n':'')+line;
   }
  }return{title:title?plain(title.values.join('\n')):name,authors,start:Math.min(offset,text.length),exists:started};
 }
 function b64(text){const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
 function unb64(text){const binary=atob(text);return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));}
 const literal=text=>text.replace(/\\([!-/:-@\[-`{-~])/g,'$1');
 async function parse(input,{name='Sin título.fountain',user={},onWarning=()=>{}}={}){
  let text=normalized(input);const match=/\n\n\/\* PLANO-WRITING-1 ([A-Za-z0-9+/=]+) \*\/[ \t\n]*$/.exec(text);let metadata=null;
  if(match){try{metadata=JSON.parse(unb64(match[1]));}catch{/* Una nota ajena o dañada no sustituye al texto visible. */}text=text.slice(0,match.index);}
  const fallback=name.replace(/\.fountain$/i,'')||'Sin título',cover=titlePage(text,fallback,user),script=S.create(cover.title,user);script.title=cover.title;script.authors=cover.authors;
  if(object(metadata)&&metadata.version===1&&metadata.signature===await hash(text)){
   if(!Array.isArray(metadata.paragraphs)||!metadata.paragraphs.length||metadata.paragraphs.length>8000||!Array.isArray(metadata.authors)||metadata.authors.length>8)throw Error('Los datos propios de escritura del Fountain no son válidos.');script.title=metadata.title;script.authors=metadata.authors.map(a=>({id:S.id(),name:a?.name,email:a?.email,phone:a?.phone,contact:a?.contact}));script.characters=metadata.characters;let previous=cover.start,total=0;
   script.doc.content=metadata.paragraphs.map(p=>{if(!object(p)||!Array.isArray(p.runs)||p.runs.length>50000)throw Error('Los párrafos propios del Fountain no son válidos.');const content=p.runs.map(run=>{if(!object(run)||!Array.isArray(run.parts)||run.parts.length>50000)throw Error('Los rangos de escritura del Fountain no son válidos.');let value='';for(const range of run.parts){if(!Array.isArray(range)||range.length!==2||!range.every(Number.isSafeInteger)||range[0]<previous||range[1]<range[0]||range[1]>text.length)throw Error('Un rango del Fountain apunta fuera de su texto.');previous=range[1];value+=literal(text.slice(range[0],range[1]));}total+=value.length;if(total>220000)throw Error('El Fountain supera el tamaño de guion admitido.');return{type:'text',text:value,...(run.marks?.length?{marks:run.marks}:{})};}).filter(r=>r.text);return{type:'paragraph',attrs:{id:S.id(),kind:p.kind},...(content.length?{content:merge(content)}:{})};});return S.validate(script);
  }
  const lines=hidden(text.slice(cover.start)).split('\n'),nodes=[];let pending=null,dialogue=false,dual=false,pageBreak=false,centered=false,lyrics=false;
  function flush(){if(pending){const content=inline(pending.text);nodes.push({type:'paragraph',attrs:{id:S.id(),kind:pending.kind},...(content.length?{content}:{})});pending=null;if(nodes.length>8000)throw Error('El Fountain contiene demasiados párrafos.');}}
  function add(kind,value,combine=false){if(combine&&pending?.kind===kind)pending.text+='\n'+value;else{flush();pending={kind,text:value};}}
  const heading=value=>/^(?:INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|INT|EXT|EST|I\/E)(?:\.|\s)/i.test(value),insert=value=>/^(?:INSERT|INSERTO|VOLVEMOS A ESCENA|BACK TO SCENE|CLOSE[ -]?UP|POV)\b/i.test(value);
  for(let i=0;i<lines.length;i++){
   const raw=lines[i],trim=raw.trim(),before=i===0||!lines[i-1].trim(),after=i===lines.length-1||!lines[i+1].trim();
   if(!raw){flush();dialogue=false;continue;}if(!trim){if(dialogue&&raw.length>=2)add('dialogue','',true);else{flush();dialogue=false;}continue;}
   if(dialogue){if(plain(trim).startsWith('(')&&!trim.replace(/^[_*]+/,'').startsWith('\\(')){let end=i;while(end+1<lines.length&&lines[end].trim()&&!plain(lines[end].trim()).endsWith(')'))end++;if(plain(lines[end]?.trim()||'').endsWith(')')){add('parenthetical',lines.slice(i,end+1).map(l=>l.trim()).join('\n'));i=end;continue;}}add('dialogue',raw.trim(),true);continue;}
   if(/^={3,}$/.test(trim)){flush();dialogue=false;pageBreak=true;continue;}if(/^#+(?:\s|$)/.test(trim)||/^=(?!=)/.test(trim)){flush();continue;}
   if(trim.startsWith('!')){add('action',raw.slice(raw.indexOf('!')+1).replace(/\t/g,'    '),true);continue;}
   const forced=trim[0]==='.'&&trim[1]!=='.'&&/^[\p{L}\p{N}]/u.test(plain(trim.slice(1))),scene=forced||before&&heading(trim);
   if(scene){const value=(forced?trim.slice(1):trim).replace(/\s+#[A-Za-z0-9][A-Za-z0-9.\-]*#\s*$/,'');add(insert(plain(value))?'insert':'scene',value);flush();continue;}
   if(trim.startsWith('>')){if(trim.endsWith('<')&&!trim.endsWith('\\<')){add('action',trim.slice(1,-1).trim(),true);centered=true;}else{add('transition',trim.slice(1).trim());flush();}continue;}
   if(before&&after&&raw.trimStart().endsWith('TO:')&&trim===trim.toLocaleUpperCase('es')){add('transition',trim);flush();continue;}
   if(trim.startsWith('~')){add('dialogue',trim.slice(1),true);lyrics=true;continue;}
   const forcedCharacter=trim.startsWith('@')&&trim.length>1,cueText=plain(forcedCharacter?trim.slice(1):trim).replace(/\s*\^$/,'').replace(/\s*\([^()]*\)\s*$/,''),autoCharacter=before&&!after&&trim[0]!=='\\'&&cueText.length<=120&&/\p{L}/u.test(cueText)&&cueText===cueText.toLocaleUpperCase('es')&&cueText.toLocaleUpperCase('es')!==cueText.toLocaleLowerCase('es');
   if(forcedCharacter||autoCharacter){let value=forcedCharacter?trim.slice(1):trim;if(/(?:^|[^\\])\^$/.test(value)){value=value.replace(/\s*\^$/,'');dual=true;}add('character',value);flush();dialogue=true;continue;}
   add('action',raw.replace(/\t/g,'    '),true);
  }flush();if(nodes.length)script.doc.content=nodes;else if(!cover.exists)throw Error('El Fountain no contiene texto de guion.');const validated=S.validate(script),warnings=[];
  if(dual)warnings.push('Los diálogos simultáneos se han conservado en orden de lectura, en una sola columna.');if(pageBreak)warnings.push('La paginación se ha recalculado con el formato del editor.');if(centered)warnings.push('El texto centrado se ha conservado como acción.');if(lyrics)warnings.push('Las letras de canciones se han conservado como diálogo.');if(warnings.length)onWarning(warnings.join(' '));return validated;
 }
 async function read(file,options={}){if(!file.size||file.size>maxBytes)throw Error('Selecciona un Fountain de texto de hasta 2 MB.');return parse(decode(new Uint8Array(await file.arrayBuffer())),{name:file.name,...options});}
 async function write(value){
  const script=S.forExport(value);if(!script)throw Error('No hay un guion para exportar.');const escape=text=>text.replace(/[\\*_\[\]]/g,'\\$&');let header='Title:\n'+script.title.split('\n').map(line=>'    '+escape(line)).join('\n');
  if(script.authors.some(a=>a.name)){header+='\nCredit: Escrito por\nAuthors:\n'+script.authors.filter(a=>a.name).map(a=>'    '+escape(a.name)).join('\n');}
  const contacts=script.authors.map(a=>[script.authors.length>1?a.name:'',a.email,a.phone,a.contact].filter(Boolean).join('\n')).filter(Boolean);if(contacts.length)header+='\nContact:\n'+contacts.flatMap(value=>value.split('\n').map(line=>'    '+escape(line))).join('\n');
  let text=header+'\n\n',speaker=false,sceneNumber=0;const paragraphs=[];
  for(const [index,node]of script.doc.content.entries()){
   const kind=node.attrs.kind,plainText=S.plain(node),linked=['dialogue','parenthetical'].includes(kind)&&speaker,orphan=kind==='dialogue'&&!linked;if(index)text+=linked?'\n':'\n\n';
   const paragraph={kind,runs:[]};paragraphs.push(paragraph);const wrapper=kind==='parenthetical'&&!/^\([\s\S]*\)$/.test(plainText),prefix={scene:'.',insert:'.',action:'',character:'@',transition:'>',section:'>'}[kind]||(orphan?'~':wrapper?'(':'');if(plainText)text+=prefix;let position=0,needActionPrefix=kind==='action';
   for(const run of node.content||[]){const record={parts:[],...(run.marks?.length?{marks:run.marks.map(m=>m.type==='character'?{type:m.type,attrs:{name:m.attrs.name}}:{type:m.type})}:{})};paragraph.runs.push(record);const marks=new Set((run.marks||[]).map(m=>m.type)),open=(marks.has('underline')?'_':'')+(marks.has('bold')?'**':'')+(marks.has('italic')?'*':''),close=(marks.has('italic')?'*':'')+(marks.has('bold')?'**':'')+(marks.has('underline')?'_':'');
    function append(value){if(!value)return;const escaped=escape(value),start=text.length;text+=escaped;record.parts.push([start,text.length]);position+=value.length;}
    for(const value of run.text.split(/(\n)/)){if(!value)continue;if(value==='\n'){append(value);if(orphan)text+='~';else if(kind==='dialogue'&&(plainText[position]==='\n'||position===plainText.length))text+='  ';else if(kind==='action'&&plainText[position-2]==='\n'&&position<plainText.length&&plainText[position]!=='\n')needActionPrefix=true;continue;}
     const leading=/^\s*/.exec(value)[0],trailing=/\s*$/.exec(value)[0],middle=value.slice(leading.length,Math.max(leading.length,value.length-trailing.length));append(leading);if(middle){if(needActionPrefix){text+='!';needActionPrefix=false;}text+=open;append(middle);text+=close;}if(value.length>leading.length)append(trailing);
    }
   }if(plainText&&(kind==='section'||wrapper))text+=kind==='section'?'<':')';if(plainText&&kind==='scene')text+=' #'+(++sceneNumber)+'#';speaker=kind==='character'||linked;
  }
  const metadata={version:1,signature:await hash(text),title:script.title,authors:script.authors.map(({name,email,phone,contact})=>({name,email,phone,contact})),characters:script.characters,paragraphs},output=text+'\n\n/* PLANO-WRITING-1 '+b64(JSON.stringify(metadata))+' */\n';if(new TextEncoder().encode(output).length>maxBytes)throw Error('El Fountain exportado supera 2 MB. Reduce su formato antes de descargarlo.');return output;
 }
 const api={read,parse,write,decode};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoFountain=api;
})(globalThis);
