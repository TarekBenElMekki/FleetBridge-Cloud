# Publish and preview on Vercel

## Step 1 — Review package locally

Extract the ZIP to a separate folder. The source files were composed from the uploaded V2.4 Desktop, V2.5 UI and Candidate Scout UI patch; no local database files were added.

Run `powershell -ExecutionPolicy Bypass -File .\scripts\Publish-Private-GitHub.ps1` from the extracted repo root after reading the security report. This script will ask you to log into GitHub CLI, review files and confirm before pushing a **private** repository.

## Step 2 — Deploy synthetic preview (no real candidates)

1. Open https://vercel.com/new and connect your GitHub account.
2. Import your **private** `FleetBridge` repository.
3. Set **Root Directory** to `web`.
4. Framework preset: **Other**; no build command required.
5. Deploy. Vercel generates a preview URL.
6. Open the URL; the app should visibly state **Preview · synthetic data · read only**.

No secret environment variables or database connection are required for the demo. It deliberately rejects writes and has no database. Keep Preview Deployment Protection enabled if you don't intend to share it.

**Important:** This is not a hosted copy of your operational CRM. It shows the V2.5 interface, local operator atlas, five fictitious candidates and three fictitious contracts.

## Step 3 — Production architecture (not implemented yet)

- Introduce a managed PostgreSQL database and server-side validation.
- Use a tested identity provider with MFA, secure session cookies, authorization, and audit events.
- Implement a per-user API, RBAC and consent-aware data retention.
- Migrate candidate and contract data through a locally run, audited export; never commit it.
- Rework Chrome extension pairing for the verified cloud origin rather than reusing local pairing tokens.
- Validate data mapping, backups, restore and a reversible cutover. Keep Desktop local-only until then.

Vercel does not provide a persistent writable SQLite filesystem. Pro is recommended for business use; verify current pricing and deployment protection policy before enabling.
