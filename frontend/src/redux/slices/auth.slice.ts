import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { SignedInUser } from '@/auth/keycloak'
import { signIn } from '@/auth/keycloak'

export type AuthStatus = 'signed-out' | 'signing-in' | 'signed-in' | 'failed'

export interface AuthState {
  status: AuthStatus
  user: SignedInUser | null
  error: string | null
}

const initialState: AuthState = { status: 'signed-out', user: null, error: null }

export const signInStaff = createAsyncThunk('auth/signIn', () => signIn())

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(signInStaff.pending, (state) => {
        state.status = 'signing-in'
        state.error = null
      })
      .addCase(signInStaff.fulfilled, (state, action) => {
        state.status = 'signed-in'
        state.user = action.payload
      })
      .addCase(signInStaff.rejected, (state, action) => {
        state.status = 'failed'
        state.user = null
        state.error = action.error.message ?? 'Sign-in failed'
      })
  },
})

export default authSlice.reducer
