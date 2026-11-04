/* Reglas conservadoras de redacción en español. No modifica el texto analizado. */
(function(root){
 'use strict';
 const punctuation=typeof module==='object'&&module.exports?require('./punctuation-review.js').check:root.PlanoPunctuation.check;
 const tokens=text=>[...text.matchAll(/[\p{L}\p{M}]+/gu)].map(match=>({text:match[0],word:match[0].toLocaleLowerCase('es').normalize('NFC'),start:match.index,end:match.index+match[0].length}));
 const articles=new Set(['el','la','los','las','un','una','unos','unas']);
 const vocabulary=new Set(['travelling','travellings','dolly','zoom','pan','tilt','flashback','flashbacks','off','whip','steadycam','steadicam','int','ext','cont','insert','fade','out','cut','dissolve','intercut','montage','smash','match','jump','more','continued']);
 // Complemento de nombres frecuentes que faltan en el diccionario general.
 // La tilde forma parte de la identidad: reconocer Sofía no acepta automáticamente Sofia.
 const properNames=new Set(('Aarón Abel Abigail Adela Adelaida Adrián Adriana Agustín Ainhoa Aitana Alan Alba Alberto Alejandra Alejandro Alex Álex Alfonso Alfredo Alicia Alma Alonso Álvaro Amalia Amanda Amelia Amparo Ana Andrea Andrés Ángel Ángela Ángeles Antonio Ariadna Ariel Armando Arturo Aurora Bárbara Beatriz Belén Benjamín Blanca Bruno Camila Camilo Candela Carla Carlos Carmen Carolina Catalina Cecilia César Clara Claudia Claudio Cristina Cristóbal Damián Daniel Daniela Darío David Diana Diego Dolores Domingo Eduardo Elena Eliana Elisa Elías Emilia Emiliano Emilio Emma Enrique Eric Erika Érika Ernesto Esteban Esther Eva Fabián Fabiola Fátima Federico Felipe Fernanda Fernando Florencia Francisco Gabriel Gabriela Gael Gloria Gonzalo Graciela Gregorio Guadalupe Guillermo Gustavo Héctor Helena Hugo Ignacio Inés Irene Iris Isabel Isabela Ismael Iván Jacobo Jaime Javier Jazmín Jesús Jimena Joaquín Joel Jorge José Josefina Juan Juana Julián Juliana Julia Julio Lara Laura Leandro Leonardo Leonor Leticia Lidia Liliana Lola Lorena Lorenzo Lourdes Lucía Luciano Luis Luisa Luna Luz Magdalena Manuela Manuel Marcela Marcelo Marcos Margarita María Mariana Mariano Marina Mario Marisol Marta Martín Martina Mateo Matías Mauricio Maximiliano Mercedes Micaela Miguel Milena Miriam Mónica Natalia Nicolás Noa Noelia Nora Nuria Óscar Pablo Paloma Paola Patricia Paula Paulina Pedro Pilar Rafael Raquel Ramón Rebeca Regina Renata Ricardo Rita Roberto Rocío Rodrigo Rosa Rosario Rubén Ruth Salomé Salvador Samuel Sandra Santiago Sara Sebastián Sergio Silvia Simón Sofía Soledad Sonia Susana Tamara Teresa Tomás Valentina Valentín Valeria Vanessa Vera Verónica Vicente Víctor Victoria Violeta Virginia Xavier Ximena Yolanda Zoe Zoé Zulema García González Rodríguez Fernández López Martínez Sánchez Pérez Gómez Martín Jiménez Ruiz Hernández Díaz Moreno Muñoz Álvarez Romero Gutiérrez Alonso Navarro Torres Domínguez Vázquez Velázquez Vásquez Ramos Ramírez Gil Serrano Blanco Suárez Molina Morales Ortega Delgado Castro Ortiz Rubio Marín Sanz Núñez Medina Iglesias Garrido Cortés Castillo Santos Guerrero Lozano Méndez Cruz Prieto Flores Herrera Peña León Márquez Cabrera Ríos Vega Fuentes Carrillo Acosta Arias Cárdenas Ospina Quintero Restrepo Rojas Pardo Castaño Pineda').toLocaleLowerCase('es').split(' '));
 function nameWords(names){return new Set(names.flatMap(name=>tokens(name).map(token=>token.word)));}
 const foldName=text=>text.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu,'');
 const nameFeatures=new Map();
 for(const [feature,names]of [['f','Adela Adriana Ainhoa Aitana Alba Alejandra Alicia Amalia Amanda Amelia Amparo Ana Andrea Ángela Angélica Ángeles Antonia Ariadna Aurora Bárbara Beatriz Belén Blanca Camila Candela Carla Carmen Carolina Catalina Cecilia Clara Claudia Cristina Daniela Diana Dolores Elena Eliana Elisa Emilia Emma Erika Érika Esther Eva Fabiola Fátima Fernanda Florencia Gabriela Gloria Graciela Inés Irene Iris Isabel Isabela Jazmín Jimena Josefina Juana Juliana Julia Lara Laura Leonor Leticia Lidia Liliana Lola Lorena Lourdes Lucía Luisa Luna Luz Magdalena Manuela Marcela Margarita María Mariana Marina Marisol Marta Martina Mercedes Micaela Milena Miriam Mónica Natalia Noelia Nora Nuria Paloma Paola Patricia Paula Paulina Raquel Rebeca Regina Renata Rita Rocío Rosa Rosario Ruth Salomé Sandra Sara Silvia Sofía Soledad Sonia Susana Tamara Teresa Valentina Valeria Vanessa Vera Verónica Victoria Violeta Virginia Ximena Yolanda Zoe Zoé Zulema'],['m','Aarón Abel Adrián Agustín Alberto Alejandro Alfonso Alfredo Alonso Álvaro Andrés Ángel Angélico Antonio Armando Arturo Benjamín Bruno Camilo Carlos César Claudio Cristóbal Damián Daniel Darío David Diego Domingo Eduardo Elías Emiliano Emilio Enrique Ernesto Esteban Fabián Federico Felipe Fernando Francisco Gabriel Gonzalo Gregorio Guillermo Gustavo Héctor Hugo Ignacio Ismael Iván Jacobo Jaime Javier Jesús Joaquín Joel Jorge José Josep Juan Julián Julio Leandro Leonardo Lorenzo Luciano Luis Manuel Marcelo Marcos Mariano Mario Martín Mateo Matías Mauricio Maximiliano Miguel Nicolás Óscar Pablo Pedro Rafael Ramón Ricardo Roberto Rodrigo Rubén Salvador Samuel Santiago Sebastián Sergio Simón Tomás Valentín Vicente Víctor Xavier']])for(const name of names.split(' ')){nameFeatures.set(foldName(name),feature);properNames.add(name.toLocaleLowerCase('es'));}
 const nouns=Object.assign(Object.create(null),{habitación:'f',habitaciones:'fp',casa:'f',casas:'fp',puerta:'f',puertas:'fp',ventana:'f',ventanas:'fp',mesa:'f',mesas:'fp',silla:'f',sillas:'fp',cama:'f',camas:'fp',escena:'f',escenas:'fp',pared:'f',paredes:'fp',mochila:'f',mochilas:'fp',mano:'f',manos:'fp',calle:'f',calles:'fp',plano:'m',planos:'mp',guion:'m',guiones:'mp',personaje:'m',personajes:'mp',sonido:'m',sonidos:'mp',micrófono:'m',micrófonos:'mp'});
 const agreement={f:['la','una'],fp:['las','unas'],m:['el','un'],mp:['los','unos']};
 const plural=word=>word.endsWith('z')?word.slice(0,-1)+'ces':/[aeiouáéíóú]$/.test(word)?word+'s':word.replace(/[áéíóú](?=n$)/,char=>char.normalize('NFD')[0])+'es';
 for(const [gender,words]of [['f','planta sala cocina oficina terraza estación recepción prisión escalera pantalla televisión mirada voz luz noche mañana tarde persona mujer niña cámara botella llave caja lámpara entrada salida ropa madre azotea carretera playa ciudad tienda iglesia escuela universidad familia gente víctima fuente agua águila aula arma área hacha alma doctora médica enfermera profesora directora actriz abuela hermana hija esposa novia vecina chica muchacha chaqueta falda sonrisa expresión respiración'],['m','cuarto pasillo dormitorio baño salón jardín patio garaje sótano edificio techo suelo piso cajón escritorio sofá armario televisor teléfono cuchillo vaso plato pocillo libro niño hombre padre coche carro camino parque hotel hospital local restaurante problema mapa día cuadro bolso traje retrato vestido tono gesto rostro doctor médico enfermero profesor director actor abuelo hermano hijo esposo novio vecino chico muchacho']])for(const word of words.split(' ')){nouns[word]=gender;nouns[plural(word)]=gender+'p';}
 const aTonica=new Set(['agua','águila','aula','arma','área','hacha','alma']),collectives=new Set(['familia','gente']);
 const adjectives=new Map();
 function adjective(forms){for(const [feature,word]of Object.entries(forms)){let entry=adjectives.get(word);if(!entry){entry={forms,features:new Set()};adjectives.set(word,entry);}entry.features.add(feature);}}
 for(const word of 'abierto cerrado oscuro iluminado pequeño alto bajo roto nuevo vacío encendido apagado sucio limpio frío tranquilo silencioso cansado sentado parado acostado despierto dormido muerto vivo mojado seco negro blanco rojo amarillo bonito feo largo corto estrecho ancho profundo claro viejo moderno antiguo lleno ocupado abandonado destrozado desordenado ordenado descuidado cuidado enfadado asustado preocupado sorprendido herido perdido cubierto descubierto escrito hecho puesto satisfecho cercano lejano próximo mismo distinto último primero segundo tercero bueno malo'.split(' '))adjective({m:word,f:word.slice(0,-1)+'a',mp:word+'s',fp:word.slice(0,-1)+'as'});
 for(const word of 'burlesco irónico sarcástico nervioso tímido serio emocionado molesto enojado furioso irritado atento distraído inquieto incómodo perplejo confundido consternado pálido tenso seguro inseguro sobresaltado incrédulo decepcionado agotado exhausto alterado resignado curioso dolido enamorado agradecido ansioso desesperado avergonzado frustrado ofendido entusiasmado pensativo áspero brusco convencido decidido nostálgico orgulloso conmocionado divertido risueño cariñoso afectuoso cariacontecido indignado callado quieto calmado relajado apenado espantado aterrado concentrado desconcertado intrigado confuso sereno exaltado extrañado ilusionado desanimado desolado aliviado emotivo vestido desnudo abrigado disfrazado peinado maquillado arrodillado agachado inclinado apoyado recostado tumbado erguido'.split(' '))adjective({m:word,f:word.slice(0,-1)+'a',mp:word+'s',fp:word.slice(0,-1)+'as'});
 adjective({m:'burlón',f:'burlona',mp:'burlones',fp:'burlonas'});
 for(const [single,multiple]of [['grande','grandes'],['verde','verdes'],['azul','azules'],['gris','grises'],['triste','tristes'],['alegre','alegres'],['caliente','calientes'],['fuerte','fuertes'],['débil','débiles'],['difícil','difíciles'],['fácil','fáciles'],['feliz','felices'],['amable','amables'],['enorme','enormes']])adjective({m:single,f:single,mp:multiple,fp:multiple});
 for(const word of 'culpable indiferente consciente inconsciente impaciente inteligente prudente torpe vulnerable amable desafiante dulce'.split(' '))adjective({m:word,f:word,mp:word+'s',fp:word+'s'});
 const copulas=new Map();for(const [single,multiple]of [['es','son'],['está','están'],['estaba','estaban'],['estará','estarán'],['parece','parecen'],['parecía','parecían'],['queda','quedan'],['permanece','permanecen']]){copulas.set(single,{plural:false,single,multiple});copulas.set(multiple,{plural:true,single,multiple});}
 for(const [single,multiple]of [['era','eran'],['estuvo','estuvieron'],['estaría','estarían'],['quedó','quedaron'],['resulta','resultan'],['luce','lucen'],['sigue','siguen'],['continúa','continúan']]){copulas.set(single,{plural:false,single,multiple});copulas.set(multiple,{plural:true,single,multiple});}
 const reflexiveVerbs=new Map(),predicativeVerbs=new Map();
 for(const [single,multiple]of [['siente','sienten'],['sentía','sentían'],['ve','ven'],['muestra','muestran'],['encuentra','encuentran'],['encontraba','encontraban'],['vuelve','vuelven'],['quedaba','quedaban']])for(const [word,plural]of [[single,false],[multiple,true]])reflexiveVerbs.set(word,{single,multiple,plural});
 for(const [single,multiple]of [['entra','entran'],['entró','entraron'],['sale','salen'],['salió','salieron'],['camina','caminan'],['caminó','caminaron'],['llega','llegan'],['llegó','llegaron'],['regresa','regresan'],['duerme','duermen'],['despierta','despiertan'],['habla','hablan'],['responde','responden']])for(const [word,plural]of [[single,false],[multiple,true]])predicativeVerbs.set(word,{single,multiple,plural});
 const pronouns=new Map([['él','m'],['ella','f'],['ellos','mp'],['ellas','fp'],['nosotros','mp'],['nosotras','fp'],['vosotros','mp'],['vosotras','fp']]),commonRoles=new Set(['protagonista','policía','guardia','periodista','artista','testigo','estudiante']);
 const manner=new Set(['alto','bajo','claro','duro','rápido','lento','fuerte','fácil','limpio','recto','derecho','seguido','fijo']);
 const modifiers=new Set(['no','muy','tan','más','menos','bastante','casi','demasiado','algo','visiblemente','ligeramente','completamente','totalmente','realmente','aparentemente','notablemente','especialmente','profundamente']);
 const prepositions=new Set(['a','al','de','del','en','con','sin','por','para','entre','sobre']);
 const determiners=[['este','esta','estos','estas'],['ese','esa','esos','esas'],['aquel','aquella','aquellos','aquellas'],['otro','otra','otros','otras'],['todo','toda','todos','todas'],['mucho','mucha','muchos','muchas'],['poco','poca','pocos','pocas'],['nuestro','nuestra','nuestros','nuestras'],['vuestro','vuestra','vuestros','vuestras'],['mi','mi','mis','mis'],['tu','tu','tus','tus'],['su','su','sus','sus']].map(list=>Object.fromEntries(['m','f','mp','fp'].map((key,i)=>[key,list[i]])));
 const determinerForms=new Map(determiners.flatMap(forms=>Object.values(forms).map(word=>[word,forms])));
 const isDeterminer=word=>articles.has(word)||determinerForms.has(word)||['qué','cuál','cuáles'].includes(word);
 function preserveCase(value,source){if(!value)return value;const letters=source.match(/\p{L}/gu)||[];if(letters.length&&letters.every(letter=>letter===letter.toLocaleUpperCase('es')))return value.toLocaleUpperCase('es');return /^\p{Lu}/u.test(source)?value[0].toLocaleUpperCase('es')+value.slice(1):value;}
 function hash(text){let value=2166136261;for(const char of text)value=Math.imul(value^char.codePointAt(0),16777619);return(value>>>0).toString(36);}
 function characterFeature(name){
  const clean=name.replace(/(?:\s*\([^()]*\))\s*$/gu,'').trim(),parts=clean.split(/\s+(?:y|e|&)\s+/iu);if(parts.length>1){const features=parts.map(characterFeature);if(features.some(feature=>!feature))return null;return features.every(feature=>feature.startsWith('f'))?'fp':'mp';}
  const words=tokens(clean);if(!words.length)return null;const first=words[0].word,article=({el:'m',la:'f',los:'mp',las:'fp',un:'m',una:'f',unos:'mp',unas:'fp'})[first];
  if(article&&words[1]&&(nouns[words[1].word]||commonRoles.has(words[1].word)||commonRoles.has(words[1].word.replace(/s$/,''))))return article;
  return pronouns.get(first)||nameFeatures.get(foldName(words[0].text))||nouns[first]||({todas:'fp',todos:'mp',ambas:'fp',ambos:'mp'})[first]||null;
 }
 function adjectiveSequence(text,words,start,feature,emit,{predicative=false}={}){
  let next=start,first=true;while(next<words.length){
   let skipped=0;while(modifiers.has(words[next]?.word)&&skipped++<4){if(!words[next+1]||!/^\s+$/.test(text.slice(words[next].end,words[next+1].start)))return;next++;}
   if(words[next]?.word==='un'&&words[next+1]?.word==='poco')next+=2;
   const word=words[next],entry=adjectives.get(word?.word);if(!entry||predicative&&manner.has(word.word)||word.word==='bajo'&&isDeterminer(words[next+1]?.word))break;
   if(!entry.features.has(feature))emit(next,entry.forms[feature],first);
   first=false;let end=next;next++;
   if(['y','e','o','u','pero'].includes(words[next]?.word)&&/^\s+$/.test(text.slice(words[end].end,words[next].start))){end=next++;}
   else if(!/^\s*,\s*$/.test(text.slice(words[end].end,words[next]?.start??text.length)))break;
   if(!/^\s*$/.test(text.slice(words[end].end,words[next]?.start??text.length))&&!/^\s*,\s*$/.test(text.slice(words[end].end,words[next]?.start??text.length)))break;
  }
 }
 function contextual(text,{kind,speaker}={}){
  if(kind!=='parenthetical'||!speaker)return[];const feature=characterFeature(speaker);if(!feature)return[];const words=tokens(text),issues=[];let start=0;
  if(/^(?:hablando|susurrando|gritando|sonriendo|mirando|observando|riendo|llorando|respirando|contestando|respondiendo|dirigiendo)(?:me|te|se|lo|la|los|las|le|les|nos)?$/.test(foldName(words[0]?.word||''))){start=1;}
  adjectiveSequence(text,words,start,feature,(at,replacement)=>{const word=words[at],message=`Posible discordancia con «${speaker}»: revisa el género y número de la acotación.`;issues.push({kind:'syntax',rule:'parenthetical-agreement',start:word.start,end:word.end,text:word.text,message,replacement:preserveCase(replacement,word.text),key:'syntax:parenthetical-agreement:'+hash(foldName(speaker)+':'+word.word)});},{predicative:true});
  return issues;
 }
 function subjectAt(text,words,index){
  const word=words[index];let feature=pronouns.get(word.word)||nouns[word.word],end=index,named=false;
  if(word.text!==word.word&&nameFeatures.has(foldName(word.text))){feature=nameFeatures.get(foldName(word.text));named=true;while(end+1<words.length&&end-index<5){const next=words[end+1],gap=text.slice(words[end].end,next.start);if(!/^\s+$/.test(gap)||['y','e','o','u','ni','se'].includes(next.word)||copulas.has(next.word)||reflexiveVerbs.has(next.word)||predicativeVerbs.has(next.word)||adjectives.has(next.word)||modifiers.has(next.word))break;const particle=['de','del','la','las','los'].includes(next.word)&&words[end+2]?.text!==words[end+2]?.word;if((next.text!==next.word&&!nouns[next.word])||particle)end++;else break;}}
  if(!feature&&commonRoles.has(word.word.replace(/s$/,''))){const article=words[index-1]?.word;feature=({el:'m',un:'m',la:'f',una:'f',los:'mp',unos:'mp',las:'fp',unas:'fp'})[article];}
  return feature?{feature,end,named}:null;
 }
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
  const subjects=new Map();
  for(let i=0;i<words.length;i++){
   const origin=i,noun=words[i],subject=subjectAt(text,words,i);if(!subject)continue;let feature=subject.feature;
   const prior=words[i-1]?.word,previous=words[i-2]?.word;
   const coordinated=['y','e','o','u','ni'].includes(prior)||['y','e','o','u','ni'].includes(previous)&&isDeterminer(prior);
   i=subject.end;
   if(coordinated){const at=['y','e','o','u','ni'].includes(prior)?origin-2:origin-3,left=subjects.get(at)||(at>=0?subjectAt(text,words,at):null);if(!left)continue;feature=left.feature.startsWith('f')&&feature.startsWith('f')?'fp':'mp';}subjects.set(subject.end,{feature});
   let next=subject.end+1,connectedSubject=connected(subject.end,next)||subject.named&&words[next]&&(/^(?:\s*\(\d{1,3}\)\s*|\s*,\s*)$/.test(text.slice(words[subject.end].end,words[next].start)));if(!connectedSubject){i=subject.end;continue;}
   if(words[next]?.word==='no'&&connected(next,next+1))next++;
   let reflexive=false;if(words[next]?.word==='se'&&connected(next,next+1)){reflexive=true;next++;}
   const verbAt=next,verb=copulas.get(words[next]?.word)||(reflexive?reflexiveVerbs.get(words[next]?.word):null)||predicativeVerbs.get(words[next]?.word),predicative=predicativeVerbs.has(words[next]?.word),embedded=prepositions.has(prior)||isDeterminer(prior)&&prepositions.has(previous);
   // Tras «a María» o «al hombre» el predicativo puede referirse al sujeto, no al objeto.
   if(!verb&&(subject.named&&embedded||['a','al'].includes(prior)||isDeterminer(prior)&&['a','al'].includes(previous)))continue;
   if(verb){
    if(embedded)continue;
    next++;if(!connected(next-1,next))continue;
   }
   if(coordinated&&!verb)continue;
   let adjectiveAt=next;for(let count=0;count<4&&modifiers.has(words[adjectiveAt]?.word)&&connected(adjectiveAt,adjectiveAt+1);count++)adjectiveAt++;
   const entry=adjectives.get(words[adjectiveAt]?.word);
   if(verb&&!collectives.has(noun.word)&&verb.plural!==feature.endsWith('p')&&(verb.single!=='es'||entry))add('subject-verb-agreement',verbAt,verbAt,'Posible falta de concordancia de número entre el sujeto y el verbo.',feature.endsWith('p')?verb.multiple:verb.single);
   const label=text.slice(noun.start,words[subject.end].end);
   adjectiveSequence(text,words,next,feature,(at,replacement,first)=>{if(verb||subject.named||!first)add('noun-adjective-agreement',at,at,`El adjetivo debe concordar con «${label}» en género y número.`,replacement);else add('noun-adjective-agreement',origin,at,'El nombre y su adjetivo no concuerdan en género o número.',text.slice(noun.start,words[at].start)+preserveCase(replacement,words[at].text));},{predicative});
   i=subject.end;
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
   if(word.text!==word.word&&properNames.has(word.word))return false;
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
 const api={tokens,syntax,contextual,characterFeature,punctuation,candidates,spelling,preserveCase,hash,nameWords};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoLanguageReview=api;
})(globalThis);
