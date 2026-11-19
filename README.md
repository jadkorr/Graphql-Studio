# ◆ GraphQL Studio

A local GraphQL schema explorer and client. Load `.graphql` schemas, explore them as an interactive graph, build operations with a visual query builder, and send requests with custom headers — directly, through a built-in local proxy, or chained through an upstream proxy such as Burp Suite.

> Versión en español: [README.es.md](README.es.md)

## Quick start

Requires Node.js 20+.

```bash
npm install
npm run dev     # proxy (port 4100) + UI with hot reload → http://localhost:5173
```

Production mode (single process):

```bash
npm start       # build + serve → http://127.0.0.1:4100
```

Background mode with helper scripts (PID and log in `.run/`):

```bash
./start.sh        # build + serve in background → http://127.0.0.1:4100
./start.sh dev    # dev mode in background → http://localhost:5173
./stop.sh         # stop it
```

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4100` | Port for the proxy server and the built UI |
| `HOST` | `127.0.0.1` | Bind address. The default only listens on localhost |
| `ALLOWED_HOSTS` | — | Extra comma-separated `host:port` values allowed to call the API |

## Features

### Schemas

- Drag and drop one or more `.graphql`, `.graphqls`, `.gql` files or an introspection JSON result into the window.
- Paste SDL directly, or fetch the schema from the endpoint via introspection (asks for confirmation first).
- Keep several schemas loaded at once and rename, delete or switch between them.
- Schemas, tabs, headers and settings persist in the browser's `localStorage`.

### Schema view

- Type list with search and kind filters (Object, Input, Enum, Interface, Union, Scalar).
- Interactive graph of the selected type, with depth 1–3. Optional toggles add incoming references, input types used by arguments, and enums.
- Hovering a node highlights its connections. Clicking a node navigates to it.
- Type documentation panel with fields, arguments, enum values, implementations and a **Used by** section.
- **▶ Try** on any `Query` / `Mutation` field generates a ready-to-run operation (selection set and variables) and opens it in a new tab.

### Visual builder

- Checkbox tree in the style of graphiql-explorer, synced both ways with the editor.
- Arguments become typed variables (`$input: Foo!`) with a JSON skeleton of the required fields. Required arguments are added automatically.
- Unions and interfaces generate `... on Type` inline fragments.
- **Auto depth (1–5)**: when a field is checked, all scalar fields are selected and the builder descends N levels into nested objects. Fields with required arguments, deprecated fields and type cycles are skipped, and selections are capped at 600 fields.
- Optional `__typename` on every level, matching Apollo Client output.
- **✨ Complete** refills the subtree of an already selected field.
- New operations are named after the first selected field (e.g. checking `createUser` names the operation `CreateUser`).

### Editor and requests

- CodeMirror 6 with schema-aware autocomplete, linting and validation. `⌘/Ctrl+Enter` runs and `⇧⌘P` formats.
- Multiple tabs, and an operation picker when a document contains several operations.
- Endpoint URL, POST/GET, JSON variables, timeout and cancel.
- `operationName` is always sent when the operation is named, with the body in Apollo key order (`operationName`, `variables`, `query`).
- **Copy as cURL**, including `-x` / `-k` when an upstream proxy or insecure TLS is enabled.
- **Clear** (editor toolbar and Builder) empties the operation, variables and response of the tab in one click, with an **Undo** button in the notification.

### Headers

- **Headers** button next to the URL bar opens a full editor. The same editor is also available below the query editor.
- Any number of headers, each of which can be toggled on or off. Sensitive values are masked, and invalid header names are highlighted in red.
- Paste a `Key: value` block into any header-name field, or use **Paste block**, to create all rows at once. If a full raw HTTP request is pasted, only its headers are kept.
- Text mode for bulk editing. Lines starting with `//` are disabled.
- **Dynamic values** are resolved per request from the operation being sent, with a live preview:

  | Template | Resolves to |
  | --- | --- |
  | `{{operationType}}` | `query`, `mutation` or `subscription` |
  | `{{operationName}}` | The operation name |
  | `{{variables}}` | Variables as compact JSON |

  ```text
  X-Operation-Type: {{operationType}}
  X-Operation-Name: {{operationName}}
  X-Variables: {{variables}}
  ```

### Import request

The **📥** button next to the URL bar accepts a raw HTTP request (Burp → *Copy request*) or a cURL command, and loads:

- the endpoint URL and method;
- all headers, except `Host`, `Content-Length`, `Connection` and invalid names;
- the query, variables and `operationName`, into a new tab.

Header values that match the body's operation type, name or variables are converted into `{{…}}` templates automatically, so they stay correct when you switch operations.

### Response and history

- Highlighted JSON, status, timing, size, GraphQL error count, response headers, copy and download.
- **History → Sent (proxy)**: every request the proxy actually sent upstream, with sequence number, source (editor or introspection), state, status, timing and body.
- **History → History**: the last 100 operations run from the editor. Clicking an entry reopens it in a new tab.

### Preferences

The **⚙** button at the right of the top bar opens the preferences (saved in the browser):

- **Language**: English (default) or Spanish.
- **Theme**: Studio, Ocean, Forest, Ember, Graphite (dark) and Light. Editor syntax colours, the graph and type colours follow the theme.
- **Fonts**: interface font (Inter, Geist, IBM Plex Sans, Manrope, System) and code font (JetBrains Mono, Fira Code, Geist Mono, IBM Plex Mono, Source Code Pro, System). All fonts are bundled locally, with no external requests.
- **Editor font size** and **interface scale** (90–125%).

## Proxy modes

Configured in the connection selector at the right edge of the URL bar.

| Mode | Behaviour |
| --- | --- |
| **Local proxy** (default) | The browser posts to `POST /api/proxy` and the Node server forwards the request, so CORS does not apply |
| **Direct** | The browser calls the endpoint with `fetch`. The endpoint must allow CORS |
| **Upstream proxy** | The Node server routes traffic through an HTTP(S) proxy, e.g. Burp Suite at `http://127.0.0.1:8080`, mitmproxy, Charles or a corporate proxy |
| **Ignore TLS errors** | Accepts self-signed or intercepting certificates. Required for HTTPS through Burp, and turned on automatically when the upstream proxy is enabled |

### Using with Burp Suite

1. Open the connection selector and enable **Chain upstream proxy** with `http://127.0.0.1:8080`.
2. Keep **Ignore TLS errors** on so Burp's CA-signed certificates are accepted.
3. Requests appear under *Proxy → HTTP history*. With *Intercept* on, each request waits until it is forwarded in Burp.

### Request fidelity and traceability

- The proxy sends **only the headers you define**. It does not add `User-Agent`, `Accept-Language` or `Sec-Fetch-*`.
- Upstream connections always use **HTTP/1.1**, with no automatic retries. Responses are decompressed (gzip, deflate, br).
- Invalid header names are skipped and reported instead of failing the request.
- Each tab allows at most one request in flight. Cancelling also aborts the upstream connection.
- Pressing `Enter` in the URL bar does not send a request.
- **Marker header** (on by default, configurable): adds `X-GraphQL-Studio: req-<n>-<OperationName>` so tool traffic can be told apart from app traffic in Burp or server logs. `<n>` matches the number in *History → Sent (proxy)*. Turn it off to make requests byte-identical to the app's.

## Project structure

```text
server/index.js             Express + undici proxy (upstream ProxyAgent, HTTP/1.1, request log), serves dist/
src/App.tsx                 Layout, drag & drop, toasts
src/store.ts                Persistent global state (zustand)
src/lib/builder.ts          AST editing for the visual builder, auto-selection
src/lib/schema.ts           Schema building/caching, reverse references, variable skeletons
src/lib/request.ts          Sending (proxy/direct), header templates, introspection, cURL export
src/lib/importRequest.ts    Raw HTTP / cURL request parser
src/lib/useRun.ts           Run/cancel logic per tab
src/components/             TopBar, Workspace, Builder, DocsPanel, SchemaView, SchemaGraph,
                            HeadersEditor, ImportModal, ResponsePanel, HistoryPanel, …
```

## Built with

React, Vite, Tailwind CSS, [graphql-js](https://github.com/graphql/graphql-js), CodeMirror 6 with [cm6-graphql](https://github.com/graphql/graphiql/tree/main/packages/cm6-graphql), [React Flow](https://reactflow.dev), zustand, Express and [undici](https://github.com/nodejs/undici). All dependencies use permissive licenses (MIT or similar).

## Where your data lives

GraphQL Studio has no accounts, no telemetry and no cloud storage. Everything stays on your machine:

| Data | Stored in | Persisted |
| --- | --- | --- |
| Loaded schemas (`.graphql`, introspection JSON) | Browser `localStorage`, key `graphql-studio` — a **copy of the text**, not a link to the original file | Yes |
| Tabs, queries, variables | Browser `localStorage` | Yes |
| Headers, **including authorization tokens** | Browser `localStorage`, unencrypted | Yes |
| Endpoint URL, proxy settings, preferences | Browser `localStorage` | Yes |
| History (last 100 operations: query, variables, status, timing) | Browser `localStorage` | Yes |
| Responses | Browser memory only | No — gone on reload |
| Proxy log (*History → Sent*: last 300 requests: URL, method, operation name, first 2,000 characters of the body) | Server memory only. **Headers are never logged** | No — gone when the server stops |

- **Schema files are never uploaded.** The browser reads the file and keeps a copy of its text; the server never receives it. Editing or deleting the original file does not affect the loaded copy — load it again to update it.
- **The server writes nothing to disk** besides its own log file (`.run/studio.log`, startup messages only).
- **The only outgoing traffic** is the requests you send to your endpoint (directly or through the upstream proxy you configure). Fonts and all assets are bundled locally.
- **Storage is per browser and per address**: `http://127.0.0.1:4100` (`./start.sh`) and `http://localhost:5173` (`./start.sh dev`) keep separate data, as do different browsers or private windows.
- **Nothing of this goes into git**: none of it lives in the project folder.
- **To delete everything**: remove schemas from the schema menu and clear the history, or clear the site data in your browser (DevTools → Application → Storage → *Clear site data*). Stopping the server clears the proxy log.

## Security

The local server is an HTTP forwarder by design, so it is locked down to the local UI:

- **Loopback only**: binds to `127.0.0.1` by default. Setting `HOST` to anything else prints a warning — anyone who can reach the port could use it as a proxy.
- **Only the local UI can call the API**:
  - the `Host` header must be one of the app's own addresses, which blocks DNS-rebinding attacks;
  - requests carrying a foreign `Origin` or `Sec-Fetch-Site: cross-site` are rejected, so other websites open in your browser cannot use the proxy (CSRF) or read the proxy log;
  - `POST /api/proxy` only accepts `application/json`.
- **Input validation**: only `GET`/`POST`, `http(s)` endpoint and upstream proxy URLs, RFC 7230 header names, CR/LF stripped from header values, timeout clamped to 1–600 s.
- **Resource limits**: 25 MB request body, 50 MB upstream response, 200 MB after decompression (protects against compression bombs).
- **Browser hardening**: Content-Security-Policy (`script-src 'self'`, no framing), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`. The UI renders all data as text (no HTML injection sinks).
- `npm audit` reports no known vulnerabilities in the dependencies.

Keep in mind:

- **Ignore TLS errors** disables certificate validation for upstream connections. Use it only with an intercepting proxy you control (e.g. Burp).
- Tokens in `localStorage` are readable by anyone with access to your browser profile. **Copy as cURL** includes them in plain text.
- If you need to reach the API from another host name, add it with `ALLOWED_HOSTS=host:port`.
- Use this tool only against systems you are authorized to test.

## License

Copyright © 2026 jadkorr. See [LICENSE](LICENSE).
