/* Solo comprueba la respuesta anónima de la función. No lee proyectos ni sube datos. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={};context.globalThis=context;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cloud-config.js'),'utf8'),context);
const config=context.PlanoCloudConfig;
(async()=>{
 if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(config?.url||''))throw new Error('Falta una URL pública válida de Supabase.');
 const response=await fetch(config.url+'/functions/v1/plano-cloud?action=list',{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json',Origin:'https://rodvelsantiago-777.github.io'},body:'{}',signal:AbortSignal.timeout(20000)});
 const body=await response.json().catch(()=>({}));
 if(response.status!==401||body.code!=='UNAUTHORIZED')throw new Error(response.status===404?'La función plano-cloud todavía no está desplegada.':`Respuesta inesperada (${response.status}). Revisa el despliegue y su autenticación.`);
 console.log('OK: función desplegada; rechaza peticiones sin identidad de Firebase. Falta comprobar el flujo con una cuenta real.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
