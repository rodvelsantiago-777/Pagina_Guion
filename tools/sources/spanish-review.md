# Revisión de español

PLANO usa **LingoTweaker 0.2.8**, un motor independiente basado en el código y los
recursos públicos de LanguageTool. No es un servicio de la RAE ni una integración
con los servicios comerciales de LanguageTool.

- Motor y recursos: https://github.com/fiduswriter/LingoTweaker
- Fuente exacta de los paquetes: https://github.com/fiduswriter/LingoTweaker/tree/819dc354224c9087ff486708adfd413ecb45f466
- Archivo del código fuente correspondiente: https://github.com/fiduswriter/LingoTweaker/archive/819dc354224c9087ff486708adfd413ecb45f466.tar.gz
- Paquetes: `lingotweaker-wasm@0.2.8` y `lingotweaker-data-es@0.2.8`.
- LGPL-2.1-or-later para el motor. Los datos conservan sus propias licencias;
  el diccionario morfológico español procede de Softcatalà, LGPL-2.1.
- Las licencias, atribuciones y hashes están junto a los archivos distribuidos,
  en `vendor/spanish-review/0.2.8/`. El WASM y los datos no se han modificado;
  el WASM únicamente se comprime con gzip. El adaptador es código de PLANO.

## Ejecución y privacidad

La revisión completa funciona en navegadores modernos, sirviendo la página por
HTTP/HTTPS (incluido GitHub Pages). Se descarga bajo demanda, al revisar texto,
desde el propio sitio. El motor y el paquete español pesan unos **8,25 MB** en
total; el navegador puede conservarlos en su caché. No se guardan en Supabase
ni cuentan como espacio del proyecto.

El motor analiza ortografía, gramática y puntuación dentro de un Web Worker;
no se envía texto a ningún servidor. Se verifican más de 1.600 reglas activas
y cero fallos de compilación al inicializarlo. Las acotaciones se analizan también
en el contexto de su personaje. Las posiciones UTF-8 del motor se convierten a
UTF-16 antes de dibujar los subrayados o aplicar una sugerencia.

La revisión es incremental: conserva los resultados de párrafos inmutables,
invalida las acotaciones si cambia su interlocutor y cancela trabajo antiguo.
Los resultados parciales se conservan aunque el usuario siga escribiendo. Se
prioriza el párrafo seleccionado. El worker se libera después de cinco minutos
sin trabajo y al cerrar el guion o cambiar de cuenta.

Se mantienen comprobaciones conservadoras existentes como complemento para
fragmentos de guion y repeticiones. No sustituyen al léxico público ni requieren
añadir palabras para ampliar el corrector general. Si falla la descarga o el
motor, se ofrece **«Revisión básica · motor completo no disponible»**, con nspell
y dictionary-es locales; no se presenta como una revisión completa. Una revisión
básica guardada no impide volver a revisar con el motor completo en otra sesión.

Ningún corrector detecta todos los errores ni interpreta siempre bien el género
de un personaje, las ambigüedades o el estilo. Las sugerencias requieren aceptación
del usuario. Los nombres de personajes y las palabras aceptadas del proyecto
siguen excluyéndose de las faltas ortográficas.

## Reproducir o actualizar

Los archivos están incluidos en el repositorio: no hay que instalar servicios,
configurar claves, desplegar un servidor lingüístico ni activar facturación.

Para reconstruir los recursos con Node 18 o superior:

```powershell
node tools/install-language-engine.cjs
```

La herramienta descarga desde npm y la fuente pública fijada, comprueba SHA-512
de ambos paquetes y SHA-256 del paquete español, extrae solo los recursos
necesarios y copia las licencias. No ejecuta scripts de instalación de terceros.
El código de construcción del motor está en `crates/lt-wasm/` y los recursos y
herramientas de empaquetado en el archivo fuente enlazado arriba. La separación
del WASM y del paquete permite reemplazar el motor sin recompilar la aplicación.

Para actualizar: revisar las notas y licencias de la versión pública elegida,
cambiar versión, commit e integridades en la herramienta y la ruta del worker,
reconstruir, incrementar la versión de revisión en `spelling.js` y ejecutar
`tests/language-engine.cjs` y la suite funcional. No se actualiza automáticamente
a una versión sin comprobar.

## Alternativas evaluadas

- La API pública de LanguageTool prohíbe las peticiones automáticas y no garantiza
  disponibilidad: https://dev.languagetool.org/public-http-api.html
- Un diccionario de definiciones no reemplaza un analizador gramatical. No se ha
  identificado una API oficial, pública y gratuita de la RAE apta para revisar
  automáticamente los guiones. No se raspa el DLE ni se usan APIs no oficiales.
- Hospedar el servidor Java de LanguageTool exigiría infraestructura adicional.
  La solución local evita cuotas de revisión, facturación y exposición de textos.

Pruebas: motor real y recursos servidos localmente, privacidad sin solicitudes a
terceros, nombres propios, concordancia/acotaciones, puntuación, offsets con
tildes/emoji, sugerencias/deshacer, cancelación, caché y respuesta de la interfaz.
