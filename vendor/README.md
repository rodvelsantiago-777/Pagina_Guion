# Bibliotecas de terceros

- **Firebase JavaScript SDK 12.19.0**, Google y colaboradores. `firebase-app-compat.js` y `firebase-auth-compat.js` proceden de `https://www.gstatic.com/firebasejs/12.19.0/`. Se cargan localmente cuando se configura el servicio de cuentas; las operaciones de autenticación se comunican con Firebase. Licencia Apache-2.0 en `LICENSE-firebase.txt`; código en https://github.com/firebase/firebase-js-sdk. Copia reproducible con `../tools/copy-firebase.cjs`. No se incluye Analytics, Firestore ni almacenamiento de archivos en la nube.

- **ExcelJS 4.4.0**, Guyon Roche y colaboradores. Código: https://github.com/exceljs/exceljs. Licencia MIT en `LICENSE-exceljs.txt`. `exceljs.min.js` es el bundle de navegador oficial; solo se carga al exportar Excel y funciona sin conexión. Se obtuvo del paquete npm oficial versionado. `../tools/copy-exceljs.cjs` permite repetir la copia desde el paquete instalado o una ruta a su carpeta.
- `excel-template.js` contiene la plantilla propia de PLANO, sin datos de proyectos ni nombres del equipo. Se genera con `../tools/build-excel-template.mjs` usando Artifact Tool. El script normaliza el prefijo del namespace principal OOXML para que ExcelJS pueda leerlo; el navegador carga la plantilla local y añade los datos actuales.

- **pdf-lib 1.17.1**, Andrew Dillon y colaboradores. Código: https://github.com/Hopding/pdf-lib. Licencia MIT en `LICENSE-pdf-lib.md`. `pdf-lib.min.js` es el bundle UMD oficial, cargado únicamente al exportar un PDF con anotaciones; permite añadir las marcas sobre el PDF original sin convertir sus páginas en imágenes. Para volver a copiarlo desde esa versión instalada, usa `../tools/copy-pdf-lib.cjs`.

- **PDF.js / pdfjs-dist 5.6.205**, Mozilla y colaboradores. Código fuente: https://github.com/mozilla/pdf.js. Distribución: https://www.npmjs.com/package/pdfjs-dist/v/5.6.205. Licencia principal Apache-2.0 en `LICENSE-pdfjs`.
- `pdf.js`: API de PDF.js empaquetada como script clásico mediante esbuild 0.28.2, con nombre global `pdfjsLib`.
- `pdf.worker.mjs`: worker de la misma distribución, usado cuando la página se sirve por HTTP.
- `pdf.worker.js`: worker empaquetado como script clásico, cargado bajo `file://` para ejecutar PDF.js sin servidor. En ese modo el procesamiento utiliza el hilo principal.
- `pdf-assets.js`: fuentes estándar, CMaps y binarios WebAssembly de esa distribución, codificados en base64 y servidos al motor mediante `BinaryDataFactory`. Así también están disponibles sin solicitudes de red al abrir un archivo local.

Las licencias de fuentes, CMaps y decodificadores se conservan en los archivos `LICENSE*`. Para reconstruir los bundles y el paquete de recursos, consulta `../tools/build-vendor.cjs`. No edites manualmente los archivos generados.
