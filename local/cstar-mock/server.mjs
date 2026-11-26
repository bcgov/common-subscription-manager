// Local stand-in for the two CSTAR lookups CHOSEN makes when tenant staff use its UI:
//
//   GET /api/v1/users/{ssoUserId}/tenants
//       -> { data: { tenants: [...] } }               404 if CSTAR doesn't know the user
//   GET /api/v1/tenants/{tenantId}/ssousers/{ssoUserId}/shared-service-roles
//       -> { data: { sharedServiceRoles: [...] } }    403 if the user isn't in that tenant
//   GET /health
//
// Response shapes follow what Notify's CSTAR client reads. Like the real API, every call needs
// a bearer token (the signed-in user's); this mock only checks that one is present.
// Memberships come from data.json.

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 3003)
const data = JSON.parse(readFileSync(new URL('./data.json', import.meta.url), 'utf8'))
const created = '2026-01-01T00:00:00.000Z'

const tenantView = (tenant) => ({
  ministryName: null,
  description: null,
  createdDateTime: created,
  updatedDateTime: created,
  createdBy: null,
  updatedBy: null,
  ...tenant,
})

const roleView = (name) => ({
  id: `local-role-${name.toLowerCase()}`,
  name,
  description: `${name} (local)`,
  createdDateTime: created,
  updatedDateTime: created,
  createdBy: null,
  updatedBy: null,
})

function userTenants(userId) {
  const memberships = data.members[userId]
  if (!memberships) return [404, { message: 'User not found' }]
  const tenants = data.tenants.filter((t) => t.id in memberships).map(tenantView)
  return [200, { data: { tenants } }]
}

function userRoles(tenantId, userId) {
  const roles = data.members[userId]?.[tenantId]
  if (!roles) return [403, { message: 'User is not a member of this tenant' }]
  return [200, { data: { sharedServiceRoles: roles.map(roleView) } }]
}

function route(req) {
  const { pathname } = new URL(req.url, 'http://cstar-mock')
  if (req.method === 'GET' && pathname === '/health') return [200, { status: 'ok' }]
  if (!/^Bearer \S+/.test(req.headers.authorization ?? '')) {
    return [401, { message: 'A bearer token is required' }]
  }
  if (req.method !== 'GET') return [404, { message: 'Not found' }]

  const tenants = /^\/api\/v1\/users\/([^/]+)\/tenants$/.exec(pathname)
  if (tenants) return userTenants(decodeURIComponent(tenants[1]))

  const roles = /^\/api\/v1\/tenants\/([^/]+)\/ssousers\/([^/]+)\/shared-service-roles$/.exec(pathname)
  if (roles) return userRoles(decodeURIComponent(roles[1]), decodeURIComponent(roles[2]))

  return [404, { message: 'Not found' }]
}

createServer((req, res) => {
  const [status, body] = route(req)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}).listen(port, () => {
  console.log(`CSTAR mock on :${port} with ${data.tenants.length} tenants`)
})
