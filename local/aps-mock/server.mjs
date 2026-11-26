// Local stand-in for the API Services Portal (APS) endpoints CHOSEN uses to issue client
// credentials. Issued credentials are real clients in the local Keycloak's apigw realm, so a
// service can exchange them for a token exactly as it would against BC Gov SSO.
//
// Implements only what CHOSEN calls:
//   POST /token                                                  service-account token
//   GET  /ds/api/v3/gateways/{gatewayId}/products                products and environments
//   POST /ds/api/v3/gateways/{gatewayId}/consumers               issue a consumer
//   PUT  /ds/api/v3/gateways/{gatewayId}/consumers/{id}?action=regenerate   rotate its secret
//   GET  /health
//
// Like the real API, there is no way to delete a consumer.

import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

const settings = {
  port: Number(process.env.PORT ?? 3002),
  gatewayId: process.env.APS_GATEWAY_ID ?? 'gw-local',
  environmentAppId: process.env.APS_ENVIRONMENT_APP_ID ?? 'LOCAL001',
  serviceAccountId: process.env.APS_CLIENT_ID ?? 'local-aps-service-account',
  serviceAccountSecret: process.env.APS_CLIENT_SECRET ?? 'local-aps-secret',
  audience: process.env.GATEWAY_AUDIENCE ?? 'ap-gw-local-default-local',
  // Keycloak as this container reaches it, and as the person's machine reaches it.
  keycloakUrl: process.env.KEYCLOAK_URL ?? 'http://keycloak:8080',
  publicKeycloakUrl: process.env.PUBLIC_KEYCLOAK_URL ?? 'http://localhost:4880',
  keycloakAdmin: process.env.KEYCLOAK_ADMIN ?? 'admin',
  keycloakAdminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin',
}

const REALM = 'apigw'
// Service-account tokens this mock has handed out. Local only, so memory is enough.
const issuedTokens = new Set()

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function keycloakAdminToken() {
  const response = await fetch(`${settings.keycloakUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: settings.keycloakAdmin,
      password: settings.keycloakAdminPassword,
    }),
  })
  if (!response.ok) throw new HttpError(502, `Keycloak admin login failed: HTTP ${response.status}`)
  return (await response.json()).access_token
}

async function keycloak(method, path, body) {
  const token = await keycloakAdminToken()
  const response = await fetch(`${settings.keycloakUrl}/admin/realms/${REALM}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    throw new HttpError(502, `Keycloak ${method} ${path} failed: HTTP ${response.status}`)
  }
  return response
}

async function findClient(clientId) {
  const response = await keycloak('GET', `/clients?clientId=${encodeURIComponent(clientId)}`)
  const [client] = await response.json()
  if (!client) throw new HttpError(404, `No consumer ${clientId}`)
  return client
}

function credentialResponse(clientId, clientSecret) {
  return {
    flow: 'client-credentials',
    clientId,
    clientSecret,
    tokenEndpoint: `${settings.publicKeycloakUrl}/realms/${REALM}/protocol/openid-connect/token`,
  }
}

async function issueConsumer(body) {
  if (body.environmentAppId !== settings.environmentAppId) {
    throw new HttpError(400, `Unknown environmentAppId ${body.environmentAppId}`)
  }
  if (!body.application?.name) throw new HttpError(400, 'application.name is required')

  // Real client IDs look like <environment appId>-<application appId>.
  const clientId = `${settings.environmentAppId}-${randomBytes(6).toString('hex').toUpperCase().slice(0, 11)}`
  await keycloak('POST', '/clients', {
    clientId,
    name: body.application.name,
    description: body.application.description,
    enabled: true,
    publicClient: false,
    serviceAccountsEnabled: true,
    standardFlowEnabled: false,
    directAccessGrantsEnabled: false,
    protocolMappers: [
      {
        name: 'gateway-audience',
        protocol: 'openid-connect',
        protocolMapper: 'oidc-audience-mapper',
        config: {
          'included.custom.audience': settings.audience,
          'access.token.claim': 'true',
          'id.token.claim': 'false',
        },
      },
    ],
  })
  const client = await findClient(clientId)
  const secret = await (await keycloak('GET', `/clients/${client.id}/client-secret`)).json()
  console.log(`Issued consumer ${clientId} for "${body.application.name}"`)
  return credentialResponse(clientId, secret.value)
}

async function regenerateConsumer(clientId) {
  const client = await findClient(clientId)
  const secret = await (await keycloak('POST', `/clients/${client.id}/client-secret`)).json()
  console.log(`Regenerated the secret for ${clientId}`)
  return credentialResponse(clientId, secret.value)
}

function issueServiceToken(form) {
  const params = new URLSearchParams(form)
  const valid =
    params.get('grant_type') === 'client_credentials' &&
    params.get('client_id') === settings.serviceAccountId &&
    params.get('client_secret') === settings.serviceAccountSecret
  if (!valid) throw new HttpError(401, 'invalid_client')
  const token = randomBytes(24).toString('hex')
  issuedTokens.add(token)
  return { access_token: token, token_type: 'Bearer', expires_in: 300 }
}

function requireServiceToken(req, gatewayId) {
  const token = req.headers.authorization?.replace(/^Bearer /, '')
  if (!token || !issuedTokens.has(token)) throw new HttpError(401, 'Missing or unknown token')
  // The real API scopes a service account to its gateway.
  if (gatewayId !== settings.gatewayId) {
    throw new HttpError(403, `Missing required scope: ${gatewayId}:CredentialIssuer.Generate`)
  }
}

const products = () => [
  {
    name: 'CHOSEN API',
    environments: [
      { name: 'local', flow: 'client-credentials', appId: settings.environmentAppId, active: true },
    ],
  },
]

async function route(req) {
  const url = new URL(req.url, 'http://aps-mock')
  if (req.method === 'GET' && url.pathname === '/health') return [200, { status: 'ok' }]
  if (req.method === 'POST' && url.pathname === '/token') {
    return [200, issueServiceToken(await readBody(req))]
  }

  const match = /^\/ds\/api\/v3\/gateways\/([^/]+)\/(products|consumers)(?:\/([^/]+))?$/.exec(url.pathname)
  if (!match) throw new HttpError(404, 'Not found')
  const [, gatewayId, resource, consumerId] = match
  requireServiceToken(req, gatewayId)

  if (resource === 'products' && req.method === 'GET') return [200, products()]
  if (resource === 'consumers' && !consumerId && req.method === 'POST') {
    return [201, await issueConsumer(JSON.parse((await readBody(req)) || '{}'))]
  }
  if (consumerId && req.method === 'PUT' && url.searchParams.get('action') === 'regenerate') {
    return [200, await regenerateConsumer(decodeURIComponent(consumerId))]
  }
  throw new HttpError(404, 'Not found')
}

createServer((req, res) => {
  route(req)
    .then(([status, body]) => send(res, status, body))
    .catch((error) => {
      const status = error instanceof HttpError ? error.status : 500
      if (status >= 500) console.error(error)
      send(res, status, { message: error.message })
    })
}).listen(settings.port, () => {
  console.log(`APS mock on :${settings.port} for ${settings.gatewayId} / ${settings.environmentAppId}`)
})
