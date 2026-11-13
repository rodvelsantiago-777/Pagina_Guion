/* Reconoce los elementos de guion en texto plano y en el portapapeles. */
(function(root){
  'use strict';
  const S=typeof module==='object'&&module.exports?require('./screenplay.js'):root.PlanoScreenplay;
  const maxBytes=2*1024*1024;
  function row(line){
    let expanded=0;line=line.replace(/\t/g,(_,offset)=>{const spaces=8-(offset+expanded)%8;expanded+=spaces-1;return' '.repeat(spaces);});
    return{text:line.trim()||(line.includes('\f')?'\f':''),indent:line.length-line.trimStart().length,raw:line};
  }
  function heading(text){
    const match=/^(?:(?:ESCENA|SCENE)\s+)?(?:(\d+[A-Z]?)[.)]?\s*)?((?:INT\.?\s*[/.-]\s*EXT\.?|EXT\.?\s*[/.-]\s*INT\.?|INT\.?|EXT\.?|I\/E\.?)\s+.+)$/i.exec(text);
    if(!match)return null;
    // Las columnas laterales son numeración impresa, no parte del encabezado.
    return match[2].replace(/\s{2,}\d+[A-Z]?\s*$/,'').trim();
  }
  const insert=text=>/^(?:INSERT|INSERTO|VOLVEMOS A ESCENA|BACK TO SCENE|CLOSE[ -]?UP|POV|PUNTO DE VISTA)\b/i.test(text);
  const transition=text=>/^(?:CORTE A(?: NEGRO)?|CORTAMOS A|FUNDIDO(?: A| EN)?(?: NEGRO| BLANCO)?|ENCADENADO|DISOLVENCIA|FADE (?:IN|OUT|TO BLACK)|CUT TO|DISSOLVE TO|SMASH CUT TO|MATCH CUT TO|FIN|THE END)\s*[:.!]?$/i.test(text);
  function cueCandidate(text){
    if(!text||text.length>100||text!==text.toLocaleUpperCase('es')||!/[\p{L}]/u.test(text))return false;
    const name=text.replace(/\s*\([^)]*\)\s*$/,'');
    return name.length<=80&&/^[\p{L}\p{N} .’'\-]+$/u.test(name)&&!/[.!?:;,]$/.test(name)&&!heading(text)&&!insert(text)&&!transition(text);
  }
  function textRows(text){
    if(typeof text!=='string'||text.length>maxBytes)throw Error('El TXT supera el tamaño admitido.');
    text=text.replace(/^\ufeff/,'').replace(/\r\n?|\u2028|\u2029|\v/g,'\n').replace(/\u00a0/g,' ');
    if(!text.trim())throw Error('El TXT está vacío.');
    if(/[\u0000-\u0008\u000e-\u001f\u007f]/.test(text))throw Error('El archivo contiene datos binarios; selecciona un TXT de texto.');
    const raw=text.replace(/\f/g,'\n\f\n').split('\n');if(raw.length>30000)throw Error('El TXT contiene demasiadas líneas.');
    return raw.map(row);
  }
  function parseBody(body,{clipboard=false,characters=[]}={}){
    const significant=body.filter(r=>r.text&&r.text!=='\f'),baseline=significant.length?Math.min(...significant.map(r=>r.indent)):0;
    const hasScene=clipboard&&significant.some(r=>heading(r.text)),names=new Set(characters.map(S.characterKey));
    const structural=text=>heading(text)||insert(text)||transition(text)||/^#{1,6}\s+/.test(text);
    const shortDirection=text=>/^(?:(?:molest|enojad|asustad|nervios|sorprendid|preocupad|confundid|enfadad|burlon|cansad|seri|tranquil)[oa]s?|susurrando|gritando|entre dientes|(?:en voz|con voz|sin mirar|mirando a)\s+[\p{L}\p{M} ]+)$/iu.test(text);
    const next=Array(body.length).fill(-1);let following=-1;
    for(let i=body.length-1;i>=0;i--){next[i]=following;if(body[i].text&&body[i].text!=='\f')following=i;}
    const blocks=[];let previous='',lastLine=-2;
    function isCue(index){const item=body[index],after=next[index]>=0?body[next[index]]:null;if(!cueCandidate(item.text))return false;
      if(item.indent-baseline>=18)return true;
      if(!after)return false;
      if(structural(after.text))return false;
      if(item.indent>baseline+2&&(after.indent<item.indent||after.text.startsWith('(')))return true;
      if(item.indent!==baseline||after.indent<baseline||cueCandidate(after.text))return false;
      const isolated=index===0||!body[index-1].text||previous==='scene';
      const shortCue=item.text.split(/\s+/).length<=5;
      const standaloneExchange=index===0&&shortCue&&significant.length===2&&/[.!?…]$/.test(after.text);
      if(clipboard&&(names.has(S.characterKey(S.cue(item.text)))||isolated&&shortCue&&(hasScene||standaloneExchange||/^[¿¡(]/.test(after.text)||shortDirection(after.text))))return true;
      return isolated&&next[index]===index+1;
    }
    function add(kind,parts,index){
      const value=parts.join(' ').trim();if(!value)return;
      if(blocks.length>=8000)throw Error('El TXT contiene demasiados párrafos.');
      blocks.push({type:'paragraph',attrs:{id:S.id(),kind},content:[{type:'text',text:value}]});previous=kind;lastLine=index;
    }
    for(let i=0;i<body.length;i++){
      const item=body[i],value=item.text;if(!value||value==='\f')continue;
      const scene=heading(value);if(scene){add('scene',[scene],i);continue;}
      if(insert(value)){add('insert',[value],i);continue;}
      if(transition(value)){add('transition',[value],i);continue;}
      if(/^#{1,6}\s+/.test(value)){add('section',[value.replace(/^#{1,6}\s+/,'')],i);continue;}
      if(isCue(i)){add('character',[value],i);continue;}
      const inDialogue=['character','parenthetical','dialogue'].includes(previous),parts=[value];
      if(inDialogue&&value.startsWith('(')){
        let depth=(value.match(/\(/g)||[]).length-(value.match(/\)/g)||[]).length;
        while(depth>0&&i+1<body.length&&body[i+1].text&&body[i+1].text!=='\f'&&!heading(body[i+1].text)&&!isCue(i+1)){
          const continuation=body[++i].text;parts.push(continuation);depth+=(continuation.match(/\(/g)||[]).length-(continuation.match(/\)/g)||[]).length;
        }
        add('parenthetical',parts,i);continue;
      }
      if(clipboard&&previous==='character'&&shortDirection(value)){
        add('parenthetical',parts,i);continue;
      }
      const startsSpeech=previous==='character'||previous==='parenthetical';
      const kind=inDialogue&&(item.indent>baseline||startsSpeech&&(clipboard||i===lastLine+1))?'dialogue':'action';
      while(i+1<body.length){const following=body[i+1];if(!following.text||following.text==='\f'||following.indent!==item.indent||structural(following.text)||isCue(i+1)||kind==='dialogue'&&following.text.startsWith('('))break;parts.push(following.text);i++;}
      add(kind,parts,i);
    }
    return blocks;
  }
  const api={textRows,heading,parseBody,parseClipboard:(text,characters)=>parseBody(textRows(text),{clipboard:true,characters})};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoScreenplayText=api;
})(globalThis);
