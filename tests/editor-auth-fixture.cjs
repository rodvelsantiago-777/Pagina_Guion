/* Aísla el editor en sus pruebas anteriores. No se carga desde la aplicación.
 * La autenticación obligatoria y el SDK real se prueban aparte en accounts.cjs. */
const fixture=`(function(){
 globalThis.PlanoAccounts={ready:Promise.resolve(),configured:true,getUser:()=>({id:'editor-test',name:'Prueba',email:'editor@example.invalid'}),notesKey:fingerprint=>'plano-notes-v1:'+fingerprint,connectWorkspace:()=>{},open:()=>{}};
 function showEditor(){document.body.classList.remove('auth-locked');document.querySelector('#auth-entry').hidden=true;const shell=document.querySelector('.app-shell');shell.inert=false;shell.setAttribute('aria-hidden','false');}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showEditor);else showEditor();
})();`;
async function preparePage(page){await page.route('**/accounts.js*',route=>route.fulfill({contentType:'text/javascript',body:fixture}));await page.route('**/cloud-config.js*',route=>route.fulfill({contentType:'text/javascript',body:'globalThis.PlanoCloudConfig={};'}));return page;}
async function launch(chromium,options){
 const browser=await chromium.launch(options),newContext=browser.newContext.bind(browser),newPage=browser.newPage.bind(browser);
 browser.newContext=async options=>{const context=await newContext(options),page=context.newPage.bind(context);context.newPage=async()=>preparePage(await page());return context;};
 browser.newPage=async options=>preparePage(await newPage(options));
 return browser;
}
module.exports={launch};
