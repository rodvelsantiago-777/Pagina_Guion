/* Construye un worker sin dependencias de red. Recibe las carpetas de los paquetes npm. */
const fs=require('node:fs'),path=require('node:path');
const source=path.resolve(process.argv[2]||'tests/.output/spell-source'),destination=path.resolve(__dirname,'../vendor');
const versions={nspell:'2.1.5','dictionary-es':'4.0.0','is-buffer':'2.0.5'};
for(const [name,version]of Object.entries(versions))if(JSON.parse(fs.readFileSync(path.join(source,name,'package.json'),'utf8')).version!==version)throw Error('Versión incorrecta de '+name);
const modules={},seen=new Map();
function bundle(file){
 file=path.resolve(file);if(seen.has(file))return seen.get(file);
 const id=seen.size;seen.set(file,id);
 const code=fs.readFileSync(file,'utf8').replace(/require\(['"]([^'"]+)['"]\)/g,(_,name)=>{
  const target=name==='is-buffer'?path.join(source,'is-buffer/index.js'):path.resolve(path.dirname(file),name);
  return 'require('+bundle(target)+')';
 });modules[id]=`function(module,exports,require){\n${code}\n}`;return id;
}
const entry=bundle(path.join(source,'nspell/lib/index.js'));
const aff=fs.readFileSync(path.join(source,'dictionary-es/index.aff'),'utf8'),dic=fs.readFileSync(path.join(source,'dictionary-es/index.dic'),'utf8');
const worker=`'use strict';const modules={${Object.entries(modules).map(([id,code])=>id+':'+code).join(',')}},cache={};function require(id){if(!cache[id]){const module={exports:{}};cache[id]=module;modules[id](module,module.exports,require);}return cache[id].exports;}const checker=require(${entry})({aff:${JSON.stringify(aff)},dic:${JSON.stringify(dic)}});onmessage=async event=>{try{const words=event.data.words,wrong=[];let known=0;for(let i=0;i<words.length;i++){if(checker.correct(words[i]))known++;else wrong.push(words[i]);if(i%200===199)await new Promise(resolve=>setTimeout(resolve,0));}postMessage({wrong,known,total:words.length});}catch(error){postMessage({error:error.message});}};`;
fs.writeFileSync(path.join(destination,'spanish-spelling.js'),'/* nspell 2.1.5 (MIT), dictionary-es 4.0.0 (MPL-1.1), is-buffer 2.0.5 (MIT). Licencias y fuentes en vendor/. */\nglobalThis.PlanoSpanishWorkerSource='+JSON.stringify(worker)+';\n');
for(const [name,file]of [['nspell','license'],['dictionary-es','license'],['is-buffer','LICENSE']])fs.copyFileSync(path.join(source,name,file),path.join(destination,'LICENSE-'+name+'.txt'));
for(const extension of ['aff','dic'])fs.copyFileSync(path.join(source,'dictionary-es/index.'+extension),path.join(destination,'spanish-source.'+extension));
console.log('Diccionario y worker locales: '+Buffer.byteLength(worker)+' bytes.');
