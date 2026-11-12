'use strict';
// Single Vercel Function for the synthetic, read-only preview.
// Each original handler is kept under lib/api-handlers; no real CRM data is accessed.
const {send} = require('../lib/demo');
const routes = Object.freeze({
  "atlas-custom": require('../lib/api-handlers/atlas-custom.js'),
  "atlas-prospect": require('../lib/api-handlers/atlas-prospect.js'),
  "atlas-prospects": require('../lib/api-handlers/atlas-prospects.js'),
  "auth/login": require('../lib/api-handlers/auth-login.js'),
  "auth/logout": require('../lib/api-handlers/auth-logout.js'),
  "auth/status": require('../lib/api-handlers/auth-status.js'),
  "candidate": require('../lib/api-handlers/candidate.js'),
  "candidates": require('../lib/api-handlers/candidates.js'),
  "contracts": require('../lib/api-handlers/contracts.js'),
  "establishments": require('../lib/api-handlers/establishments.js'),
  "export": require('../lib/api-handlers/export.js'),
  "health": require('../lib/api-handlers/health.js'),
  "import": require('../lib/api-handlers/import.js'),
  "pair-code": require('../lib/api-handlers/pair-code.js'),
  "pair": require('../lib/api-handlers/pair.js'),
  "sync": require('../lib/api-handlers/sync.js'),
});
function requestedRoute(req) {
  // In Vercel, vercel.json rewrites set the route query parameter.
  // In the standalone dev server the route is taken from the original path.
  const localPath = new URL(req.url || '/', 'http://localhost').pathname;
  const original = localPath.startsWith('/api/') ? localPath.slice(5) : '';
  if (original && original !== 'gateway') return original;
  const queryRoute = req.query && req.query.route;
  if (typeof queryRoute === 'string') return queryRoute;
  if (Array.isArray(queryRoute)) return '';
  return new URL(req.url || '/', 'http://localhost').searchParams.get('route') || '';
}
module.exports = function gateway(req, res) {
  const route = requestedRoute(req);
  if (!Object.prototype.hasOwnProperty.call(routes,route)) {
    return send(req,res,{error:'Unknown FleetBridge preview API route.'},404);
  }
  return routes[route](req,res);
};
