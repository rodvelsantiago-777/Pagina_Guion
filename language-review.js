/* Reglas conservadoras de redacción en español. No modifica el texto analizado. */
(function(root){
 'use strict';
 const tokens=text=>[...text.matchAll(/[\p{L}\p{M}]+/gu)].map(match=>({text:match[0],word:match[0].toLocaleLowerCase('es').normalize('NFC'),start:match.index,end:match.index+match[0].length}));
 const articles=new Set(['el','la','los','las','un','una','unos','unas']);
 const vocabulary=new Set(['travelling','travellings','dolly','zoom','pan','tilt','flashback','flashbacks','off','whip','steadycam','steadicam','int','ext','cont','insert','fade','out','cut','dissolve','intercut','montage','smash','match','jump','more','continued']);
 const nouns=Object.assign(Object.create(null),{habitación:'f',habitaciones:'fp',casa:'f',casas:'fp',puerta:'f',puertas:'fp',ventana:'f',ventanas:'fp',mesa:'f',mesas:'fp',silla:'f',sillas:'fp',cama:'f',camas:'fp',escena:'f',escenas:'fp',pared:'f',paredes:'fp',mochila:'f',mochilas:'fp',mano:'f',manos:'fp',calle:'f',calles:'fp',plano:'m',planos:'mp',guion:'m',guiones:'mp',personaje:'m',personajes:'mp',sonido:'m',sonidos:'mp',micrófono:'m',micrófonos:'mp'});
 const agreement={f:['la','una'],fp:['las','unas'],m:['el','un'],mp:['los','unos']};
 const plural=word=>word.endsWith('z')?word.slice(0,-1)+'ces':/[aeiouáéíóú]$/.test(word)?word+'s':word.replace(/[áéíóú](?=n$)/,char=>char.normalize('NFD')[0])+'es';
 for(const [gender,words]of [['f','planta sala cocina oficina terraza estación recepción prisión escalera pantalla televisión mirada voz luz noche mañana tarde persona mujer niña cámara botella llave caja lámpara entrada salida ropa madre azotea carretera playa ciudad tienda iglesia escuela universidad familia gente víctima fuente agua águila aula arma área hacha alma'],['m','cuarto pasillo dormitorio baño salón jardín patio garaje sótano edificio techo suelo piso cajón escritorio sofá armario televisor teléfono cuchillo vaso plato pocillo libro niño hombre padre coche carro camino parque hotel hospital local restaurante problema mapa día cuadro bolso traje retrato vestido']])for(const word of words.split(' ')){nouns[word]=gender;nouns[plural(word)]=gender+'p';}
 const aTonica=new Set(['agua','águila','aula','arma','área','hacha','alma']),collectives=new Set(['familia','gente']);
 const adjectives=new Map();
 function adjective(forms){for(const [feature,word]of Object.entries(forms)){let entry=adjectives.get(word);if(!entry){entry={forms,features:new Set()};adjectives.set(word,entry);}entry.features.add(feature);}}
 for(const word of 'abierto cerrado oscuro iluminado pequeño alto bajo roto nuevo vacío encendido apagado sucio limpio frío tranquilo silencioso cansado sentado parado acostado despierto dormido muerto vivo mojado seco negro blanco rojo amarillo bonito feo largo corto estrecho ancho profundo claro viejo moderno antiguo lleno ocupado abandonado destrozado desordenado ordenado descuidado cuidado enfadado asustado preocupado sorprendido herido perdido cubierto descubierto escrito hecho puesto satisfecho cercano lejano próximo mismo distinto último primero segundo tercero bueno malo'.split(' '))adjective({m:word,f:word.slice(0,-1)+'a',mp:word+'s',fp:word.slice(0,-1)+'as'});
 for(const [single,multiple]of [['grande','grandes'],['verde','verdes'],['azul','azules'],['gris','grises'],['triste','tristes'],['alegre','alegres'],['caliente','calientes'],['fuerte','fuertes'],['débil','débiles'],['difícil','difíciles'],['fácil','fáciles'],['feliz','felices'],['amable','amables'],['enorme','enormes']])adjective({m:single,f:single,mp:multiple,fp:multiple});
 const copulas=new Map();for(const [single,multiple]of [['es','son'],['está','están'],['estaba','estaban'],['estará','estarán'],['parece','parecen'],['parecía','parecían'],['queda','quedan'],['permanece','permanecen']]){copulas.set(single,{plural:false,single,multiple});copulas.set(multiple,{plural:true,single,multiple});}
 const degrees=new Set(['muy','tan','más','menos','bastante','casi','demasiado']),prepositions=new Set(['a','al','de','del','en','con','sin','por','para','entre','sobre']);
 const determiners=[['este','esta','estos','estas'],['ese','esa','esos','esas'],['aquel','aquella','aquellos','aquellas'],['otro','otra','otros','otras'],['todo','toda','todos','todas'],['mucho','mucha','muchos','muchas'],['poco','poca','pocos','pocas'],['nuestro','nuestra','nuestros','nuestras'],['vuestro','vuestra','vuestros','vuestras'],['mi','mi','mis','mis'],['tu','tu','tus','tus'],['su','su','sus','sus']].map(list=>Object.fromEntries(['m','f','mp','fp'].map((key,i)=>[key,list[i]])));
 const determinerForms=new Map(determiners.flatMap(forms=>Object.values(forms).map(word=>[word,forms])));
 const isDeterminer=word=>articles.has(word)||determinerForms.has(word)||['qué','cuál','cuáles'].includes(word);
 function preserveCase(value,source){if(!value)return value;const letters=source.match(/\p{L}/gu)||[];if(letters.length&&letters.every(letter=>letter===letter.toLocaleUpperCase('es')))return value.toLocaleUpperCase('es');return /^\p{Lu}/u.test(source)?value[0].toLocaleUpperCase('es')+value.slice(1):value;}
 function hash(text){let value=2166136261;for(const char of text)value=Math.imul(value^char.codePointAt(0),16777619);return(value>>>0).toString(36);}
 function syntax(text){
  const words=tokens(text),issues=[];
  function add(rule,first,last,message,replacement){
   const start=words[first].start,end=words[last].end,fragment=text.slice(start,end);
   if(!issues.some(item=>item.start===start&&item.end===end))issues.push({kind:'syntax',rule,start,end,text:fragment,message,replacement:replacement?preserveCase(replacement,fragment):replacement,key:'syntax:'+rule+':'+hash(fragment.toLocaleLowerCase('es'))});
  }
  for(let i=0;i<words.length-1;i++){
   const a=words[i],b=words[i+1],gap=text.slice(a.end,b.start);
   if(!/^\s+$/.test(gap))continue;
   if(a.word===b.word)add('repeated-word',i,i+1,'Posible palabra repetida.',a.text);
   else if(articles.has(a.word)&&articles.has(b.word))add('double-article',i,i+1,'Hay dos artículos seguidos; revisa cuál corresponde.',undefined);
   if(['a','de'].includes(a.word)&&b.word==='el'&&b.text!=='El')add('contraction',i,i+1,'Esta combinación suele escribirse como una contracción.',a.word==='a'?'al':'del');
   if(['habían','hubieron'].includes(a.word)&&['un','una','unos','unas','muchos','muchas'].includes(b.word))add('impersonal-haber',i,i,'En este uso impersonal, haber suele ir en singular.',a.word==='habían'?'había':'hubo');
   const feature=nouns[b.word],tonic=aTonica.has(b.word),allowed=feature?[...agreement[feature],...(tonic?['el','un']:[])]:[];
   if(articles.has(a.word)&&feature&&(!allowed.includes(a.word)||tonic&&a.word==='la')){
    const options=agreement[feature],article=tonic?(a.word==='una'||a.word==='un'?'una':'el'):options[['un','una','unos','unas'].includes(a.word)?1:0];
    add('noun-agreement',i,i+1,'Posible falta de concordancia entre el artículo y el nombre.',article+' '+b.text);
   }
   const determiner=determinerForms.get(a.word);if(determiner&&feature&&determiner[feature]!==a.word)add('determiner-agreement',i,i+1,'El determinante y el nombre no concuerdan en género o número.',determiner[feature]+' '+b.text);
  }
  const connected=(a,b)=>b<words.length&&/^\s+$/.test(text.slice(words[a].end,words[b].start));
  for(let i=0;i<words.length;i++){
   const noun=words[i],feature=nouns[noun.word];if(!feature)continue;
   const prior=words[i-1]?.word,previous=words[i-2]?.word;
   if(['y','e','o','u','ni'].includes(prior)||['y','e','o','u','ni'].includes(previous)&&isDeterminer(prior))continue;
   let next=i+1;if(!connected(i,next))continue;
   const verbAt=next,verb=copulas.get(words[next].word),embedded=prepositions.has(prior)||isDeterminer(prior)&&prepositions.has(previous);
   if(verb){
    if(embedded)continue;
    next++;if(!connected(next-1,next))continue;
   }
   for(let count=0;count<2&&degrees.has(words[next]?.word)&&connected(next,next+1);count++)next++;
   const entry=adjectives.get(words[next]?.word);
   if(verb&&!collectives.has(noun.word)&&verb.plural!==feature.endsWith('p')&&(verb.single!=='es'||entry))add('subject-verb-agreement',verbAt,verbAt,'Posible falta de concordancia de número entre el sujeto y el verbo.',feature.endsWith('p')?verb.multiple:verb.single);
   if(!entry||entry.features.has(feature))continue;
   const replacement=entry.forms[feature];
   if(verb)add('noun-adjective-agreement',next,next,`El adjetivo debe concordar con «${noun.text}» en género y número.`,replacement);
   else add('noun-adjective-agreement',i,next,'El nombre y su adjetivo no concuerdan en género o número.',text.slice(noun.start,words[next].start)+preserveCase(replacement,words[next].text));
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
   if(word.text===word.text.toLocaleUpperCase('es'))return true;
   // Conserva los nombres propios intermedios; comprueba la mayúscula inicial de una oración.
   if(word.text!==word.word&&text.slice(0,word.start).trim()&&!/[.!?]\s*$/.test(text.slice(0,word.start)))return false;
   return true;
  }).map(word=>({...word,lookup:word.text===word.text.toLocaleUpperCase('es')?word.word:word.text}));
 }
 function spelling(text,result){
  const wrong=new Set(result.wrong);
  return candidates(text).filter(word=>wrong.has(word.lookup)).map(word=>({kind:'spelling',start:word.start,end:word.end,text:word.text,key:word.word,message:'Palabra no reconocida por el diccionario de español.',suggestions:(Array.isArray(result.suggestions?.[word.lookup])?result.suggestions[word.lookup]:[]).map(value=>preserveCase(value,word.text))}));
 }
 const api={tokens,syntax,candidates,spelling,preserveCase,hash};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoLanguageReview=api;
})(globalThis);
