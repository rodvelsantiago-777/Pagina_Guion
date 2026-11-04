# Notas de versión de PLANO

## Activación en GitHub Pages (una sola vez)

1. En el repositorio abre **Settings → Pages → Build and deployment → Source** y elige **GitHub Actions**. La configuración anterior «Deploy from a branch» no ejecuta el generador.
2. Haz **Commit → Push origin** con los cambios de este proyecto, incluida la carpeta `.github/workflows`. No hace falta elegir una plantilla adicional de GitHub.
3. En **Actions** aparecerá **Publicar PLANO y notas de versión**. Cuando termine correctamente, el sitio y sus notas estarán publicados juntos.

El flujo usa la rama `main`, el repositorio existente y GitHub Pages. No añade claves privadas, servicios de IA ni planes de pago. Solo publica HTML, CSS, JavaScript, los recursos de `vendor` y el historial público de novedades; no publica herramientas, pruebas, archivos de entorno ni configuración del servidor.

## Qué sucede con cada Push origin

`tools/build-pages.cjs` identifica el commit de la publicación y el rango de cambios desde la última versión publicada. Si no existe un historial anterior, usa el rango del Push. Agrupa las novedades en **Novedades**, **Mejoras** y **Correcciones** y reúne todos los pushes del mismo día en una única versión, según `America/Bogota`. Conserva hasta 200 jornadas dentro del límite del historial. La medianoche UTC no crea una versión nueva en Colombia. Reintentar el mismo commit conserva su nota y no lo mueve a otro día. El último commit queda registrado como referencia para calcular los cambios siguientes; los textos repetidos de la jornada se muestran una sola vez.

El sitio recibe un `release-notes.json` generado, con un máximo de 140 KB. Cada recurso JS/CSS del HTML usa el identificador del commit para evitar que una actualización cargue archivos antiguos de la caché. Los errores de publicación no cambian el sitio que ya estaba disponible.

Para escribir notas claras, añade entradas a **release-notes.entries.json** junto al cambio de código:

```json
{
  "id": "identificador-unico-de-la-mejora",
  "category": "fixed",
  "text": "Ahora puedes leer todo el contenido de sonido en el guion técnico."
}
```

Las categorías admitidas son `new`, `improved` y `fixed`. Usa un ID nuevo para cada mejora; conserva las entradas antiguas. Solo los IDs nuevos se anuncian como novedades. Cambiar la redacción de una entrada actualiza su texto en el historial, sin volver a anunciar aquella función. Si una función recibe otro cambio, añade una entrada nueva; `revision` permite señalar una actualización explícita de un ID existente. No edites el manifiesto generado.

Escribe una frase breve por cambio, sin detalles internos ni repetir cómo se guardan o reconstruyen los datos. Para agrupar formatos, usa el mismo `group` y `text`, y un `detail` diferente en cada entrada; `detailOrder` fija su orden en la lista.

Si no se añadieron entradas, el flujo prepara un resumen breve de las áreas modificadas; prioriza los mensajes explícitos `fix:` y `feat:` frente a títulos genéricos de commits. Ese resumen describe las áreas actualizadas; no interpreta por sí solo todos los detalles del código. Los textos del registro permiten ofrecer explicaciones más precisas a los usuarios.

El `release-notes.json` vacío de la carpeta de trabajo es intencional: un cambio local todavía no se ha publicado. GitHub Actions lo sustituye dentro del paquete de publicación. Los archivos generados quedan en `_site/`, que no se añade a Git.

## Numeración de versiones

El historial publicado queda así:

- 22 de octubre de 2026: **0.1.0**.
- 23 de octubre: **0.1.1**.
- 2 de noviembre, incorporación del redactor: **0.2.0**.
- 3 de noviembre: **0.2.1**.

Cada jornada nueva incrementa solo el último número: 0.2.2, 0.2.3, etc. Los pushes de una misma jornada no incrementan la versión. Las fechas siguen mostrándose por separado. Se conservan los identificadores diarios y los recibos de lectura de las cuentas.

**El propietario decide los saltos de versión.** `release-notes.config.json` contiene `initialVersion` y los hitos explícitos de `milestones`. Para un salto elegido, añade la fecha de Colombia y la versión correspondiente, por ejemplo `{ "day": "2026-12-10", "version": "0.3.0" }`. Es solo un ejemplo: ese hito no está activado. El generador nunca decide por el tamaño del cambio si debe subir la versión intermedia o principal.

Al publicar esta actualización se reescribe también el historial anterior con los textos breves del catálogo. Los formatos se agrupan por día y el orden de versiones se mantiene de reciente a antiguo. La migración no presenta las funciones antiguas como nuevas.

## Lectura por cuenta

Después de iniciar sesión con correo verificado, el inicio muestra un aviso cuando hay una jornada nueva. Los pushes posteriores de ese mismo día actualizan sus notas sin crear otro aviso diario. La ventana incluye todo el historial disponible: la jornada más reciente arriba y cada día anterior debajo, con su fecha y sus cambios, también para cuentas nuevas. El historial antiguo por push se agrupa automáticamente por fecha. Al cerrarla se registra como leída la versión más reciente; las antiguas siguen disponibles y no vuelven a provocar avisos. No interrumpe una edición ni se superpone a otro diálogo.

**Entendido**, la cruz o **Esc** registran la lectura. El recibo se guarda por UID en Supabase y se recupera desde otro navegador o equipo. Una pestaña antigua no puede retroceder la fecha de lectura de una versión más reciente. **Notas de parche**, en el inicio, y en la barra lateral, abre el historial con todas las versiones conservadas, sus fechas y sus cambios, aunque ya se hayan leído. Cada apertura consulta el historial publicado y comienza por la versión más reciente. Este acceso sigue visible cuando el historial está vacío o falla la carga; muestra un mensaje y permite volver a cargarlo con **Actualizar**.

Solo se cachean en el navegador el identificador, fecha y estado pendiente del recibo, separados por cuenta. No contiene PDF ni anotaciones. Si se cierra el aviso sin conexión, el recibo se reintenta al recuperar la conexión. Hasta que el servidor confirme la lectura, otro dispositivo puede mostrarla de nuevo. Un fallo de las notas o de su sincronización no bloquea el estudio.

La tabla `plano_release_receipts` y su RPC tienen RLS y acceso exclusivo del servidor, con las mismas cuotas del almacenamiento existente. La función `plano-cloud` verifica los tokens Firebase antes de leer o escribir el recibo. No es necesario migrar usuarios.

## Verificación

`node tests/patch-notes.cjs` usa Git real en un repositorio temporal, PostgreSQL WASM, JWT firmados y navegador. Verifica rangos de Push, registro editorial, resumen alternativo, reintentos, paquete estático, caché de recursos, permisos SQL, aislamiento de cuentas, lectura entre dispositivos, publicaciones omitidas, texto seguro, consulta manual, teclado, desconexión y pantallas de 320–1440 px. Define `PLANO_RUNTIME_MODULES` como el resto de pruebas; `PLANO_BROWSER=brave` permite repetir en Brave.

`tests/release-editorial.cjs` verifica la migración de versiones, agrupación de formatos, redacción histórica sin novedades repetidas y saltos definidos por el propietario. `tests/daily-releases.cjs` conserva la agrupación por día e idempotencia al reintentar una publicación.
