import {createAccountService} from './account.mjs';
export function accountRuntime({jose,service,projectId,removeFile}){
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
  const work=(async()=>{const result=await firebase('lookup',{localId:[owner]},true),user=result.users?.[0];return{exists:Boolean(user),disabled:Boolean(user?.disabled),validSince:Number(user?.validSince||0)};})();lookups.set(owner,work);
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
