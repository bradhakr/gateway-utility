# Gateway Utility — Config File Write Options

**Problem:** The application returns `EROFS: read-only file system, open '/app/config.json'` when attempting to save configuration changes from within the running pod.

**Root cause:** Both `config.json` and `auth-config.json` are mounted from the `gateway-utility-config` ConfigMap with `readOnly: true` in `k8s/deployment.yaml`. Kubernetes projects ConfigMap data into the container via a bind mount, which is inherently read-only at the kernel level. The `readOnly: true` flag makes this explicit.

---

## Option 1 — Remove `readOnly: true` (Quick Fix)

**What it does:** Makes the mounted files writable inside the container for the lifetime of the pod.

**Trade-off:** With a `subPath` mount, Kubernetes writes go into the container's overlay filesystem — not back into the ConfigMap. Changes work immediately while the pod is running but are **lost on every pod restart**. The ConfigMap itself is never updated.

**Best for:** Quick unblocking or short-lived testing where config changes only need to survive the current session.

### Change required in `k8s/deployment.yaml`

Remove the two `readOnly: true` lines from the ConfigMap volumeMounts:

```yaml
# BEFORE
volumeMounts:
  - name: config-json
    mountPath: /app/config.json
    subPath: config.json
    readOnly: true              # ← remove this line

  - name: config-json
    mountPath: /app/auth-config.json
    subPath: auth-config.json
    readOnly: true              # ← remove this line
```

```yaml
# AFTER
volumeMounts:
  - name: config-json
    mountPath: /app/config.json
    subPath: config.json

  - name: config-json
    mountPath: /app/auth-config.json
    subPath: auth-config.json
```

### Apply

```bash
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/deployment.yaml | kubectl apply -f -
kubectl rollout restart deployment/gateway-utility -n gu-dev
```

---

## Option 2 — emptyDir + initContainer (Writable, Survives Pod Lifetime)

**What it does:** Adds an init container that copies the ConfigMap values into a writable `emptyDir` volume at pod startup. The main container mounts the `emptyDir` instead of the ConfigMap directly, so writes succeed.

**Trade-off:** Changes persist as long as the pod is alive (including across in-app saves). They are lost on pod restart — the init container re-copies the ConfigMap values. To make a change permanent, update the ConfigMap and restart (Option 3).

**Best for:** An internal utility where the UI config editor needs to work during a working session, but the ConfigMap remains the authoritative source for permanent values.

### Changes required in `k8s/deployment.yaml`

#### 1 — Add an `initContainers` block (before `containers:`)

```yaml
      initContainers:
        - name: config-init
          image: busybox:1.36
          command:
            - sh
            - -c
            - >
              cp /config-source/config.json /config-writable/config.json &&
              cp /config-source/auth-config.json /config-writable/auth-config.json
          volumeMounts:
            - name: config-json
              mountPath: /config-source
              readOnly: true
            - name: config-writable
              mountPath: /config-writable
```

#### 2 — Change the main container's config volumeMounts to use `config-writable`

```yaml
# BEFORE — ConfigMap mounts (readOnly)
          volumeMounts:
            - name: config-json
              mountPath: /app/config.json
              subPath: config.json
              readOnly: true

            - name: config-json
              mountPath: /app/auth-config.json
              subPath: auth-config.json
              readOnly: true
```

```yaml
# AFTER — emptyDir mounts (writable)
          volumeMounts:
            - name: config-writable
              mountPath: /app/config.json
              subPath: config.json

            - name: config-writable
              mountPath: /app/auth-config.json
              subPath: auth-config.json
```

#### 3 — Add the `config-writable` emptyDir volume (under `volumes:`)

```yaml
      volumes:
        - name: config-json
          configMap:
            name: gateway-utility-config

        - name: config-writable      # ← add this
          emptyDir: {}

        # ... rest of existing volumes unchanged
```

### Apply

```bash
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/deployment.yaml | kubectl apply -f -
kubectl rollout restart deployment/gateway-utility -n gu-dev
```

---

## Option 3 — Update the ConfigMap Directly (Kubernetes-Native, Permanent)

**What it does:** Keeps `deployment.yaml` unchanged (files remain read-only inside the pod). Configuration is changed externally by updating the ConfigMap, then triggering a rolling restart to load the new values.

**Trade-off:** The in-app config editor cannot save to disk — that feature does not work under this model. All config changes must be made by an operator via `kubectl` or by re-applying the ConfigMap manifest. This is the correct production approach.

**Best for:** Production deployments managed by an operator, where config changes go through a controlled process (Git → apply → restart).

### How to update configuration

#### Edit `k8s/configmap.yaml` locally, then apply it:

```bash
# DEV
sed 's/namespace: gateway-utility/namespace: gu-dev/' k8s/configmap.yaml | kubectl apply -f -
kubectl rollout restart deployment/gateway-utility -n gu-dev

# PROD
sed 's/namespace: gateway-utility/namespace: gu-prod/' k8s/configmap.yaml | kubectl apply -f -
kubectl rollout restart deployment/gateway-utility -n gu-prod
```

#### Or edit the ConfigMap live (for a quick one-off change):

```bash
kubectl edit configmap gateway-utility-config -n gu-dev
# Edit in-place, save and exit — Kubernetes updates the ConfigMap immediately.
# The pod does NOT auto-reload; trigger a restart to pick up the change:
kubectl rollout restart deployment/gateway-utility -n gu-dev
```

---

## Comparison Summary

| | Option 1 | Option 2 | Option 3 |
|---|---|---|---|
| **In-app config editor works** | Yes | Yes | No |
| **Changes survive pod restart** | No | No | Yes (permanent) |
| **ConfigMap updated** | No | No | Yes |
| **Deployment change required** | Remove `readOnly: true` | Add initContainer + emptyDir | None |
| **Recommended for** | Quick testing | Day-to-day dev use | Production |
