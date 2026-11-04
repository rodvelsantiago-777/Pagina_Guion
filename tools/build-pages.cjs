/* Publicación estática y notas del rango Git. Sin claves ni servicios de IA. */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {releases,versionConfig}=require('../patch-notes.js');
const categories=['new','improved','fixed'];
function git(root,args){return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:5*1024*1024,stdio:['ignore','pipe','pipe']}).trim();}
function readEntries(root,ref){
 try{const data=JSON.parse(git(root,['show',`${ref}:release-notes.entries.json`]));return Array.isArray(data.entries)?data.entries:[];}catch{return [];}
}
function readVersioning(root,ref){try{return versionConfig(JSON.parse(git(root,['show',`${ref}:release-notes.config.json`])));}catch{return versionConfig();}}
function presentEntries(records){
 const result=[],groups=new Map();
 for(const entry of records){
  if(typeof entry==='string'||entry&&Array.isArray(entry.details)){result.push(entry);continue;}
  if(!entry||typeof entry.text!=='string')continue;
  if(typeof entry.group==='string'&&typeof entry.detail==='string'){
   let group=groups.get(entry.group);
   if(!group){group={text:entry.text,details:[],order:[]};groups.set(entry.group,group);result.push(group);}
   if(!group.details.includes(entry.detail)){group.details.push(entry.detail);group.order.push(entry.detailOrder||0);}
  }else result.push(entry.text);
 }
 return result.map(item=>item?.order?{text:item.text,details:item.details.map((text,i)=>({text,order:item.order[i]})).sort((a,b)=>a.order-b.order).map(item=>item.text)}:item);
}
function rewordHistory(root,after,history,editorial){
 const current=new Map(editorial.map(item=>[item.id,item])),aliases=new Map();
 let refs=[];try{refs=git(root,['log',after,'--format=%H','--','release-notes.entries.json']).split('\n').slice(0,200);}catch{}
 for(const ref of new Set([after,...history.map(item=>item.commit).filter(Boolean),...refs]))for(const item of readEntries(root,ref)){
  if(typeof item?.text==='string'&&!aliases.has(item.text.trim().slice(0,500)))aliases.set(item.text.trim().slice(0,500),item.id);
 }
 return history.map(item=>({...item,sections:item.sections.map(section=>({...section,items:presentEntries(section.items.map(note=>typeof note==='string'&&current.get(aliases.get(note))||note))}))}));
}
function exists(root,sha){try{return /^[a-f0-9]{40}$/.test(sha)&&Boolean(git(root,['cat-file','-e',`${sha}^{commit}`])==='');}catch{return false;}}
function makeRelease({root,before,after,previous,publishedAt=new Date().toISOString()}){
 if(!exists(root,after))throw new Error('La publicación necesita un commit Git válido.');
 const versioning=readVersioning(root,after),editorial=readEntries(root,after);
 const history=rewordHistory(root,after,releases({...previous,versioning}),editorial),same=history.find(item=>item.commit===after);
 if(same)return {schema:1,versioning,releases:releases({schema:1,versioning,releases:history})};
 let base=exists(root,before)?before:null;
 const last=history[0]?.commit;
 if(exists(root,last)){try{git(root,['merge-base','--is-ancestor',last,after]);base=last;}catch{}}
 const prior=new Map((base?readEntries(root,base):[]).map(item=>[item.id,item]));
 // La redacción es editorial; solo IDs nuevos o una revisión explícita anuncian otra función.
 let entries=editorial.filter(item=>item&&typeof item.id==='string'&&categories.includes(item.category)&&typeof item.text==='string'&&item.text.trim()&&(!prior.has(item.id)||(prior.get(item.id).revision||1)!==(item.revision||1))).slice(0,200);
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
  const fixes=[...new Set(subjects)].filter(text=>/^(fix|corrige|corrección|feat)(\([^)]*\))?:?\s/i.test(text)&&text.length>14).slice(0,3);
  if(fixes.length)entries=fixes.map(text=>({category:/^(fix|corrige|corrección)\b/i.test(text)?'fixed':'new',text:text.replace(/^(feat|fix|chore)(\([^)]*\))?:\s*/,'').slice(0,160)}));
  if(!entries.length)entries=[{category:'improved',text:'Actualización de mantenimiento de la aplicación.'}];
 }
 const current={id:after,commit:after,publishedAt:new Date(publishedAt).toISOString(),sections:categories.map(category=>({category,items:presentEntries(entries.filter(item=>item.category===category))})).filter(section=>section.items.length)};
 const feed={schema:1,versioning,releases:releases({schema:1,versioning,releases:[current,...history]})};
 while(Buffer.byteLength(JSON.stringify(feed),'utf8')>140000&&feed.releases.length>1)feed.releases.pop();
 return feed;
}
function writeSite(root,output,feed,sha){
 if(path.resolve(output)===path.resolve(root))throw new Error('El directorio de salida debe ser independiente.');
 fs.mkdirSync(output,{recursive:true});
 for(const name of fs.readdirSync(root))if(/^[\w.-]+\.(html|css|js)$/.test(name)&&fs.statSync(path.join(root,name)).isFile())fs.copyFileSync(path.join(root,name),path.join(output,name));
 fs.cpSync(path.join(root,'vendor'),path.join(output,'vendor'),{recursive:true});
 for(const name of fs.readdirSync(output).filter(name=>name.endsWith('.html'))){
  const html=path.join(output,name);
  let source=fs.readFileSync(html,'utf8').replace(/\b(src|href)="((?!https?:|data:)[^"#?]+\.(?:css|js))(?:\?[^\"]*)?"/g,(_,attr,url)=>`${attr}="${url}?v=${sha}"`);
  const version=feed.releases?.[0]?.version;
  if(/^\d+\.\d+\.\d+$/.test(version||''))source=source.replace(/(<meta name="plano-version" content=")[^"]*(")/g,(_,start,end)=>start+version+end).replace(/(<[^>]*\bdata-app-version(?:="[^"]*")?[^>]*>)[^<]*/g,(_,start)=>start+'v'+version);
  fs.writeFileSync(html,source);
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
 const feed=makeRelease({root,before:event.before,after,previous});
 writeSite(root,path.join(root,'_site'),feed,after);console.log(`Sitio preparado con ${feed.releases.length} notas de versión. Commit ${after.slice(0,7)}.`);
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={makeRelease,writeSite,presentEntries,rewordHistory};
