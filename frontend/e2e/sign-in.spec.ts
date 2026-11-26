import { expect, test } from '@playwright/test'
import { baseURL } from './utils'

// Staff pages are behind IDIR sign-in, so opening the app sends the browser to SSO.
test('staff pages send you to sign in', async ({ page }) => {
  await page.goto(baseURL)
  await expect(page).toHaveURL(/\/realms\/standard\/protocol\/openid-connect\/auth/)
})
