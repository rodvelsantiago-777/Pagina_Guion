# Notas de versión de PLANO

## Activación en GitHub Pages (una sola vez)

1. En el repositorio abre **Settings → Pages → Build and deployment → Source** y elige **GitHub Actions**. La configuración anterior «Deploy from a branch» no ejecuta el generador.
2. Haz **Commit → Push origin** con los cambios de este proyecto, incluida la carpeta `.github/workflows`. No hace falta elegir una plantilla adicional de GitHub.
3. En **Actions** aparecerá **Publicar PLANO y notas de versión**. Cuando termine correctamente, el sitio y sus notas estarán publicados juntos.

El flujo usa la rama `main`, el repositorio existente y GitHub Pages. No añade claves privadas, servicios de IA ni planes de pago. Solo publica HTML, CSS, JavaScript, los recursos de `vendor` y el historial público de novedades; no publica herramientas, pruebas, archivos de entorno ni configuración del servidor.

## Qué sucede con cada Push origin

`tools/build-pages.cjs` identifica el commit de la publicación y el rango de cambios desde la última versión publicada. Si no existe un historial anterior, usa el rango del Push. Agrupa las novedades en **Novedades**, **Mejoras** y **Correcciones**, genera la fecha y el número de publicación y conserva hasta veinte versiones. Reintentar el mismo commit conserva su nota y no crea otro aviso. Una publicación posterior incluye los cambios de una ejecución que hubiera quedado cancelada, si el commit publicado anterior está disponible en el historial.

El sitio recibe un `release-notes.json` generado, con un máximo de 140 KB. Cada recurso JS/CSS del HTML usa el identificador del commit para evitar que una actualización cargue archivos antiguos de la caché. Los errores de publicación no cambian el sitio que ya estaba disponible.

Para escribir notas claras, añade entradas a **release-notes.entries.json** junto al cambio de código:

```json
{
  "id": "identificador-unico-de-la-mejora",
  "category": "fixed",
  "text": "Ahora puedes leer todo el contenido de sonido en el guion técnico."
}
```

Las categorías admitidas son `new`, `improved` y `fixed`. Usa un ID nuevo para cada mejora; conserva las entradas antiguas. Solo las añadidas o modificadas desde la publicación anterior aparecen en la nota nueva. No es necesario editar números de versión, fechas ni el manifiesto generado.

Si no se añadieron entradas, el flujo prepara un resumen a partir de los archivos modificados y los mensajes de los commits. Ese resumen describe las áreas actualizadas; no interpreta por sí solo todos los detalles del código. Los textos del registro permiten ofrecer explicaciones más precisas a los usuarios.

El `release-notes.json` vacío de la carpeta de trabajo es intencional: un cambio local todavía no se ha publicado. GitHub Actions lo sustituye dentro del paquete de publicación. Los archivos generados quedan en `_site/`, que no se añade a Git.

## Lectura por cuenta

Después de iniciar sesión con correo verificado, el inicio muestra un aviso cuando hay publicaciones pendientes. La ventana incluye todo el historial disponible: la versión más reciente arriba y cada publicación anterior debajo, con su fecha y sus cambios, también para cuentas nuevas. Al cerrarla se registra como leída la versión más reciente; las antiguas siguen disponibles y no vuelven a provocar avisos. No interrumpe una edición ni se superpone a otro diálogo.

**Entendido**, la cruz o **Esc** registran la lectura. El recibo se guarda por UID en Supabase y se recupera desde otro navegador o equipo. Una pestaña antigua no puede retroceder la fecha de lectura de una versión más reciente. **Notas de parche**, en el inicio, en la barra lateral y en el menú del editor, abre el historial con todas las versiones conservadas, sus fechas y sus cambios, aunque ya se hayan leído. Cada apertura consulta el historial publicado y comienza por la versión más reciente. Este acceso sigue visible cuando el historial está vacío o falla la carga; muestra un mensaje y permite volver a cargarlo con **Actualizar**.

Solo se cachean en el navegador el identificador, fecha y estado pendiente del recibo, separados por cuenta. No contiene PDF ni anotaciones. Si se cierra el aviso sin conexión, el recibo se reintenta al recuperar la conexión. Hasta que el servidor confirme la lectura, otro dispositivo puede mostrarla de nuevo. Un fallo de las notas o de su sincronización no bloquea el estudio.

La tabla `plano_release_receipts` y su RPC tienen RLS y acceso exclusivo del servidor, con las mismas cuotas del almacenamiento existente. La función `plano-cloud` verifica los tokens Firebase antes de leer o escribir el recibo. No es necesario migrar usuarios.

## Verificación

`node tests/patch-notes.cjs` usa Git real en un repositorio temporal, PostgreSQL WASM, JWT firmados y navegador. Verifica rangos de Push, registro editorial, resumen alternativo, reintentos, paquete estático, caché de recursos, permisos SQL, aislamiento de cuentas, lectura entre dispositivos, publicaciones omitidas, texto seguro, consulta manual, teclado, desconexión y pantallas de 320–1440 px. Define `PLANO_RUNTIME_MODULES` como el resto de pruebas; `PLANO_BROWSER=brave` permite repetir en Brave.
