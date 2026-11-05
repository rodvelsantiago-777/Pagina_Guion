/* Adaptación de resultados del motor público. Posiciones de la aplicación: UTF-16. */
(function(root){
 'use strict';
 const fold=text=>text.toLocaleLowerCase('es').normalize('NFC');
 function hash(text){let value=2166136261;for(const char of text)value=Math.imul(value^char.codePointAt(0),16777619);return(value>>>0).toString(36);}
 function byteOffsets(text){
  const offsets=new Map([[0,0]]);let bytes=0,index=0;
  for(const char of text){const cp=char.codePointAt(0);bytes+=cp<=127?1:cp<=2047?2:cp<=65535?3:4;index+=char.length;offsets.set(bytes,index);}return offsets;
 }
 const vocabulary=new Set('int ext cont insert travelling travellings dolly zoom pan tilt flashback flashbacks off whip steadycam steadicam fade out cut dissolve intercut montage smash match jump more continued'.split(' '));
 function matches(text,raw,{kind='text',shift=0,onlyAgreement=false,speaker=''}={}){
  const offsets=byteOffsets(text),issues=[];
  for(const m of raw){
   if(onlyAgreement&&!/^AGREEMENT_/.test(m.category_id||''))continue;
   if(m.rule_id==='UPPERCASE_SENTENCE_START'&&(kind==='parenthetical'||!/[.!?][\s»”"')\]]*$/u.test(text)))continue;
   const a=offsets.get(m.range?.start),b=offsets.get(m.range?.end);
   if(a===undefined||b===undefined||a<shift||b<=a)continue;
   const fragment=text.slice(a,b),spelling=m.issue_type==='misspelling';
   if(spelling&&vocabulary.has(fold(fragment)))continue;
   const category=spelling?'spelling':m.category_id==='TYPOGRAPHY'||m.issue_type==='whitespace'?'punctuation':'syntax';
   const suggestions=[...new Set((m.suggestions||[]).map(s=>s.value).filter(s=>typeof s==='string'&&s.length<2000))].slice(0,5);
   const id=m.rule_id+(m.sub_id?':'+m.sub_id:'');
   issues.push({kind:category,rule:'lt:'+id,start:a-shift,end:b-shift,text:fragment,message:onlyAgreement?`Posible discordancia con «${speaker}»: ${m.message}`:m.message,key:spelling?fold(fragment):'lt:'+hash(id+':'+fold(fragment)+(onlyAgreement?':'+fold(speaker):'')),suggestions,...(!spelling&&suggestions.length?{replacement:suggestions[0]}:{})});
  }return issues;
 }
 // El nombre no forma parte de la acotación editable. Solo devolvemos coincidencias
 // de concordancia que caen íntegramente en ella; nunca corregimos el contexto creado.
 function contextual(block){
  if(block.kind!=='parenthetical'||!block.speaker)return null;
  const speaker=block.speaker.replace(/\s*\([^()]*\)\s*$/u,'').trim();
  if(!speaker||speaker.length>100)return null;
  const prefix=speaker+(/\s+(?:Y|E|&)\s+/iu.test(speaker)?' están ':' está ');
  const open=/^\s*\(/u.exec(block.text),start=open?open[0].length:0;
  const value=block.text.slice(start).replace(/\)\s*$/u,'');
  return{text:prefix+value+'.',shift:prefix.length,offset:start,end:start+value.length,speaker};
 }
 function merge(primary,supplement){
  // No ocultar errores distintos que solo comparten parte del texto. En una
  // misma selección tiene prioridad el motor, salvo una repetición estructural:
  // cambiar «un una» por «una una» no resuelve el artículo sobrante.
  const structural=supplement.filter(issue=>['double-article','repeated-word','repeated-phrase','parenthetical-agreement'].includes(issue.rule));
  const same=(a,b)=>a.kind===b.kind&&a.start===b.start&&a.end===b.end;
  const issues=primary.filter(issue=>!structural.some(other=>same(issue,other)));
  for(const issue of [...structural,...supplement])if(!issues.some(other=>same(other,issue)))issues.push(issue);
  return issues.sort((a,b)=>a.start-b.start||a.kind.localeCompare(b.kind));
 }
 // Límites por frase para no enviar al motor párrafos arbitrariamente grandes.
 // Los límites mantienen los offsets del texto original, sin recortarlo ni perderlo.
 function segments(text,limit=1800){
  const result=[];let start=0;
  while(start<text.length){let end=Math.min(text.length,start+limit);if(end<text.length){const chunk=text.slice(start,end),sentences=[...chunk.matchAll(/[.!?]\s+|\n+/g)],last=sentences.at(-1);if(last&&last.index>limit/3)end=start+last.index+last[0].length;else{const space=chunk.lastIndexOf(' ');if(space>limit/2)end=start+space+1;}if(/[\uD800-\uDBFF]/.test(text[end-1]))end--;}
   result.push({text:text.slice(start,end),offset:start});start=end;
  }return result;
 }
 const api={byteOffsets,matches,contextual,merge,segments};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoLanguageEngine=api;
})(globalThis);
