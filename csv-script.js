/* CSV de guion: dos columnas, comillas y saltos; sin planos ni datos de producción. */
(function(root){
  'use strict';
  const S=typeof module==='object'&&module.exports?require('./screenplay.js'):root.PlanoScreenplay,maxBytes=5*1024*1024;
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const kinds={scene:['escena','scene','slugline','sceneheading'],action:['accion','action','texto','text','normal'],character:['personaje','character','editdialogname'],parenthetical:['parentesis','acotacion','parenthetical','editdialogparen'],dialogue:['dialogo','dialogue','dialog','editdialogcontent'],transition:['transicion','transition'],insert:['insert','inserto','shot','toma'],section:['seccion','section','secuencia','sequence','act','acto','endact']};
  const types={scene:'Escena',action:'Acción',character:'Personaje',parenthetical:'Paréntesis',dialogue:'Diálogo',transition:'Transición',insert:'Insert',section:'Secuencia'};
  const omitted=new Set(['note','notes','nota','notas','comment','comentario','image','imagen','outline']);
  const coverLabels=new Set(['title','titulo','author','autor','address','email','phone','copyright','contact','contacto','contactname','writtenby']);
  function kindOf(value){const key=norm(value);for(const [kind,names]of Object.entries(kinds))if(names.includes(key))return kind;return null;}
  function authorField(value){const match=/^(Author|Autor|Address|E-mail|Email|Phone|Contact|Contacto)(?:\s+([1-8]))?$/i.exec(value.trim());return match?{index:match[2]?Number(match[2])-1:0,field:({author:'name',autor:'name',address:'email',email:'email',phone:'phone',contact:'contact',contacto:'contact'})[norm(match[1])]}:null;}
  function isCover(value){return coverLabels.has(norm(value))||Boolean(authorField(value));}
  function speaker(value){return value.trim()&&value.length<=100&&/[\p{L}]/u.test(value)&&value===value.toLocaleUpperCase('es')&&/^[\p{L}\p{N} .’'()\-]+$/u.test(value);}
  function rowsOf(text,delimiter,limit=12000){
    const rows=[];let row=[],field='',quoted=false,closed=false,started=false;
    function pushField(){if(field.length>220000)throw Error('Un campo del CSV es demasiado largo.');row.push(field);field='';closed=false;started=false;if(row.length>2)throw Error('El CSV de guion debe tener dos columnas: tipo o personaje, y texto.');}
    function pushRow(){pushField();if(row.some(value=>value.trim()))rows.push(row);row=[];if(rows.length>12000)throw Error('El CSV contiene demasiadas filas.');return rows.length>=limit;}
    for(let i=0;i<text.length;i++){
      const char=text[i];
      if(quoted){if(char==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else if(char==='\r'){field+='\n';if(text[i+1]==='\n')i++;}else field+=char;}
      else if(char===delimiter){pushField();}
      else if(char==='\n'||char==='\r'){if(pushRow())return rows;if(char==='\r'&&text[i+1]==='\n')i++;}
      else if(closed){if(char!==' '&&char!=='\t')throw Error('Hay texto fuera de las comillas de un campo CSV.');}
      else if(char==='"'){if(started)throw Error('Una comilla del CSV no está escapada.');quoted=true;started=true;}
      else{field+=char;started=true;}
      if(field.length>220000)throw Error('Un campo del CSV es demasiado largo.');
    }
    if(quoted)throw Error('El CSV tiene un campo con comillas sin cerrar.');if(started||closed||field.length||row.length)pushRow();return rows;
  }
  function table(text){
    text=text.replace(/^\ufeff/,'');const directive=/^sep=([,;\t])(?:\r\n|\r|\n)/i.exec(text);if(directive)text=text.slice(directive[0].length);
    let delimiter=directive?.[1];if(!delimiter){for(const candidate of [',',';','\t']){try{const sample=rowsOf(text,candidate,30);if(sample.length&&sample.every(row=>row.length===2)){delimiter=candidate;break;}}catch{}}}
    if(!delimiter)throw Error('El CSV de guion necesita dos columnas separadas por coma, punto y coma o tabulación.');
    const rows=rowsOf(text,delimiter);if(!rows.length||rows.some(row=>row.length!==2))throw Error('El CSV de guion debe tener dos columnas en todas sus filas.');return rows;
  }
  function cover(rows,fallback,user,literal){
    const titleRow=rows.find(r=>['title','titulo'].includes(norm(r[0]))),title=titleRow?titleRow[1]:fallback,authors=[];
    if(literal){const seen=new Set();for(const [type,text]of rows){const field=authorField(type);if(!field)continue;const key=field.index+':'+field.field;if(seen.has(key))throw Error('Un dato de autor está repetido en el CSV.');seen.add(key);while(authors.length<=field.index)authors.push({id:S.id(),name:'',email:'',phone:'',contact:''});authors[field.index][field.field]=text;}return{title,authors};}
    let naming=false,contacts=false,active=0;
    for(const row of rows){const text=row[1].trim();if(!text||row===titleRow)continue;if(/^(?:escrito por|written by|guion de|by)\s*:?$/i.test(text)){naming=true;continue;}
      const existing=authors.findIndex(a=>a.name===text);if(existing>=0){active=existing;contacts=true;continue;}
      const email=text.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/),phone=/^\+?[\d\s().-]{7,}$/.test(text),label=/^(?:contacto|contact|e-?mail|tel[eé]fono)\s*:?$/i.test(text);
      if(email||phone||label||/^(?:copyright|©|v\d|versi[oó]n)/i.test(text))contacts=true;
      if(['author','autor'].includes(norm(row[0]))||naming&&!contacts){authors.push({id:S.id(),name:text,email:'',phone:'',contact:''});continue;}
      if(!authors.length)authors.push({id:S.id(),name:user.name||'',email:'',phone:'',contact:''});if(label)continue;if(email)authors[active].email=email[0];else if(phone)authors[active].phone=text;else authors[active].contact+=(authors[active].contact?'\n':'')+text;
    }
    if(!authors.length)authors.push({id:S.id(),name:user.name||'',email:user.email||'',phone:'',contact:''});return{title,authors};
  }
  function parse(text,{name='Sin título.csv',user={}}={}){
    if(typeof text!=='string'||!text.trim()||new TextEncoder().encode(text).length>maxBytes)throw Error('Selecciona un CSV de guion de hasta 5 MB.');
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw Error('El CSV contiene datos binarios o caracteres no válidos.');
    const rows=table(text),first=rows[0],header=['tipo','type','elemento','element','tipodeelemento'].includes(norm(first[0]))&&['texto','text','contenido','textoliteral'].includes(norm(first[1])),literal=header&&norm(first[1])==='textoliteral';if(header)rows.shift();if(!rows.length)throw Error('El CSV no contiene texto de guion.');
    // Solo nuestra cabecera declara el escape de texto literal. No se altera un CSV externo.
    if(literal)for(const row of rows)if(row[1].startsWith("'"))row[1]=row[1].slice(1);
    const hasCover=rows.some(row=>['title','titulo'].includes(norm(row[0]))),firstBody=rows.findIndex(row=>!isCover(row[0])&& !['texto','text'].includes(norm(row[0]))&&(kindOf(row[0])||speaker(row[0].trim()))),start=hasCover?(firstBody>=0?firstBody:rows.length):0;
    const fallback=name.replace(/\.csv$/i,'')||'Sin título',portada=hasCover?cover(rows.slice(0,start),fallback,user,literal):{title:fallback,authors:S.create(fallback,user).authors},script=S.create(portada.title,user),nodes=[];script.title=portada.title;script.authors=portada.authors;
    function add(kind,value){if(nodes.length>=8000)throw Error('El CSV contiene demasiados párrafos.');nodes.push({type:'paragraph',attrs:{id:S.id(),kind},...(value?{content:[{type:'text',text:value}]}:{})});}
    for(const [type,text]of rows.slice(start)){
      if(omitted.has(norm(type)))continue;let kind=kindOf(type);
      if(kind){if(!literal&&kind==='scene'&&/^(?:INSERT|INSERTO|VOLVEMOS A ESCENA|BACK TO SCENE)\b/i.test(text))kind='insert';add(kind,text);continue;}
      const name=type.trim();if(literal||!speaker(name)||isCover(type))throw Error('El CSV contiene un tipo o personaje no compatible: '+type.slice(0,60)+'.');
      add('character',name);let dialogue=text;
      while(dialogue.startsWith('(')){
        let depth=0,end=-1;for(let i=0;i<dialogue.length;i++){if(dialogue[i]==='(')depth++;else if(dialogue[i]===')'&&--depth===0){end=i;break;}}
        if(end<0)break;add('parenthetical',dialogue.slice(0,end+1));dialogue=dialogue.slice(end+1).replace(/^[ \t]+/,'');
      }
      if(dialogue||!text)add('dialogue',dialogue);
    }
    if(nodes.length)script.doc.content=nodes;else if(!hasCover)throw Error('El CSV no contiene párrafos de guion compatibles.');return S.validate(script);
  }
  function decode(bytes){
    let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';
    try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{if(encoding!=='utf-8')throw Error('La codificación del CSV está dañada.');return new TextDecoder('windows-1252').decode(bytes);}
  }
  async function read(file,options={}){if(!file.size||file.size>maxBytes)throw Error('Selecciona un CSV de guion de hasta 5 MB.');return parse(decode(new Uint8Array(await file.arrayBuffer())),{name:file.name,...options});}
  function write(value){
    const script=S.validate(value);if(!script)throw Error('No hay un guion para exportar.');const rows=[['Tipo','Texto (literal)'],['Title',script.title]];
    if(script.authors.some(a=>a.name))rows.push(['Texto','Escrito por:']);
    for(const [index,author]of script.authors.entries()){const suffix=script.authors.length>1?' '+(index+1):'';rows.push(['Author'+suffix,author.name]);for(const [field,label]of [['email','Address'],['phone','Phone'],['contact','Contact']])if(author[field])rows.push([label+suffix,author[field]]);}
    for(const node of script.doc.content)rows.push([types[node.attrs.kind],S.plain(node)]);
    const literal=text=>/^[\s]*[=+\-@]/u.test(text)||/^[\t\r\n']/.test(text)?"'"+text:text,quote=text=>'"'+text.replace(/"/g,'""')+'"';
    return '\ufeff'+rows.map(([type,text],index)=>[quote(type),quote(index?literal(text):text)].join(',')).join('\r\n')+'\r\n';
  }
  const api={parse,read,write,table};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoCsv=api;
})(globalThis);
