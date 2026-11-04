/* Encuadre local. Solo sale del navegador la miniatura confirmada por el usuario. */
(function(root){
 'use strict';const A=root.PlanoAvatarImage,L=A.limits,size=280;let source=null,zoom=1,x=0,y=0,drag=null,finish=null,epoch=0,saving=false;
 const dialog=document.createElement('dialog');dialog.id='avatar-crop-dialog';dialog.className='avatar-crop-dialog';dialog.setAttribute('aria-labelledby','avatar-crop-title');
 dialog.innerHTML='<header><div><h2 id="avatar-crop-title">Encuadra tu foto</h2><p>Arrastra la imagen y ajusta el zoom.</p></div><button type="button" id="avatar-crop-close" aria-label="Cancelar encuadre">×</button></header><div class="avatar-crop-viewport"><canvas id="avatar-crop-canvas" width="280" height="280" tabindex="0" aria-label="Encuadre de la foto: arrastra o utiliza las flechas para moverla"></canvas></div><label class="avatar-crop-zoom">Zoom<input id="avatar-crop-zoom" type="range" min="1" max="4" step="0.01" value="1"></label><p class="avatar-crop-note">Se guardará únicamente el icono recortado y optimizado.</p><p id="avatar-crop-error" role="alert" hidden></p><footer><button id="avatar-crop-cancel" type="button" class="account-text-button">Cancelar</button><button id="avatar-crop-save" type="button" class="account-primary-button">Usar foto</button></footer>';
 const $=s=>dialog.querySelector(s),canvas=$('#avatar-crop-canvas'),context=canvas.getContext('2d');
 const scale=()=>Math.max(size/source.width,size/source.height)*zoom;
 function clamp(){const k=scale();x=Math.max(-(source.width*k-size)/2,Math.min((source.width*k-size)/2,x));y=Math.max(-(source.height*k-size)/2,Math.min((source.height*k-size)/2,y));}
 function draw(){if(!source)return;clamp();const k=scale();context.fillStyle='#fff';context.fillRect(0,0,size,size);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(source,(size-source.width*k)/2+x,(size-source.height*k)/2+y,source.width*k,source.height*k);}
 function cancel(){context.clearRect(0,0,size,size);epoch++;drag=null;saving=false;if(dialog.open)dialog.close();if(source){source.width=source.height=0;source=null;}const resolve=finish;finish=null;resolve?.(null);}
 async function open(file){
  cancel();const id=epoch;if(!file||file.size>L.inputBytes||!file.size)throw Error('Elige una imagen JPG, PNG o WebP de hasta 5 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer()),meta=A.inspect(bytes);
  if(id!==epoch)return null;
  if(!meta||!['image/png','image/jpeg','image/webp'].includes(meta.type))throw Error('El formato no es válido. Elige una imagen JPG, PNG o WebP.');
  if(meta.width<1||meta.height<1||meta.width>L.side||meta.height>L.side||meta.width*meta.height>L.pixels)throw Error('La resolución de la imagen es demasiado grande. Elige una versión de hasta 25 megapíxeles.');
  let bitmap;try{bitmap=await createImageBitmap(new Blob([bytes],{type:meta.type}),{imageOrientation:'from-image'});}catch{throw Error('No se pudo leer la imagen. Prueba con otra foto.');}
  if(id!==epoch){bitmap.close();return null;}
  const k=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));source=document.createElement('canvas');source.width=Math.max(1,Math.round(bitmap.width*k));source.height=Math.max(1,Math.round(bitmap.height*k));const ctx=source.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,source.width,source.height);ctx.drawImage(bitmap,0,0,source.width,source.height);bitmap.close();
  zoom=1;x=y=0;$('#avatar-crop-zoom').value='1';$('#avatar-crop-error').hidden=true;$('#avatar-crop-save').disabled=false;draw();
  const result=new Promise(resolve=>finish=resolve);dialog.showModal();canvas.focus();return result;
 }
 async function exportImage(){
  if(!source)throw Error('Vuelve a elegir la imagen.');const out=document.createElement('canvas');out.width=out.height=L.size;const ctx=out.getContext('2d'),k=scale(),length=size/k;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,L.size,L.size);ctx.imageSmoothingQuality='high';ctx.drawImage(source,(source.width-length)/2-x/k,(source.height-length)/2-y/k,length,length,0,0,L.size,L.size);
  try{for(const type of ['image/webp','image/jpeg'])for(const quality of [.62,.46,.3,.16]){
   const blob=await new Promise(resolve=>out.toBlob(resolve,type,quality));if(!blob||blob.type!==type||blob.size>L.outputBytes)continue;
   const value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});if(A.valid(value))return value;
  }throw Error('No se pudo optimizar la foto. Prueba con otra imagen.');}finally{out.width=out.height=0;}
 }
 canvas.addEventListener('pointerdown',event=>{if(!source||saving||event.button!==0)return;event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:x,startY:y};canvas.setPointerCapture(event.pointerId);});
 canvas.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const rect=canvas.getBoundingClientRect();x=drag.startX+(event.clientX-drag.x)*size/rect.width;y=drag.startY+(event.clientY-drag.y)*size/rect.height;draw();});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>drag=null);
 canvas.addEventListener('keydown',event=>{const move={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]}[event.key];if(!move||saving)return;event.preventDefault();event.stopPropagation();x+=move[0];y+=move[1];draw();});
 $('#avatar-crop-zoom').addEventListener('input',event=>{if(saving)return;const next=Number(event.target.value);x*=next/zoom;y*=next/zoom;zoom=next;draw();});
 for(const id of ['#avatar-crop-close','#avatar-crop-cancel'])$(id).onclick=cancel;
 dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});dialog.addEventListener('close',()=>{if(!dialog.open&&finish)cancel();});
 $('#avatar-crop-save').onclick=async()=>{if(saving)return;saving=true;const id=epoch;$('#avatar-crop-save').disabled=true;try{const photo=await exportImage();if(id!==epoch)return;const resolve=finish;finish=null;cancel();resolve?.(photo);}catch(error){if(id!==epoch)return;$('#avatar-crop-error').textContent=error.message;$('#avatar-crop-error').hidden=false;saving=false;$('#avatar-crop-save').disabled=false;}};
 root.PlanoAvatarCrop={open,cancel};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>document.body.append(dialog));else document.body.append(dialog);
})(globalThis);
