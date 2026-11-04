/* Gestión de cuenta. La identidad y auth_time proceden del JWT verificado, nunca del cuerpo. */
const reject=code=>{throw Object.assign(new Error(code),{code});};
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
function deviceName(request){
 const ua=(request.headers.get('user-agent')||'').slice(0,1000),browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome / Brave':/Safari\//.test(ua)?'Safari':'Navegador';
 const os=/Windows/.test(ua)?'Windows':/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Macintosh/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'';
 return browser+(os?' · '+os:'');
}
export function createAccountService({db,lookup,revokeTokens,deleteUser,removeFile,capabilities,credentialState,check}){
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
  if(identity.authTime<state.validSince)reject('SESSION_REVOKED');
 }
 async function guard(identity,request){const data=await dataFor(identity,request);await observeCredentials(identity,data);return db(identity.owner,'guard',data);}
 async function action(name,identity,request,body,token){
  const data=await dataFor(identity,request),owner=identity.owner;await observeCredentials(identity,data);
  if(!body||typeof body!=='object'||Array.isArray(body))reject('INVALID_INPUT');
  if(name==='account_session_open'){
   if(!data.secretHash)reject('SESSION_REVOKED');
   const user=await lookup(token);if(user.localId!==owner||user.emailVerified!==true)reject('UNAUTHORIZED');
   return db(owner,'open',{...data,name:user.displayName||'',device:deviceName(request)});
  }
  await db(owner,'guard',data);
  if(name==='account_ping')return{};
  if(name==='account_read')return{...await db(owner,'read',data),email:identity.email,capabilities:capabilities()};
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
