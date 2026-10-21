export const FILE_LIMIT=10485760,PAYLOAD_LIMIT=350000;
const errors={
 UNAUTHORIZED:[401,'Vuelve a iniciar sesión para acceder a tus proyectos.'],NOT_FOUND:[404,'El proyecto no existe o no pertenece a esta cuenta.'],
 CONFLICT:[409,'Hay una versión más reciente. Exporta tus notas antes de recargar el proyecto de la nube.'],NOT_READY:[409,'El PDF no terminó de subirse. Puedes eliminar esta subida e intentarlo de nuevo.'],
 USER_STORAGE_LIMIT:[413,'Has alcanzado los 10 proyectos de esta cuenta. Elimina uno para subir otro.'],GLOBAL_STORAGE_LIMIT:[413,'El espacio gratuito de la página está lleno. No se ha activado ningún plan de pago.'],
 GLOBAL_MONTH_LIMIT:[429,'Se alcanzó el límite mensual gratuito de la página. Tus proyectos se conservan; el acceso se restablecerá el próximo mes.'],
 USER_MONTH_LIMIT:[429,'Se alcanzó el límite mensual de esta cuenta. Tus proyectos se conservan.'],RATE_LIMIT:[429,'Demasiadas operaciones seguidas. Espera un minuto e inténtalo de nuevo.'],
 TOO_LARGE:[413,'El límite gratuito es de 10 MB por PDF y 350 KB de anotaciones por proyecto.'],INVALID_INPUT:[400,'Los datos del proyecto no son válidos.'],
 INVALID_PAYLOAD:[400,'Las anotaciones no corresponden a este proyecto o superan el tamaño permitido.'],
 UPLOAD_FAILED:[503,'No se terminó de subir el PDF. Comprueba la conexión; puedes reintentar desde la biblioteca.'],UNAVAILABLE:[503,'La nube no está disponible. Comprueba la conexión o que el proyecto Supabase esté activo.']
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
export function createHandler({verify,rpc,preferences,upload,download,remove,origins}){
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
   if(action==='create'){
    const raw=await readLimited(request,FILE_LIMIT+4096);
    const form=await new Response(raw,{headers:{'content-type':request.headers.get('content-type')||''}}).formData().catch(()=>fail('INVALID_INPUT'));
    const file=form.get('file');if(!(file instanceof Blob)||file.size<1||file.size>FILE_LIMIT)fail('TOO_LARGE');
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-'))fail('INVALID_INPUT');
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const name=String(form.get('name')||'Guion.pdf').trim().slice(0,180)||'Guion.pdf';
    let project=await call('reserve',null,{fingerprint,name,size_bytes:bytes.length});
    if(!project.created){if(project.state!=='ready')fail('NOT_READY');return json({project});}
    try{await upload(owner,project.id,bytes);project=await call('ready',project.id);}
    catch{ // Se conserva la reserva: nunca liberar espacio sin comprobar que no queda un objeto.
     fail('UPLOAD_FAILED');
    }
    return json({project:{...project,created:true}});
   }
   const bytes=await readLimited(request,PAYLOAD_LIMIT+4096);
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes)||'{}');}catch{fail('INVALID_INPUT');}
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
   if(action==='download'){
    const project=await call('download',body.id),file=await download(owner,project.id);
    return new Response(file,{headers:{...headers,'Content-Type':'application/pdf'}});
   }
   if(!Number.isSafeInteger(body.revision)||body.revision<0)fail('INVALID_INPUT');
   if(action==='save'){
    validPayload(body.payload);return json({project:await call('save',body.id,{revision:body.revision,payload:body.payload})});
   }
   if(action==='rename'){
    if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>180)fail('INVALID_INPUT');
    return json({project:await call('rename',body.id,{revision:body.revision,name:body.name.trim()})});
   }
   if(action==='delete'){
    // No se borra primero la fila: si falla Storage sigue existiendo una entrada recuperable.
    const previous=await call('delete_begin',body.id,{revision:body.revision});
    try{await remove(owner,body.id);}catch{
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
