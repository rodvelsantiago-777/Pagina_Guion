export function firebaseVerifier(jose,projectId,keys){
  const jwks=keys||jose.createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
  return async token=>{
    const {payload}=await jose.jwtVerify(token,jwks,{issuer:`https://securetoken.google.com/${projectId}`,audience:projectId,algorithms:['RS256'],requiredClaims:['exp','iat','auth_time','sub'],clockTolerance:5});
    const now=Math.floor(Date.now()/1000);
    if(payload.email_verified!==true||typeof payload.sub!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(payload.sub)||!Number.isFinite(payload.auth_time)||!Number.isFinite(payload.iat)||payload.auth_time>now+5||payload.iat>now+5)throw new Error('UNAUTHORIZED');
    return payload.sub;
  };
}
