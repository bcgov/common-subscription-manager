#!/usr/bin/env node
// Generates Kong config for one environment from templates/routes.yaml and
// config/<environment>.env.
//
//   node scripts/generate-routes.mjs local          -> generated/kong-local.yaml (local Kong)
//   node scripts/generate-routes.mjs pr --prs 12,15 -> generated/gw-dev.yaml (every open PR)
//   node scripts/generate-routes.mjs test           -> generated/gw-test.yaml
//   node scripts/generate-routes.mjs prod           -> generated/gw-prod.yaml
//   node scripts/generate-routes.mjs --check        -> generates every environment into a
//                                                      temporary folder, to catch mistakes in CI
//
// It refuses to write a config with a missing value, rather than publishing routes that point
// nowhere.
//
// PR environments share the dev qualifier, and `gwa publish-gateway --qualifier dev` replaces
// everything under it. So the dev file lists every open PR at once: publishing one PR on its
// own would delete the others' routes. An empty --prs list publishes no PR routes.

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLACEHOLDER = /\$\{([A-Z0-9_]+)\}/g
// Allowed to be empty: no hostname locally, and no path prefix outside PR environments.
const MAY_BE_EMPTY = new Set(['GATEWAY_HOSTNAME', 'PATH_PREFIX'])

function parseEnvFile(path) {
  const values = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) values[match[1]] = match[2].trim()
  }
  return values
}

// Values can refer to each other, e.g. ROUTE_PREFIX=gw-a88e8-pr-${PR_NUMBER}-.
function resolveValues(values) {
  const resolved = { ...values }
  for (let pass = 0; pass < 5; pass++) {
    for (const [key, value] of Object.entries(resolved)) {
      resolved[key] = value.replace(PLACEHOLDER, (all, name) => resolved[name] ?? all)
    }
  }
  return resolved
}

function checkValues(values, envName) {
  const problems = Object.entries(values)
    .filter(([key, value]) => (value === '' && !MAY_BE_EMPTY.has(key)) || PLACEHOLDER.test(value))
    .map(([key, value]) => (value === '' ? `${key} is empty` : `${key} refers to an unset value: ${value}`))
  PLACEHOLDER.lastIndex = 0
  if (problems.length > 0) {
    throw new Error(`config/${envName}.env: ${problems.join('; ')}`)
  }
}

function substitute(template, values) {
  const missing = new Set()
  const text = template.replace(PLACEHOLDER, (all, name) => {
    if (!(name in values)) missing.add(name)
    return values[name] ?? all
  })
  if (missing.size > 0) {
    throw new Error(`templates/routes.yaml uses values no env file sets: ${[...missing].join(', ')}`)
  }
  return text
}

// Removes the /pr-<number> prefix before the request reaches the backend, which expects /api/...
function stripPrefixPlugin(prefix, tag) {
  return {
    name: 'pre-function',
    tags: [tag],
    enabled: true,
    config: {
      access: [
        `local prefix = "${prefix}"\n` +
          'local path = kong.request.get_path()\n' +
          'if path:sub(1, #prefix) == prefix then\n' +
          '  kong.service.request.set_path(path:sub(#prefix + 1))\n' +
          'end',
      ],
    },
  }
}

function adjustRoute(route, values, envName) {
  if (!route.hosts?.length) delete route.hosts
  route.plugins ??= []
  if (envName === 'local') {
    // The stock Kong image has no jwt-keycloak plugin. The backend verifies tokens itself.
    route.plugins = route.plugins.filter((plugin) => plugin.name !== 'jwt-keycloak')
  }
  if (values.PATH_PREFIX) {
    route.plugins.push(stripPrefixPlugin(values.PATH_PREFIX, values.CONFIG_TAG))
  }
  if (route.plugins.length === 0) delete route.plugins
}

function buildConfig(envName, values) {
  const parsed = yaml.load(substitute(readFileSync(join(root, 'templates/routes.yaml'), 'utf8'), values))
  const config = { services: parsed.services }
  for (const service of config.services) {
    for (const route of service.routes) adjustRoute(route, values, envName)
  }
  // Kong's own format marker, needed to load the file into a local Kong without a database.
  return envName === 'local' ? { _format_version: '3.0', ...config } : config
}

const OUTPUT_NAMES = { local: 'kong-local.yaml', pr: 'gw-dev.yaml', test: 'gw-test.yaml', prod: 'gw-prod.yaml' }

function valuesFor(envName, extra, placeholderPlate) {
  const raw = { ...parseEnvFile(join(root, 'config', `${envName}.env`)), ...extra }
  if (placeholderPlate && raw.LICENSE_PLATE === '') raw.LICENSE_PLATE = placeholderPlate
  const values = resolveValues(raw)
  checkValues(values, envName)
  return values
}

function configFor(envName, { prNumbers, placeholderPlate }) {
  if (envName !== 'pr') {
    return buildConfig(envName, valuesFor(envName, {}, placeholderPlate))
  }
  if (!prNumbers) throw new Error('The pr environment needs --prs <n,n,...> (it may be empty).')
  const services = prNumbers.flatMap(
    (n) => buildConfig('pr', valuesFor('pr', { PR_NUMBER: n }, placeholderPlate)).services,
  )
  return { services }
}

function generate(envName, options) {
  if (!(envName in OUTPUT_NAMES)) throw new Error(`Unknown environment "${envName}".`)
  const header =
    `# Generated by scripts/generate-routes.mjs from templates/routes.yaml and config/${envName}.env.\n` +
    '# Do not edit; change the template or the env file and generate again.\n'
  const path = join(options.outDir, OUTPUT_NAMES[envName])
  mkdirSync(options.outDir, { recursive: true })
  writeFileSync(path, header + yaml.dump(configFor(envName, options), { noRefs: true, lineWidth: 120 }))
  return path
}

function parsePrList(list) {
  if (list === undefined) return undefined
  const numbers = list.split(',').map((n) => n.trim()).filter(Boolean)
  const bad = numbers.find((n) => !/^\d+$/.test(n))
  if (bad) throw new Error(`Not a PR number: "${bad}"`)
  return numbers
}

function main(args) {
  if (args.includes('--check')) {
    const outDir = mkdtempSync(join(tmpdir(), 'chosen-gateway-'))
    const options = { prNumbers: ['1', '2'], outDir, placeholderPlate: 'abc123' }
    for (const envName of ['local', 'pr', 'test', 'prod']) {
      console.log(`ok  ${envName}: ${generate(envName, options)}`)
    }
    return
  }
  const envName = args[0]
  if (!envName) throw new Error('Usage: generate-routes.mjs <local|pr|test|prod> [--prs <n,n,...>] | --check')
  const prsIndex = args.indexOf('--prs')
  const prNumbers = parsePrList(prsIndex >= 0 ? (args[prsIndex + 1] ?? '') : undefined)
  console.log(generate(envName, { prNumbers, outDir: join(root, 'generated') }))
}

try {
  main(process.argv.slice(2))
} catch (error) {
  console.error(`error: ${error.message}`)
  process.exit(1)
}
