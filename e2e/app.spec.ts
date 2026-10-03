import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

/** Complete the required body scan. Plain images contain no person, so this exercises manual placement. */
async function completeScan(page: Page) {
  await page.getByRole('button', { name: 'Add photos' }).click();
  await page.getByLabel('Front photo').setInputFiles(fixture('plain-front.png'));
  await page.getByLabel('Side photo').setInputFiles(fixture('plain-side.png'));
  await page.getByRole('button', { name: 'Analyse' }).click();
  await expect(page.getByText('Check the front measurements')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/No person was detected|Automatic detection is unavailable/).first()).toBeVisible();
  // Nudge one line with the keyboard to prove the editor responds.
  await page.getByRole('slider', { name: /^Chest first edge/ }).press('ArrowLeft');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Check the side measurements')).toBeVisible();
  await page.getByRole('button', { name: 'Review results' }).click();
  await expect(page.getByText('Your scan', { exact: true })).toBeVisible({ timeout: 30_000 });
  // The 3D body was fitted in a worker (either measured on it, or kept for display with a warning).
  await expect(page.getByText(/3D body fitting was unavailable/)).toBeHidden();
  await expect(page.getByText(/fitted to your photos|could not match your photos/).first()).toBeVisible();
  await page.getByLabel('I placed the lines on my photos myself and they match my body').check();
  await page.getByRole('button', { name: 'Use this scan' }).click();
  await expect(page.getByText('Body scan complete')).toBeVisible();
}

async function onboard(page: Page, name = 'Sam') {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole('button', { name: 'Create my profile' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Birth year').fill('1994');
  await page.getByLabel('Height').fill('180');
  await page.getByLabel('Weight').fill('80');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /Intermediate/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  // The scan is mandatory: no way forward until it is done.
  await expect(page.getByRole('button', { name: 'Continue' })).toBeHidden();
  await completeScan(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Neck').fill('39');
  await page.getByLabel('Waist (navel)').fill('84');
  await expect(page.getByText(/Estimated body fat/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radiogroup', { name: 'Calves rating' }).getByRole('radio', { name: 'Lagging' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Your starting point')).toBeVisible();
  await page.getByRole('button', { name: 'Start training' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`, ${name}$`) })).toBeVisible();
}

test('onboarding requires a scan, then shows the calibrated dashboard', async ({ page }) => {
  await onboard(page);
  await expect(page.getByText(/XP to level/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Calves/ }).first()).toBeVisible();
  await expect(page.getByText(/fitted to your scan/)).toBeVisible({ timeout: 15_000 });
  await page.goto('/scan');
  await expect(page.getByText('Placed by hand')).toBeVisible();
  await page.goto('/measurements');
  await expect(page.getByText('photo scan')).toBeVisible();
});

test('model detail can be switched in settings', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Explore with demo data' }).click();
  await expect(page.getByText(/fitted to your scan|calibrated to your body scan/)).toBeVisible({ timeout: 15_000 });
  await page.goto('/settings');
  await page.getByRole('radiogroup', { name: '3D model detail' }).getByRole('radio', { name: 'Standard' }).click();
  await page.goto('/');
  await expect(page.getByText(/Standard model/)).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
});

test('logging a workout earns XP and persists across reloads', async ({ page }) => {
  await onboard(page);
  await page.goto('/workout/new');
  await page.getByRole('button', { name: 'Add exercise' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add exercise' });
  await dialog.getByLabel('Search exercises').fill('bench press');
  await dialog.getByRole('button', { name: /^Barbell Bench Press/ }).click();
  await expect(page.getByLabel('Set 3 reps', { exact: true })).toBeVisible();
  await page.getByLabel('Set 1 weight', { exact: true }).fill('70');
  await expect(page.getByText('XP preview')).toBeVisible();
  await expect(page.locator('li', { hasText: 'Chest' }).getByText(/^\+\d+/)).toBeVisible();
  await page.getByRole('button', { name: 'Save workout' }).click();
  await expect(page.getByText(/Workout saved/)).toBeVisible();

  await page.goto('/history');
  await expect(page.getByText('1 workouts logged')).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 workouts logged')).toBeVisible();
  await page.getByRole('link', { name: /3 sets/ }).click();
  await expect(page.getByRole('heading', { name: 'Edit workout' })).toBeVisible();
});

test('daily check-in is saved', async ({ page }) => {
  await onboard(page);
  await page.goto('/check-in');
  await page.getByLabel('Body weight').fill('79.5');
  await page.getByLabel('Sleep').fill('8');
  await page.getByLabel('Protein').fill('150');
  await page.getByRole('button', { name: 'Save check-in' }).click();
  await expect(page.getByText('Check-in saved')).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('×1.15')).toBeVisible();
});

test('demo data renders the 3D model and muscle detail', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Explore with demo data' }).click();
  await expect(page.getByRole('heading', { name: /, Alex$/ })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  await page
    .getByRole('link', { name: /Biceps/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Biceps', exact: true })).toBeVisible();
  await expect(page.getByText('Best exercises')).toBeVisible();
});

test('backup export and import round-trip', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Explore with demo data' }).click();
  await page.goto('/settings');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup' }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();

  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reset everything' }).click();
  await expect(page).toHaveURL(/\/welcome$/);

  await page.getByRole('button', { name: 'Create my profile' }).click();
  await page.getByLabel('Name').fill('Tmp');
  await page.getByLabel('Birth year').fill('1990');
  await page.getByLabel('Height').fill('175');
  await page.getByLabel('Weight').fill('70');
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await completeScan(page);
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start training' }).click();
  await expect(page.getByRole('heading', { name: /, Tmp$/ })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await page.getByLabel('Backup file').setInputFiles(path!);
  await expect(page.getByText('Backup restored')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /, Alex$/ })).toBeVisible();
});
