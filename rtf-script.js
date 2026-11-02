/* RTF de escritura: lector por grupos, Unicode y formato; nunca ejecuta campos u objetos. */
(function(root){
  'use strict';
  const S=typeof module==='object'&&module.exports?require('./screenplay.js'):root.PlanoScreenplay;
  const maxBytes=5*1024*1024;
  const ignored=new Set(('fontemb fontfile filetbl colortbl info generator pict object objdata objclass objname objtime result datafield datastore themedata colorschememapping listtable listoverridetable listtext pntext pn numbering leveltext levelnumbers revtbl rsidtbl latentstyles xmlnstbl xmlopen xmlclose xmlattrname xmlattrvalue annotation atnid atnauthor atndate footnote endnote shp shpinst shprslt nonshppict background fldinst formfield docvar userprops propname proptype staticval linkval mmathPr').split(' '));
  const symbols={emdash:'—',endash:'–',emspace:'\u2003',enspace:'\u2002',qmspace:'\u2005',bullet:'•',lquote:'‘',rquote:'’',ldblquote:'“',rdblquote:'”',tab:'\t',line:'\n'};
  const charset={0:null,1:null,77:10000,128:932,129:949,134:936,136:950,161:1253,162:1254,163:1258,177:1255,178:1256,186:1257,204:1251,222:874,238:1250};
  const encodings={65001:'utf-8',932:'shift_jis',936:'gbk',949:'euc-kr',950:'big5',10000:'macintosh',874:'windows-874',28591:'iso-8859-1'};
  const norm=text=>(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function binary(bytes){if(!bytes.length||bytes.length>maxBytes)throw Error('Selecciona un RTF con texto de hasta 5 MB.');let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return text.replace(/^\xef\xbb\xbf/,'');}
  function tokenize(input){
    if(typeof input!=='string'||input.length>maxBytes)throw Error('El RTF supera el tamaño admitido.');
    input=input.replace(/^\ufeff/,'');if(!/^\s*\{\\rtf1(?=[\\\s{}])/.test(input))throw Error('El archivo no es un RTF válido.');
    const rows=[],styles=new Map(),fonts=new Map(),decoders=new Map(),stack=[];
    let state={dest:'body',skip:false,star:false,start:true,uc:1,cp:1252,c:{},p:{left:0,right:0,align:'left',style:0}},runs=[],bytes=[],fallback=0,total=0,closed=false,defaultFont=0,pendingBreak=false,bodyFormat=null;
    const clone=value=>({...value,c:{...value.c},p:{...value.p},start:true,star:false,upr:false,uprChildren:0});
    function effective(id,seen=new Set()){
      const item=styles.get(id);if(!item||seen.has(id)||seen.size>128)return{p:{},c:{},names:''};seen.add(id);
      const base=effective(item.based,seen);return{p:{...base.p,...item.p},c:{...base.c,...item.c},names:[item.name,base.names].filter(Boolean).join('|')};
    }
    function append(text){
      if(!text||state.skip)return;
      if(state.dest==='style'){state.styleText=(state.styleText||'')+text;if(state.styleText.length>1024)throw Error('Hay un estilo RTF demasiado largo.');return;}
      if(state.dest!=='body')return;
      const paragraphStyle=effective(state.p.style),characterStyle=effective(state.c.style),format={...paragraphStyle.c,...characterStyle.c,...state.c};
      if(format.hidden||format.deleted)return;
      if(/[\u0000-\u0008\u000b-\u001f\u007f]/.test(text))throw Error('El RTF contiene datos binarios fuera de un objeto.');
      if(format.caps)text=text.toLocaleUpperCase('es');
      total+=text.length;if(total>300000)throw Error('El texto del RTF supera el tamaño admitido.');
      const marks=['bold','italic','underline'].filter(key=>format[key]).map(type=>({type})),reference=/PLANO Personaje: ([^|]+)/i.exec(characterStyle.names);
      if(reference)marks.push({type:'character',attrs:{name:S.canonical(reference[1])}});
      const last=runs.at(-1);if(last&&JSON.stringify(last.marks||[])===JSON.stringify(marks))last.text+=text;
      else runs.push({type:'text',text,...(marks.length?{marks}:{})});
      bodyFormat={...paragraphStyle.p,...state.p,names:paragraphStyle.names};
    }
    function flushBytes(){
      if(!bytes.length)return;
      const selectedFont=state.c.font??effective(state.c.style).c.font??effective(state.p.style).c.font??defaultFont;
      const cp=fonts.get(selectedFont)??state.cp,label=encodings[cp]||(/^125[0-8]$/.test(String(cp))?'windows-'+cp:null);
      if(!label){if(bytes.some(b=>b>127))throw Error('La codificación de este RTF no es compatible. Exporta el documento como RTF Unicode.');append(new TextDecoder('utf-8').decode(new Uint8Array(bytes)));}
      else{if(!decoders.has(label))decoders.set(label,new TextDecoder(label,{fatal:true}));try{append(decoders.get(label).decode(new Uint8Array(bytes)));}catch{throw Error('El RTF contiene texto con una codificación dañada.');}}
      bytes=[];
    }
    function byte(value){if(fallback){fallback--;return;}if(!state.skip&&['body','style'].includes(state.dest))bytes.push(value);}
    function paragraph(force=false){
      flushBytes();if(state.skip||state.dest!=='body')return;
      if(runs.length||force){if(rows.length>=12000)throw Error('El RTF contiene demasiados párrafos.');rows.push({runs,format:bodyFormat||{...effective(state.p.style).p,...state.p,names:effective(state.p.style).names},pageBreak:pendingBreak});if(runs.length)pendingBreak=false;}
      runs=[];bodyFormat=null;
    }
    function control(word,n,hasNumber){
      if(word==='bin'){
        if(!hasNumber||n<0||n>maxBytes)throw Error('El RTF contiene un bloque binario inválido.');if(fallback)fallback--;return n;
      }
      if(fallback){fallback--;return;}
      if(state.skip)return;
      if(word==='fonttbl'){state.dest='fonttable';return;}
      if(word==='stylesheet'){state.dest='stylesheet';return;}
      if(state.dest==='fonttable'){
        if(word==='f')state.fontDefinition=n;
        if(word==='fcharset'&&charset[n]!==undefined)fonts.set(state.fontDefinition,charset[n]);
        if(word==='cpg')fonts.set(state.fontDefinition,n);return;
      }
      if(state.dest==='stylesheet'&&['s','cs'].includes(word)){state.dest='style';state.star=false;state.styleDefinition=n;state.styleType=word;state.styleText='';state.c={};state.p={};return;}
      if(word==='sbasedon'&&state.dest==='style'){state.based=n;return;}
      if(word==='ud'&&state.unicodeAlternative){state.star=false;return;}
      if(state.star){state.skip=true;state.star=false;}
      if(ignored.has(word)||/^(?:header|footer)(?:l|r|f)?$/.test(word)){state.skip=true;return;}
      if(state.skip)return;
      if(word==='upr'){state.upr=true;state.uprChildren=0;return;}
      if(word==='ansicpg'){state.cp=n;return;}
      if(word==='mac'){state.cp=10000;return;}
      if(word==='deff'){defaultFont=n;return;}
      if(word==='uc'){if(n<0||n>32)throw Error('El RTF tiene una secuencia Unicode inválida.');state.uc=n;return;}
      if(word==='u'){if(!hasNumber||n< -32768||n>65535)throw Error('El RTF tiene un carácter Unicode inválido.');append(String.fromCharCode(n<0?n+65536:n));fallback=state.uc;return;}
      if(word==='pard'){state.p={left:0,right:0,align:'left',style:0};return;}
      if(word==='plain'){state.c={};return;}
      if(['b','i','ul','ulw','uld','uldb','ulwave','caps','v','deleted'].includes(word)){
        state.c[({b:'bold',i:'italic',caps:'caps',v:'hidden',deleted:'deleted'})[word]||'underline']=!hasNumber||n!==0;return;
      }
      if(word==='ulnone'){state.c.underline=false;return;}
      if(word==='f'){state.c.font=n;return;}
      if(word==='cs'){state.c.style=n;return;}
      if(word==='s'){state.p={left:0,right:0,align:'left',...effective(n).p,style:n};return;}
      if(word==='li'||word==='lin'){state.p.left=n;return;}
      if(word==='ri'||word==='rin'){state.p.right=n;return;}
      if(['ql','qc','qr','qj'].includes(word)){state.p.align=({ql:'left',qc:'center',qr:'right',qj:'left'})[word];return;}
      if(word==='pagebb'){pendingBreak=!hasNumber||n!==0;return;}
      if(['page','sect'].includes(word)){paragraph();pendingBreak=true;return;}
      if(word==='par'||word==='row'){paragraph(true);return;}
      if(word==='cell'){append('\t');return;}
      if(symbols[word])append(symbols[word]);
    }
    for(let i=0;i<input.length;){
      const char=input[i];
      if(closed){if(!/\s/.test(char))throw Error('Hay datos fuera del documento RTF.');i++;continue;}
      if(char==='{'){
        flushBytes();fallback=0;if(stack.length>=256)throw Error('El RTF tiene demasiados grupos anidados.');
        const parent=state;stack.push(parent);state=clone(parent);
        if(parent.upr){parent.uprChildren++;state.skip=parent.skip||parent.uprChildren===1;state.unicodeAlternative=parent.uprChildren===2;}
        i++;continue;
      }
      if(char==='}'){
        flushBytes();fallback=0;if(!stack.length)throw Error('El RTF tiene grupos dañados.');
        if(state.dest==='style'&&state.styleDefinition!==undefined){if(styles.size>=2048)throw Error('El RTF contiene demasiados estilos.');styles.set(state.styleDefinition,{name:(state.styleText||'').replace(/;\s*$/,'').trim(),based:state.based,p:{...state.p},c:{...state.c},type:state.styleType});}
        if(stack.length===1)paragraph();state=stack.pop();if(!stack.length)closed=true;i++;continue;
      }
      if(char==='\r'||char==='\n'){i++;continue;}
      if(char!=='\\'){const code=input.charCodeAt(i++);if(code>255){flushBytes();if(fallback)fallback--;else append(String.fromCharCode(code));}else byte(code);continue;}
      i++;if(i>=input.length)throw Error('El RTF termina con una secuencia incompleta.');const symbol=input[i++];
      if(symbol==="'"){
        const hex=input.slice(i,i+2);if(!/^[\da-f]{2}$/i.test(hex))throw Error('Hay un carácter escapado inválido en el RTF.');byte(parseInt(hex,16));i+=2;continue;
      }
      flushBytes();
      if(!/[a-z]/i.test(symbol)){
        if(fallback){fallback--;continue;}
        if(symbol==='*')state.star=true;
        else if(['\\','{','}'].includes(symbol))append(symbol);
        else if(symbol==='~')append('\u00a0');else if(symbol==='_')append('‑');else if(symbol==='-')append('\u00ad');
        else if(symbol==='\r'||symbol==='\n'){if(symbol==='\r'&&input[i]==='\n')i++;paragraph(true);}continue;
      }
      let word=symbol;while(i<input.length&&/[a-z]/i.test(input[i])){word+=input[i++];if(word.length>64)throw Error('Hay un control RTF inválido.');}
      let number='',sign=1;if(input[i]==='-'){sign=-1;i++;}while(i<input.length&&/\d/.test(input[i])){number+=input[i++];if(number.length>10)throw Error('Hay un parámetro RTF inválido.');}
      const n=number?Number(number)*sign:0;if(Math.abs(n)>2147483647)throw Error('Hay un parámetro RTF inválido.');if(input[i]===' ')i++;
      const length=control(word.toLowerCase(),n,Boolean(number));
      if(length!==undefined){if(i+length>input.length)throw Error('El bloque binario RTF está incompleto.');i+=length;}
    }
    if(!closed||stack.length)throw Error('El RTF está incompleto: hay grupos sin cerrar.');
    return{rows,styles};
  }
  const aliases={scene:['slugline','sceneheading','escena'],action:['action','accion'],character:['editdialogname','character','personaje'],parenthetical:['editdialogparen','parenthetical','parentesis','acotacion'],dialogue:['editdialogcontent','dialogue','dialogo'],transition:['transition','transicion'],insert:['shot','insert','inserto'],section:['section','seccion']};
  function role(row){for(const name of (row.format.names||'').split('|').map(norm))for(const [kind,keys]of Object.entries(aliases))if(keys.includes(name))return kind;return null;}
  const scene=text=>/^(?:\d+[A-Z]?[.)]?\s*)?(?:INT\.?\s*[/.-]\s*EXT\.?|EXT\.?\s*[/.-]\s*INT\.?|INT\.?|EXT\.?|I\/E\.?)\s/i.test(text);
  function clean(row){const value=row.runs.map(r=>r.text).join('');let start=value.search(/\S/),end=value.trimEnd().length;if(start<0)return[];
    if(scene(value.trim())||role(row)==='scene'){
      const prefix=/^\s*\d+[A-Z]?[.)]?\s*(?=(?:INT|EXT|I\/E)[.\s/])/i.exec(value);if(prefix)start=prefix[0].length;
      const suffix=/(?:\t| {2,})\s*\d+[A-Z]?\s*$/.exec(value);if(suffix)end=suffix.index;
    }
    let offset=0;return row.runs.flatMap(run=>{const a=Math.max(0,start-offset),b=Math.min(run.text.length,end-offset);offset+=run.text.length;return b>a?[{...run,text:run.text.slice(a,b).replace(/\t/g,'    ')}]:[];});
  }
  function cover(rows,fallback,user){
    const titleRow=rows.find(r=>/(?:^|\|)(?:Title|Título)(?:\||$)/i.test(r.format.names))||rows.find(r=>r.text),title=titleRow?.text||fallback,authors=[];
    let naming=false,contacts=false,active=0;
    for(const row of rows){const text=row.text;if(!text||row===titleRow)continue;
      if(/^(?:escrito por|written by|guion de|by)\s*:?$/i.test(text)){naming=true;continue;}
      const found=authors.findIndex(a=>a.name===text);if(found>=0){active=found;contacts=true;continue;}
      const email=text.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/),phone=/^\+?[\d\s().-]{7,}$/.test(text),label=/^(?:contacto|contact|e-?mail|tel[eé]fono)\s*:?$/i.test(text);
      if(email||phone||label||/^(?:Copyright|©|v\d|versi[oó]n)/i.test(text))contacts=true;
      if(/(?:^|\|)(?:Author|Autor)(?:\||$)/i.test(row.format.names)||naming&&!contacts){authors.push({id:S.id(),name:text,email:'',phone:'',contact:''});continue;}
      if(!authors.length)authors.push({id:S.id(),name:user.name||'',email:'',phone:'',contact:''});if(label)continue;
      if(email)authors[active].email=email[0];else if(phone)authors[active].phone=text;else authors[active].contact+=(authors[active].contact?'\n':'')+text;
    }
    if(!authors.length)authors.push({id:S.id(),name:user.name||'',email:user.email||'',phone:'',contact:''});return{title,authors};
  }
  function parse(input,{name='Sin título.rtf',user={}}={}){
    const parsed=tokenize(input),rows=parsed.rows.map(r=>({...r,runs:clean(r)})).map(r=>({...r,text:r.runs.map(run=>run.text).join('')})),firstScene=rows.findIndex(r=>scene(r.text)||role(r)==='scene'),firstBreak=rows.findIndex(r=>r.text&&r.pageBreak);
    const styled=rows.findIndex(r=>r.text&&role(r)),hasTitle=rows.some(r=>/(?:^|\|)(?:Title|Título)(?:\||$)/i.test(r.format.names)),label=rows.findIndex(r=>/^(?:escrito por|written by|guion de|by)\s*:?$/i.test(r.text));
    const hasCover=hasTitle||label>=0&&(firstScene<0||label<firstScene),start=hasCover?(firstBreak>=0?firstBreak:firstScene>=0?firstScene:styled>=0?styled:rows.length):0;
    const fallback=name.replace(/\.rtf$/i,'')||'Sin título',portada=hasCover?cover(rows.slice(0,start),fallback,user):{title:fallback,authors:S.create(fallback,user).authors};
    const script=S.create(portada.title,user);script.title=portada.title;script.authors=portada.authors;
    const body=rows.slice(start).filter(r=>r.text),baseline=body.length?Math.min(...body.map(r=>r.format.left||0)):0,blocks=[];let previous='';
    for(let index=0;index<body.length;index++){
      const row=body[index],text=row.text,left=(row.format.left||0)-baseline;let kind=role(row);
      if(/^(?:INSERT|INSERTO|VOLVEMOS A ESCENA|BACK TO SCENE)\b/i.test(text))kind='insert';
      else if(scene(text))kind='scene';
      if(!kind){
        if(/^(?:CORTE A(?: NEGRO)?|FUNDIDO(?: A NEGRO)?|FADE (?:IN|OUT)|CUT TO|DISSOLVE TO|FIN|THE END)\s*[:.!]?$/i.test(text)||row.format.align==='right')kind='transition';
        else if(/^\(.*\)$/s.test(text))kind='parenthetical';
        else if(left>=2500&&text===text.toLocaleUpperCase('es')&&text.length<=100)kind='character';
        else if(left>=900&&['character','dialogue','parenthetical'].includes(previous))kind='dialogue';
        else kind='action';
      }
      blocks.push({type:'paragraph',attrs:{id:S.id(),kind},content:row.runs});previous=kind;
    }
    if(blocks.length)script.doc.content=blocks;else if(!hasCover)throw Error('El RTF no contiene texto de guion.');
    script.characters=[...new Set([...parsed.styles.values()].map(s=>/^PLANO Personaje: (.+)$/i.exec(s.name)?.[1]).filter(Boolean).map(S.canonical))];
    return S.validate(script);
  }
  async function read(file,options={}){if(!file.size||file.size>maxBytes)throw Error('Selecciona un RTF con texto de hasta 5 MB.');return parse(binary(new Uint8Array(await file.arrayBuffer())),{name:file.name,...options});}
  function escape(text){let out='';for(let i=0;i<String(text).length;i++){const c=String(text)[i],code=c.charCodeAt(0);if(c==='\\'||c==='{'||c==='}')out+='\\'+c;else if(c==='\n')out+='\\line ';else if(c==='\t')out+='\\tab ';else if(code>=32&&code<=126)out+=c;else if(code>=128)out+='\\u'+(code>32767?code-65536:code)+'?';}return out;}
  function write(value){
    const script=S.validate(value);if(!script)throw Error('No hay un guion para exportar.');
    const ids={scene:8,action:9,character:10,parenthetical:11,dialogue:12,transition:13,insert:14,section:15},defs=[{id:0,name:'Normal',props:'\\ql'},{id:1,name:'Title',props:'\\qc\\b\\sa480'},{id:2,name:'Written by',props:'\\qc\\sa240\\keepn'},{id:3,name:'Author',props:'\\qc\\sa120\\keepn'},{id:4,name:'Contact name',props:'\\ql\\keepn'},{id:5,name:'Address',props:'\\ql'},{id:6,name:'Phone',props:'\\ql'},{id:7,name:'Contact',props:'\\ql'}];
    for(const [kind,id]of Object.entries(ids)){const spec=S.types[kind],left=Math.round((spec.left-S.format.left)*20),right=Math.max(0,Math.round((432-(spec.left-S.format.left)-spec.columns*7.2)*20));defs.push({id,name:({scene:'Slugline',action:'Action',character:'Character',parenthetical:'Parenthetical',dialogue:'Dialogue',transition:'Transition',insert:'Shot',section:'Section'})[kind],props:`\\li${left}\\ri${right}\\sb${['dialogue','parenthetical'].includes(kind)?0:['scene','insert','section'].includes(kind)?480:240}${kind==='transition'?'\\qr':'\\ql'}${['scene','section'].includes(kind)?'\\b':''}${spec.upper?'\\caps':''}${['scene','character','parenthetical','insert','section'].includes(kind)?'\\keepn':''}`});}
    const registered=new Set(script.characters);for(const node of script.doc.content)for(const run of node.content||[])for(const mark of run.marks||[])if(mark.type==='character')registered.add(mark.attrs.name);
    const references=new Map([...registered].map((name,i)=>[name,100+i]));
    const p=(id,text='',extra='')=>`\\pard\\plain\\f0\\fs24\\cf1\\s${id}\\sb0\\sa0\\sl-240\\slmult0\\li0\\ri0\\widctlpar${defs.find(s=>s.id===id).props}${extra} ${text}\\par\n`;
    let output='{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1\n{\\fonttbl{\\f0\\fmodern\\fcharset0 Courier New;}}\n{\\colortbl;\\red0\\green0\\blue0;}\n';
    output+='{\\stylesheet'+defs.map(s=>`{\\s${s.id}\\f0\\fs24\\sl-240\\slmult0${s.props} ${s.name};}`).join('')+[...references].map(([name,id])=>`{\\*\\cs${id}\\additive ${escape('PLANO Personaje: '+name)};}`).join('')+'}\n';
    output+='\\paperw12240\\paperh15840\\margl2160\\margr1440\\margt1440\\margb1440\\headery720\\footery720\\hyphauto0\\deflang3082\\sectd\\sbkpage{\\header }\n';
    output+=p(0,'','\\sl-3600')+p(1,escape(script.title||'Sin título'));let top=252+S.wrap(script.title||'Sin título',60).length*12+24;
    const authors=script.authors.filter(a=>a.name.trim());if(authors.length){output+=p(2,'Escrito por');top+=24;for(const author of authors){output+=p(3,escape(author.name));top+=S.wrap(author.name,60).length*12+6;}}
    const contacts=[];for(const author of script.authors){if(!author.email&&!author.phone&&!author.contact)continue;if(script.authors.length>1&&author.name)contacts.push([4,author.name]);for(const [id,key]of [[5,'email'],[6,'phone'],[7,'contact']])if(author[key])contacts.push([id,author[key]]);}
    if(contacts.length){const count=contacts.reduce((n,[,text])=>n+S.wrap(text,60).length,0),gap=Math.max(12,720-count*12-top);output+=p(0,'',`\\sl-${Math.round(gap*20)}`);for(const [id,text]of contacts)output+=p(id,escape(text));}
    output+='\\sect\\sectd\\sbkpage\\pgnrestart\\pgnstarts1\\titlepg{\\headerf }{\\header\\pard\\plain\\f0\\fs24\\qr\\chpgn.\\par}\n';
    let sceneNumber=0;
    for(const node of script.doc.content){const kind=node.attrs.kind;let content=(node.content||[]).map(run=>{let properties='';for(const mark of run.marks||[])properties+=mark.type==='bold'?'\\b':mark.type==='italic'?'\\i':mark.type==='underline'?'\\ul':mark.type==='character'?`\\cs${references.get(mark.attrs.name)}`:'';return properties?'{'+properties+' '+escape(run.text)+'}':escape(run.text);}).join(''),extra='';
      if(kind==='scene'&&S.plain(node).trim()){sceneNumber++;content=sceneNumber+'\\tab '+content+'\\tab '+sceneNumber;extra='\\fi-1080\\tx0\\tqr\\tx8640';}
      output+=p(ids[kind],content,extra);
    }
    return output+'}';
  }
  const api={read,parse,write,tokenize};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoRtf=api;
})(globalThis);
