import type { FC } from 'react'
import { Footer, Header } from '@bcgov/design-system-react-components'
import { Link } from '@tanstack/react-router'
import { signOut } from '@/auth/keycloak'
import { useAppSelector } from '@/redux/hooks'

type Props = {
  children: React.ReactNode
}

const Layout: FC<Props> = ({ children }) => {
  const user = useAppSelector((state) => state.auth.user)
  return (
    <div className="d-flex flex-column min-vh-100">
      <Header title="CHOSEN" titleElement="h1">
        {' '}
        <Link aria-label="Home" className="btn btn-light btn-lg" to="/">
          <i aria-hidden="true" className="bi bi-house-door-fill" />
        </Link>
        {user && (
          <>
            <span className="ms-3">{user.name}</span>
            <button
              className="btn btn-outline-light ms-2"
              onClick={() => void signOut()}
              type="button"
            >
              Sign out
            </button>
          </>
        )}
      </Header>
      <main
        className="d-flex flex-grow-1 align-items-start justify-content-center mt-5 mb-5 ml-1 mr-1"
        id="main-content"
      >
        {children}
      </main>
      <Footer />
    </div>
  )
}

export default Layout
