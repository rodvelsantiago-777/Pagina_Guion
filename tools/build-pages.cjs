/* Publicación estática y notas del rango Git. Sin claves ni servicios de IA. */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {releases,releaseDay}=require('../patch-notes.js');
const categories=['new','improved','fixed'];
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:5*1024*1024,stdio:['ignore','pipe','pipe']}).trim();}
function readEntries(root,ref){
 try{const data=JSON.parse(git(root,['show',`${ref}:release-notes.entries.json`]));return Array.isArray(data.entries)?data.entries:[];}catch{return [];}
}
function exists(root,sha){try{return /^[a-f0-9]{40}$/.test(sha)&&Boolean(git(root,['cat-file','-e',`${sha}^{commit}`])==='');}catch{return false;}}
function makeRelease({root,before,after,previous,publishedAt=new Date().toISOString(),runNumber=1}){
 if(!exists(root,after))throw new Error('La publicación necesita un commit Git válido.');
 const history=releases(previous),same=history.find(item=>item.commit===after);
 if(same)return {schema:1,releases:history};
 let base=exists(root,before)?before:null;
 const last=history[0]?.commit;
 if(exists(root,last)){try{git(root,['merge-base','--is-ancestor',last,after]);base=last;}catch{}}
 const prior=new Map((base?readEntries(root,base):[]).map(item=>[item.id,item.text]));
 let entries=readEntries(root,after).filter(item=>item&&typeof item.id==='string'&&categories.includes(item.category)&&typeof item.text==='string'&&item.text.trim()&&prior.get(item.id)!==item.text).map(item=>({category:item.category,text:item.text.slice(0,500)})).slice(0,40);
 if(!entries.length){
  const args=base?['diff','--name-only',base,after,'--']:['show','--format=','--name-only',after,'--'];
  const files=git(root,args).split('\n'),groups=[
   [/^(cloud-library|library|script-preview)\./,'Actualización de la biblioteca de guiones.'],
   [/^(app|coverage-lines|document-labels|label-layout|shot-)\b/,'Actualización de las herramientas de cobertura y anotaciones.'],
   [/^(technical-script|excel-export)\./,'Actualización del guion técnico y sus herramientas.'],
   [/^(appearance|styles|editor)\./,'Actualización del diseño y los controles del estudio.'],
   [/^(accounts|cloud|supabase\/)/,'Actualización de cuentas y guardado en la nube.'],
   [/^(patch-notes|release-notes|\.github\/)/,'Actualización de las notas de versión y la publicación.']
  ];
  entries=groups.filter(([pattern])=>files.some(file=>pattern.test(file))).map(([,text])=>({category:'improved',text}));
  const subjects=git(root,['log','--reverse','--format=%s',...(base?[`${base}..${after}`]:['-1',after])]).split('\n');
  for(const text of [...new Set(subjects)].filter(text=>text.length>14&&!/^Merge\b/.test(text)).slice(0,12))entries.push({category:/^(fix|corrige|corrección)\b/i.test(text)?'fixed':'improved',text:text.replace(/^(feat|fix|chore)(\([^)]*\))?:\s*/,'').slice(0,250)});
  if(!entries.length)entries=[{category:'improved',text:'Actualización de mantenimiento de la aplicación.'}];
 }
 const current={id:after,commit:after,publishedAt:new Date(publishedAt).toISOString(),version:releaseDay(publishedAt).replaceAll('-','.'),sections:categories.map(category=>({category,items:entries.filter(item=>item.category===category).map(item=>item.text)})).filter(section=>section.items.length)};
 const feed={schema:1,releases:releases({schema:1,releases:[current,...history]})};
 while(JSON.stringify(feed).length>140000&&feed.releases.length>1)feed.releases.pop();
 return feed;
}
function writeSite(root,output,feed,sha){
 if(path.resolve(output)===path.resolve(root))throw new Error('El directorio de salida debe ser independiente.');
 fs.mkdirSync(output,{recursive:true});
 for(const name of fs.readdirSync(root))if(/^[\w.-]+\.(html|css|js)$/.test(name)&&fs.statSync(path.join(root,name)).isFile())fs.copyFileSync(path.join(root,name),path.join(output,name));
 fs.cpSync(path.join(root,'vendor'),path.join(output,'vendor'),{recursive:true});
 for(const name of fs.readdirSync(output).filter(name=>name.endsWith('.html'))){
  const html=path.join(output,name);
  fs.writeFileSync(html,fs.readFileSync(html,'utf8').replace(/\b(src|href)="((?!https?:|data:)[^"#?]+\.(?:css|js))(?:\?[^\"]*)?"/g,(_,attr,url)=>`${attr}="${url}?v=${sha}"`));
 }
 fs.writeFileSync(path.join(output,'release-notes.json'),JSON.stringify(feed));fs.writeFileSync(path.join(output,'.nojekyll'),'');
}
async function main(){
 const root=path.resolve(__dirname,'..'),after=process.env.GITHUB_SHA||git(root,['rev-parse','HEAD']);
 let event={};if(process.env.GITHUB_EVENT_PATH)event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 let previous={schema:1,releases:[]};
 if(process.env.PAGES_URL){
  try{
   const url=new URL('release-notes.json',process.env.PAGES_URL.replace(/\/?$/,'/'));if(url.protocol!=='https:')throw new Error('Se requiere HTTPS');
   const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(8000)});
   if(response.ok&&Number(response.headers.get('content-length'))<=150000){const text=await response.text();if(text.length<=150000)previous=JSON.parse(text);}
  }catch{console.warn('No se encontró un historial anterior; se publicará la nota actual.');}
 }
 const feed=makeRelease({root,before:event.before,after,previous,runNumber:process.env.GITHUB_RUN_NUMBER||1});
 writeSite(root,path.join(root,'_site'),feed,after);console.log(`Sitio preparado con ${feed.releases.length} notas de versión. Commit ${after.slice(0,7)}.`);
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={makeRelease,writeSite};
