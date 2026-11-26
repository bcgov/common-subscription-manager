import { combineSlices, configureStore } from '@reduxjs/toolkit'

// Pass each slice in as it's written, e.g. combineSlices(authSlice, topicsSlice).
export const rootReducer = combineSlices()

export type RootState = ReturnType<typeof rootReducer>

/** Builds a store. Tests call it directly so each one starts from its own state. */
export function setupStore(preloadedState?: Partial<RootState>) {
  return configureStore({ reducer: rootReducer, preloadedState })
}

export const store = setupStore()

export type AppStore = ReturnType<typeof setupStore>
export type AppDispatch = AppStore['dispatch']
