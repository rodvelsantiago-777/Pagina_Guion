/* Adaptador de PLANO. LingoTweaker y sus datos conservan sus licencias, en 0.2.8/. */
const base=new URL('./0.2.8/',self.location.href);
const [{default:init,LtEngine}]=await Promise.all([import(new URL('lt_wasm.js',base)),import(new URL('../../language-engine.js'+self.location.search,self.location.href)),import(new URL('../../punctuation-review.js'+self.location.search,self.location.href))]);
await import(new URL('../../language-review.js'+self.location.search,self.location.href));
const adapter=globalThis.PlanoLanguageEngine,review=globalThis.PlanoLanguageReview,queue=[];let engine=null,running=false,current=null;
async function resource(name){
 const response=await fetch(new URL(name,base),{credentials:'omit'});if(!response.ok)throw Error('No se pudo descargar '+name);
 const bytes=new Uint8Array(await response.arrayBuffer());
 // Algunos alojamientos aplican Content-Encoding: gzip y el navegador ya lo abre.
 if(bytes[0]!==0x1f||bytes[1]!==0x8b)return bytes;
 if(typeof DecompressionStream!=='function')throw Error('El navegador no admite la revisión completa.');
 return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}
async function prepare(){
 const [wasm,pack]=await Promise.all([resource('engine.wasm.gz'),resource('es.pack.gz')]);
 await init({module_or_path:wasm});engine=new LtEngine('es',pack,JSON.stringify({today:new Date().toISOString().slice(0,10),picky:false}));
 if(engine.active_rule_count()<1000||JSON.parse(engine.compile_failures_json()).length)throw Error('El motor español no se pudo cargar completamente.');
 postMessage({ready:true,rules:engine.active_rule_count(),version:'0.2.8'});
}
const ready=prepare().catch(error=>{postMessage({fatal:error.message});throw error;});ready.catch(()=>{});
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
function check(text,options){return adapter.matches(text,JSON.parse(engine.check_matches_json(text)).matches,options);}
async function run(){
 if(running)return;running=true;
 try{
  await ready;
  while(queue.length){current=queue.shift();const {id,blocks}=current,results=[];
   try{
    for(const block of blocks){
     if(current.cancelled)break;
     const issues=[];
     for(const segment of adapter.segments(block.text)){if(current.cancelled)break;for(const issue of check(segment.text,{kind:block.kind}))issues.push({...issue,start:issue.start+segment.offset,end:issue.end+segment.offset});await pause();}
     const context=adapter.contextual(block);
     if(context&&!current.cancelled)for(const issue of check(context.text,{kind:'parenthetical',onlyAgreement:true,shift:context.shift,speaker:context.speaker})){
      if(issue.end+context.offset<=context.end)issues.push({...issue,start:issue.start+context.offset,end:issue.end+context.offset});
     }
     const merged=adapter.merge(issues,[...review.syntax(block.text),...review.contextual(block.text,block),...review.punctuation(block.text)]);
     if(!current.cancelled)postMessage({id,index:results.length,issues:merged});results.push(merged);await pause();
    }
    if(!current.cancelled)postMessage({id,results});
   }catch(error){postMessage({id,error:error.message});}finally{current=null;}
  }
 }catch{}finally{running=false;}
}
onmessage=({data})=>{if(data.cancel){const index=queue.findIndex(job=>job.id===data.cancel);if(index>=0)queue.splice(index,1);else if(current?.id===data.cancel)current.cancelled=true;return;}queue.push(data);run();};
