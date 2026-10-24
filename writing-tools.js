/* Solicita el corrector nativo. El idioma y las sugerencias los decide el navegador. */
(function(){
 'use strict';
 function enable(node){
  if(node.nodeType!==1)return;
  const controls=[...(node.matches('textarea,input')?[node]:[]),...node.querySelectorAll('textarea,input')];
  for(const input of controls){
   if(input.getAttribute('spellcheck')==='false'||input.tagName==='INPUT'&&input.type!=='text')continue;
   input.spellcheck=true;input.lang='es';
  }
 }
 enable(document.documentElement);
 new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)enable(node);}).observe(document.body,{childList:true,subtree:true});
})();
