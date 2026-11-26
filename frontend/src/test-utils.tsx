import type { RenderOptions } from '@testing-library/react'
import { cleanup, render } from '@testing-library/react'
import { Provider as ReduxProvider } from 'react-redux'
import { afterEach } from 'vitest'
import type { AppStore, RootState } from '@/redux/store'
import { setupStore } from '@/redux/store'

afterEach(() => {
  cleanup()
})

interface ProviderRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Partial<RootState>
  store?: AppStore
}

/** Renders inside a Redux provider with a fresh store, unless the test passes its own. */
function customRender(
  ui: React.ReactElement,
  { preloadedState, store = setupStore(preloadedState), ...options }: ProviderRenderOptions = {},
) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReduxProvider store={store}>{children}</ReduxProvider>
  )
  return { store, ...render(ui, { wrapper, ...options }) }
}

export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'
// override render export
export { customRender as render }
