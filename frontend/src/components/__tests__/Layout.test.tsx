import type { AnchorHTMLAttributes, ReactElement, ReactNode } from 'react'
import { vi } from 'vitest'
import { render, screen, userEvent, within } from '@/test-utils'
import Layout from '@/components/Layout'
import { signOut } from '@/auth/keycloak'

vi.mock('@/auth/keycloak', () => ({ signOut: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode
    to: string
  } & AnchorHTMLAttributes<HTMLAnchorElement>): ReactElement => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('Layout', () => {
  test('exposes one main landmark, a level-one heading, and a named home control', () => {
    render(
      <Layout>
        <p>Page content</p>
      </Layout>,
    )

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('main')).toContainElement(screen.getByText('Page content'))
    expect(screen.getByRole('heading', { level: 1, name: 'CHOSEN' })).toBeInTheDocument()

    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(within(header).queryByRole('button')).not.toBeInTheDocument()
    expect(
      within(header).getByRole('link', { name: 'Government of British Columbia' }),
    ).toBeInTheDocument()
  })

  test('shows who is signed in, and lets them sign out', async () => {
    render(
      <Layout>
        <p>Page content</p>
      </Layout>,
      {
        preloadedState: {
          auth: {
            status: 'signed-in',
            user: { id: 'GUID', username: 'admin', name: 'Local Operator', roles: [] },
            error: null,
          },
        },
      },
    )

    const header = screen.getByRole('banner')
    expect(within(header).getByText('Local Operator')).toBeInTheDocument()
    await userEvent.click(within(header).getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
