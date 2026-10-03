import { expect, test } from '@playwright/test';

// A fake camera feed and synthetic orientation events stand in for a phone.
test.use({
  permissions: ['camera'],
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test('in-app camera shows a level guide and fills the photo slot', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Explore with demo data' }).click();
  await page.goto('/scan');
  await page
    .getByRole('button', { name: /New scan/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Add photos' }).click();
  await page
    .getByRole('button', { name: /Use camera/ })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: 'Front photo' })).toBeVisible();
  await page.waitForFunction(() => (document.querySelector('video')?.videoWidth ?? 0) > 0);

  const tilt = (beta: number, gamma: number) =>
    page.evaluate(
      ([b, g]) =>
        window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g })),
      [beta, gamma],
    );
  await tilt(80, 0);
  await expect(page.getByText(/Tilt the phone upright/)).toBeVisible();
  await tilt(90.5, 0.5);
  await expect(page.getByText(/Level — hold it there/)).toBeVisible();

  await page.getByRole('button', { name: 'Take photo' }).click();
  await expect(page.getByRole('img', { name: 'Front photo' })).toBeVisible();
});
