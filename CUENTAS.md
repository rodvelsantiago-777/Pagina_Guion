# Activar las cuentas de PLANO

La web continúa en GitHub Pages. Firebase Authentication gestiona usuarios, contraseñas, sesiones, confirmación de correo y recuperación. El código ya está conectado a la app web **planos-15624** con los datos públicos proporcionados. Authentication debe tener habilitado Email/Password y autorizado el dominio de GitHub Pages. `node tools/check-accounts.cjs` permite comprobar esos dos ajustes sin crear usuarios ni enviar correos.

La primera pantalla es el acceso al estudio, con **Crear cuenta** e **Iniciar sesión**. El editor no se muestra hasta tener una sesión con el correo verificado. No hay acceso como invitado ni una opción de continuar sin cuenta. Si la configuración o la conexión falla, la pantalla mantiene el editor cerrado y ofrece reintentar. No crea usuarios ficticios ni guarda contraseñas en el navegador.

## 1. Crear el proyecto y registrar la web

1. Entra en https://console.firebase.google.com/ con tu cuenta de Google y crea un proyecto, por ejemplo **PLANO**. Google Analytics es opcional; esta integración no lo utiliza.
2. Dentro del proyecto, añade una aplicación **Web**, con el icono **</>**, y llámala PLANO. La web se seguirá publicando desde GitHub Pages.
3. Firebase muestra el objeto **firebaseConfig**. También puedes encontrarlo en **Configuración del proyecto → General → Tus apps → Web → Configuración del SDK**.
4. Copia sus valores `apiKey`, `authDomain`, `projectId` y `appId` al archivo `auth-config.js`, conservando las comillas. Puedes compartir ese objeto público para que Codex complete el archivo. No hacen falta la contraseña de Google, una cuenta de servicio, un archivo JSON de administración ni una clave privada.

Ejemplo de estructura (sustituye los textos por los datos de tu proyecto):

```js
globalThis.PlanoAuthConfig = Object.freeze({
  apiKey: "VALOR_DE_API_KEY",
  authDomain: "ID_DEL_PROYECTO.firebaseapp.com",
  projectId: "ID_DEL_PROYECTO",
  appId: "VALOR_DE_APP_ID"
});
```

Esta configuración identifica tu proyecto web y está diseñada para publicarse en el navegador. No concede acceso de administrador. Documentación: https://firebase.google.com/docs/projects/api-keys.

## 2. Habilitar el acceso por correo

1. Abre **Authentication**, pulsa empezar si se solicita y entra en **Sign-in method / Método de acceso**.
2. Activa **Email/Password / Correo electrónico y contraseña** y guarda.
3. En los ajustes de Authentication, configura la **política de contraseñas** para exigir al menos **12 caracteres**, igual que el formulario de la web. El inicio de sesión admite contraseñas existentes sin imponerles esa longitud desde el cliente.
4. En **Settings / Configuración → Authorized domains / Dominios autorizados**, añade **`rodvelsantiago-777.github.io`**. Se escribe solo el dominio, sin `https://` ni `/Pagina_Guion/`.
5. Para pruebas locales reales añade también `localhost` o `127.0.0.1`, según la dirección que vayas a utilizar. Estos dominios pueden no estar autorizados por defecto en proyectos nuevos.

Documentación: https://firebase.google.com/docs/auth/web/password-auth y https://firebase.google.com/docs/auth/web/manage-users.

## 3. Publicar y comprobar

1. En GitHub Desktop revisa los cambios, crea un commit y pulsa **Push origin**. Conserva la carpeta `vendor`: contiene los dos SDK de Firebase que usa la aplicación. Los archivos nuevos `auth-config.js`, `accounts.js` y `accounts.css` deben publicarse junto a `index.html`.
2. Espera a que termine el despliegue de Pages y recarga https://rodvelsantiago-777.github.io/Pagina_Guion/.
3. Al entrar verás directamente **Crear cuenta**. Escribe nombre, correo y contraseña y abre el enlace de verificación recibido. Si ya tienes una cuenta, usa la pestaña **Iniciar sesión**. Firebase ofrece su propio manejador de enlaces de correo; esta integración lo utiliza por defecto.
4. Vuelve a la web y pulsa **Ya he verificado mi correo**, o inicia sesión desde la pestaña a la que te lleve el enlace. Hasta verificar el correo, permanecerás en la pantalla de acceso. Una sesión verificada ya guardada permite entrar directamente al estudio al recargar.
5. Prueba cerrar sesión, volver a entrar y **He olvidado mi contraseña**. Comprueba la bandeja de entrada y spam. Los enlaces de correo incluyen una URL de retorno con la ruta completa del proyecto, de modo que funcionan bajo `/Pagina_Guion/`.
6. Los usuarios registrados aparecen en **Authentication → Users / Usuarios**. La consola permite gestionar cuentas y consultar la configuración del proveedor.

La configuración pública recibida ya se ha incorporado. La comprobación contra el servicio real es una consulta de configuración y un intento de acceso con datos inexistentes; no crea usuarios ni envía mensajes. Las pruebas automáticas de los flujos completos usan el SDK real con respuestas de red simuladas y no envían correos reales. El registro y los correos con un usuario real se deben probar después de activar el proveedor y autorizar el dominio. No se ha publicado el código automáticamente en GitHub.

## Qué incluye esta versión

- Registro con nombre, correo y contraseña y verificación del correo.
- Inicio de sesión y opción de mantenerla iniciada en el dispositivo. Sin marcarla, se usa la persistencia de sesión del navegador.
- Recuperación y cambio de contraseña por correo, con respuestas que no revelan si el correo solicitado está registrado.
- Reenvío de verificación con espera de 60 segundos y comprobación de verificación.
- Perfil con nombre, correo y cierre de sesión. Mensajes de error en español, protección contra envíos dobles y diseño claro/oscuro adaptable a móvil.
- Soporte para enlaces de acción `verifyEmail` y `resetPassword` si en el futuro se configura un manejador propio en la web. Valida los códigos con Firebase y elimina los parámetros de acción del historial; no utiliza una URL de retorno recibida para redirigir al usuario.

## Archivos y anotaciones

Las cuentas están en Firebase; **los PDF y las anotaciones siguen en este navegador**. No se ha activado Cloud Storage, Firestore ni sincronización. No se necesita una base de datos adicional para esta versión.

Cada usuario verificado tiene un espacio local de notas identificado por su UID de Firebase. Las notas de la versión antigua sin cuentas permanecen intactas bajo la clave `plano-notes-v1:`; no se trasladan automáticamente a otra identidad. Si tienes una copia JSON anterior, inicia sesión, abre el mismo PDF e importa la copia desde el menú del proyecto.

Al cambiar de identidad se cierra el documento y se vacía su historial de edición antes de activar el nuevo espacio. Las notas guardadas permanecen disponibles cuando vuelvas a entrar y abras ese PDF. Una exportación ya iniciada termina antes de cerrar el documento; los cambios voluntarios de cuenta se bloquean mientras se está editando un plano o exportando. Los cambios de sesión notificados por Firebase se procesan también sin mezclar los espacios.

La separación local organiza los datos entre cuentas; no cifra el almacenamiento del navegador ni constituye un control de acceso para datos alojados en un servidor. Una futura sincronización necesitará reglas de autorización del lado del servidor. Borrar los datos del navegador elimina las notas locales, así que las copias JSON siguen siendo útiles.

## Desarrollo y dependencias

`auth-config.js` contiene únicamente configuración pública. `accounts.js` carga los SDK oficiales Firebase **12.19.0** desde `vendor/` solo cuando hay configuración y la página está servida por HTTP/HTTPS. La autenticación real requiere conexión con los servicios de Firebase; abrir `index.html` con `file://` muestra la indicación de utilizar la web publicada o un servidor local y mantiene cerrado el editor.

El módulo de cuentas arranca por sí mismo, separado del editor. El editor registra sus funciones de cambio de usuario mediante `connectWorkspace`. Así, un error o una demora en `app.js` no deja sin respuesta los formularios de acceso. Los botones de envío muestran el estado de conexión y se habilitan cuando Firebase está preparado. Se mantiene oculta e inerte la interfaz del editor desde el HTML inicial; `upload()` comprueba también que exista un usuario verificado. Los recursos de cuentas y el controlador del editor llevan una versión en su URL para evitar mezclar archivos de distintos despliegues en la caché de GitHub Pages.

Para probar localmente, sirve esta carpeta por HTTP, por ejemplo con `python -m http.server 8765 --bind 127.0.0.1`, y abre `http://127.0.0.1:8765/`. Autoriza ese dominio en Firebase. No guardes credenciales de administración en esta carpeta pública.

`node tools/copy-firebase.cjs` vuelve a descargar los dos SDK desde el CDN oficial y su licencia. `node tests/accounts.cjs` ejecuta la prueba automatizada, con Node.js, Playwright, pdf-lib y Microsoft Edge; `PLANO_RUNTIME_MODULES` indica dónde están esas dependencias. No necesita un proyecto Firebase real. Prueba el SDK contra una API simulada para registro, correo verificado/no verificado, recuperación, errores, persistencia, separación de dos cuentas, conservación de notas antiguas, enlaces de acción, ausencia de contraseñas almacenadas e interfaz móvil. Comprueba la primera pantalla obligatoria, que Escape no permita entrar, la guardia de importación sin sesión, el arranque de cuentas con el editor averiado y la recuperación tras fallar el SDK.

`node tests/accounts-live.cjs` presenta el código local bajo el origen HTTPS de Pages, sirviendo los archivos mediante interceptación de las solicitudes del navegador, y comprueba la conexión con Firebase real mediante un intento de acceso con datos inexistentes. No crea usuarios, no envía correos ni publica archivos. Las pruebas previas del editor usan `tests/editor-auth-fixture.cjs` para aislar sus herramientas de la autenticación; ese adaptador solo se sirve desde los tests y no es una opción de la aplicación.
