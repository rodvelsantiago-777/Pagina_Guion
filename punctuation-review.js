/* Reglas locales conservadoras de puntuación; no reescribe el guion. */
(function(root){
 'use strict';
 const hash=text=>{let value=2166136261;for(const char of text)value=Math.imul(value^char.codePointAt(0),16777619);return(value>>>0).toString(36);};
 const abbreviations=new Set(['int','ext','sr','sra','srta','dr','dra','ud','uds','pág','págs','núm','núms','etc','aprox','tel','av','ej','vs','vo','os','oc']);
 function check(text){
  const issues=[],protectedRanges=[...text.matchAll(/https?:\/\/[^\s<>]+|www\.[^\s<>]+|[\p{L}\p{N}_.+%-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|\b[\p{L}\p{N}_-]+\.(?:pdf|plano|docx|txt|rtf|fdx|fountain|celtx|wdz|json|csv|html|js|css)\b/giu)].map(match=>[match.index,match.index+match[0].length]);
  const protectedAt=at=>protectedRanges.some(([from,to])=>at>=from&&at<to);
  function add(rule,start,end,message,replacement){
   if(start<0||end<=start||end>text.length||protectedAt(start)||issues.some(issue=>start<issue.end&&end>issue.start))return;
   const fragment=text.slice(start,end);issues.push({kind:'punctuation',rule,start,end,text:fragment,key:'punctuation:'+rule+':'+hash(fragment),message:'Puntuación: '+message,...(replacement!==undefined?{replacement}:{})});
  }
  const decimal=at=>/\d/.test(text[at-1]||'')&&/\d/.test(text[at+1]||'');
  const abbreviation=at=>{const prior=text.slice(Math.max(0,at-35),at).match(/([\p{L}]+)$/u)?.[1]||'';return prior.length===1||abbreviations.has(prior.toLocaleLowerCase('es'));};
  // La elipsis, los signos enfáticos y las abreviaturas tienen sus propias reglas.
  for(const match of text.matchAll(/\.{2,}|[,;:]{2,}/g)){
   const start=match.index,end=start+match[0].length;if(protectedAt(start))continue;
   if(match[0][0]==='.'){
    let from=start;while(from>0&&/[ \t]/.test(text[from-1]))from--;const attached=from<start&&/[\p{L}\p{N})\]»”]/u.test(text[from-1]||''),missingSpace=/[\p{L}\p{N}]/u.test(text[end]||'');
    if(match[0].length!==3||attached||missingSpace)add('ellipsis',attached?from:start,end+(missingSpace?1:0),match[0].length!==3?'Los puntos suspensivos se escriben con tres puntos.':'Revisa los espacios junto a los puntos suspensivos.','...'+(missingSpace?' '+text[end]:''));
   }else if([...match[0]].every(char=>char===match[0][0]))add('duplicate-sign',start,end,'Parece que este signo está repetido.',match[0][0]);
  }
  for(let at=0;at<text.length;at++){
   const sign=text[at];if(!/[,.;:!?…]/.test(sign)||protectedAt(at))continue;
   if(sign==='.'&&(text[at-1]==='.'||text[at+1]==='.'))continue;
   let from=at;while(from>0&&/[ \t]/.test(text[from-1]))from--;
   const before=from>0?text[from-1]:'',number=/\d/.test(before)&&/\d/.test(text[at+1]||'')&&/[,.:]/.test(sign),abbrev=sign==='.'&&abbreviation(at),hasWrongSpace=from<at&&Boolean(before)&&!/[\n\r¿¡([{—–]/.test(before);
   const missingSpace=!number&&!abbrev&&/[\p{L}\p{N}]/u.test(text[at+1]||'');
   if(hasWrongSpace||missingSpace){const end=at+1+(missingSpace?1:0),replacement=sign+(missingSpace?' '+text[at+1]:'');add('sign-spacing',hasWrongSpace?from:at,end,hasWrongSpace?'Este signo debe ir unido al texto anterior.':'Falta un espacio después del signo.',replacement);}
   if((sign==='?'||sign==='!')&&text[at+1]==='.'&&text[at+2]!=='.')add('terminal-period',at+1,at+2,'No se añade un punto inmediatamente después de «?» o «!».','');
  }
  for(const match of text.matchAll(/[¿¡][ \t]+/g))add('opening-space',match.index,match.index+match[0].length,'El signo de apertura va unido a la primera palabra.',match[0][0]);
  const stacks={'?':[],'!':[]},opening={'¿':'?','¡':'!'};let boundary=0;
  for(let at=0;at<text.length;at++){
   if(protectedAt(at))continue;const sign=text[at];
   if(opening[sign]){stacks[opening[sign]].push(at);continue;}
   if(sign==='?'||sign==='!'){
    if(text[at-1]===sign)continue;
    let end=at+1;while(text[end]===sign)end++;
    if(stacks[sign].length)stacks[sign].splice(Math.max(0,stacks[sign].length-(end-at)));
    else{
     const prefix=text.slice(boundary,at),first=prefix.match(/[\p{L}\p{M}\p{N}]+/u);if(first){const start=boundary+first.index,end=start+first[0].length;add(sign==='?'?'missing-open-question':'missing-open-exclamation',start,end,`Revisa si falta el signo de apertura «${sign==='?'?'¿':'¡'}».`,(sign==='?'?'¿':'¡')+first[0]);}
    }
    boundary=end;
   }else if(/[;\n\r]/.test(sign)||sign===':'&&!decimal(at)||sign==='.'&&text[at-1]!=='.'&&text[at+1]!=='.'&&!decimal(at)&&!abbreviation(at))boundary=at+1;
  }
  for(const sign of ['?','!'])for(const start of stacks[sign]){
   const tail=text.slice(start+1),last=[...tail.matchAll(/[\p{L}\p{M}\p{N}]+/gu)].at(-1);if(!last)continue;
   const from=start+1+last.index,to=from+last[0].length,remaining=text.slice(to);
   if(/^[ \t]*\.?[ \t]*$/.test(remaining))add(sign==='?'?'missing-close-question':'missing-close-exclamation',from,text.length,`Revisa si falta el signo de cierre «${sign}».`,last[0]+sign);
   else add('unclosed-sign',start,start+1,`Hay un signo «${text[start]}» sin su cierre «${sign}».`);
  }
  return issues.sort((a,b)=>a.start-b.start||a.end-b.end);
 }
 const api={check};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoPunctuation=api;
})(globalThis);
