// Generado por node tools/build-cloud-function.cjs. No contiene secretos.
import * as jose from 'npm:jose@6.1.3';
function firebaseVerifier(jose,projectId,keys,{details=false}={}){
  const jwks=keys||jose.createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
  return async token=>{
    const {payload}=await jose.jwtVerify(token,jwks,{issuer:`https://securetoken.google.com/${projectId}`,audience:projectId,algorithms:['RS256'],requiredClaims:['exp','iat','auth_time','sub'],clockTolerance:5});
    const now=Math.floor(Date.now()/1000);
    if(payload.email_verified!==true||typeof payload.sub!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(payload.sub)||!Number.isFinite(payload.auth_time)||!Number.isFinite(payload.iat)||payload.auth_time>now+5||payload.iat>now+5)throw new Error('UNAUTHORIZED');
    return details?{owner:payload.sub,email:payload.email||'',authTime:payload.auth_time}:payload.sub;
  };
}

/* Validación compartida de fotos. La copia pública se genera con build-cloud-function.cjs. */
(function(root){
 'use strict';
 const limits=Object.freeze({inputBytes:5*1024*1024,pixels:25000000,side:8192,size:128,outputBytes:8192,textBytes:11000});
 const text=(b,a,n)=>String.fromCharCode(...b.subarray(a,a+n));
 function inspect(b){
  if(!(b instanceof Uint8Array)||b.length<30)return null;const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  if(text(b,1,3)==='PNG'&&b[0]===137&&text(b,12,4)==='IHDR')return{type:'image/png',width:v.getUint32(16),height:v.getUint32(20)};
  if(b[0]===255&&b[1]===216){
   let at=2,metadata=false;
   while(at+4<=b.length){if(b[at++]!==255)return null;while(b[at]===255)at++;const marker=b[at++];if(marker===0xda||marker===0xd9)break;if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
    if(at+2>b.length)return null;const length=v.getUint16(at);if(length<2||at+length>b.length)return null;
    if(marker===0xe1||marker===0xed||marker===0xfe)metadata=true;
    if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker)){if(length<8)return null;return{type:'image/jpeg',width:v.getUint16(at+5),height:v.getUint16(at+3),metadata};}at+=length;
   }return null;
  }
  if(text(b,0,4)==='RIFF'&&text(b,8,4)==='WEBP'&&v.getUint32(4,true)+8===b.length){
   let at=12,declared=null,images=[],animated=false,metadata=false;
   while(at+8<=b.length){const kind=text(b,at,4),length=v.getUint32(at+4,true),start=at+8;if(start+length>b.length)return null;
    if(kind==='VP8X'&&length>=10){declared={width:1+b[start+4]+(b[start+5]<<8)+(b[start+6]<<16),height:1+b[start+7]+(b[start+8]<<8)+(b[start+9]<<16)};animated=Boolean(b[start]&2);}
    else if(kind==='VP8 '&&length>=10&&b[start+3]===0x9d&&b[start+4]===1&&b[start+5]===0x2a)images.push({width:v.getUint16(start+6,true)&0x3fff,height:v.getUint16(start+8,true)&0x3fff});
    else if(kind==='VP8L'&&length>=5&&b[start]===0x2f){const bits=v.getUint32(start+1,true);images.push({width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)});}
    else if(['ANIM','ANMF'].includes(kind))animated=true;
    else if(['EXIF','XMP '].includes(kind))metadata=true;
    at=start+length+(length%2);
   }
   const size=declared||images[0];return size?{type:'image/webp',...size,images,animated,metadata}:null;
  }return null;
 }
 function valid(value){
  if(value==='')return true;if(typeof value!=='string'||value.length>limits.textBytes)return false;
  const match=/^data:(image\/(?:jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match||match[2].length%4)return false;
  try{const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>limits.outputBytes)return false;const meta=inspect(bytes);if(!meta||meta.type!==match[1]||meta.width!==limits.size||meta.height!==limits.size||meta.metadata)return false;
   if(meta.type==='image/jpeg')return bytes.at(-2)===255&&bytes.at(-1)===217;
   return !meta.animated&&meta.images.length===1&&meta.images.every(size=>size.width===limits.size&&size.height===limits.size);
  }catch{return false;}
 }
 function paint(element,value,initials=''){
  if(!element)return;element.replaceChildren();const photo=Boolean(value&&valid(value));element.classList.toggle('has-photo',photo);
  if(photo){const img=document.createElement('img');img.src=value;img.alt='';img.width=limits.size;img.height=limits.size;element.append(img);}else element.textContent=initials;
 }
 const api={limits,inspect,valid,paint};root.PlanoAvatarImage=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);

/* Gestión de cuenta. La identidad y auth_time proceden del JWT verificado, nunca del cuerpo. */
const reject=code=>{throw Object.assign(new Error(code),{code});};
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
function deviceName(request){
 const ua=(request.headers.get('user-agent')||'').slice(0,1000),browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome / Brave':/Safari\//.test(ua)?'Safari':'Navegador';
 const os=/Windows/.test(ua)?'Windows':/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'';
 return browser+(os?' · '+os:'');
}
function createAccountService({db,lookup,revokeTokens,deleteUser,removeFile,capabilities,credentialState,check}){
 async function dataFor(identity,request){
  if(!identity||typeof identity!=='object'||typeof identity.owner!=='string'||!Number.isSafeInteger(identity.authTime))reject('UNAUTHORIZED');
  const secret=request.headers.get('x-plano-session')||'';
  if(secret&&!/^[a-f0-9]{64}$/.test(secret))reject('SESSION_REVOKED');
  return{ownerHash:await digest(identity.owner),authTime:identity.authTime,secretHash:secret?await digest(secret):''};
 }
 async function observeCredentials(identity,data){
  if(!credentialState)return;
  const state=await credentialState(identity.owner);if(!state)return;
  if(!state.exists||state.disabled)reject('SESSION_REVOKED');
  if(!Number.isSafeInteger(state.validSince)||state.validSince<0)reject('UNAVAILABLE');
  if(state.validSince>0)await db(identity.owner,'credential_epoch',{...data,validSince:state.validSince});
  if(identity.authTime<state.validSince)reject('SESSION_REVOKED');return state;
 }
 async function guard(identity,request){const data=await dataFor(identity,request);await observeCredentials(identity,data);return db(identity.owner,'guard',data);}
 async function action(name,identity,request,body,token){
  const data=await dataFor(identity,request),owner=identity.owner,credentials=await observeCredentials(identity,data);
  if(!body||typeof body!=='object'||Array.isArray(body))reject('INVALID_INPUT');
  if(name==='account_session_open'){
   if(!data.secretHash)reject('SESSION_REVOKED');
   const user=credentials?.user||await lookup(token);if(user.localId!==owner||user.emailVerified!==true)reject('UNAUTHORIZED');
   const opened=await db(owner,'open',{...data,name:user.displayName||'',device:deviceName(request)});if(body.workspace===true)opened.account={...await db(owner,'read',data),email:identity.email,capabilities:capabilities()};return opened;
  }
  await db(owner,'guard',data);
  if(name==='account_ping')return{};
  if(name==='account_read')return{...await db(owner,'read',data),email:identity.email,capabilities:capabilities()};
  if(name==='account_avatar'){if(!globalThis.PlanoAvatarImage.valid(body.avatar))reject('INVALID_INPUT');await db(owner,'avatar',{...data,avatar:body.avatar});return db(owner,'read',data);}
  if(name==='account_profile'){
   if(typeof body.name!=='string'||body.name.trim().length<2||body.name.length>120||typeof body.company!=='string'||body.company.length>120||typeof body.birthDate!=='string'||body.birthDate&&!/^\d{4}-\d{2}-\d{2}$/.test(body.birthDate))reject('INVALID_INPUT');
   if(body.birthDate&&(!Number.isFinite(Date.parse(body.birthDate+'T00:00:00Z'))||new Date(body.birthDate+'T00:00:00Z').toISOString().slice(0,10)!==body.birthDate))reject('INVALID_INPUT');
   await db(owner,'profile',{...data,name:body.name,company:body.company,birthDate:body.birthDate});return db(owner,'read',data);
  }
  if(name==='account_session_close'){
   if(typeof body.sessionId!=='string'||!/^[-a-f0-9]{36}$/.test(body.sessionId))reject('INVALID_INPUT');
   return db(owner,'revoke',{...data,sessionId:body.sessionId});
  }
  if(!['account_suspend','account_sessions_close'].includes(name))reject('INVALID_INPUT');
  if(identity.authTime<Math.floor(Date.now()/1000)-300)reject('RECENT_LOGIN');
  if(name==='account_sessions_close'){
   await db(owner,'revoke_all',data);if(capabilities().admin)await revokeTokens(owner).catch(()=>{});return{};
  }
  if(name==='account_suspend'){
   if(!capabilities().deletion)reject('ACCOUNT_SETUP');
   const result=await db(owner,'suspend',data);await revokeTokens(owner).catch(()=>{});return result;
  }
  reject('INVALID_INPUT');
 }
 async function maintain(){
  let deleted=0,failed=0;
  if(capabilities().deletion)for(const owner of await db('system','due',{})){
   try{
    const claim=await db(owner,'purge_claim',{});if(!claim)continue;
    for(const id of claim.files)await removeFile(owner,id);
    await deleteUser(owner);
    await db(owner,'purge_finish',{ownerHash:await digest(owner)});deleted++;
   }catch{failed++;}
  }
  await db('system','prune',{});return{deleted,failed};
 }
 return{guard,action,maintain,check:check||capabilities};
}

function accountRuntime({jose,service,projectId,removeFile}){
 const parse=name=>{try{return JSON.parse(Deno.env.get(name)||'null');}catch{return null;}};
 const admin=parse('FIREBASE_ADMIN_JSON');
 const adminReady=Boolean(admin?.project_id===projectId&&admin?.client_email&&admin?.private_key);
 const apiKey=Deno.env.get('FIREBASE_WEB_API_KEY')||'AIzaSyAwMI_4xgUiXxS3y-LRr_CWDsRknNDZkRM';
 let oauth=null,maintenanceToken='',prepared=null;
 const db=async(owner,action,data)=>(await service('/rest/v1/rpc/plano_account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner:owner,p_action:action,p_data:data})})).json();
 async function prepare(){
  if(!prepared)prepared=(async()=>{try{maintenanceToken=await(await service('/rest/v1/rpc/plano_maintenance_token',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();}catch{maintenanceToken='';}})();
  await prepared;
 }
 async function googleToken(){
  if(!adminReady)throw Error('ACCOUNT_SETUP');if(oauth&&oauth.expires>Date.now()+60000)return oauth.token;
  const key=await jose.importPKCS8(admin.private_key,'RS256');
  const assertion=await new jose.SignJWT({scope:'https://www.googleapis.com/auth/identitytoolkit'}).setProtectedHeader({alg:'RS256'}).setIssuer(admin.client_email).setSubject(admin.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('50m').sign(key);
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(15000)}),value=await response.json();
  if(!response.ok||!value.access_token)throw Error('ACCOUNT_SETUP');oauth={token:value.access_token,expires:Date.now()+value.expires_in*1000};return oauth.token;
 }
 async function firebase(operation,body,administrative=false){
  const url=administrative?`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:${operation}`:`https://identitytoolkit.googleapis.com/v1/accounts:${operation}?key=${apiKey}`;
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(administrative?{Authorization:'Bearer '+await googleToken()}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)}),result=await response.json();
  if(!response.ok){if(operation==='delete'&&result.error?.message==='USER_NOT_FOUND')return{};
   throw Error(result.error?.message?.startsWith('CREDENTIAL_TOO_OLD')?'RECENT_LOGIN':'UNAVAILABLE');}
  return result;
 }
 const lookups=new Map();
 async function credentialState(owner){
  if(!adminReady)return null;
  if(lookups.has(owner))return lookups.get(owner);
  const work=(async()=>{const result=await firebase('lookup',{localId:[owner]},true),user=result.users?.[0];return{exists:Boolean(user),disabled:Boolean(user?.disabled),validSince:Number(user?.validSince||0),user};})();lookups.set(owner,work);
  try{return await work;}finally{if(lookups.get(owner)===work)lookups.delete(owner);}
 }
 const account=createAccountService({db,credentialState,
  check:async()=>{let firebaseReady=false;try{if(adminReady){await firebase('lookup',{localId:['plano-nonexistent-permission-probe']},true);firebaseReady=true;}}catch{}return{firebase:firebaseReady,scheduler:Boolean(maintenanceToken)};},
  lookup:async token=>(await firebase('lookup',{idToken:token})).users?.[0]||{},
  revokeTokens:owner=>firebase('update',{localId:owner,validSince:String(Math.floor(Date.now()/1000))},true),
  deleteUser:owner=>firebase('delete',{localId:owner},true),removeFile,
  capabilities:()=>({admin:adminReady,password:adminReady,deletion:adminReady&&Boolean(maintenanceToken)})
 });
 return{account,prepare,maintenance:async request=>{await prepare();const supplied=request.headers.get('x-plano-maintenance')||'';if(!maintenanceToken||supplied.length!==maintenanceToken.length)return false;let diff=0;for(let i=0;i<supplied.length;i++)diff|=supplied.charCodeAt(i)^maintenanceToken.charCodeAt(i);return diff===0;}};
}

const FILE_LIMIT=10485760,PAYLOAD_LIMIT=350000;
const errors={
 SESSION_REVOKED:[401,'Esta sesión se ha cerrado. Inicia sesión de nuevo.'],ACCOUNT_DELETED:[401,'Esta cuenta ya ha completado su periodo de eliminación.'],
 RECENT_LOGIN:[401,'Confirma tu contraseña para continuar.'],SESSION_LIMIT:[429,'Hay demasiadas sesiones abiertas. Cierra alguna para continuar.'],
 ACCOUNT_SETUP:[503,'Esta operación no está disponible temporalmente.'],
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
function createHandler({verify,rpc,preferences,releases,download,remove,origins,account,maintenance}){
 return async request=>{
  const origin=request.headers.get('origin')||'',allowed=origins.includes(origin);
  const headers={'Cache-Control':'no-store','Vary':'Origin'};
  if(allowed)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-plano-session','Access-Control-Allow-Methods':'POST, OPTIONS'});
  const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
  if(origin&&!allowed)return json({code:'FORBIDDEN',message:'Origen no autorizado.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return json({code:'METHOD',message:'Método no permitido.'},405);
  try{
   const action=new URL(request.url).searchParams.get('action');
   if(action==='account_maintenance'||action==='account_config_status'){
    if(!maintenance||!await maintenance(request))fail('UNAUTHORIZED');return json(action==='account_maintenance'?await account.maintain():await account.check());
   }
   const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]||'';
   let identity;try{identity=await verify(token);}catch{fail('UNAUTHORIZED');}
   const owner=typeof identity==='string'?identity:identity.owner;
   const call=(operation,id=null,data={})=>rpc(owner,operation,id,data);
   if(action==='create')fail('UPGRADE_REQUIRED');
   const bytes=await readLimited(request,PAYLOAD_LIMIT+4096);
   let body;try{body=JSON.parse(new TextDecoder().decode(bytes)||'{}');}catch{fail('INVALID_INPUT');}
   if(action==='workspace_open'){
    if(!body||typeof body!=='object'||Array.isArray(body))fail('INVALID_INPUT');
    if(!account||!preferences||!releases)fail('ACCOUNT_SETUP');
    const session=await account.action('account_session_open',identity,request,{workspace:true},token);
    const [library,settings,seen]=await Promise.all([call('list'),preferences(owner,'read'),releases(owner,'read',{})]);
    const {account:profile,...opened}=session;return json({...opened,workspace:{list:library,preferences_read:{preferences:settings},release_read:{receipt:seen},account_read:profile}});
   }
   if(action?.startsWith('account_')){if(!account)fail('ACCOUNT_SETUP');return json(await account.action(action,identity,request,body,token));}
   if(account)await account.guard(identity,request);
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
const removeFile=async(owner:string,id:string)=>{await service('/storage/v1/object/plano-pdfs',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[`${owner}/${id}.pdf`]})});};
const runtime=accountRuntime({jose,service,projectId,removeFile});
const handler=createHandler({
 verify:firebaseVerifier(jose,projectId,undefined,{details:true}),origins,account:runtime.account,maintenance:runtime.maintenance,
 releases:async(owner:string,action:string,data:unknown)=>(await service('/rest/v1/rpc/plano_release_receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner:owner,p_action:action,p_data:data})})).json(),
 preferences:async(owner:string,action:string,patch:unknown)=>(await service('/rest/v1/rpc/plano_preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner:owner,p_action:action,p_patch:patch})})).json(),
 rpc:async(owner:string,action:string,id:string|null,data:unknown)=>(await service('/rest/v1/rpc/plano_cloud',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner:owner,p_action:action,p_id:id,p_data:data})})).json(),
 download:async(owner:string,id:string)=>(await service(object(owner,id).replace('/object/','/object/authenticated/'))).blob(),
 remove:removeFile
});
Deno.serve(async request=>{const action=new URL(request.url).searchParams.get('action');if(['workspace_open','account_read','account_suspend'].includes(action||''))await runtime.prepare();return handler(request);});
