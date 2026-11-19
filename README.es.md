# ◆ GraphQL Studio

Explorador y cliente GraphQL local: carga esquemas `.graphql`, visualízalos como grafo interactivo, construye operaciones con un builder visual y envía peticiones con headers personalizados, a través de un proxy local opcional.

## Inicio rápido

```bash
npm install
npm run dev        # proxy (4100) + UI con hot reload → http://localhost:5173
```

Modo producción (un solo proceso):

```bash
npm start          # build + servidor → http://127.0.0.1:4100
```

Variables: `PORT` (por defecto `4100`), `HOST` (por defecto `127.0.0.1`; solo escucha en localhost).

## Funcionalidades

| Área | Detalle |
| --- | --- |
| **Esquemas** | Arrastra uno o varios `.graphql` / `.graphqls` / `.gql` o JSON de introspección. También puedes pegar SDL u obtenerlo por introspección del endpoint. Admite varios esquemas a la vez (renombrar / eliminar / cambiar). Todo se guarda en `localStorage`. |
| **Vista Esquema** | Lista de tipos con búsqueda y filtros por tipo (Object, Input, Enum, Interface, Union, Scalar). Grafo interactivo con profundidad 1–3, referencias entrantes, inputs de argumentos y enums opcionales. Al pasar el cursor se resaltan las conexiones; al hacer clic se navega. Panel de documentación con «Usado por». |
| **Builder** | Árbol con checkboxes, similar a graphiql-explorer, sincronizado en ambos sentidos con el editor. Los argumentos se convierten en variables tipadas (`$input: Foo!`) y se genera un esqueleto JSON. Los argumentos requeridos se añaden solos, y unions/interfaces usan `... on Type`. |
| **Editor** | CodeMirror 6 con autocompletado, lint y validación contra el esquema. `⌘/Ctrl+Enter` ejecuta, `⇧⌘P` formatea. Soporta pestañas y la selección de operación cuando hay varias. |
| **Request** | URL, POST/GET, variables JSON, timeout, cancelación y copia como cURL. |
| **Headers** | Botón «Headers» junto a la URL. Admite varios headers activables y pegar un bloque `Header: valor` (se divide en filas). También edición como texto y valores sensibles ocultos. Los valores dinámicos `{{operationType}}`, `{{operationName}}` y `{{variables}}` se resuelven con la operación que se envía, con vista previa. |
| **Respuesta** | JSON resaltado, status, tiempo, tamaño, conteo de errores GraphQL, headers de respuesta y descarga. |
| **Historial** | Últimas 100 peticiones; un clic las reabre en una pestaña nueva. |

## Proxy

En el selector de conexión (a la derecha de la URL):

- **Proxy local** (por defecto): el navegador envía la petición a `POST /api/proxy` y el servidor Node la reenvía al endpoint. Así se evita CORS.
- **Directo**: `fetch` desde el navegador (requiere que el servidor permita CORS).
- **Encadenar proxy upstream**: el servidor Node sale por un proxy HTTP(S), por ejemplo Burp `http://127.0.0.1:8080`, mitmproxy o un proxy corporativo.
- **Ignorar errores TLS**: útil con certificados autofirmados o con un proxy que intercepta tráfico.

El cURL copiado incluye `-x` y `-k` cuando corresponde.

### Auditoría y trazabilidad

- **Header de marca** (activado por defecto; se configura en el selector de conexión): añade `X-GraphQL-Studio: req-<n>-<Operación>` para distinguir en Burp el tráfico de la tool del de la app. Desactívalo si necesitas que el request salga idéntico al de la app.
- **Historial → Enviado (proxy):** lista cada petición que el proxy envió realmente, con número, origen (editor o introspección), estado, status y tiempo. El número `<n>` coincide con el del header de marca.
- Cada pestaña tiene como máximo una petición en vuelo. Si cancelas, también se corta la conexión con el upstream.
- La introspección pide confirmación. `Enter` en la URL no envía nada.
- El proxy siempre usa HTTP/1.1, no hace reintentos y envía solo los headers definidos. Los nombres de header inválidos se omiten y se avisa de ello.

## Estructura

```text
server/index.js            proxy Express + undici (ProxyAgent) y servido de dist/
src/store.ts               estado global persistente (zustand)
src/lib/builder.ts         edición del AST para el builder visual
src/lib/schema.ts          construcción/caché de esquemas, referencias inversas, esqueletos
src/lib/request.ts         envío (proxy/directo), introspección, cURL
src/components/            TopBar, Workspace, Builder, DocsPanel, SchemaView, SchemaGraph, …
```

## Dónde se guardan tus datos

Todo queda en tu máquina; no hay cuentas, telemetría ni nube.

- **Esquemas cargados**: una **copia del texto** en el `localStorage` del navegador (clave `graphql-studio`). El archivo original no se sube a ningún sitio ni queda enlazado: si lo cambias, vuelve a cargarlo.
- **Pestañas, variables, historial (100 últimas), headers con tokens, ajustes y preferencias**: `localStorage` del navegador, sin cifrar.
- **Respuestas**: solo en memoria; se pierden al recargar.
- **Log del proxy** (*Historial → Enviado*): memoria del servidor, últimas 300 peticiones (URL, método, operación, primeros 2.000 caracteres del body). **Nunca guarda headers.** Se borra al parar el servidor.
- El almacenamiento es **por navegador y por dirección**: `127.0.0.1:4100` y `localhost:5173` tienen datos separados.
- Nada de esto está en la carpeta del proyecto, así que **no llega a git**.
- Para borrarlo todo: elimina los esquemas, limpia el historial o borra los datos del sitio en el navegador.

## Seguridad

- El servidor solo escucha en `127.0.0.1` y únicamente acepta peticiones de la propia interfaz (comprobación de `Host` contra DNS rebinding y de `Origin` / `Sec-Fetch-Site` contra CSRF).
- Validación de método, URLs y headers; límites de tamaño (respuesta 50 MB, 200 MB descomprimida) y timeout.
- Cabeceras de seguridad (CSP, `X-Frame-Options`, `nosniff`).
- «Ignorar errores TLS» desactiva la validación de certificados: úsalo solo con un proxy de interceptación propio.
- Usa esta herramienta solo contra sistemas que tengas autorización para probar.

Más detalle en el [README en inglés](README.md#security).

## Licencia

Copyright © 2026 jadkorr. Ver [LICENSE](LICENSE).
