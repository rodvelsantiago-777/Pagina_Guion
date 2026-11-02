/* Modelo de guion, formato Carta/Courier 12 y paginación compartida por editor y PDF. */
(function(root){
 'use strict';
 const kinds={scene:'Escena',action:'Acción',character:'Personaje',parenthetical:'Acotación',dialogue:'Diálogo',transition:'Transición',insert:'Insert',section:'Sección'};
 const format={width:612,height:792,left:108,right:72,top:72,bottom:72,line:12,lines:54};
 const types={scene:{left:108,columns:60,upper:true},action:{left:108,columns:60},character:{left:266.4,columns:38,upper:true},parenthetical:{left:223.2,columns:25},dialogue:{left:180,columns:35},transition:{left:108,columns:60,upper:true,right:true},insert:{left:108,columns:60,upper:true},section:{left:108,columns:60,upper:true}};
 const id=()=>crypto.randomUUID(),plain=node=>(node.content||[]).map(piece=>piece.text||'').join(''),canonical=name=>name.trim().replace(/\s+/g,' ').toLocaleUpperCase('es'),cue=name=>canonical(name).replace(/\s*\((?:V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT[’']?D|CONTIN[ÚU]A)\)\s*$/i,'').trim();
 function create(title,user={}){return{version:1,id:id(),revision:0,title:(title||'Sin título').slice(0,176),authors:[{id:id(),name:(user.name||'').slice(0,120),email:(user.email||'').slice(0,254),phone:'',contact:''}],characters:[],doc:{type:'doc',content:[{type:'paragraph',attrs:{kind:'scene',id:id()}}]}};}
 function validate(value){
  if(value===undefined||value===null)return null;
  if(!value||value.version!==1||typeof value.id!=='string'||!/^[-\w]{1,80}$/.test(value.id)||!Number.isSafeInteger(value.revision)||value.revision<0||typeof value.title!=='string'||value.title.length>176)throw Error('El guion editable no es válido.');
  const clean={version:1,id:value.id,revision:value.revision,title:value.title,authors:[],characters:[],doc:{type:'doc',content:[]}};
  if(!Array.isArray(value.authors)||value.authors.length>8||!Array.isArray(value.characters)||value.characters.length>500)throw Error('La portada o los personajes no son válidos.');
  const authorIds=new Set();for(const author of value.authors){if(!author||typeof author.id!=='string'||!/^[-\w]{1,80}$/.test(author.id)||authorIds.has(author.id))throw Error('Hay autores inválidos.');authorIds.add(author.id);const item={id:author.id};for(const [key,max]of Object.entries({name:120,email:254,phone:80,contact:300})){if(typeof author[key]!=='string'||author[key].length>max)throw Error('Los datos de un autor son demasiado largos.');item[key]=author[key].replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');}clean.authors.push(item);}
  const registry=new Set();for(const name of value.characters){if(typeof name!=='string'||!name.trim()||name.length>80)throw Error('Hay personajes inválidos.');registry.add(canonical(name));}clean.characters=[...registry];
  if(value.doc?.type!=='doc'||!Array.isArray(value.doc.content)||!value.doc.content.length||value.doc.content.length>8000)throw Error('El contenido del guion no es válido.');
  const ids=new Set();let length=0;
  for(const paragraph of value.doc.content){
   if(paragraph.type!=='paragraph'||!Object.hasOwn(types,paragraph.attrs?.kind)||typeof paragraph.attrs.id!=='string'||!/^[-\w]{1,80}$/.test(paragraph.attrs.id)||ids.has(paragraph.attrs.id))throw Error('Hay párrafos de guion inválidos.');ids.add(paragraph.attrs.id);
   const node={type:'paragraph',attrs:{kind:paragraph.attrs.kind,id:paragraph.attrs.id},content:[]};
   for(const piece of paragraph.content||[]){
    if(piece.type!=='text'||typeof piece.text!=='string'||!piece.text.length)throw Error('Hay texto de guion inválido.');length+=piece.text.length;if(length>220000)throw Error('Este guion supera el tamaño de texto admitido.');
    const item={type:'text',text:piece.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'')},seen=new Set();if(!item.text)continue;
    for(const mark of piece.marks||[]){if(!['bold','italic','underline','character'].includes(mark.type)||seen.has(mark.type))throw Error('Hay formato de texto inválido.');seen.add(mark.type);if(mark.type==='character'){const name=mark.attrs?.name;if(typeof name!=='string'||!name.trim()||name.length>80)throw Error('Hay referencias de personaje inválidas.');(item.marks||=[]).push({type:'character',attrs:{name:canonical(name)}});}else(item.marks||=[]).push({type:mark.type});}node.content.push(item);
   }if(!node.content.length)delete node.content;clean.doc.content.push(node);
  }
  if(value.sourceLayout){
   const source=value.sourceLayout;
   if(source.version!==1||!Number.isSafeInteger(source.revision)||source.revision<0||!Array.isArray(source.pages)||!source.pages.length||source.pages.length>2000||!Array.isArray(source.rows)||source.rows.length>12000)throw Error('La disposición del guion importado no es válida.');
   clean.sourceLayout={version:1,revision:source.revision,pages:source.pages.map(page=>{if(!Number.isFinite(page.width)||!Number.isFinite(page.height)||page.width<1||page.height<1||page.width>20000||page.height>20000)throw Error('Hay tamaños de página inválidos.');return{width:page.width,height:page.height};}),rows:source.rows.map(row=>{
    if(!Number.isInteger(row.page)||row.page<1||row.page>source.pages.length||['x','y','width','height'].some(key=>!Number.isFinite(row[key])||row[key]<0||row[key]>1.1)||row.id&&!ids.has(row.id)||!row.id&&(typeof row.text!=='string'||row.text.length>3000))throw Error('Hay posiciones de texto inválidas.');
    const parts=row.parts;if(parts&&(!Array.isArray(parts)||parts.length>500||parts.some(p=>!Array.isArray(p)||p.length!==4||!Number.isInteger(p[0])||!Number.isInteger(p[1])||p[0]<0||p[1]<p[0]||p[1]>3000||!Number.isFinite(p[2])||!Number.isFinite(p[3])||p[2]<0||p[2]>1.1||p[3]<0||p[3]>1.1)))throw Error('Hay fragmentos de texto inválidos.');
    return{...(row.id?{id:row.id}:{text:row.text}),page:row.page,x:row.x,y:row.y,width:row.width,height:row.height,...(parts?{parts:parts.map(p=>[...p])}:{})};
   })};
  }
  return clean;
 }
 function wrap(text,columns){
  if(!text)return[{from:0,to:0,text:''}];const lines=[];let from=0;
  while(from<text.length){
   if(text[from]==='\n'){lines.push({from,to:from,text:''});from++;if(from===text.length)lines.push({from,to:from,text:''});continue;}
   const newline=text.indexOf('\n',from),stop=newline<0?text.length:newline;let to=Math.min(stop,from+columns);
   if(to<stop){const space=text.lastIndexOf(' ',to-1);if(space>=from)to=space+1;if(/[\uD800-\uDBFF]/.test(text[to-1]))to--;}
   if(to<=from)to=Math.min(text.length,from+columns);
   lines.push({from,to,text:text.slice(from,to).replace(/\n/g,'')});from=to;
   if(from===newline){from++;if(from===text.length)lines.push({from,to:from,text:''});}
  }return lines;
 }
 function layout(doc){
  const blocks=[],pages=[[]];let page=0,row=0,pos=0,speaker='';
  for(const node of doc.content){
   const text=plain(node),kind=node.attrs.kind,spec=types[kind],lines=wrap(spec.upper?text.toLocaleUpperCase('es'):text,spec.columns);
   if(kind==='character')speaker=cue(text);else if(!['dialogue','parenthetical'].includes(kind))speaker='';
   let space=row&& !['dialogue','parenthetical'].includes(kind)?1:0;
   const keep=kind==='scene'?Math.min(4,lines.length+2):kind==='character'?Math.min(3,lines.length+2):1;
   let before=0,breakBefore=false;if(row+space+keep>format.lines){before=format.lines-row;page++;pages.push([]);row=0;space=0;breakBefore=true;}
   const block={id:node.attrs.id,kind,text,pos,size:text.length+2,lines:[],space,before,breakBefore,page,startRow:row};row+=space;
   for(const [index,line]of lines.entries()){
    let continuation=null;
    if(kind==='dialogue'&&speaker&&row===53&&lines.length-index>1){
     pages[page].push({virtual:true,text:'(MÁS)',left:259.2,page,row:53});page++;pages.push([]);row=1;
     continuation={speaker:speaker+' (CONT.)'};pages[page].push({virtual:true,text:continuation.speaker,left:266.4,page,row:0});
    }
    let breakBefore=0;if(row>=format.lines){page++;pages.push([]);row=0;breakBefore=1;}
    const entry={...line,page,row,breakBefore:breakBefore||Boolean(continuation),continuation,pos:pos+1+line.from,kind,blockId:block.id,first:index===0};block.lines.push(entry);pages[page].push(entry);row++;
   }
   blocks.push(block);pos+=text.length+2;
  }return{blocks,pages,endRows:row,pageCount:pages.length,totalHeight:pages.length*1056+(pages.length-1)*28,tail:format.lines-row};
 }
 function analyze(value){
  const screenplay=validate(value),scenes=[],characters=new Map(screenplay.characters.map(name=>[name,{name,mentions:[],dialogues:[]}]));let scene=null,speaker='';
  const ensure=name=>{name=cue(name);if(!name)return null;if(!characters.has(name))characters.set(name,{name,mentions:[],dialogues:[]});return characters.get(name);};
  for(const node of screenplay.doc.content){const text=plain(node),kind=node.attrs.kind;
   if(kind==='scene'){speaker='';if(text.trim()){scene={id:node.attrs.id,number:scenes.length+1,title:text};scenes.push(scene);}}
   if(kind==='character'){speaker=cue(text);ensure(speaker);}
   else if(kind==='dialogue'&&speaker&&text.trim())ensure(speaker)?.dialogues.push({id:node.attrs.id,text,scene:scene?.title||'Sin escena'});
   else if(!['dialogue','parenthetical'].includes(kind))speaker='';
   const names=new Set((node.content||[]).flatMap(piece=>(piece.marks||[]).filter(mark=>mark.type==='character').map(mark=>mark.attrs.name)));
   for(const name of names)ensure(name)?.mentions.push({id:node.attrs.id,text,scene:scene?.title||'Sin escena'});
  }return{scenes,characters:[...characters.values()]};
 }
 function runs(node,from,to){const result=[];let offset=0;for(const piece of node.content||[]){const a=Math.max(from-offset,0),b=Math.min(to-offset,piece.text.length);if(a<b)result.push({text:piece.text.slice(a,b),marks:piece.marks||[]});offset+=piece.text.length;}return result;}
 async function pdf(value){
  const script=validate(value);if(!root.PDFLib)throw Error('No se pudo cargar el generador PDF.');const {PDFDocument,StandardFonts,rgb}=root.PDFLib;
  const document=await PDFDocument.create(),fonts={normal:await document.embedFont(StandardFonts.Courier),bold:await document.embedFont(StandardFonts.CourierBold),italic:await document.embedFont(StandardFonts.CourierOblique),both:await document.embedFont(StandardFonts.CourierBoldOblique)};
  document.setTitle(script.title||'Sin título');document.setAuthor(script.authors.map(a=>a.name).filter(Boolean).join(', '));document.setSubject('PLANO · Guion editable · '+script.id);document.setCreator('PLANO');
  const fallback=new Map();let canvas,context;
  async function draw(page,text,x,top,marks=[]){
   const bold=marks.some(mark=>mark.type==='bold'),italic=marks.some(mark=>mark.type==='italic'),font=fonts[bold&&italic?'both':bold?'bold':italic?'italic':'normal'];
   try{page.drawText(text,{x,y:792-top-12,font,size:12,color:rgb(0,0,0)});}catch{
    canvas||=root.document.createElement('canvas');context=canvas.getContext('2d');const key=[text,bold,italic].join('|');let image=fallback.get(key);
    if(!image){canvas.width=Math.max(1,Math.ceil(text.length*7.2+4))*3;canvas.height=60;context.scale(3,3);context.font=`${italic?'italic ':''}${bold?'bold ':''}12px "Courier New",monospace`;context.fillStyle='#000';context.textBaseline='top';context.fillText(text,0,1);image=await document.embedPng(canvas.toDataURL('image/png'));fallback.set(key,image);}page.drawImage(image,{x,y:792-top-16,width:canvas?Math.max(1,Math.ceil(text.length*7.2+4)):image.width/3,height:20});
   }
   if(marks.some(mark=>mark.type==='underline'))page.drawLine({start:{x,y:792-top-13},end:{x:x+text.length*7.2,y:792-top-13},thickness:.55,color:rgb(0,0,0)});
  }
  if(script.sourceLayout?.revision===script.revision){
   const source=script.sourceLayout,pages=source.pages.map(size=>document.addPage([size.width,size.height])),nodes=new Map(script.doc.content.map(node=>[node.attrs.id,node]));
   for(const row of source.rows){const node=nodes.get(row.id),text=node?plain(node):row.text;if(!text)continue;const page=pages[row.page-1],size=source.pages[row.page-1],font=node&&['scene','section'].includes(node.attrs.kind)?fonts.bold:fonts.normal,fontSize=row.height*size.height;
    try{for(const part of row.parts||[[0,text.length,row.x,row.width]])page.drawText(text.slice(part[0],part[1]),{x:part[2]*size.width,y:size.height-(row.y*size.height+fontSize*.9),font,size:fontSize,color:rgb(0,0,0)});}catch{throw Error('El PDF contiene caracteres que requieren revisar la conversión antes de guardarla.');}
   }
   return{bytes:await document.save(),titlePages:0,pages:pages.length};
  }
  const cover=document.addPage([612,792]),titleLines=wrap(script.title||'Sin título',60);let top=252;
  for(const line of titleLines){await draw(cover,line.text,108+(432-line.text.length*7.2)/2,top,[{type:'bold'}]);top+=12;}
  top+=24;await draw(cover,'Escrito por',108+(432-10*7.2)/2,top);top+=24;
  for(const author of script.authors.filter(a=>a.name.trim())){for(const line of wrap(author.name,60)){await draw(cover,line.text,108+(432-line.text.length*7.2)/2,top);top+=12;}top+=6;}
  const contactLines=[];for(const author of script.authors){const lines=[author.name,author.email,author.phone,author.contact].filter(text=>text.trim());if(!author.email&&!author.phone&&!author.contact)continue;for(const text of lines)contactLines.push(...wrap(text,60).map(line=>line.text));contactLines.push('');}if(contactLines.at(-1)==='')contactLines.pop();
  let current=cover,contactTop=Math.max(top+36,720-contactLines.length*12);for(const text of contactLines){if(contactTop>708){current=document.addPage([612,792]);contactTop=72;}await draw(current,text,72,contactTop);contactTop+=12;}
  const titlePages=document.getPageCount(),flow=layout(script.doc),nodesById=new Map(script.doc.content.map(node=>[node.attrs.id,node]));
  for(const [number,lines]of flow.pages.entries()){
   const page=document.addPage([612,792]);if(number>0)await draw(page,(number+1)+'.',540-String(number+1).length*7.2,36);
   for(const line of lines){if(line.virtual){await draw(page,line.text,line.left,72+line.row*12);continue;}const node=nodesById.get(line.blockId),spec=types[line.kind];let x=spec.right?540-line.text.trimEnd().length*7.2:spec.left;
    for(const run of runs(node,line.from,line.to)){let text=spec.upper?run.text.toLocaleUpperCase('es'):run.text;text=text.replace(/\n/g,'');const marks=['scene','section'].includes(line.kind)?[...run.marks,{type:'bold'}]:run.marks;await draw(page,text,x,72+line.row*12,marks);x+=text.length*7.2;}
   }
  }
  if(canvas)canvas.width=canvas.height=0;return{bytes:await document.save(),titlePages,pages:flow.pageCount};
 }
 function fromPdf(pages,title,user){const value=create(title,user),blocks=[],rows=[],scene=text=>/^(?:(?:ESCENA|SCENE)\s*)?(?:\d+[A-Z]?[.\s-]+)?(?:INT\.?|EXT\.?|INT\.?\s*[/.-]\s*EXT\.?)\s/i.test(text),firstScene=pages.findIndex(page=>page.lines.some(line=>scene(line.text)));
  const round=number=>Math.round(Math.max(0,Math.min(1.1,number))*1000000)/1000000;
  for(const [index,page]of pages.entries())for(const line of page.lines){const text=line.text.trim();if(!text)continue;const geometry={page:index+1,x:round(line.x),y:round(line.y),width:round(line.width),height:round(line.height)};
   if(line.parts?.length>1){let offset=0;geometry.parts=[];for(const part of line.parts){const start=text.indexOf(part.text,offset);if(start<0){delete geometry.parts;break;}geometry.parts.push([start,start+part.text.length,round(part.x),round(part.width)]);offset=start+part.text.length;}}
   if(firstScene>0&&index<firstScene||/^\d+[.]?$/.test(text)){rows.push({...geometry,text});continue;}
   const kind=scene(text)?'scene':/^(?:CORTE A|FUNDIDO A|FADE |CUT TO|DISSOLVE TO).*[:.]$/i.test(text)?'transition':/^\(.*\)$/.test(text)?'parenthetical':text===text.toLocaleUpperCase('es')&&text.length<45&&line.x>.28?'character':line.x>.25&&line.x<.6?'dialogue':'action',node={type:'paragraph',attrs:{kind,id:id()},content:[{type:'text',text}]};blocks.push(node);rows.push({...geometry,id:node.attrs.id});
  }
  if(!blocks.length)throw Error('Este PDF no contiene texto seleccionable. Necesita OCR antes de convertirse; el original no se ha borrado.');
  if(firstScene>0){const cover=pages.slice(0,firstScene).flatMap(page=>page.lines.map(line=>line.text.trim())).filter(Boolean),written=cover.findIndex(text=>/^(?:escrito por|guion de|written by)\s*:?$/i.test(text));if(cover[0]&&!/^\d+[.]?$/.test(cover[0]))value.title=cover[0].slice(0,176);if(written>=0&&cover[written+1])value.authors=[{id:id(),name:cover[written+1].slice(0,120),email:(cover.find(text=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))||'').slice(0,254),phone:'',contact:''}];}
  value.doc.content=blocks;value.sourceLayout={version:1,revision:0,pages:pages.map(page=>({width:page.width,height:page.height})),rows};return validate(value);
 }
 function portable(value){return JSON.stringify({format:'plano.screenplay',version:1,screenplay:validate(value)});}
 function importPortable(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>350000)throw Error('El archivo editable supera 350 KB.');let data;try{data=JSON.parse(text);}catch{throw Error('El archivo .plano no contiene un guion válido.');}
  if(data?.format!=='plano.screenplay'||data.version!==1)throw Error('Este archivo no es un guion editable .plano. Las copias con planos se importan desde Importar notas.');
  const script=validate(data.screenplay);if(!script)throw Error('El archivo no contiene un guion.');const active=script.sourceLayout?.revision===script.revision;script.id=id();script.revision=0;if(active)script.sourceLayout.revision=0;else delete script.sourceLayout;return script;
 }
 function thumbnail(value){
  const canvas=root.document.createElement('canvas');canvas.width=320;canvas.height=414;const context=canvas.getContext('2d'),scale=320/612;context.fillStyle='#fff';context.fillRect(0,0,320,414);context.fillStyle='#111';context.textBaseline='top';context.font=`bold ${12*scale}px "Courier New",monospace`;let top=252*scale;
  for(const line of wrap(value.title||'Sin título',60)){context.fillText(line.text,108*scale+(432-line.text.length*7.2)*scale/2,top);top+=12*scale;}
  context.font=`${12*scale}px "Courier New",monospace`;top+=24*scale;context.fillText('Escrito por',108*scale+(432-72)*scale/2,top);top+=24*scale;
  for(const author of value.authors)if(author.name){for(const line of wrap(author.name,60)){context.fillText(line.text,108*scale+(432-line.text.length*7.2)*scale/2,top);top+=12*scale;}top+=6*scale;}
  const contacts=value.authors.flatMap(author=>[author.name,author.email].filter(Boolean));top=Math.max(top+18*scale,720*scale-contacts.length*12*scale);for(const text of contacts){context.fillText(text,72*scale,top);top+=12*scale;}const result=canvas.toDataURL('image/jpeg',.72);canvas.width=canvas.height=0;return result.length<=20000?result:null;
 }
 const api={kinds,format,types,id,plain,canonical,cue,create,validate,wrap,layout,analyze,runs,pdf,fromPdf,portable,importPortable,thumbnail};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoScreenplay=api;
})(globalThis);
