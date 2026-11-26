import { render, screen } from '@/test-utils'
import { useAppStore } from '@/redux/hooks'
import { setupStore } from '@/redux/store'

function StoreProbe() {
  const store = useAppStore()
  return <p>{typeof store.dispatch === 'function' ? 'store available' : 'no store'}</p>
}

describe('Redux store', () => {
  test('gives each test its own store', () => {
    expect(setupStore()).not.toBe(setupStore())
  })

  test('is available to components rendered with the test render', () => {
    const { store } = render(<StoreProbe />)
    expect(screen.getByText('store available')).toBeInTheDocument()
    expect(store.getState()).toEqual({})
  })
})
