/* Comprueba la configuración pública sin crear usuarios ni enviar correos. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sandbox={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../auth-config.js'),'utf8'),sandbox);
const config=sandbox.PlanoAuthConfig;
(async()=>{
 if(!config?.apiKey){console.log('Falta la configuración pública de Firebase.');process.exitCode=2;return;}
 const suffix='?key='+encodeURIComponent(config.apiKey);
 const project=await fetch('https://identitytoolkit.googleapis.com/v1/projects'+suffix).then(response=>response.json());
 if(project.error){console.log('Firebase:',project.error.message);process.exitCode=2;return;}
 const domains=project.authorizedDomains||[];console.log('Proyecto:',config.projectId);console.log('GitHub Pages autorizado:',domains.includes('rodvelsantiago-777.github.io')?'sí':'no');
 const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword'+suffix,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'plano-provider-check@example.invalid',password:'Invalid-for-provider-check',returnSecureToken:true})});
 const body=await response.json(),enabled=['INVALID_LOGIN_CREDENTIALS','EMAIL_NOT_FOUND','INVALID_PASSWORD'].includes(body.error?.message);
 console.log('Acceso por correo:',enabled?'habilitado':body.error?.message||'respuesta inesperada');
 process.exitCode=enabled&&domains.includes('rodvelsantiago-777.github.io')?0:2;
})().catch(()=>{console.error('No se pudo comprobar la conexión con Firebase.');process.exitCode=1;});
