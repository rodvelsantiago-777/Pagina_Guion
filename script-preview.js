/* Una pequeña imagen JPEG del PDF, sin anotaciones ni cambios de tema. */
(function(root){
 'use strict';
 function valid(value){return typeof value==='string'&&value.length<=20000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);}
 async function create(pdf){
  const page=await pdf.getPage(1),original=page.getViewport({scale:1});
  const scale=Math.min(180/original.width,252/original.height),viewport=page.getViewport({scale});
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
  try{
   await page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'}).promise;
   const image=canvas.toDataURL('image/jpeg',.65);return valid(image)?image:null;
  }finally{canvas.width=canvas.height=0;}
 }
 root.PlanoScriptPreview={create,valid};
})(globalThis);
