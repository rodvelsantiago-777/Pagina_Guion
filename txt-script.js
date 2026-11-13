/* Intercambio de escritura en texto plano. Sin metadatos ni datos de producción. */
(function(root){
  'use strict';
  const S=typeof module==='object'&&module.exports?require('./screenplay.js'):root.PlanoScreenplay;
  const {textRows,heading,parseBody,parseClipboard}=typeof module==='object'&&module.exports?require('./screenplay-text.js'):root.PlanoScreenplayText;
  const maxBytes=2*1024*1024;
  function decode(bytes){
    if(bytes.byteLength>maxBytes||!bytes.byteLength)throw Error('Selecciona un TXT con texto de hasta 2 MB.');
    let encoding='utf-8',bom=0;
    if(bytes[0]===255&&bytes[1]===254){encoding='utf-16le';bom=2;}
    else if(bytes[0]===254&&bytes[1]===255){encoding='utf-16be';bom=2;}
    else if(bytes.length>8){
      const sample=bytes.subarray(0,Math.min(bytes.length,512));let even=0,odd=0;
      for(let i=0;i<sample.length;i++)if(sample[i]===0){if(i%2)odd++;else even++;}
      if(odd>sample.length*.25&&even<sample.length*.05)encoding='utf-16le';
      else if(even>sample.length*.25&&odd<sample.length*.05)encoding='utf-16be';
    }
    let text;
    try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes.subarray(bom));}
    catch{if(encoding!=='utf-8')throw Error('El TXT tiene una codificación dañada.');text=new TextDecoder('windows-1252').decode(bytes);}
    if(/[\u0000-\u0008\u000e-\u001f\u007f]/.test(text))throw Error('El archivo contiene datos binarios; selecciona un TXT de texto.');
    return text.replace(/^\ufeff/,'').replace(/\r\n?|\u2028|\u2029|\v/g,'\n').replace(/\u00a0/g,' ');
  }
  const writtenBy=text=>/^(?:escrito por|written by|guion de|gui[oó]n de|autores?|by)\s*:?\s*$/i.test(text);
  const contactLabel=text=>/^(?:contacto|contact|datos de contacto|e-?mail|correo(?: electr[oó]nico)?|tel[eé]fono)\s*:?\s*$/i.test(text);
  const email=text=>text.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/u)?.[0];
  const phone=text=>/^\+?[\d\s().-]{7,}$/.test(text);
  function cover(rows,fallback,user){
    const content=rows.filter(r=>r.text),titleRow=content[0],title=(titleRow?.text||fallback).replace(/^(?:Title|T[ií]tulo):\s*/i,''),authors=[];
    let naming=false,contacts=false,active=0;
    for(const item of content.slice(1)){
      const text=item.text;
      if(writtenBy(text)){naming=true;continue;}
      const inline=/^(?:escrito por|written by|guion de|gui[oó]n de|autor(?:a)?):\s*(.+)$/i.exec(text);
      if(inline){authors.push({id:S.id(),name:inline[1],email:'',phone:'',contact:''});naming=true;continue;}
      const existing=authors.findIndex(a=>a.name===text);
      if(existing>=0){active=existing;contacts=true;continue;}
      if(email(text)||phone(text)||contactLabel(text)||/^(?:copyright|©|versi[oó]n|v\d)/i.test(text))contacts=true;
      if(naming&&!contacts){authors.push({id:S.id(),name:text,email:'',phone:'',contact:''});continue;}
      if(!authors.length)authors.push({id:S.id(),name:user.name||'',email:'',phone:'',contact:''});
      if(contactLabel(text))continue;
      const author=authors[active];
      if(email(text))author.email=email(text);
      else if(phone(text))author.phone=text;
      else author.contact+=(author.contact?'\n':'')+text;
    }
    if(!authors.length)authors.push({id:S.id(),name:user.name||'',email:user.email||'',phone:'',contact:''});
    return{title,authors};
  }
  function parse(text,{name='Sin título.txt',user={}}={}){
    const rows=textRows(text),firstScene=rows.findIndex(r=>heading(r.text)),firstBreak=rows.findIndex(r=>r.text==='\f');
    const beforeScene=firstScene>0?rows.slice(0,firstScene):[],strongCover=beforeScene.some(r=>writtenBy(r.text)||/^(?:escrito por|written by|autor(?:a)?|t[ií]tulo|title):/i.test(r.text));
    const separateCover=firstBreak>=0&&rows.slice(0,firstBreak).some(r=>writtenBy(r.text));
    const start=separateCover?firstBreak+1:strongCover?firstScene:0;
    const fallback=name.replace(/\.txt$/i,'')||'Sin título',portada=start?cover(rows.slice(0,start-Number(separateCover)),fallback,user):{title:fallback,authors:S.create(fallback,user).authors};
    const script=S.create(portada.title,user);script.title=portada.title;script.authors=portada.authors;
    const blocks=parseBody(rows.slice(start));
    if(blocks.length)script.doc.content=blocks;
    else if(!start)throw Error('El TXT no contiene texto de guion.');
    return S.validate(script);
  }
  async function read(file,options={}){
    if(!file.size||file.size>maxBytes)throw Error('Selecciona un TXT con texto de hasta 2 MB.');
    return parse(decode(new Uint8Array(await file.arrayBuffer())),{name:file.name,...options});
  }
  function write(value){
    const script=S.forExport(value);if(!script)throw Error('No hay un guion para exportar.');
    const center=text=>' '.repeat(Math.max(0,Math.floor((68-text.length)/2)))+text;
    const lines=Array(17).fill('');lines.push(center(script.title||'Sin título'),'','',center('Escrito por:'));
    for(const author of script.authors)if(author.name.trim())lines.push('',center(author.name));
    while(lines.length<46)lines.push('');
    for(const author of script.authors){if(!author.email&&!author.phone&&!author.contact)continue;if(script.authors.length>1&&author.name)lines.push(author.name);for(const field of ['email','phone','contact'])if(author[field])lines.push(...author[field].split(/\r?\n/));lines.push('');}
    // El salto de página es texto estándar, no un contenedor de datos privados.
    lines.push('\f');
    for(const node of script.doc.content){const kind=node.attrs.kind,value=S.plain(node),text=S.types[kind].upper?value.toLocaleUpperCase('es'):value;if(!text.trim()){lines.push('');continue;}
      if(kind==='section'){lines.push('# '+text,'');continue;}
      if(['scene','insert','character'].includes(kind)){lines.push(' '.repeat(kind==='character'?20:0)+text,'');continue;}
      const indent=kind==='dialogue'?10:kind==='parenthetical'?15:0,columns=kind==='dialogue'?35:kind==='parenthetical'?25:60;
      for(const line of S.wrap(text,columns)){const content=line.text.trimEnd(),padding=kind==='transition'?Math.max(0,60-content.length):indent;lines.push(' '.repeat(padding)+content);}
      lines.push('');
    }
    return '\ufeff'+lines.join('\r\n').trimEnd()+'\r\n';
  }
  const api={read,parse,decode,write,parseClipboard};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoTxt=api;
})(globalThis);
