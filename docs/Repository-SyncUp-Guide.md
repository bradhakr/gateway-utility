# Repository SyncUp — User Guide

Bi-directional synchronisation between a Layer7 API Gateway and a GitHub repository.

---

## Table of Contents

1. [Overview](#1--overview)
2. [Prerequisites](#2--prerequisites)
3. [GitHub Config — Setting Up Repositories](#3--github-config--setting-up-repositories)
4. [Gateway → Git Workflow](#4--gateway--git-workflow)
5. [Git → Gateway Workflow](#5--git--gateway-workflow)
6. [API Endpoints Reference](#6--api-endpoints-reference)
7. [File Structure — Exploded Bundle Layout](#7--file-structure--exploded-bundle-layout)
8. [Troubleshooting](#8--troubleshooting)
9. [Security Notes](#9--security-notes)

---

## 1 — Overview

Repository SyncUp is a 4-step wizard that moves gateway entity definitions to and from a GitHub repository without requiring a local `git` installation. All GitHub communication goes through the GitHub REST API using a stored Personal Access Token (PAT).

### Gateway → Git

```
Gateway (export)
    │  graphman.sh export --using all
    ▼
Entity selection  (step 2 — choose individual items per type)
    │  POST /api/repo-sync/explode
    ▼
Explode preview   (step 3 — review file tree, deselect if needed)
    │  POST /api/repo-sync/push-to-github
    ▼
GitHub repository (one PUT per file via REST API)
```

### Git → Gateway

```
GitHub repository
    │  POST /api/repo-sync/list-repo-contents
    ▼
File browser      (step 2 — grouped by entity type folder)
    │  POST /api/repo-sync/pull-and-import
    ▼
Implode + Import  (step 3 review → step 4 result)
    │  graphman.sh implode → graphman.sh import
    ▼
Target Gateway
```

---

## 2 — Prerequisites

| Requirement | Details |
|-------------|---------|
| Configured gateway | At least one entry in `graphman.configuration` (set up via **Graphman Config**) |
| GitHub repository | Exists on GitHub and is accessible with your PAT |
| GitHub PAT | Created at [github.com → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens) |
| PAT scope (classic) | `repo` — gives read/write access to repository contents |
| PAT scope (fine-grained) | **Repository permissions → Contents: Read and write** |
| graphman-client | Installed and `graphmanHome` configured in `config.json` |

> The tool does **not** require `git` to be installed. All GitHub operations use the REST API directly.

---

## 3 — GitHub Config — Setting Up Repositories

Before using Repository SyncUp you must add at least one repository entry in **GitHub Config** (`/github-config`).

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| Name | Yes | Display name used in the Repository SyncUp dropdowns (e.g. `my-gw-policies`) |
| Owner | Yes | GitHub username or organisation name (e.g. `myorg`) |
| Repository | Yes | Repository name without owner (e.g. `gateway-policies`) |
| Default Branch | Yes | Branch that new files are pushed to by default (e.g. `main`) |
| Personal Access Token | Yes | PAT with `repo` or Contents Read & Write scope |
| Description | No | Free-text note for your own reference |

### PAT Security

- PATs are stored exclusively in `github-repos.json` on the server filesystem.
- `github-repos.json` is gitignored — it is **never committed** to source control.
- After saving, PATs are masked as `***` in all API responses to the browser.
- When you edit a repo entry and leave the PAT field as `***`, the existing PAT is preserved on the server.
- To rotate a PAT, edit the entry and paste the new token into the PAT field before saving.

### Saving Changes

Click **Save All** to persist your changes. The page shows an unsaved-changes warning if you attempt to navigate away before saving.

---

## 4 — Gateway → Git Workflow

### Step 1 — Setup

1. Set **Direction** to **Gateway → Git** (default).
2. Select a **Source Gateway** from the dropdown (populated from `graphman.configuration`).
3. Select a **Target Repository** from the dropdown (populated from `github-repos.json`).
4. Optionally change the **Schema Version** (defaults to `exportSchema` from `config.json`).
5. Click **Continue**.

The backend runs `graphman.sh export --using all` for the selected gateway and returns a full entity map.

### Step 2 — Select Entities

- Entity types are shown as expandable groups (e.g. `webApiServices`, `policyFragments`).
- Each group shows the item count and a **Select All / Deselect All** toggle.
- Expand a group to see individual items and toggle them independently.
- Only selected items are included in the export bundle sent to the explode step.
- Click **Preview Exploded Files** to proceed.

### Step 3 — Preview & Commit

- The exploded file tree is displayed in a table showing relative path, entity type, and file size.
- Deselect individual files you do not want to push.
- Enter a **Commit Message** and optionally change the **Branch** (defaults to the repository's default branch).
- Click **Push to GitHub** to send each file via GitHub REST API.

> Each file is pushed as a separate API call. An existing file is updated (using its current SHA); a new file is created. All calls use the same commit message.

### Step 4 — Result

- A results table shows each file with a ✓ or ✗ status and the GitHub API response.
- Files that already existed at the same content are silently accepted by GitHub (no error).
- Click **Start Over** to return to step 1.

---

## 5 — Git → Gateway Workflow

### Step 1 — Setup

1. Set **Direction** to **Git → Gateway**.
2. Select a **Source Repository** from the dropdown.
3. Select a **Target Gateway** from the dropdown.
4. Click **Continue**.

The backend fetches the full repository tree via `GET /repos/{owner}/{repo}/git/trees/{sha}?recursive=1`.

### Step 2 — Browse Repository

- Files are grouped by the top-level directory in the repository (which corresponds to entity type, e.g. `webApiServices/`, `policyFragments/`).
- Only directories matching known Graphman entity folder names are shown.
- Expand a group to see individual files. Use **Select All / Deselect All** per group.
- Click **Review Selection** to proceed.

### Step 3 — Review & Import

- A read-only list of the selected files is shown for final confirmation.
- Click **Import to Gateway** to start the process.

The backend:
1. Downloads each selected file from GitHub using `GET /repos/{owner}/{repo}/contents/{path}`.
2. Writes all files to a temporary directory (`response/syncup_tmp_*/implode/`).
3. Runs `graphman.sh implode` to assemble a Graphman bundle from the directory.
4. Runs `graphman.sh import` to import the bundle into the target gateway.

### Step 4 — Result

- Shows success or failure for the overall import operation.
- The full graphman import log is displayed.
- Any per-file download errors (step 1) are listed separately.
- Click **Start Over** to return to step 1.

---

## 6 — API Endpoints Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/github-repos` | Read `github-repos.json` — PATs masked as `***` |
| POST | `/api/github-repos-save` | Write `github-repos.json` — preserves existing PAT when `***` is submitted |
| POST | `/api/repo-sync/export-selected` | Export full bundle from a gateway; return entity map for step 2 selection |
| POST | `/api/repo-sync/explode` | Explode a filtered bundle (level 2); return flat file list; keep temp dir alive |
| POST | `/api/repo-sync/push-to-github` | Push each selected file to GitHub via REST API; clean up temp dir |
| POST | `/api/repo-sync/list-repo-contents` | Fetch repo tree from GitHub; return files grouped by entity type folder |
| POST | `/api/repo-sync/pull-and-import` | Download selected files, implode, import to gateway; clean up temp dir |

### Request / Response Shapes

**`POST /api/repo-sync/export-selected`**
```json
{ "gateway": "my-gateway", "schema": "v11.2.1" }
```
Returns: `{ "entityMap": { "webApiServices": [...], "policyFragments": [...] } }`

**`POST /api/repo-sync/explode`**
```json
{ "bundle": { "webApiServices": [...] }, "schema": "v11.2.1" }
```
Returns: `{ "files": [{ "relPath": "webApiServices/my-api.json", "entityType": "webApiServices", "sizeBytes": 1234, "tmpDir": "syncup_tmp_1717000000000" }] }`

**`POST /api/repo-sync/push-to-github`**
```json
{
  "repoName": "my-gw-policies",
  "tmpDir": "syncup_tmp_1717000000000",
  "selectedFiles": ["webApiServices/my-api.json"],
  "commitMessage": "chore: sync gateway policies",
  "branch": "main"
}
```
Returns: `{ "results": [{ "file": "webApiServices/my-api.json", "ok": true, "status": 201 }] }`

**`POST /api/repo-sync/list-repo-contents`**
```json
{ "repoName": "my-gw-policies" }
```
Returns: `{ "groups": { "webApiServices": [{ "path": "webApiServices/my-api.json", "size": 1234 }] } }`

**`POST /api/repo-sync/pull-and-import`**
```json
{
  "repoName": "my-gw-policies",
  "selectedPaths": ["webApiServices/my-api.json"],
  "gateway": "my-gateway",
  "schema": "v11.2.1"
}
```
Returns: `{ "ok": true, "log": "...", "downloadErrors": [] }`

---

## 7 — File Structure — Exploded Bundle Layout

The explode step uses `graphman.sh explode --options.level 2`, which extracts policy XML into separate files alongside the entity JSON. The resulting directory layout mirrors what the graphman-client uses natively:

```
response/syncup_tmp_<timestamp>/
└── exploded/
    ├── webApiServices/
    │   ├── my-service.json        ← entity metadata
    │   └── my-service/
    │       └── policy.xml         ← extracted policy XML (level 2)
    ├── policyFragments/
    │   ├── my-fragment.json
    │   └── my-fragment/
    │       └── policy.xml
    └── clusterProperties/
        └── my-property.json
```

This layout is exactly what `graphman.sh implode` expects on the Git → Gateway path, making round-trips lossless.

---

## 8 — Troubleshooting

### Export fails with "gateway not found"

- Check that the selected gateway alias exists in `graphman.configuration`.
- Open **Graphman Config** and verify the gateway entry is saved correctly.
- Use **Entity Inspector → Test Gateway** to confirm connectivity.

### Push fails with 401 Unauthorized

- The PAT stored for this repo has expired or been revoked.
- Open **GitHub Config**, edit the entry, paste a new PAT, and save.

### Push fails with 422 Unprocessable Entity

- Usually means the branch does not exist on the remote.
- Create the branch in GitHub first, or change the branch name in step 3 to an existing branch.

### Push fails with `ERR_UNESCAPED_CHARACTERS`

- This should not happen in the current implementation — all path segments are individually URL-encoded.
- If it occurs, file a bug. Include the full file path that triggered the error.

### Import fails — "implode produced no bundle"

- The selected files may not represent a complete or valid Graphman entity structure.
- Ensure the repository was originally created by Repository SyncUp (Gateway → Git), so the directory layout matches what `graphman.sh implode` expects.

### "No entity folders found" in Git → Gateway step 2

- The repository does not contain any top-level directories matching known Graphman entity type names (e.g. `webApiServices`, `policyFragments`).
- Check that the selected repository was exported via Repository SyncUp or has the expected structure.

### Temp directories not cleaned up

- Temp dirs are cleaned immediately after push or import.
- If the server was restarted mid-operation, orphaned `response/syncup_tmp_*/` directories are removed by the 24-hour cleanup routine on next startup.
- You can manually delete them: `rm -rf response/syncup_tmp_*`

---

## 9 — Security Notes

| Concern | Mitigation |
|---------|------------|
| PAT stored in plaintext on server | `github-repos.json` is gitignored and protected by OS file permissions. Do not expose the server filesystem. |
| PAT never sent to browser | All GitHub API calls are proxied through the Express BFF. The browser never receives the raw PAT. |
| PAT rotation (local dev) | Edit the repo entry in GitHub Config and paste the new token. Old tokens are overwritten on save. |
| PAT rotation (Kubernetes) | Update the `gateway-utility-github-repos` secret via `kubectl` and restart the pod. |
| Accidental commit of `github-repos.json` | File is in `.gitignore`. Run `git status` before any commit to confirm it is not staged. |
| Accidental commit of `k8s/github-repos-secret.yaml` | File is in `.gitignore`. Never force-add it. |
| Self-signed TLS on gateway | Controlled by `rejectUnauthorized` in `graphman.configuration`. Use `true` in production. |
| HTTPS for GitHub API | All GitHub calls use Node's built-in `https` module to `api.github.com` over TLS. |

### Kubernetes Deployment Notes

In a Kubernetes deployment, `github-repos.json` is mounted **read-only** from the `gateway-utility-github-repos` Secret. This means:

- The **GitHub Config UI** (`/github-config`) cannot save changes — it will return an error when running in-cluster.
- Repository entries are managed entirely via `kubectl` (same pattern as `graphman.configuration`).
- The secret is **optional** — if it does not exist, the pod starts normally and Repository SyncUp shows "no repositories configured".

```bash
# Create or update the secret from a local file
kubectl create secret generic gateway-utility-github-repos \
  --namespace gu-dev \
  --from-file=github-repos.json=/path/to/your/github-repos.json \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pod to pick up the updated secret
kubectl rollout restart deployment/gateway-utility -n gu-dev
```

See `k8s/github-repos-secret.yaml.template` for the full YAML template with field descriptions.

---

*For gateway setup, graphman-client installation, and auth configuration, see [README.md](../README.md).*
*For all API endpoints and navigation reference, see [Local-Env-Testing.md](./Local-Env-Testing.md).*
