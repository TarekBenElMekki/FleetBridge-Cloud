# Security boundary

**Repository preparation, not production approval.**

1. GitHub repository MUST be private. No candidate profiles, Chrome preferences, paired extension storage, SQLite files, backups, credentials or `.env` files in Git.
2. The source-only checks provided with this package are heuristic; **a human review is still required** before first push.
3. Chrome extensions are source snapshots; never remove/reinstall the current extension, since unpacked-extension IDs and storage can change.
4. The installed local Desktop has a PIN `1234` in preview defaults. This is NOT acceptable for remote access. The demo web app intentionally has no real data or private APIs.
5. **Do not** forward the original Desktop server port or tunnel the local SQLite service onto the internet.
6. Production requires user accounts, role-based access control, MFA, HTTPS, server-side authorization, auditing, backup/restore, retained source provenance, and encrypted managed PostgreSQL.
7. LinkedIn profile information may be personal data: determine lawful processing basis, retention, access, data-subject rights, and hosting-region obligations before migration.
8. Static web demo includes a limited public operator dataset and reference geography; validate licensing before public commercial distribution.
9. Never use a live LinkedIn account cookie, session token, or stored pairing key in the cloud deployment.

**Status as delivered:** Private-source candidate and synthetic read-only preview; **not** production CRM.
