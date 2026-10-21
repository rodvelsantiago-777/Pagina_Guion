import * as jose from 'npm:jose@6.1.3';
import { firebaseVerifier } from './auth.mjs';
import { createHandler } from './handler.mjs';

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
 preferences:async(owner:string,action:string,patch:unknown)=>(await service('/rest/v1/rpc/plano_preferences',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner:owner,p_action:action,p_patch:patch})})).json(),
 rpc:async(owner:string,action:string,id:string|null,data:unknown)=>(await service('/rest/v1/rpc/plano_cloud',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_owner:owner,p_action:action,p_id:id,p_data:data})})).json(),
 upload:async(owner:string,id:string,bytes:Uint8Array)=>{await service(object(owner,id),{method:'POST',headers:{'Content-Type':'application/pdf','x-upsert':'false'},body:bytes});},
 download:async(owner:string,id:string)=>(await service(object(owner,id).replace('/object/','/object/authenticated/'))).blob(),
 remove:async(owner:string,id:string)=>{await service('/storage/v1/object/plano-pdfs',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[`${owner}/${id}.pdf`]})});}
}));
