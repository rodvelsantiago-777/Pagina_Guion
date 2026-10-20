/* Cuentas reales mediante Firebase Auth. El editor y sus archivos siguen siendo locales. */
(function (root) {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const config=root.PlanoAuthConfig||{};
  const configured=['apiKey','authDomain','projectId','appId'].every(key=>typeof config[key]==='string'&&config[key].trim()&&!/[<>]/.test(config[key]));
  let client=null,current=null,owner='',view='signup',working=false,initialized=false,unavailable='',hooks={},queue=Promise.resolve(),resetCode='',resendAt=0,resendTimer,connecting=true,workspaceConnected=false;
  let resolveReady; const ready=new Promise(resolve=>resolveReady=resolve);
  const titles={login:'Bienvenido de nuevo',signup:'Crea tu cuenta',forgot:'Recupera tu acceso',reset:'Nueva contraseña',verify:'Verifica tu correo',profile:'Mi cuenta'};
  function message(text='',error=false){const node=$('#account-message');node.textContent=text;node.hidden=!text;node.classList.toggle('is-error',error);}
  function safeError(error){
    const messages={
      'auth/invalid-credential':'El correo o la contraseña no son correctos.', 'auth/wrong-password':'El correo o la contraseña no son correctos.', 'auth/user-not-found':'El correo o la contraseña no son correctos.',
      'auth/email-already-in-use':'No se pudo crear la cuenta con ese correo. Prueba a iniciar sesión o recuperar el acceso.', 'auth/invalid-email':'Escribe un correo electrónico válido.',
      'auth/weak-password':'Elige una contraseña más larga que cumpla los requisitos de la cuenta.', 'auth/password-does-not-meet-requirements':'La contraseña no cumple los requisitos de seguridad.',
      'auth/too-many-requests':'Se han realizado demasiados intentos. Espera un momento y vuelve a intentarlo.', 'auth/network-request-failed':'No hay conexión con el servicio de cuentas. Comprueba tu conexión y vuelve a intentarlo.',
      'auth/user-disabled':'Esta cuenta no está disponible.', 'auth/invalid-action-code':'El enlace ya se utilizó o no es válido. Solicita uno nuevo.', 'auth/expired-action-code':'El enlace ha caducado. Solicita uno nuevo.',
      'auth/operation-not-allowed':'El acceso por correo todavía no está disponible.', 'auth/unauthorized-domain':'El acceso desde esta dirección todavía no está habilitado.',
      'auth/configuration-not-found':'El servicio de cuentas todavía no está activado.',
      'auth/invalid-continue-uri':'No se pudo preparar el enlace de correo.', 'auth/unauthorized-continue-uri':'No se pudo preparar el enlace de correo.',
      'auth/requires-recent-login':'Vuelve a iniciar sesión para realizar este cambio.', 'auth/web-storage-unsupported':'El navegador está bloqueando el almacenamiento de la sesión.',
      'auth/invalid-api-key':'El servicio de cuentas todavía no está disponible.'
    };
    return messages[error?.code]||'No se pudo completar la operación. Inténtalo de nuevo.';
  }
  function showField(name,visible){const box=$(`[data-account-field="${name}"]`);box.hidden=!visible;for(const input of box.querySelectorAll('input')){input.disabled=!visible;input.required=visible;input.setCustomValidity('');}}
  function syncGate(){
    const unlocked=Boolean(current?.emailVerified)&&workspaceConnected;
    const dialog=$('#account-dialog'),shell=$('.app-shell');
    document.body.classList.toggle('auth-locked',!unlocked);$('#auth-entry').hidden=unlocked;shell.inert=!unlocked;shell.setAttribute('aria-hidden',String(!unlocked));
    $('#close-account').hidden=!unlocked;$('#account-continue').hidden=!unlocked;
    if(!unlocked){
      if(dialog.parentElement!==$('#auth-card-mount')){if(dialog.open)dialog.close();$('#auth-card-mount').append(dialog);}
      if(!dialog.open)dialog.show();
    }else if(dialog.parentElement===$('#auth-card-mount')){
      if(dialog.open)dialog.close();document.body.append(dialog);
    }
    const pendingEditor=Boolean(current?.emailVerified)&&!workspaceConnected;
    $('#auth-loading').hidden=!connecting&&!pendingEditor;
    $('#auth-loading').textContent=pendingEditor?'Preparando tu espacio de trabajo…':'Conectando con el servicio de cuentas…';
  }
  function render(){
    syncGate();
    const active=Boolean(current?.emailVerified),accessible=configured&&!unavailable;
    $('#account-title').textContent=titles[view];
    $('#account-unavailable').hidden=accessible;
    if(unavailable)$('#account-unavailable p').textContent=unavailable;
    $('#account-tabs').hidden=!accessible||!['login','signup'].includes(view);
    for(const button of document.querySelectorAll('[data-account-view]'))button.setAttribute('aria-pressed',String(button.dataset.accountView===view));
    $('#account-form').hidden=!accessible||['verify','profile'].includes(view);
    $('#account-verify').hidden=!accessible||view!=='verify';$('#account-profile').hidden=!accessible||view!=='profile';
    const fields={name:view==='signup',email:['login','signup','forgot'].includes(view),password:['login','signup','reset'].includes(view),confirm:['signup','reset'].includes(view)};
    for(const [field,visible]of Object.entries(fields))showField(field,visible);
    $('#account-password').minLength=view==='login'?0:12;$('#account-password').autocomplete=view==='login'?'current-password':'new-password';
    $('#account-password-hint').hidden=view==='login';$('#account-remember-row').hidden=view!=='login';
    $('#account-submit').textContent=connecting?'Conectando…':{login:'Iniciar sesión',signup:'Crear cuenta',forgot:'Enviar enlace',reset:'Guardar contraseña'}[view]||'Continuar';
    $('#account-forgot').hidden=view!=='login';$('#account-back').hidden=!['forgot','reset'].includes(view);
    $('#account-form-intro').hidden=view!=='forgot';$('#account-form-intro').textContent='Te enviaremos un enlace para elegir una nueva contraseña.';
    $('#account-local-note').hidden=view==='profile';
    const name=current?.displayName?.trim()||current?.email?.split('@')[0]||'Mi cuenta';
    $('#open-account span').textContent=active?name.split(' ')[0]:current?'Verificar correo':'Mi cuenta';
    $('#open-account').setAttribute('aria-label',active?`Abrir cuenta de ${name}`:current?'Verificar correo':'Abrir mi cuenta');
    $('#open-account').title=active?`Mi cuenta · ${current.email}`:current?'Verificar correo':'Mi cuenta';
    $('#account-profile-name').textContent=name;$('#account-profile-email').textContent=current?.email||'';$('#account-avatar').textContent=Array.from(name)[0]?.toUpperCase()||'P';$('#account-verify-email').textContent=current?.email||'';
    for(const button of $('#account-dialog').querySelectorAll('button'))button.disabled=working;
    $('#account-submit').disabled=working||connecting||!client;
    $('#account-dialog').setAttribute('aria-busy',String(working));
    updateResend();
  }
  function setView(next,clear=true){view=next;if(clear)message();$('#account-password').value='';$('#account-confirm').value='';$('#account-password').type='password';$('#account-show-password').textContent='Mostrar';$('#account-show-password').setAttribute('aria-pressed','false');render();}
  function open(next){
    setView(next|| (current?current.emailVerified?'profile':'verify':'signup'));
    if(!$('#account-dialog').open)$('#account-dialog').showModal();
    (configured&&!unavailable&&!current?(view==='signup'?$('#account-name'):$('#account-email')):document.body.classList.contains('auth-locked')?$('#account-title'):$('#close-account')).focus();
  }
  function close(){if(working||document.body.classList.contains('auth-locked'))return;$('#account-dialog').close();$('#account-password').value='';$('#account-confirm').value='';$('#open-account').focus({preventScroll:true});clearTimeout(resendTimer);}
  function updateResend(){
    clearTimeout(resendTimer);
    const seconds=Math.max(0,Math.ceil((resendAt-Date.now())/1000));
    $('#account-resend').textContent=seconds?`Reenviar en ${seconds} s`:'Reenviar enlace';$('#account-resend').disabled=working||seconds>0;
    if(seconds&&$('#account-dialog').open&&view==='verify')resendTimer=setTimeout(updateResend,1000);
  }
  function acceptUser(next){
    queue=queue.catch(()=>{}).then(async()=>{
      const nextOwner=next?.emailVerified?next.uid:'';
      if(nextOwner!==owner){await hooks.change?.(nextOwner,owner);owner=nextOwner;}
      current=next;
      connecting=false;
      if(!['forgot','reset'].includes(view))view=current?current.emailVerified?'profile':'verify':view==='signup'?'signup':'login';
      render();resolveReady();
    });
    return queue;
  }
  async function task(action,changing=false){
    if(working)return;
    if(!client){message('No se pudo preparar el acceso. Reintenta la conexión.',true);return;}
    if(changing&&hooks.canChange&&!hooks.canChange()){message('Termina o cancela la edición del plano y espera a que finalice la exportación antes de cambiar de cuenta.',true);return;}
    working=true;message();render();
    try{await action();}catch(error){message(safeError(error),true);}
    finally{working=false;$('#account-password').value='';$('#account-confirm').value='';render();}
  }
  function actionSettings(){return{url:location.origin+location.pathname,handleCodeInApp:false};}
  async function sendVerification(){
    if(!current||current.emailVerified)return;
    await current.sendEmailVerification(actionSettings());resendAt=Date.now()+60000;
    message('Enlace enviado. Revisa tu correo y la carpeta de spam.');updateResend();
  }
  function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;const timer=setTimeout(()=>{script.remove();reject(new Error('SDK timeout'));},15000);script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('SDK unavailable'));};document.head.append(script);});}
  async function handleEmailAction(){
    const params=new URL(location.href).searchParams,mode=params.get('mode'),code=params.get('oobCode');
    if(!code||!['resetPassword','verifyEmail'].includes(mode))return;
    const clean=new URL(location.href);for(const key of ['mode','oobCode','apiKey','continueUrl','lang'])clean.searchParams.delete(key);history.replaceState(null,'',clean.pathname+clean.search+clean.hash);
    open(mode==='resetPassword'?'reset':'login');working=true;render();
    try{
      if(mode==='resetPassword'){await client.verifyPasswordResetCode(code);resetCode=code;setView('reset');}
      else{await client.applyActionCode(code);if(client.currentUser){await client.currentUser.reload();await client.currentUser.getIdToken(true);await acceptUser(client.currentUser);}message('Correo verificado. Ya puedes iniciar sesión.');}
    }catch(error){setView('forgot');message(safeError(error),true);}
    finally{working=false;render();}
  }
  async function init(options={}){
    hooks={...hooks,...options};if(initialized)return ready;initialized=true;
    $('#open-account').addEventListener('click',()=>open());$('#close-account').addEventListener('click',close);$('#account-continue').addEventListener('click',close);
    $('#account-dialog').addEventListener('cancel',event=>{event.preventDefault();close();});
    $('#account-retry').addEventListener('click',()=>location.reload());
    $('#auth-theme').addEventListener('click',()=>$('#toggle-theme').click());
    for(const button of document.querySelectorAll('[data-account-view]'))button.addEventListener('click',()=>setView(button.dataset.accountView));
    $('#account-forgot').addEventListener('click',()=>setView('forgot'));$('#account-back').addEventListener('click',()=>{resetCode='';setView('login');});
    $('#account-show-password').addEventListener('click',()=>{const visible=$('#account-password').type==='password';$('#account-password').type=visible?'text':'password';$('#account-show-password').textContent=visible?'Ocultar':'Mostrar';$('#account-show-password').setAttribute('aria-label',visible?'Ocultar contraseña':'Mostrar contraseña');$('#account-show-password').setAttribute('aria-pressed',String(visible));});
    for(const input of $('#account-form').querySelectorAll('input'))input.addEventListener('input',()=>{input.setCustomValidity('');if(['account-password','account-confirm'].includes(input.id))$('#account-confirm').setCustomValidity('');});
    $('#account-form').addEventListener('submit',event=>{
      event.preventDefault();const mode=view,email=$('#account-email').value.trim(),password=$('#account-password').value,name=$('#account-name').value.trim();
      if(mode==='signup'&&name.length<2)$('#account-name').setCustomValidity('Escribe tu nombre.');
      if(['signup','reset'].includes(mode)&&password!==$('#account-confirm').value)$('#account-confirm').setCustomValidity('Las contraseñas no coinciden.');
      if(!$('#account-form').reportValidity())return;
      task(async()=>{
        if(mode==='login'){
          await client.setPersistence($('#account-remember').checked?root.firebase.auth.Auth.Persistence.LOCAL:root.firebase.auth.Auth.Persistence.SESSION);
          const result=await client.signInWithEmailAndPassword(email,password);await acceptUser(result.user);
          if(result.user.emailVerified){working=false;close();}else message('Verifica tu correo para activar la cuenta. Puedes reenviar el enlace aquí.');
        }else if(mode==='signup'){
          await client.setPersistence(root.firebase.auth.Auth.Persistence.SESSION);
          const result=await client.createUserWithEmailAndPassword(email,password);await acceptUser(result.user);
          try{await result.user.updateProfile({displayName:name});}catch{message('La cuenta se creó, pero no se pudo guardar el nombre.',true);}
          setView('verify');await sendVerification();
        }else if(mode==='forgot'){
          try{await client.sendPasswordResetEmail(email,actionSettings());}catch(error){if(error.code!=='auth/user-not-found')throw error;}
          message('Si existe una cuenta con ese correo, recibirás un enlace para recuperar el acceso.');
        }else if(mode==='reset'){
          if(!resetCode){setView('forgot');message('Solicita un enlace nuevo para cambiar la contraseña.',true);return;}
          await client.confirmPasswordReset(resetCode,password);resetCode='';setView('login');message('Contraseña actualizada. Inicia sesión con tu nueva contraseña.');
        }
      },['login','signup'].includes(mode));
    });
    $('#account-signout').addEventListener('click',()=>task(async()=>{await client.signOut();await acceptUser(null);setView('login');message('Sesión cerrada. Tus anotaciones siguen guardadas en este navegador.');},true));
    $('#account-other-email').addEventListener('click',()=>task(async()=>{await client.signOut();await acceptUser(null);$('#account-email').value='';setView('login');},true));
    $('#account-resend').addEventListener('click',()=>{if(Date.now()>=resendAt)task(sendVerification);});
    $('#account-check-email').addEventListener('click',()=>task(async()=>{if(!client.currentUser)return;await client.currentUser.reload();await client.currentUser.getIdToken(true);await acceptUser(client.currentUser);message(current?.emailVerified?'Correo verificado. Tu cuenta ya está activa.':'El correo aún no está verificado. Abre el enlace recibido y vuelve a intentarlo.');},true));
    $('#account-change-password').addEventListener('click',()=>task(async()=>{await client.sendPasswordResetEmail(current.email,actionSettings());message('Te hemos enviado un enlace para cambiar tu contraseña.');}));
    render();
    if(!configured){connecting=false;unavailable='El servicio de cuentas todavía no está configurado.';render();resolveReady();return ready;}
    if(!['http:','https:'].includes(location.protocol)){connecting=false;unavailable='Para acceder a tu cuenta, abre la web publicada o usa un servidor local.';render();resolveReady();return ready;}
    try{
      await loadScript('vendor/firebase-app-compat.js');await loadScript('vendor/firebase-auth-compat.js');
      const app=root.firebase.initializeApp(config,'plano-accounts');client=app.auth();client.languageCode='es';
      client.onIdTokenChanged(next=>{acceptUser(next).catch(()=>{connecting=false;message('No se pudo cambiar de cuenta. Recarga la página.',true);render();resolveReady();});},()=>{connecting=false;unavailable='No se pudo recuperar la sesión. Recarga la página para volver a intentarlo.';render();resolveReady();});
      await ready;await handleEmailAction();
    }catch{connecting=false;unavailable='No se pudo conectar con el servicio de cuentas. Comprueba tu conexión y vuelve a intentarlo.';render();resolveReady();}
    return ready;
  }
  function connectWorkspace(options){hooks={...hooks,...options};workspaceConnected=true;if(initialized)render();}
  root.PlanoAccounts={init,ready,configured,open,connectWorkspace,notesKey:fingerprint=>owner?`plano-notes-user-v1:${encodeURIComponent(owner)}:${fingerprint}`:`plano-notes-v1:${fingerprint}`,getUser:()=>current?.emailVerified?{id:current.uid,name:current.displayName||'',email:current.email}:null};
  // El acceso se inicia por sí mismo, aunque el editor tarde en cargar o falle.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init());else init();
})(globalThis);
