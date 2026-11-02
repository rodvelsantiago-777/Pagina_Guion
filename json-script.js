/* JSON de escritura: líneas de WriterDuet y versión portátil de solo guion. */
(function(root){
  'use strict';
  const S=typeof module==='object'&&module.exports?require('./screenplay.js'):root.PlanoScreenplay;
  const format='plano.screenplay.json',maxBytes=5*1024*1024;
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const kinds={scene:['escena','slugline','scene','sceneheading'],action:['accion','action','texto','text','normal'],character:['personaje','character','editdialogname'],parenthetical:['parentesis','acotacion','parenthetical','editdialogparen'],dialogue:['dialogo','dialog','dialogue','editdialogcontent'],transition:['transicion','transition'],insert:['insert','inserto','shot','toma'],section:['seccion','section','secuencia','sequence','act','endact','acto','findeacto']};
  const types={scene:'Escena',action:'Acción',character:'Personaje',parenthetical:'Paréntesis',dialogue:'Diálogo',transition:'Transición',insert:'Insert',section:'Secuencia'};
  const omitted=new Set(['note','notes','nota','notas','image','imagen','comment','comentario','outline']);
  const markKeys={b:'bold',bold:'bold',i:'italic',italic:'italic',u:'underline',underline:'underline'};
  function kindOf(value){const key=norm(value);for(const [kind,names]of Object.entries(kinds))if(names.includes(key))return kind;return null;}
  function validText(value){if(typeof value!=='string'||value.length>220000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw Error('Hay texto inválido en el JSON.');return value;}
  function merge(runs){const result=[];for(const run of runs){if(!run.text)continue;const last=result.at(-1);if(last&&JSON.stringify(last.marks||[])===JSON.stringify(run.marks||[]))last.text+=run.text;else result.push(run);}return result;}
  function textRuns(line,budget,own){
    const text=validText(line.text),attributes=line.attributes??{};if(!object(attributes)||attributes.textAttributes!==undefined&&!object(attributes.textAttributes))throw Error('El formato de texto del JSON no es válido.');
    const events=new Map([[0,[]],[text.length,[]]]);let count=0;
    function add(position,change){if(!events.has(position))events.set(position,[]);events.get(position).push(change);}
    function range(value,type,name){
      if(!object(value)||!Number.isInteger(value.start)||!Number.isInteger(value.end)||value.start<0||value.end<value.start||value.end>=text.length)throw Error('El JSON contiene un rango de formato fuera del texto.');
      if(++count>2048||++budget.ranges>50000)throw Error('El JSON contiene demasiados rangos de formato.');
      const start=value.start,end=value.end+1; // WriterDuet incluye el carácter indicado por end.
      const splitsSurrogate=at=>at>0&&at<text.length&&/[\uD800-\uDBFF]/.test(text[at-1])&&/[\uDC00-\uDFFF]/.test(text[at]);
      if(splitsSurrogate(start)||splitsSurrogate(end))throw Error('Un rango de formato corta un carácter Unicode.');
      add(start,{type,name,delta:1});add(end,{type,name,delta:-1});
    }
    for(const [key,type]of Object.entries(markKeys)){
      const values=attributes.textAttributes?.[key];if(values===undefined||values===false||values===null)continue;
      if(values===true){if(text.length)range({start:0,end:text.length-1},type);continue;}
      if(!Array.isArray(values))throw Error('Los rangos de formato del JSON no son válidos.');for(const value of values)range(value,type);
    }
    if(own&&line.characterReferences!==undefined){if(!Array.isArray(line.characterReferences)||line.characterReferences.length>512)throw Error('Las referencias de personaje del JSON no son válidas.');for(const value of line.characterReferences){if(typeof value?.name!=='string'||!value.name.trim()||value.name.length>80)throw Error('Hay una referencia de personaje inválida.');range(value,'character',S.canonical(value.name));}}
    const points=[...events.keys()].sort((a,b)=>a-b),active={bold:0,italic:0,underline:0},names=new Map(),runs=[];
    for(let i=0;i<points.length-1;i++){
      for(const change of events.get(points[i])){if(change.type==='character'){const count=(names.get(change.name)||0)+change.delta;if(count)names.set(change.name,count);else names.delete(change.name);}else active[change.type]+=change.delta;}
      if(names.size>1)throw Error('El JSON contiene referencias de personaje que se solapan.');
      const value=text.slice(points[i],points[i+1]);if(!value)continue;const marks=['bold','italic','underline'].filter(type=>active[type]>0).map(type=>({type}));if(names.size)marks.push({type:'character',attrs:{name:names.keys().next().value}});runs.push({type:'text',text:value,...(marks.length?{marks}:{})});
    }
    return merge(runs);
  }
  function cover(rows,fallback,user,own){
    const titleRow=rows.find(row=>['title','titulo'].includes(norm(row.type))),title=titleRow?validText(titleRow.text):fallback;
    if(own){
      const authors=[],fields=new Set();for(const row of rows){if(row.authorIndex===undefined&&row.authorField===undefined)continue;
        if(!Number.isInteger(row.authorIndex)||row.authorIndex<0||row.authorIndex>7||!['name','email','phone','contact'].includes(row.authorField))throw Error('Los autores del JSON no son válidos.');
        const key=row.authorIndex+':'+row.authorField;if(fields.has(key))throw Error('Hay un dato de autor repetido en el JSON.');fields.add(key);
        while(authors.length<=row.authorIndex)authors.push({id:S.id(),name:'',email:'',phone:'',contact:''});authors[row.authorIndex][row.authorField]=validText(row.text);
      }return{title,authors};
    }
    const authors=[];let naming=false,contacts=false,active=0;
    for(const row of rows){const text=validText(row.text).trim();if(!text||row===titleRow)continue;
      if(/^(?:escrito por|written by|guion de|by)\s*:?$/i.test(text)){naming=true;continue;}
      const existing=authors.findIndex(a=>a.name===text);if(existing>=0){active=existing;contacts=true;continue;}
      const email=text.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/),phone=/^\+?[\d\s().-]{7,}$/.test(text),label=/^(?:contacto|contact|e-?mail|correo(?: electr[oó]nico)?|tel[eé]fono)\s*:?$/i.test(text);
      if(email||phone||label||/^(?:copyright|©|v\d|versi[oó]n)/i.test(text))contacts=true;
      if(['author','autor'].includes(norm(row.type))||naming&&!contacts){authors.push({id:S.id(),name:text,email:'',phone:'',contact:''});continue;}
      if(!authors.length)authors.push({id:S.id(),name:user.name||'',email:'',phone:'',contact:''});if(label)continue;
      if(email)authors[active].email=email[0];else if(phone)authors[active].phone=text;else authors[active].contact+=(authors[active].contact?'\n':'')+text;
    }
    if(!authors.length)authors.push({id:S.id(),name:user.name||'',email:user.email||'',phone:'',contact:''});return{title,authors};
  }
  function parse(text,{name='Sin título.json',user={}}={}){
    if(typeof text!=='string'||new TextEncoder().encode(text).length>maxBytes)throw Error('Selecciona un JSON de guion de hasta 5 MB.');let data;try{data=JSON.parse(text.replace(/^\ufeff/,''));}catch{throw Error('El archivo no contiene JSON válido.');}
    if(!object(data))throw Error('El JSON no contiene un guion compatible.');
    if(data.format==='plano.project'||data.app==='PLANO'&&Array.isArray(data.annotations))throw Error('Las copias de producción se importan como proyecto .plano. Este importador JSON admite solo escritura.');
    const own=data.format===format;if(data.format!==undefined&&!own||own&&data.version!==1)throw Error('La versión o el formato de este JSON de guion no es compatible.');
    if(!Array.isArray(data.lines)||data.lines.length>8000)throw Error('El JSON no contiene una lista de párrafos de guion compatible.');
    if(data.titlePage!==undefined&&(!object(data.titlePage)||!Array.isArray(data.titlePage.lines)||data.titlePage.lines.length>1000))throw Error('La portada del JSON no es válida.');
    const titleRows=data.titlePage?.lines||[];for(const row of titleRows)if(!object(row)||typeof row.type!=='string'||typeof row.text!=='string')throw Error('Hay un párrafo de portada inválido.');
    const fallback=name.replace(/\.json$/i,'')||'Sin título',portada=titleRows.length?cover(titleRows,fallback,user,own):own?{title:fallback,authors:[]}:{title:fallback,authors:S.create(fallback,user).authors},script=S.create(portada.title,user),nodes=[],budget={ranges:0};script.title=portada.title;script.authors=portada.authors;
    for(const line of data.lines){if(!object(line)||typeof line.type!=='string')throw Error('Hay un párrafo de guion inválido en el JSON.');if(omitted.has(norm(line.type)))continue;
      let kind=kindOf(line.type);if(!kind)throw Error('El JSON contiene un tipo de párrafo no compatible: '+line.type.slice(0,60)+'.');
      const runs=textRuns(line,budget,own);if(!own&&kind==='scene'&&/^(?:INSERT|INSERTO|VOLVEMOS A ESCENA|BACK TO SCENE)\b/i.test(line.text))kind='insert';
      nodes.push({type:'paragraph',attrs:{id:S.id(),kind},...(runs.length?{content:runs}:{})});
    }
    if(nodes.length)script.doc.content=nodes;else if(!titleRows.some(row=>norm(row.type)==='title'&&row.text.trim()))throw Error('El JSON no contiene texto de guion.');
    if(own){if(!Array.isArray(data.characters)||data.characters.length>500)throw Error('La lista de personajes del JSON no es válida.');script.characters=data.characters;}
    return S.validate(script);
  }
  async function read(file,options={}){
    if(!file.size||file.size>maxBytes)throw Error('Selecciona un JSON de guion de hasta 5 MB.');const bytes=new Uint8Array(await file.arrayBuffer());let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';let text;try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{throw Error('El JSON tiene una codificación dañada. Guárdalo como UTF-8.');}return parse(text,{name:file.name,...options});
  }
  function write(value){
    const script=S.validate(value);if(!script)throw Error('No hay un guion para exportar.');const layout=S.layout(script.doc),coverRows=[];let titleIndex=0,sceneId=null,sceneNumber=0;
    function row(type,text,attributes={},extra={}){return{type,text,attributes:{textAttributes:{},...attributes},...extra};}
    const blank=()=>coverRows.push(row('Texto',''));
    for(let i=0;i<17;i++)blank();coverRows.push(row('Title',script.title,script.title?{textAttributes:{b:[{start:0,end:script.title.length-1}]}}:{}));blank();blank();blank();coverRows.push(row('Texto','Escrito por:'));blank();blank();
    for(const [index,author]of script.authors.entries())coverRows.push(row('Author',author.name,{}, {authorIndex:index,authorField:'name'}));
    while(coverRows.length<47)blank();
    for(const [index,author]of script.authors.entries())for(const [field,type]of [['email','Address'],['phone','Phone'],['contact','Texto']])if(author[field])coverRows.push(row(type,author[field],{}, {authorIndex:index,authorField:field}));
    const lines=script.doc.content.map((node,index)=>{
      const text=S.plain(node),textAttributes={},references=[];let offset=0;
      function append(list,range){const last=list.at(-1);if(last&&last.end+1===range.start&&last.name===range.name)last.end=range.end;else list.push(range);}
      for(const run of node.content||[]){for(const mark of run.marks||[]){const range={start:offset,end:offset+run.text.length-1};if(mark.type==='character')append(references,{...range,name:mark.attrs.name});else{const key=({bold:'b',italic:'i',underline:'u'})[mark.type];append(textAttributes[key]||=([]),range);}}offset+=run.text.length;}
      const wdId='p'+(index+1),attributes={textAttributes};if(node.attrs.kind==='scene'&&text.trim()){sceneId=wdId;attributes.numberObject={number:String(++sceneNumber)};}
      return row(types[node.attrs.kind],text,attributes,{wdId,uid:wdId,documentId:'-',pageNumber:(layout.blocks[index]?.lines[0]?.page||0)+1,...(sceneId?{sceneWdId:sceneId}:{}),...(references.length?{characterReferences:references}:{})});
    });
    const titlePage={documentId:'titlePage',lines:coverRows.map(item=>{const id='t'+(++titleIndex);return{...item,wdId:id,uid:id,documentId:'titlePage'};}),pageSettings:{pageSize:'Letter'}};
    return JSON.stringify({format,version:1,lines,titlePage,characters:script.characters,lineNumbers:{Escena:{left:true,right:true}},documentDetails:{titlePage:{title:'Página de título'},'-':{title:'Guion'}},pageSettings:{pageSize:'Letter'}},null,2)+'\n';
  }
  const api={parse,read,write};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoJson=api;
})(globalThis);
