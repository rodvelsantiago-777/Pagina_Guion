/* Validación compartida de fotos. La copia pública se genera con build-cloud-function.cjs. */
(function(root){
 'use strict';
 const limits=Object.freeze({inputBytes:5*1024*1024,pixels:25000000,side:8192,size:128,outputBytes:8192,textBytes:11000});
 const text=(b,a,n)=>String.fromCharCode(...b.subarray(a,a+n));
 function inspect(b){
  if(!(b instanceof Uint8Array)||b.length<30)return null;const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  if(text(b,1,3)==='PNG'&&b[0]===137&&text(b,12,4)==='IHDR')return{type:'image/png',width:v.getUint32(16),height:v.getUint32(20)};
  if(b[0]===255&&b[1]===216){
   let at=2,metadata=false;
   while(at+4<=b.length){if(b[at++]!==255)return null;while(b[at]===255)at++;const marker=b[at++];if(marker===0xda||marker===0xd9)break;if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
    if(at+2>b.length)return null;const length=v.getUint16(at);if(length<2||at+length>b.length)return null;
    if(marker===0xe1||marker===0xed||marker===0xfe)metadata=true;
    if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker)){if(length<8)return null;return{type:'image/jpeg',width:v.getUint16(at+5),height:v.getUint16(at+3),metadata};}at+=length;
   }return null;
  }
  if(text(b,0,4)==='RIFF'&&text(b,8,4)==='WEBP'&&v.getUint32(4,true)+8===b.length){
   let at=12,declared=null,images=[],animated=false,metadata=false;
   while(at+8<=b.length){const kind=text(b,at,4),length=v.getUint32(at+4,true),start=at+8;if(start+length>b.length)return null;
    if(kind==='VP8X'&&length>=10){declared={width:1+b[start+4]+(b[start+5]<<8)+(b[start+6]<<16),height:1+b[start+7]+(b[start+8]<<8)+(b[start+9]<<16)};animated=Boolean(b[start]&2);}
    else if(kind==='VP8 '&&length>=10&&b[start+3]===0x9d&&b[start+4]===1&&b[start+5]===0x2a)images.push({width:v.getUint16(start+6,true)&0x3fff,height:v.getUint16(start+8,true)&0x3fff});
    else if(kind==='VP8L'&&length>=5&&b[start]===0x2f){const bits=v.getUint32(start+1,true);images.push({width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)});}
    else if(['ANIM','ANMF'].includes(kind))animated=true;
    else if(['EXIF','XMP '].includes(kind))metadata=true;
    at=start+length+(length%2);
   }
   const size=declared||images[0];return size?{type:'image/webp',...size,images,animated,metadata}:null;
  }return null;
 }
 function valid(value){
  if(value==='')return true;if(typeof value!=='string'||value.length>limits.textBytes)return false;
  const match=/^data:(image\/(?:jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);if(!match||match[2].length%4)return false;
  try{const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));if(bytes.length>limits.outputBytes)return false;const meta=inspect(bytes);if(!meta||meta.type!==match[1]||meta.width!==limits.size||meta.height!==limits.size||meta.metadata)return false;
   if(meta.type==='image/jpeg')return bytes.at(-2)===255&&bytes.at(-1)===217;
   return !meta.animated&&meta.images.length===1&&meta.images.every(size=>size.width===limits.size&&size.height===limits.size);
  }catch{return false;}
 }
 function paint(element,value,initials=''){
  if(!element)return;element.replaceChildren();const photo=Boolean(value&&valid(value));element.classList.toggle('has-photo',photo);
  if(photo){const img=document.createElement('img');img.src=value;img.alt='';img.width=limits.size;img.height=limits.size;element.append(img);}else element.textContent=initials;
 }
 const api={limits,inspect,valid,paint};root.PlanoAvatarImage=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
