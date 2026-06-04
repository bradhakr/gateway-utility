# Gateway Utility — React Console

A modern web-based console for Layer7 API Gateway management tasks, wrapping the existing Graphman automation scripts in a professional Broadcom-themed React UI.

## Navigation

The application requires login before accessing any tool. After authenticating you land on a dashboard that organises all tools into two sections.

### Tools

| Page | Route | Description |
|------|-------|-------------|
| **Find Assertions** | `/find-assertions` | Search all gateway services and policies for a specific assertion type. Export affected bundles, optionally replace the assertion with a newer version, and import the changes back — all in one workflow. |
| **Check Compliance** | `/check-compliance` | Audit every service and policy for correct Encapsulated Assertion (encass) usage. Results are clearly marked Compliant or Not Compliant, giving instant visibility of policy coverage and governance gaps. |
| **Keys & Certificates** | `/certificate-management` | Inspect trusted certificates and private keys. Each entry shows validity dates with colour-coded expiry alerts. Edit inline and stage changes; import individually or use the **staging bar** to select multiple edits and bulk-import them in one click. A coloured context bar shows which gateway (Source or Target) is active. Leaving the page with staged or unsaved edits triggers a navigation warning. **Trusted Certs:** all trust-setting toggles and the Base64 DER certificate field are editable. **Private Keys:** metadata fields (alias, keyType, subjectDn, etc.) are read-only — they are derived from the key material itself and cannot be changed in place. To replace a key, expand the **PKCS#12 Bundle (Base64)** or **PEM Private Key** field in the editor form and paste the new key material, then save and import. The certificate chain (`certChain`) is shown as a read-only PEM display alongside the key. |
| **Entity Inspector** | `/entity-updates` | Browse the full inventory of gateway entities (services, policies, encass configs, JDBC connections, and more) side-by-side across source and target gateways. Use the interactive form editor to edit entity fields and stage changes. Import individually or use the **staging bar** (amber checkboxes + "Import Selected") to bulk-import all staged edits in one click. A coloured context bar shows the active gateway. Leaving with staged or unsaved edits triggers a navigation warning. |
| **Entity Forge** | `/entity-forge` | Build a new gateway entity through a guided, schema-driven form. Smart type-aware controls populate the bundle automatically — no raw JSON editing required. Preview and import directly to a gateway. The form grows to its natural height for any schema size — simple types (e.g. ClusterProperty) display compactly; complex types with many nested fields (e.g. L7Policy, services) scroll via the main page with the live JSON preview panel staying visible as a sticky column alongside. |
| **Entity Browser** | `/entity-browser` | Query any gateway using built-in ByFilters GraphQL queries. Select an entity type, define field conditions, and retrieve matching entities in a live results table. Export results as JSON. Requires schema v11.2.0+. |
| **Bundle Import** | `/new-entity` | Upload or paste any valid Graphman JSON bundle and import it to a configured gateway. Entity types and item counts are listed automatically; import triggers in one click. |

### Configuration

| Page | Route | Description |
|------|-------|-------------|
| **App Config** | `/configuration` | Set gateway names, login URL, Graphman home path, default assertion type, and export/import schema versions. Saved to `config.json`. Navigating away with unsaved changes triggers a warning. |
| **Graphman Config** | `/graphman-config` | Add, edit, or remove gateway connection entries (address, credentials, TLS, `allowMutations`) and configure global Graphman runtime options. Reads and writes `graphman.configuration` directly. Navigating away with unsaved changes triggers a warning. |
| **Auth Config** | `/auth-setup` | Configure gateway basic-auth login endpoints and OIDC settings (discovery URL, client ID, scopes, redirect URIs). Intentionally reachable before login so auth misconfigurations can be corrected. |

### System

| Page | Route | Description |
|------|-------|-------------|
| **Login** | `/login` | Gateway login page — supports both basic-auth (username/password proxied through the BFF) and OIDC (PKCE authorization-code flow). |
| **Graphman Version** | `/graphman-version` | Displays the installed graphman client version, active schema, supported schemas, and extensions as reported by `graphman.sh version`. |

## Architecture

```
GatewayUtility/
├── server.js              # Express API + BFF (port 3002); OIDC, session, all REST endpoints
├── config.json            # App settings (graphmanHome, gateway names, schemas)
├── auth-config.json       # Auth settings (gateway login URLs, OIDC client config)
├── src/
│   ├── App.tsx            # React Router setup (createBrowserRouter); auth guards (ProtectedRoute / PublicOnlyRoute)
│   ├── context/
│   │   └── AuthContext.tsx  # Session state shared across the app (OIDC BFF)
│   ├── components/        # Header, Sidebar, Footer, Layout, NavigationBlocker (unsaved-changes modal)
│   ├── hooks/             # Shared React hooks — useDirtyGuard (navigation guard for unsaved changes)
│   └── pages/             # One file per page (15 pages total — see Navigation above)
├── response/              # Scratch dir — exported bundle data (spFolderSVCFull*.json), results
├── generated/             # Scratch dir — generated bundle files from Find Assertions
├── public/                # Static assets (broadcom.png, favicon)
└── dist/                  # Production build output (Vite + TypeScript)
```

`server.js` is fully self-contained — all scripts (`SearchAssertions.js`, `ExportBundles.js`, etc.) live in the same `GatewayUtility/` directory. There is no longer any dependency on a sibling `../Find-Assertions/` directory.

The Vite dev server proxies every `/api/*` request to `localhost:3002`.

Scratch directories (`response/` and `generated/`) are cleaned automatically on startup and every 24 hours — files older than 24 hours are removed.

## Running

### Development (hot reload)

```bash
cd ~/Documents/APIM/Graphman/Scripts/GatewayUtility
npm run dev
```

Opens the React app at **http://localhost:5173** with the API server running on **port 3002**.

### Production

```bash
npm run build    # TypeScript compile + Vite bundle → dist/
npm start        # Serve dist/ + API on port 3002
```

Then open **http://localhost:3002**.

## API Endpoints

### Health & Application Config

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health check — returns `{ status: "ok" }` |
| GET | `/api/config` | Read `config.json` (app settings) |
| POST | `/api/config` | Update `config.json` |
| GET | `/api/readme` | Serve the project `README.md` for the dashboard help panel |
| GET | `/api/graphman-version` | Run `graphman.sh version` and return parsed client/schema info |
| GET | `/api/graphman-config` | Read `graphman.configuration` — returns gateways without passwords |
| GET | `/api/graphman-config-full` | Read `graphman.configuration` — full content including passwords (used by Graphman Config editor) |
| POST | `/api/graphman-config-save` | Write full `graphman.configuration` back to disk |
| GET | `/api/schema/versions` | List all schema version directories under `graphmanHome/schema/` |
| GET | `/api/schema/describe` | List entity types, mutations, queries, and built-in queries for a schema version |
| GET | `/api/schema/type/:typeName` | Full field definition for a single entity type from schema metadata |
| GET | `/api/schema/query-filters/:queryName` | Parse filter types and entity fields for a named ByFilters query |

### Authentication (BFF — OIDC + gateway basic auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/config` | Read `auth-config.json` (client secret masked as `***`) |
| POST | `/api/auth/config` | Update `auth-config.json` (preserves existing secret if `***` is sent) |
| POST | `/api/auth/test-url` | Probe a URL for reachability; extracts TLS cert info (expiry, issuer, self-signed flag) |
| GET | `/api/auth/oidc-discover` | Proxy OIDC discovery document fetch (avoids browser CORS restrictions) |
| GET | `/api/auth/oidc-init` | Generate PKCE verifier/challenge, state, nonce; store in session; return authorization URL |
| POST | `/api/auth/token-exchange` | Exchange authorization code for tokens; validate ID token via JWKS; establish BFF session |
| GET | `/api/auth/session` | Return session status; performs periodic token introspection against the IDP |
| POST | `/api/auth/logout` | Destroy server-side session; return OIDC `end_session` URL if available |
| POST | `/api/gateway-login` | Proxy basic-auth login to the gateway REST login endpoint |
| POST | `/api/gateway-logoff` | Proxy logoff to the gateway REST logoff endpoint |

### Find Assertions workflow

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/export-all` | Run `graphman.sh export --using all` to fetch the full gateway bundle (source or target) |
| POST | `/api/search-assertions` | Run `SearchAssertions.js` — scan the bundle for a specific assertion type |
| POST | `/api/export-bundles` | Run `ExportBundles.js` — export matching service bundles from the source gateway |
| POST | `/api/replace-assertions` | Run `ReplaceAssertions.js` — rewrite assertion type in generated bundles |
| POST | `/api/import-bundles` | Run `ImportBundles.js` — import modified bundles to the target gateway |
| GET | `/api/results` | List `*-results.json` files in `response/` sorted by modification time |
| GET | `/api/results/:filename` | Return the content of a specific result file |
| GET | `/api/input-data` | Return stats from `response/spFolderSVCFull.json` (service/policy counts, hostname) |

### Compliance

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/encass-configs` | List all Encapsulated Assertion configs from the loaded source bundle |
| POST | `/api/encass-compliance` | Audit all services and policies for use of a specified encass by name |
| POST | `/api/compliance-check` | Multi-assertion audit — check for presence of any set of assertion types |

### Entity Inspector & Import

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/entities` | List all non-empty entity type keys from the source or target bundle |
| GET | `/api/entities/:entityType` | Return all items for a specific entity type from source or target bundle |
| POST | `/api/entity-import` | Write a single edited entity to a temp bundle and import it to the target gateway |
| POST | `/api/bundle-import-raw` | Accept a full Graphman JSON bundle string and import it to a named gateway |
| POST | `/api/gateway-test` | Direct GraphQL connectivity probe (`{ __typename }`) against a named gateway |
| POST | `/api/gateway-query` | Execute a ByFilters GraphQL query with field conditions against a live gateway |

### Entity Forge

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/entity-forge` | Validate and import a schema-built entity bundle to a named gateway |

### Keys & Certificates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/certificates` | Extract trusted cert and private key data from `spFolderSVCFull.json` (legacy endpoint) |
| GET | `/api/keys-certs/:entityType` | Return enriched cert/key items (`trustedCerts`, `keys`, or `sslKeys`) with parsed X.509 validity dates |

### Generated Bundles

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/bundles` | List JSON bundle files in `generated/` |
| GET | `/api/bundles/:filename` | Return the content of a specific generated bundle file |

## Prerequisites

- **Node.js v15.6+** — `X509Certificate` (used to parse certificate validity dates from trusted cert `certBase64` fields) requires Node 15.6 or later.
- **graphman-client** — the graphman CLI must be installed and accessible. The path is configured via `graphmanHome` in `config.json` (default: `../../graphman-client-main` relative to `GatewayUtility/`).
- **`graphman.configuration`** — a valid graphman configuration file with at least one gateway entry (address, username, password). Located at `<graphmanHome>/graphman.configuration` or `GatewayUtility/graphman.configuration`.
- **`config.json`** — created automatically with blank defaults on first run. Update via the **App Config** page or edit directly. Key fields: `graphmanHome`, `sourceGateway`, `targetGateway`, `exportSchema`, `importSchema`.
- **`auth-config.json`** (optional) — configure via the **Auth Config** page. Required only when using gateway basic-auth login or OIDC SSO. Contains `gateway.loginUrl`, `gateway.logoffUrl`, and OIDC client settings.
- **Bundle data** — most tools (Compliance, Keys & Certificates, Entity Inspector) read from `response/spFolderSVCFull.json`. This file is generated by running **Export All** in the Find Assertions or Entity Inspector pages, or by running `graphman.sh export --using all` manually.
