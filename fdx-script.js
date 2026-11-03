/* Final Draft XML de escritura: solo Content, TitlePage y datos propios de escritura. */
(function(root){
 'use strict';
 const maxBytes=5*1024*1024,NS='urn:plano:screenplay:1';
 const children=(node,name)=>Array.from(node?.children||[]).filter(el=>!el.namespaceURI&&el.localName===name),child=(node,name)=>children(node,name)[0];
 const ownChildren=(node,name)=>Array.from(node?.children||[]).filter(el=>el.namespaceURI===NS&&el.localName===name),ownChild=(node,name)=>ownChildren(node,name)[0];
 const escape=text=>String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"'\r]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;','\r':'&#13;'}[c])),attribute=text=>escape(text).replace(/\n/g,'&#10;').replace(/\t/g,'&#9;');
 const norm=text=>(text||'').trim().toLowerCase().replace(/[\s_-]+/g,'');
 const kinds={sceneheading:'scene',scene:'scene',action:'action',general:'action',character:'character',parenthetical:'parenthetical',dialogue:'dialogue',dialog:'dialogue',transition:'transition',shot:'insert',insert:'insert',newact:'section',endofact:'section',section:'section',lyrics:'dialogue',castlist:'action'};
 const types={scene:'Scene Heading',action:'Action',character:'Character',parenthetical:'Parenthetical',dialogue:'Dialogue',transition:'Transition',insert:'Shot',section:'New Act'};
 function parse(text,{name='Sin título.fdx',user={},onWarning=()=>{}}={}){
  const S=root.PlanoScreenplay;
  if(typeof text!=='string'||!text.length||text.length>maxBytes)throw Error('Selecciona un guion FDX de hasta 5 MB.');
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('El FDX contiene declaraciones XML no permitidas.');
  const document=new DOMParser().parseFromString(text,'application/xml'),fdx=document.documentElement;
  if(document.querySelector('parsererror')||fdx.localName!=='FinalDraft'||fdx.namespaceURI||fdx.getAttribute('DocumentType')!=='Script')throw Error('El archivo no contiene un guion Final Draft XML válido (.fdx).');
  let count=0;const pending=[[fdx,0]];while(pending.length){const [node,depth]=pending.pop();if(++count>50000||depth>128)throw Error('El FDX contiene demasiados elementos o niveles anidados.');for(const next of node.children)pending.push([next,depth+1]);}
  const contents=children(fdx,'Content');if(contents.length!==1)throw Error('El FDX debe contener un único cuerpo de guion.');
  const metadata=ownChild(child(fdx,'UserDocumentData'),'Writing'),own=metadata?.getAttribute('Version')==='1',settings=new Map();
  for(const element of children(fdx,'ElementSettings')){const type=element.getAttribute('Type');settings.set(type,{style:child(element,'FontSpec')?.getAttribute('Style')||'',as:child(element,'Behavior')?.getAttribute('PaginateAs')||''});}
  function runs(paragraph){
   const result=[],base=settings.get(paragraph.getAttribute('Type'))?.style||'';
   for(const node of children(paragraph,'Text')){
    // No lee ScriptNotes, SceneProperties, Tagger ni texto de cabeceras o pies.
    let text=Array.from(node.childNodes).filter(n=>n.nodeType===3||n.nodeType===4).map(n=>n.nodeValue).join('');if(!text)continue;
    const styles=new Set((node.hasAttribute('Style')?node.getAttribute('Style'):base).split('+').map(norm));if(styles.has('allcaps'))text=text.toLocaleUpperCase('es');
    const marks=['bold','italic','underline'].filter(type=>styles.has(type)).map(type=>({type})),character=own?node.getAttributeNS(NS,'Character'):null;if(character)marks.push({type:'character',attrs:{name:S.canonical(character)}});
    const previous=result.at(-1);if(previous&&JSON.stringify(previous.marks||[])===JSON.stringify(marks))previous.text+=text;else result.push({type:'text',text,...(marks.length?{marks}:{})});
   }return result;
  }
  const coverContent=child(child(fdx,'TitlePage'),'Content'),rows=children(coverContent,'Paragraph').map(p=>({text:runs(p).map(r=>r.text).join(''),alignment:p.getAttribute('Alignment')})).filter(r=>r.text.trim());
  const fallback=name.replace(/\.fdx$/i,'')||'Sin título',title=rows[0]?.text.trim()||fallback,script=S.create(title,user);script.title=title;
  if(rows.length){
   const authors=[];let active=0,naming=false,contact=false;
   for(const row of rows.slice(1)){
    const value=row.text.trim();if(/^(?:escrito por|written by|screenplay by|guion de|by)\s*:?$/i.test(value)){naming=true;continue;}
    const existing=authors.findIndex(a=>a.name===value);if(existing>=0){active=existing;contact=true;continue;}
    const email=value.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/),phone=/^\+?[\d\s().-]{7,}$/.test(value),label=/^(?:contacto|contact|e-?mail|correo(?: electr[oó]nico)?|tel[eé]fono)\s*:?$/i.test(value);
    if(email||phone||label||/^(?:copyright|©|v\d|versi[oó]n)/i.test(value))contact=true;
    if(naming&&!contact||!naming&&!contact&&row.alignment==='Center'){if(!/^(?:y|and|&)$/i.test(value))authors.push({id:S.id(),name:value,email:'',phone:'',contact:''});continue;}
    if(!authors.length)authors.push({id:S.id(),name:'',email:'',phone:'',contact:''});if(label)continue;
    if(email&&!authors[active].email)authors[active].email=email[0];else if(phone&&!authors[active].phone)authors[active].phone=value;else authors[active].contact+=(authors[active].contact?'\n':'')+value;
   }
   if(authors.length)script.authors=authors;
  }
  if(own){
   const authors=ownChild(metadata,'Authors'),characters=ownChild(metadata,'Characters');if(!authors||!characters)throw Error('Los datos de escritura del FDX están incompletos.');
   // Si otro editor cambió la portada, manda su texto visible, no los datos antiguos de la extensión.
   const coverLines=rows.flatMap(row=>row.text.split('\n')).filter(line=>line.trim());
   if(metadata.getAttribute('CoverLines')===JSON.stringify(coverLines)){
    if(metadata.hasAttribute('Title'))script.title=metadata.getAttribute('Title');
    script.authors=ownChildren(authors,'Author').map(author=>({id:S.id(),name:author.getAttribute('Name')||'',email:author.getAttribute('Email')||'',phone:author.getAttribute('Phone')||'',contact:author.getAttribute('Contact')||''}));
   }
   script.characters=ownChildren(characters,'Character').map(el=>el.textContent);
  }else{script.characters=children(child(child(fdx,'SmartType'),'Characters'),'Character').map(el=>el.textContent).filter(t=>t.trim());}
  const nodes=[];let dual=false,custom=false;
  function walk(container){for(const p of container.children){
   if(p.namespaceURI)continue;if(p.localName==='DualDialogue'){dual=true;walk(p);continue;}if(p.localName!=='Paragraph')continue;
   const type=p.getAttribute('Type')||'',nested=child(p,'DualDialogue');if(['image','scriptnote','note'].includes(norm(type)))continue;
   const content=runs(p),text=content.map(r=>r.text).join('');
   if(content.length||!nested&&type){let kind=kinds[norm(type)]||kinds[norm(settings.get(type)?.as)]||'action';if(!own&&kind==='scene'&&/^(?:INSERT|INSERTO|VOLVEMOS A ESCENA|BACK TO SCENE)\b/i.test(text))kind='insert';if(!kinds[norm(type)]&&!kinds[norm(settings.get(type)?.as)])custom=true;
    nodes.push({type:'paragraph',attrs:{id:S.id(),kind},...(content.length?{content}:{})});if(nodes.length>8000)throw Error('El FDX contiene demasiados párrafos.');}
   if(nested){dual=true;walk(nested);}
  }}walk(contents[0]);
  if(nodes.length)script.doc.content=nodes;else if(!rows.length)throw Error('El FDX no contiene texto de guion ni portada.');
  const validated=S.validate(script);if(dual||custom)onWarning([dual?'Los diálogos simultáneos se han conservado en orden de lectura, en una sola columna.':'',custom?'Los elementos personalizados sin equivalencia se han conservado como acción.':''].filter(Boolean).join(' '));return validated;
 }
 function decode(bytes){
  if(!bytes.length||bytes.length>maxBytes)throw Error('Selecciona un guion FDX de hasta 5 MB.');
  let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254||bytes[0]===60&&bytes[1]===0)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255||bytes[0]===0&&bytes[1]===60)encoding='utf-16be';
  else{const prefix=new TextDecoder('windows-1252').decode(bytes.subarray(0,256)),declared=/<\?xml[^>]*encoding\s*=\s*["']([^"']+)/i.exec(prefix);if(declared)encoding=declared[1];}
  try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{throw Error('La codificación del FDX no es compatible o está dañada.');}
 }
 async function read(file,options={}){if(!file.size||file.size>maxBytes)throw Error('Selecciona un guion FDX de hasta 5 MB.');return parse(decode(new Uint8Array(await file.arrayBuffer())),{name:file.name,...options});}
 function write(value){
  const S=root.PlanoScreenplay,script=S.forExport(value);if(!script)throw Error('No hay un guion para exportar.');
  const font=(style='')=>'<FontSpec AdornmentStyle="0" Background="#FFFFFFFFFFFF" Color="#000000000000" Font="Courier New" RevisionID="0" Size="12" Style="'+style+'"/>',text=(value,style='')=>'<Text Font="Courier New" Size="12" Style="'+style+'">'+escape(value)+'</Text>';
  let number=0;const body=script.doc.content.map(node=>'<Paragraph Type="'+types[node.attrs.kind]+'" Alignment="'+(node.attrs.kind==='transition'?'Right':'Left')+'"'+(node.attrs.kind==='scene'?' Number="'+(++number)+'"':'')+'>'+((node.content||[]).map(run=>{const style=(run.marks||[]).filter(m=>['bold','italic','underline'].includes(m.type)).map(m=>m.type[0].toUpperCase()+m.type.slice(1)).join('+'),reference=run.marks?.find(m=>m.type==='character');return'<Text Style="'+style+'"'+(reference?' plano:Character="'+attribute(reference.attrs.name)+'"':'')+'>'+escape(run.text)+'</Text>';}).join('')||'<Text/>')+'</Paragraph>').join('\n');
  const settings=Object.entries(types).map(([kind,type])=>{const spec=S.types[kind],left=spec.left/72,right=Math.min(7.5,left+spec.columns/10),next={scene:'Action',action:'Action',character:'Dialogue',parenthetical:'Dialogue',dialogue:'Action',transition:'Scene Heading',insert:'Action',section:'Scene Heading'}[kind];return'<ElementSettings Type="'+type+'">'+font(spec.upper?'AllCaps':'')+'<ParagraphSpec Leading="Regular" LeftIndent="'+left.toFixed(2)+'" RightIndent="'+right.toFixed(2)+'" FirstIndent="0.00" Alignment="'+(spec.right?'Right':'Left')+'" SpaceBefore="'+(['dialogue','parenthetical'].includes(kind)?0:12)+'" Spacing="1" StartsNewPage="No"/><Behavior PaginateAs="'+(kind==='section'?'General':kind==='insert'?'Scene Heading':type)+'" ReturnKey="'+next+'"/></ElementSettings>';}).join('\n');
  const coverLines=[];const coverP=(value,align='Center',space=0,style='')=>{coverLines.push(...value.split('\n').filter(line=>line.trim()));return'<Paragraph Type="General" Alignment="'+align+'" LeftIndent="1.50" RightIndent="7.50" FirstIndent="0.00" Leading="Regular" Spacing="1" SpaceBefore="'+space+'">'+text(value,style)+'</Paragraph>';};
  let cover=coverP(script.title,'Center',216,'Bold'),rows=20;const names=script.authors.filter(a=>a.name);if(names.length){cover+=coverP('Escrito por:','Center',24);rows+=3;for(const author of names){cover+=coverP(author.name,'Center',12);rows+=Math.max(1,Math.ceil(author.name.length/60))+1;}}
  const contacts=script.authors.map(a=>[script.authors.length>1?a.name:'',a.email,a.phone,a.contact].filter(Boolean).join('\n')).filter(Boolean),contactRows=contacts.reduce((sum,t)=>sum+t.split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil(l.length/60)),0),0)+Math.max(0,contacts.length-1);let first=true;
  for(const contact of contacts){cover+=coverP(contact,'Left',first?Math.max(24,(52-rows-contactRows)*12):12);first=false;}
  const header='<HeaderAndFooter FooterFirstPage="No" FooterVisible="No" HeaderFirstPage="No" HeaderVisible="Yes" StartingPage="1"><Header><Paragraph Alignment="Right" LeftIndent="1.50" RightIndent="7.50">'+text('')+'<DynamicLabel Type="Page #"/>'+text('.')+'</Paragraph></Header><Footer/></HeaderAndFooter>';
  const registry=new Set(script.characters);for(const node of script.doc.content)if(node.attrs.kind==='character'&&S.plain(node).trim())registry.add(S.cue(S.plain(node)));
  const metadata='<UserDocumentData><plano:Writing Version="1" Title="'+attribute(script.title)+'" CoverLines="'+attribute(JSON.stringify(coverLines))+'"><plano:Authors>'+script.authors.map(a=>'<plano:Author Name="'+attribute(a.name)+'" Email="'+attribute(a.email)+'" Phone="'+attribute(a.phone)+'" Contact="'+attribute(a.contact)+'"/>').join('')+'</plano:Authors><plano:Characters>'+script.characters.map(name=>'<plano:Character>'+escape(name)+'</plano:Character>').join('')+'</plano:Characters></plano:Writing></UserDocumentData>';
  const output='<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<FinalDraft DocumentType="Script" Template="No" Version="2" xmlns:plano="'+NS+'"><Content>'+body+'</Content>'+header+'<PageLayout BackgroundColor="#FFFFFFFFFFFF" BottomMargin="72" DocumentLeading="Normal" FooterMargin="36" ForegroundColor="#000000000000" HeaderMargin="36" TopMargin="72"><PageSize Height="11.00" Width="8.50"/></PageLayout><ElementSettings Type="General">'+font()+'<ParagraphSpec Alignment="Left" LeftIndent="1.50" RightIndent="7.50" FirstIndent="0.00" Leading="Regular" Spacing="1" SpaceBefore="0" StartsNewPage="No"/><Behavior PaginateAs="General" ReturnKey="General"/></ElementSettings>'+settings+'<TitlePage><HeaderAndFooter HeaderVisible="No" FooterVisible="No" HeaderFirstPage="No" FooterFirstPage="No"><Header/><Footer/></HeaderAndFooter><Content>'+cover+'</Content></TitlePage><MoresAndContinueds>'+font()+'<DialogueBreaks AutomaticCharacterContinueds="Yes" BottomOfPage="Yes" DialogueBottom="(MÁS)" DialogueTop="(CONT.)" TopOfNext="Yes"/><SceneBreaks SceneBottomOfPage="No" SceneTopOfNext="No"/></MoresAndContinueds><SmartType><Characters>'+[...registry].filter(Boolean).map(name=>'<Character>'+escape(name)+'</Character>').join('')+'</Characters></SmartType>'+metadata+'</FinalDraft>';
  if(new TextEncoder().encode(output).length>maxBytes)throw Error('El FDX exportado supera 5 MB. Reduce su formato antes de descargarlo.');return output;
 }
 root.PlanoFdx={parse,read,decode,write};
})(globalThis);
