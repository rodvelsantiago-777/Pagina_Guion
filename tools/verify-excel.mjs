// Inspección y renderizado de los XLSX descargados; no modifica los libros.
import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const paths=process.argv.slice(2);
for(const [index,path] of paths.entries()){
 const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(path));
 const sheet=wb.worksheets.getItemAt(0),name=sheet.name;
 console.log(path,(await wb.inspect({kind:'table',sheetId:name,range:'A14:M21',tableMaxRows:8,tableMaxCols:13,maxChars:2200})).ndjson);
 const png=await wb.render({sheetName:name,range:'A1:M21',scale:1,format:'png'});
 await fs.writeFile(new URL(`../tests/.output/excel-review-${index}.png`,import.meta.url),new Uint8Array(await png.arrayBuffer()));
}
