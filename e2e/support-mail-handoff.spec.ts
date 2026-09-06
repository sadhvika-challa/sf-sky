import { expect, test } from '@playwright/test'

test('describes support mail as an unconfirmed draft handoff', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One browser proves the mail handoff copy contract')

  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Report a bug' }).click()

  const dialog = page.getByRole('dialog', { name: 'Report a bug' })
  await dialog.getByLabel('Describe what happened').fill('The map did not refresh.')
  await dialog.getByRole('button', { name: 'Send to Karl' }).click()

  await expect(dialog).toContainText('Draft opened. Send it in your email app to contact support.')
  await expect(dialog).not.toContainText("Karl's on it")
})
