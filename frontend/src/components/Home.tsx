import type { FC } from 'react'
import { useAppSelector } from '@/redux/hooks'

/** The staff landing page. Placeholder until the first staff pages are built. */
const Home: FC = () => {
  const user = useAppSelector((state) => state.auth.user)
  return (
    <section className="container">
      <h2>Common Hosted Subscription for Event Notifications</h2>
      {user && <p>Signed in as {user.name}.</p>}
    </section>
  )
}

export default Home
