/* Archivo .plano completo. Identidad, sesión y revisiones de servidor nunca se transfieren. */
(function(root){
 'use strict';
 const S=typeof module==='object'&&module.exports?require('./screenplay.js'):root.PlanoScreenplay;
 function project(value){
  if(!value||typeof value.name!=='string'||!value.name.trim()||value.name.trim().length>120||/[\u0000-\u001f\u007f]/.test(value.name)||typeof value.documentName!=='string'||!value.documentName.trim()||value.documentName.length>180||/[\u0000-\u001f\u007f]/.test(value.documentName))throw Error('El nombre del proyecto no es válido.');
  const raw=value.payload,screenplay=S.validate(raw?.screenplay);if(!screenplay||!Array.isArray(raw.annotations)||!Array.isArray(raw.corrections)||raw.annotations.length>10000||raw.corrections.length>1000)throw Error('El archivo no contiene un proyecto completo válido.');
  const payload={version:1,documentFormat:2,screenplay,annotations:structuredClone(raw.annotations),corrections:structuredClone(raw.corrections),crew:structuredClone(raw.crew||{}),proofreading:structuredClone(raw.proofreading||{})};
  if(raw.view&&['writing','coverage','technical'].includes(raw.view.stage)&&typeof raw.view.scene==='string'&&raw.view.scene.length<150)payload.view={stage:raw.view.stage,scene:raw.view.scene};
  if(typeof raw.thumbnail==='string'&&raw.thumbnail.length<=20000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw.thumbnail))payload.thumbnail=raw.thumbnail;
  return{name:value.name.trim(),documentName:value.documentName.trim().replace(/\.(pdf|plano)$/i,'').slice(0,174)+'.plano',payload};
 }
 function stringify(value){return JSON.stringify({format:'plano.project',version:1,project:project(value)});}
 function parse(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>400000)throw Error('El archivo .plano supera el tamaño admitido.');let data;try{data=JSON.parse(text);}catch{throw Error('El archivo .plano está dañado o no contiene JSON válido.');}
  if(data?.format==='plano.screenplay'&&data.version===1){const script=S.importPortable(text);return{name:(script.title||'Sin título').slice(0,120),documentName:(script.title||'Sin título').slice(0,174)+'.plano',payload:{version:1,documentFormat:2,screenplay:script,annotations:[],corrections:[],crew:{},proofreading:{}},legacy:true};}
  if(data?.format!=='plano.project'||data.version!==1)throw Error('Este archivo no es un proyecto .plano compatible.');
  const result=project(data.project);result.payload.screenplay.id=S.id();return result;
 }
 const api={stringify,parse,project};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanoProjectArchive=api;
})(globalThis);
