import { render, screen } from '@/test-utils'
import Home from '@/components/Home'

describe('Home', () => {
  test('names the service and who is signed in', () => {
    render(<Home />, {
      preloadedState: {
        auth: {
          status: 'signed-in',
          user: { id: 'GUID', username: 'admin', name: 'Local Operator', roles: [] },
          error: null,
        },
      },
    })
    expect(
      screen.getByRole('heading', { name: 'Common Hosted Subscription for Event Notifications' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Signed in as Local Operator.')).toBeInTheDocument()
  })
})
