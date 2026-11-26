import { createFileRoute, Outlet } from '@tanstack/react-router'
import { store } from '@/redux/store'
import { signInStaff } from '@/redux/slices/auth.slice'

// Every page under this route is for staff, so the person signs in with IDIR before it loads.
// Public pages (confirm, unsubscribe, manage) must live outside it.
export const Route = createFileRoute('/_staff')({
  beforeLoad: async () => {
    await store.dispatch(signInStaff()).unwrap()
  },
  component: Outlet,
})
