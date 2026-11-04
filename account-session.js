/* Prueba de dispositivo ligada al UID Firebase; nunca contiene perfil, guiones ni contraseñas. */
(function(root){
 'use strict';let active=null,pending=null,lastProbe=0,previous='',workspace=null;
 const enabled=()=>Boolean(root.PlanoCloud?.configured&&root.PlanoAccounts?.manage),key=uid=>'plano-device-session-v1:'+uid;
 const failure=(code,message)=>Object.assign(new Error(message),{code});
 function stored(uid){try{const value=localStorage.getItem(key(uid));if(/^[a-f0-9]{64}$/.test(value||''))return value;}catch{}const value=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');try{localStorage.setItem(key(uid),value);}catch{}return value;}
 function forget(uid=previous){workspace=null;active=null;pending=null;try{if(uid)localStorage.removeItem(key(uid));}catch{}}
 async function raw(action,data,token,secret){
  const expectedUid=root.PlanoAccounts.getUser()?.id;
  const config=root.PlanoCloudConfig,endpoint=config.url.replace(/\/$/,'')+'/functions/v1/plano-cloud';
  const response=await fetch(endpoint+'?action='+action,{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json','x-plano-session':secret},body:JSON.stringify(data),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(['account_suspend','account_sessions_close'].includes(action)?45000:25000)});
  let body;try{body=await response.json();}catch{throw failure('NETWORK','No se pudo conectar con la cuenta.');}
  if(root.PlanoAccounts.getUser()?.id!==expectedUid)throw failure('CANCELLED','La cuenta ha cambiado.');
  if(!response.ok){const error=failure(body.code||'NETWORK',body.message||'No se pudo completar la operación.');if(['SESSION_REVOKED','ACCOUNT_DELETED'].includes(error.code)||action==='account_session_open'&&error.code==='RECENT_LOGIN')document.dispatchEvent(new CustomEvent('plano-session-revoked',{detail:error.message}));throw error;}return body;
 }
 async function ensure(token){
  if(!enabled())return null;const uid=root.PlanoAccounts.getUser()?.id;if(!uid)throw failure('SESSION','Inicia sesión para continuar.');
  const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))),authTime=payload.auth_time; // Solo caché; el servidor verifica el JWT.
  if(active?.uid===uid&&active.authTime===authTime)return active;
  if(pending){await pending;if(active?.uid===uid&&active.authTime===authTime)return active;}
  const secret=active?.uid===uid?active.secret:stored(uid);
  const work=(async()=>{let result;try{result=await raw('workspace_open',{},token,secret);}catch(error){if(!['INVALID_INPUT','ACCOUNT_SETUP'].includes(error.code))throw error;result=await raw('account_session_open',{},token,secret);}if(root.PlanoAccounts.getUser()?.id!==uid)throw failure('SESSION','La cuenta ha cambiado.');active={uid,authTime,secret,id:result.sessionId};workspace=result.workspace?{uid,at:Date.now(),data:result.workspace}:null;if(typeof result.name==='string')root.PlanoAccounts.setProfileName(result.name);root.PlanoAccounts.setProfilePhoto(result.avatar||'');previous=uid;if(result.restored)document.dispatchEvent(new CustomEvent('plano-account-restored'));return active;})();pending=work;
  try{return await work;}finally{if(pending===work)pending=null;}
 }
 function take(action){if(!workspace||workspace.uid!==root.PlanoAccounts.getUser()?.id||Date.now()-workspace.at>30000||!Object.hasOwn(workspace.data,action))return null;const result=workspace.data[action];delete workspace.data[action];return result;}
 async function request(action,data={}){const token=await root.PlanoAccounts.getAccessToken(),session=await ensure(token);if(!session)throw failure('SETUP','La cuenta no está conectada.');return take(action)||raw(action,data,token,session.secret);}
 async function probe(){if(!enabled()||!root.PlanoAccounts.getUser()||document.hidden||Date.now()-lastProbe<45000)return;lastProbe=Date.now();try{await request('account_ping');}catch{}}
 document.addEventListener('plano-account-change',()=>{const uid=root.PlanoAccounts.getUser()?.id||'';if(!uid&&previous)forget();if(uid!==previous){active=null;pending=null;workspace=null;}previous=uid;});
 root.addEventListener('focus',probe);setInterval(probe,60000);
 root.PlanoAccountSession={ensure,request,take,forget,closeCurrent:async()=>{if(!enabled()||!active)return;try{await request('account_session_close',{sessionId:active.id});}finally{forget();}}};
})(globalThis);
