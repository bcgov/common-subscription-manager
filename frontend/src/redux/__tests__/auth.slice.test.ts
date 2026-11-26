import { configureStore } from '@reduxjs/toolkit'
import { authSlice, signInStaff } from '@/redux/slices/auth.slice'
import { signIn } from '@/auth/keycloak'

vi.mock('@/auth/keycloak', () => ({ signIn: vi.fn() }))

const user = { id: 'GUID', username: 'admin', name: 'Local Operator', roles: ['CHOSEN_ADMIN'] }

function makeStore() {
  return configureStore({ reducer: { auth: authSlice.reducer } })
}

describe('auth slice', () => {
  test('starts signed out', () => {
    expect(makeStore().getState().auth).toEqual({ status: 'signed-out', user: null, error: null })
  })

  test('records the user once signed in', async () => {
    vi.mocked(signIn).mockResolvedValueOnce(user)
    const store = makeStore()
    await store.dispatch(signInStaff())
    expect(store.getState().auth).toEqual({ status: 'signed-in', user, error: null })
  })

  test('records why signing in failed', async () => {
    vi.mocked(signIn).mockRejectedValueOnce(new Error('Sign-in is not configured'))
    const store = makeStore()
    await store.dispatch(signInStaff())
    expect(store.getState().auth).toEqual({
      status: 'failed',
      user: null,
      error: 'Sign-in is not configured',
    })
  })
})
