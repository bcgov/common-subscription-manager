import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setupServer } from 'msw/node'

// Tests add their own handlers with server.use(); any request nothing handles fails the test.
export const server = setupServer()

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))

afterAll(() => server.close())

// Reset handlers after each test, so tests don't leak into each other.
afterEach(() => server.resetHandlers())
