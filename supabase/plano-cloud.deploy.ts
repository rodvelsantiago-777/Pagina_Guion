// Generado por node tools/build-cloud-function.cjs. No contiene secretos.
import * as jose from 'npm:jose@6.1.3';
function firebaseVerifier(jose,projectId,keys){
  const jwks=keys||jose.createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
  return async token=>{
    const {payload}=await jose.jwtVerify(token,jwks,{issuer:`https://securetoken.google.com/${projectId}`,audience:projectId,algorithms:['RS256'],requiredClaims:['exp','iat','auth_time','sub'],clockTolerance:5});
    const now=Math.floor(Date.now()/1000);
    if(payload.email_verified!==true||typeof payload.sub!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(payload.sub)||!Number.isFinite(payload.auth_time)||!Number.isFinite(payload.iat)||payload.auth_time>now+5||payload.iat>now+5)throw new Error('UNAUTHORIZED');
    return payload.sub;
  };
}

const FILE_LIMIT=10485760,PAYLOAD_LIMIT=350000;
const errors={
 UNAUTHORIZED:[401,'Vuelve a iniciar sesión para acceder a tus proyectos.'],NOT_FOUND:[404,'El proyecto no existe o no pertenece a esta cuenta.'],
 CONFLICT:[409,'Hay una versión más reciente. Exporta tus notas antes de recargar el proyecto de la nube.'],NOT_READY:[409,'El proyecto no está listo para esta operación. Actualiza la página y vuelve a abrirlo.'],
 USER_STORAGE_LIMIT:[413,'Has alcanzado los 10 proyectos de esta cuenta. Elimina uno para subir otro.'],GLOBAL_STORAGE_LIMIT:[413,'El espacio gratuito de la página está lleno. No se ha activado ningún plan de pago.'],
 GLOBAL_MONTH_LIMIT:[429,'Se alcanzó el límite mensual gratuito de la página. Tus proyectos se conservan; el acceso se restablecerá el próximo mes.'],
 USER_MONTH_LIMIT:[429,'Se alcanzó el límite mensual de esta cuenta. Tus proyectos se conservan.'],RATE_LIMIT:[429,'Demasiadas operaciones seguidas. Espera un minuto e inténtalo de nuevo.'],
 TOO_LARGE:[413,'El guion editable y sus planos admiten hasta 350 KB por proyecto.'],INVALID_INPUT:[400,'Los datos del proyecto no son válidos.'],
 INVALID_PAYLOAD:[400,'El guion o sus planos no son válidos, no corresponden al proyecto o superan el tamaño permitido.'],
 UPLOAD_FAILED:[503,'No se terminó de subir el PDF. Comprueba la conexión; puedes reintentar desde la biblioteca.'],UNAVAILABLE:[503,'La nube no está disponible. Comprueba la conexión o que el proyecto Supabase esté activo.']
 ,UPGRADE_REQUIRED:[409,'Actualiza la página: los PDF se convierten en guiones editables antes de guardarse.']
};
function fail(code){throw Object.assign(new Error(code),{code});}
async function readLimited(request,limit){
 if(Number(request.headers.get('content-length'))>limit)fail('TOO_LARGE');
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();
 let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();fail('TOO_LARGE');}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
function validPayload(data){
 if(!data||data.version!==1||!Array.isArray(data.annotations)||data.annotations.length>10000||new TextEncoder().encode(JSON.stringify(data)).length>PAYLOAD_LIMIT)fail('TOO_LARGE');
 // El cliente valida además coordenadas, páginas y campos de cada plano al abrir.
 for(const note of data.annotations)if(!note||typeof note.id!=='string'||note.id.length>120||!['line','highlight'].includes(note.type))fail('INVALID_INPUT');
}
function validEditable(data){
 validPayload(data);const s=data.screenplay;
 if(data.documentFormat!==2||!s||s.version!==1||typeof s.id!=='string'||!/^[-\w]{1,80}$/.test(s.id)||!Number.isSafeInteger(s.revision)||s.revision<0||typeof s.title!=='string'||s.title.length>176||!Array.isArray(s.authors)||s.authors.length>8||!Array.isArray(s.characters)||s.characters.length>500||s.doc?.type!=='doc'||!Array.isArray(s.doc.content)||!s.doc.content.length||s.doc.content.length>8000)fail('INVALID_PAYLOAD');
 let length=0;for(const p of s.doc.content){if(p?.type!=='paragraph'||!['scene','action','character','parenthetical','dialogue','transition','insert','section'].includes(p.attrs?.kind)||typeof p.attrs.id!=='string')fail('INVALID_PAYLOAD');for(const text of p.content||[]){if(text.type!=='text'||typeof text.text!=='string')fail('INVALID_PAYLOAD');length+=text.text.length;}}if(length>220000)fail('TOO_LARGE');
}
function createHandler({verify,rpc,preferences,releases,download,remove,origins}){
 return async request=>{
  const origin=request.headers.get('origin')||'',allowed=origins.includes(origin);
  const headers={'Cache-Control':'no-store','Vary':'Origin'};
  if(allowed)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'});
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
  if(origin&&!allowed)return json({code:'FORBIDDEN',message:'Origen no autorizado.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return json({code:'METHOD',message:'Método no permitido.'},405);
  try{
   let owner;try{owner=await verify(request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]||'');}catch{fail('UNAUTHORIZED');}
   const action=new URL(request.url).searchParams.get('action');
   const call=(operation,id=null,data={})=>rpc(owner,operation,id,data);
   if(action==='create')fail('UPGRADE_REQUIRED');
   const bytes=await readLimited(request,PAYLOAD_LIMIT+4096);
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes)||'{}');}catch{fail('INVALID_INPUT');}
   if(action==='create_editable'){
    validEditable(body.payload);if(typeof body.name!=='string'||!body.name.trim()||body.name.length>180)fail('INVALID_INPUT');
    if(body.projectName!==undefined&&(typeof body.projectName!=='string'||!body.projectName.trim()||body.projectName.trim().length>120||/[\u0000-\u001f\u007f]/.test(body.projectName)))fail('INVALID_INPUT');
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('editable:'+body.payload.screenplay.id))),b=>b.toString(16).padStart(2,'0')).join('');
    return json({project:await call('create_doc',null,{fingerprint,name:body.name.trim(),project_name:body.projectName?.trim(),payload:{...body.payload,fingerprint}})});
   }
   if(action==='release_read'||action==='release_seen'){
    if(!body||typeof body!=='object'||Array.isArray(body))fail('INVALID_INPUT');
    if(action==='release_seen'&&(typeof body.releaseId!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(body.releaseId)||typeof body.publishedAt!=='string'||!Number.isFinite(Date.parse(body.publishedAt))||Date.parse(body.publishedAt)<Date.UTC(2020,0,1)||Date.parse(body.publishedAt)>Date.now()+300000))fail('INVALID_INPUT');
    return json({receipt:await releases(owner,action==='release_read'?'read':'seen',body)});
   }
   if(action==='preferences_read'||action==='preferences_save'){
    if(!body||typeof body!=='object'||Array.isArray(body))fail('INVALID_INPUT');
    const patch=body.patch;
    if(action==='preferences_save'&&(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(key=>!['mode','preset'].includes(key))||
      ('mode' in patch&&!['light','dark'].includes(patch.mode))||
      ('preset' in patch&&!['default','red','brown','orange','yellow','green','sky','blue','pink','violet','gray','graphite'].includes(patch.preset))))fail('INVALID_INPUT');
    return json({preferences:await preferences(owner,action==='preferences_read'?'read':'save',patch||{})});
   }
   if(action==='list')return json(await call('list'));
   if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(body.id||''))fail('INVALID_INPUT');
   if(action==='read')return json({project:await call('read',body.id)});
   if(action==='cleanup_pdf'){
    let project=await call('cleanup_read',body.id);
    if(project.pdf_cleanup_pending){try{await remove(owner,body.id);project=await call('cleanup_done',body.id);}catch{/* El texto ya está confirmado; se reintentará al volver a abrir. */}}
    return json({project});
   }
   if(action==='download'){
    const project=await call('download',body.id),file=await download(owner,project.id);
    return new Response(file,{headers:{...headers,'Content-Type':'application/pdf'}});
   }
   if(!Number.isSafeInteger(body.revision)||body.revision<0)fail('INVALID_INPUT');
   if(action==='convert_editable'){
    validEditable(body.payload);let project=await call('convert_doc',body.id,{revision:body.revision,payload:body.payload});
    if(project.pdf_cleanup_pending){try{await remove(owner,body.id);const clean=await call('cleanup_done',body.id);project={...project,...clean};}catch{/* Conserva el documento y la limpieza pendiente de forma durable. */}}
    return json({project});
   }
   if(action==='save'){
    validPayload(body.payload);if(body.payload.documentFormat===2)validEditable(body.payload);return json({project:await call('save',body.id,{revision:body.revision,payload:body.payload})});
   }
   if(action==='rename'){
    if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>180)fail('INVALID_INPUT');
    return json({project:await call('rename',body.id,{revision:body.revision,name:body.name.trim()})});
   }
   if(action==='rename_project'){
    if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>120||/[\u0000-\u001f\u007f]/.test(body.name))fail('INVALID_INPUT');
    return json({project:await call('rename_project',body.id,{revision:body.revision,name:body.name.trim()})});
   }
   if(action==='delete'){
    // No se borra primero la fila: si falla Storage sigue existiendo una entrada recuperable.
    const previous=await call('delete_begin',body.id,{revision:body.revision});
    try{if(previous.storage_kind!=='editable'||previous.pdf_cleanup_pending)await remove(owner,body.id);}catch{
     await call('delete_cancel',body.id,{previous_state:previous.state}).catch(()=>{});fail('UNAVAILABLE');
    }
    return json(await call('delete_finish',body.id));
   }
   fail('INVALID_INPUT');
  }catch(error){
   const code=Object.hasOwn(errors,error.code)?error.code:Object.hasOwn(errors,error.message)?error.message:'UNAVAILABLE';
   const [status,message]=errors[code];return json({code,message},status);
  }
 };
}


const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const projectId=Deno.env.get('FIREBASE_PROJECT_ID')||'planos-15624';
const origins=(Deno.env.get('ALLOWED_ORIGINS')||'https://rodvelsantiago-777.github.io').split(',').map(value=>value.trim()).filter(Boolean);
const headers={apikey:key,Authorization:`Bearer ${key}`};
async function service(path:string,options:RequestInit={}){
 const response=await fetch(url+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(20000)});
 if(!response.ok){
  let body;try{body=await response.json();}catch{}
  throw new Error(body?.message||'UNAVAILABLE');
 }
 return response;
}
const object=(owner:string,id:string)=>`/storage/v1/object/plano-pdfs/${encodeURIComponent(owner)}/${id}.pdf`;
Deno.serve(createHandler({
 verify:firebaseVerifier(jose,projectId),origins,
 releases:async(owner:string,action:string,data:unknown)=>(await service('/rest/v1/rpc/plano_release_receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner:owner,p_action:action,p_data:data})})).json(),
 preferences:async(owner:string,action:string,patch:unknown)=>(await service('/rest/v1/rpc/plano_preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner:owner,p_action:action,p_patch:patch})})).json(),
 rpc:async(owner:string,action:string,id:string|null,data:unknown)=>(await service('/rest/v1/rpc/plano_cloud',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner:owner,p_action:action,p_id:id,p_data:data})})).json(),
 download:async(owner:string,id:string)=>(await service(object(owner,id).replace('/object/','/object/authenticated/'))).blob(),
 remove:async(owner:string,id:string)=>{await service('/storage/v1/object/plano-pdfs',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[`${owner}/${id}.pdf`]})});}
}));
