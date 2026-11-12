# FleetBridge

Private, local-first recruitment operations source and a separate **synthetic, read-only Vercel web preview**.

| Directory | Purpose |
|---|---|
| `apps/desktop/` | Windows FleetBridge V2.5 Desktop code (V2.4 backend + V2.5 UI) |
| `extensions/candidate-scout/` | Candidate Scout with corporate report-only popup |
| `extensions/discovery-profile14/` | Historical Discovery source; do not install/update automatically |
| `extensions/discovery-profile15/` | Historical Discovery source; do not install/update automatically |
| `web/` | Safe **synthetic-only, read-only** Vercel preview, separate from Windows data |
| `infra/sql/` | Draft cloud data model, not yet applied |
| `docs/` | Security checks, migration roadmap and manual deployment guide |
| `scripts/` | Guarded PowerShell publisher to a **private** GitHub repository |

## Safety

- Do not use the web preview for real candidate/contract data.
- Do not publish this repository publicly: private-by-default until code, licenses and data provenance are independently reviewed.
- The `1234` local PIN and in-memory sessions **must never** be used to secure a public deployment.
- A public browser-facing URL does **not** mean your CRM database has been migrated.
- Nothing here connects or changes your installed FleetBridge, Chrome profiles or original backups.

Read [docs/DEPLOY.md](docs/DEPLOY.md) and [docs/SECURITY.md](docs/SECURITY.md) before pushing or deploying.
