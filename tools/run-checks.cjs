/* Suite funcional sin cuentas reales ni correos; limita a dos navegadores simultáneos. */
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tests/.output');fs.mkdirSync(out,{recursive:true});
const names=['run','shot-values','compact-scenes','scenes-view','presentation','refinements','title-safety','title-scroll','title-weight','script-corrections','workspace-interactions','stages-and-colors','line-editing','multipage-lines','line-continuation','shot-copy','batch-colors','shot-tools','pdf-export','all-export','excel-export','appearance','accounts','accounts-input','cloud','patch-notes'];
const results=[];let next=0;
function run(name){return new Promise(resolve=>{
 const start=Date.now(),child=spawn(process.execPath,[path.join(root,'tests',name+'.cjs')],{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk;});
 child.on('error',error=>{output+=error.message;});
 child.on('close',code=>{const result={name,passed:code===0,seconds:Math.round((Date.now()-start)/100)/10};results.push(result);fs.writeFileSync(path.join(out,'audit-'+name+'.log'),output);console.log(`${result.passed?'OK':'FAIL'} ${name} (${result.seconds}s)`);if(!result.passed)console.log(output.slice(-2800));resolve();});
});}
async function worker(){while(next<names.length)await run(names[next++]);}
(async()=>{
 await Promise.all([worker(),worker()]);
 // Medir el rendimiento sin competir con otra prueba de navegador.
 await run('performance');
 fs.writeFileSync(path.join(out,'audit-suite.json'),JSON.stringify(results,null,2));
 const failed=results.filter(result=>!result.passed);console.log(`${results.length-failed.length}/${results.length} pruebas correctas.`);if(failed.length)process.exitCode=1;
})();
