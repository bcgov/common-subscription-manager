#!/usr/bin/env node
// One-off check that the API Services Portal issues client credentials the way CHOSEN's
// design assumes. Run it by hand with the CredentialIssuer.Generate service account:
//
//   read -s APS_CLIENT_SECRET && export APS_CLIENT_SECRET
//   APS_CLIENT_ID=<service account client id> node api-gateway/scripts/check-client-credentials.mjs
//
// It answers three questions:
//   1. Does issuing a consumer return a client secret and a token URL?
//   2. Does a token for that consumer carry its client ID as `azp`, with the expected audience?
//   3. Does regenerating rotate the secret, so the old one stops working and the new one works?
//
// It prints results only, never a secret. It leaves one consumer behind, named
// chosen-cc-check-<time>, because APS has no API to delete consumers; remove it on the
// portal's Consumers page afterwards.

const config = {
  apsTokenUrl:
    process.env.APS_TOKEN_URL ??
    'https://authz.apps.gov.bc.ca/auth/realms/aps/protocol/openid-connect/token',
  apsApiBaseUrl: process.env.APS_API_BASE_URL ?? 'https://api.gov.bc.ca/ds/api/v3',
  gatewayId: process.env.APS_GATEWAY_ID ?? 'gw-a88e8',
  environmentAppId: process.env.APS_ENVIRONMENT_APP_ID ?? 'D5C97345',
  expectedAudience: process.env.EXPECTED_AUDIENCE ?? 'ap-gw-a88e8-default-dev',
  clientId: process.env.APS_CLIENT_ID,
  clientSecret: process.env.APS_CLIENT_SECRET,
}

const results = []

function record(question, passed, detail) {
  results.push({ question, passed, detail })
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${question}${detail ? ` (${detail})` : ''}`)
}

// Error bodies from APS and Keycloak describe the problem; they don't echo secrets.
async function describeFailure(response) {
  const text = await response.text()
  return `HTTP ${response.status}: ${text.slice(0, 300)}`
}

async function requestToken(tokenUrl, clientId, clientSecret) {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!response.ok) {
    return { ok: false, detail: await describeFailure(response) }
  }
  const body = await response.json()
  return { ok: true, accessToken: body.access_token }
}

// Reads the token's claims without verifying it; this script only inspects what SSO issued.
function claimsOf(jwt) {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
}

async function apsRequest(serviceToken, method, path, body) {
  const response = await fetch(`${config.apsApiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${await describeFailure(response)}`)
  }
  return response.json()
}

function checkIssued(credential) {
  console.log(`      flow: ${credential.flow}`)
  console.log(`      clientId: ${credential.clientId}`)
  console.log(`      tokenEndpoint: ${credential.tokenEndpoint ?? '(none)'}`)
  console.log(`      issuer: ${credential.issuer ?? '(none)'}`)
  const complete = Boolean(credential.clientId && credential.clientSecret && credential.tokenEndpoint)
  record(
    '1. Issuing returns a client ID, secret and token URL',
    complete,
    complete ? undefined : `secret ${credential.clientSecret ? 'present' : 'missing'}`,
  )
  return complete
}

async function checkToken(credential) {
  const token = await requestToken(credential.tokenEndpoint, credential.clientId, credential.clientSecret)
  if (!token.ok) {
    record('2. A token can be obtained with the issued credentials', false, token.detail)
    return
  }
  const claims = claimsOf(token.accessToken)
  const audiences = [claims.aud].flat()
  console.log(`      iss: ${claims.iss}`)
  console.log(`      aud: ${audiences.join(', ')}`)
  console.log(`      azp: ${claims.azp}`)
  console.log(`      lifetime: ${claims.exp - claims.iat}s`)
  record('2a. The token\'s azp is the issued client ID', claims.azp === credential.clientId)
  record(
    `2b. The token's audience includes ${config.expectedAudience}`,
    audiences.includes(config.expectedAudience),
  )
}

async function checkRegenerate(serviceToken, issued) {
  const path =
    `/gateways/${encodeURIComponent(config.gatewayId)}/consumers/` +
    `${encodeURIComponent(issued.clientId)}?action=regenerate`
  const rotated = await apsRequest(serviceToken, 'PUT', path)
  record('3a. Regenerating keeps the client ID', rotated.clientId === issued.clientId)
  record(
    '3b. Regenerating returns a different secret',
    Boolean(rotated.clientSecret) && rotated.clientSecret !== issued.clientSecret,
  )
  const tokenUrl = rotated.tokenEndpoint ?? issued.tokenEndpoint
  const oldSecret = await requestToken(tokenUrl, issued.clientId, issued.clientSecret)
  record('3c. The old secret is refused', !oldSecret.ok)
  const newSecret = await requestToken(tokenUrl, issued.clientId, rotated.clientSecret)
  record('3d. The new secret works', newSecret.ok, newSecret.ok ? undefined : newSecret.detail)
}

async function main() {
  if (!config.clientId || !config.clientSecret) {
    console.error('Set APS_CLIENT_ID and APS_CLIENT_SECRET for the CredentialIssuer.Generate service account.')
    process.exit(2)
  }

  console.log(`Gateway ${config.gatewayId}, environment ${config.environmentAppId}\n`)

  const service = await requestToken(config.apsTokenUrl, config.clientId, config.clientSecret)
  if (!service.ok) {
    throw new Error(`Could not get a token for the service account: ${service.detail}`)
  }

  const name = `chosen-cc-check-${new Date().toISOString().replace(/[:.]/g, '-')}`
  console.log(`Issuing consumer for application "${name}"`)
  const issued = await apsRequest(
    service.accessToken,
    'POST',
    `/gateways/${encodeURIComponent(config.gatewayId)}/consumers`,
    {
      environmentAppId: config.environmentAppId,
      application: { name, description: 'CHOSEN client-credentials check. Safe to remove.' },
      labels: { purpose: 'chosen-cc-check' },
    },
  )

  if (checkIssued(issued)) {
    await checkToken(issued)
    await checkRegenerate(service.accessToken, issued)
  }

  const failed = results.filter((r) => !r.passed).length
  console.log(`\n${results.length - failed} passed, ${failed} failed.`)
  console.log(`Remove consumer ${issued.clientId ?? name} on the portal's Consumers page when done.`)
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(`\nStopped: ${error.message}`)
  process.exit(1)
})
