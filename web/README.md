# FleetBridge Vercel preview

Deploy from this `web` root on Vercel. This app is **read-only**, carries only synthetic candidate and contract records, and has no persistent database. Do not use it for actual recruitment records. No authentication is claimed or provided in this preview.

Local dev (Node 20+): `npm run dev` then http://127.0.0.1:18760/.

`api/*` are stateless read-only Vercel Functions. No local SQLite, local server, PIN, pairing or real candidate data is in this web deployment.

The Atlas public source includes approximated geographic coordinates and an incomplete sourced heavy-truck starter directory; it is not a list of actual vacancies.
