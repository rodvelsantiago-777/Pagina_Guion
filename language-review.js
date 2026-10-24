/* Reglas conservadoras de redacción en español. No modifica el texto analizado. */
(function(root){
 'use strict';
 const tokens=text=>[...text.matchAll(/[\p{L}\p{M}]+/gu)].map(match=>({text:match[0],word:match[0].toLocaleLowerCase('es').normalize('NFC'),start:match.index,end:match.index+match[0].length}));
 const articles=new Set(['el','la','los','las','un','una','unos','unas']);
 const vocabulary=new Set(['travelling','travellings','dolly','zoom','pan','tilt','flashback','flashbacks','off','whip','steadycam','steadicam']);
 const nouns={habitación:'f',habitaciones:'fp',casa:'f',casas:'fp',puerta:'f',puertas:'fp',ventana:'f',ventanas:'fp',mesa:'f',mesas:'fp',silla:'f',sillas:'fp',cama:'f',camas:'fp',escena:'f',escenas:'fp',pared:'f',paredes:'fp',mochila:'f',mochilas:'fp',mano:'f',manos:'fp',calle:'f',calles:'fp',plano:'m',planos:'mp',guion:'m',guiones:'mp',personaje:'m',personajes:'mp',sonido:'m',sonidos:'mp',micrófono:'m',micrófonos:'mp'};
 const agreement={f:['la','una'],fp:['las','unas'],m:['el','un'],mp:['los','unos']};
 function hash(text){let value=2166136261;for(const char of text)value=Math.imul(value^char.codePointAt(0),16777619);return(value>>>0).toString(36);}
 function syntax(text){
  const words=tokens(text),issues=[];
  function add(rule,first,last,message,replacement){
   const start=words[first].start,end=words[last].end,fragment=text.slice(start,end);
   if(!issues.some(item=>item.start===start&&item.end===end))issues.push({kind:'syntax',rule,start,end,text:fragment,message,replacement,key:'syntax:'+rule+':'+hash(fragment.toLocaleLowerCase('es'))});
  }
  for(let i=0;i<words.length-1;i++){
   const a=words[i],b=words[i+1],gap=text.slice(a.end,b.start);
   if(!/^\s+$/.test(gap))continue;
   if(a.word===b.word)add('repeated-word',i,i+1,'Posible palabra repetida.',a.text);
   else if(articles.has(a.word)&&articles.has(b.word))add('double-article',i,i+1,'Hay dos artículos seguidos; revisa cuál corresponde.',undefined);
   if(['a','de'].includes(a.word)&&b.text==='el')add('contraction',i,i+1,'Esta combinación suele escribirse como una contracción.',a.word==='a'?'al':'del');
   if(['habían','hubieron'].includes(a.word)&&['un','una','unos','unas','muchos','muchas'].includes(b.word))add('impersonal-haber',i,i,'En este uso impersonal, haber suele ir en singular.',a.word==='habían'?'había':'hubo');
   if(articles.has(a.word)&&nouns[b.word]&&!agreement[nouns[b.word]].includes(a.word)){
    const options=agreement[nouns[b.word]],article=options[['un','una','unos','unas'].includes(a.word)?1:0];
    add('noun-agreement',i,i+1,'Posible falta de concordancia entre el artículo y el nombre.',article+' '+b.text);
   }
  }
  // Busca frases duplicadas contiguas o separadas solo por un artículo sobrante.
  for(let i=0;i<words.length;i++)for(let length=Math.min(6,Math.floor((words.length-i)/2));length>=2;length--){
   const first=words.slice(i,i+length);
   if(!first.some(word=>word.word.length>=4&&!articles.has(word.word)))continue;
   for(let skip=0;skip<=2;skip++){
    const next=i+length+skip;if(next+length>words.length)continue;
    if(words.slice(i+length,next).some(word=>!articles.has(word.word)))continue;
    if(first.some((word,k)=>word.word!==words[next+k].word))continue;
    if(!/^[\p{L}\p{M}\s]+$/u.test(text.slice(words[i].start,words[next+length-1].end)))continue;
    if(issues.some(issue=>issue.rule==='repeated-phrase'&&words[next].start>=issue.start&&words[next+length-1].end<=issue.end))continue;
    add('repeated-phrase',next,next+length-1,'Esta frase parece repetida dentro del mismo fragmento.',undefined);
   }
  }
  return issues.sort((a,b)=>a.start-b.start||b.end-a.end);
 }
 function candidates(text){
  return tokens(text).filter(word=>{
   if(word.text.length<3||word.text.length>40||vocabulary.has(word.word))return false;
   if(/[\d_]/.test(text[word.start-1]||'')||/[\d_]/.test(text[word.end]||''))return false;
   const segment=text.slice(Math.max(0,text.lastIndexOf(' ',word.start-1)+1),text.indexOf(' ',word.end)<0?text.length:text.indexOf(' ',word.end));
   if(/https?:|@|www\./i.test(segment))return false;
   if(word.text===word.text.toLocaleUpperCase('es'))return false;
   // Conserva los nombres propios intermedios; comprueba la mayúscula inicial de una oración.
   if(word.text!==word.word&&text.slice(0,word.start).trim()&&!/[.!?]\s*$/.test(text.slice(0,word.start)))return false;
   return true;
  });
 }
 function spelling(text,result){
  if(result.total>=10&&result.known/result.total<.35)return [];
  const wrong=new Set(result.wrong);
  return candidates(text).filter(word=>wrong.has(word.text)).map(word=>({kind:'spelling',start:word.start,end:word.end,text:word.text,key:word.word,message:'Palabra no reconocida por el diccionario de español.',suggestions:result.suggestions?.[word.text]||[]}));
 }
 const api={tokens,syntax,candidates,spelling,hash};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoLanguageReview=api;
})(globalThis);
