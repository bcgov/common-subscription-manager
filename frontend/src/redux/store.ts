import { combineSlices, configureStore } from '@reduxjs/toolkit'
import { authSlice } from './slices/auth.slice'

// Pass each slice in as it's written.
export const rootReducer = combineSlices(authSlice)

export type RootState = ReturnType<typeof rootReducer>

/** Builds a store. Tests call it directly so each one starts from its own state. */
export function setupStore(preloadedState?: Partial<RootState>) {
  return configureStore({ reducer: rootReducer, preloadedState })
}

export const store = setupStore()

export type AppStore = ReturnType<typeof setupStore>
export type AppDispatch = AppStore['dispatch']
