import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:8787');
  await page.locator('canvas').waitFor();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/fullscreen-before.png' });
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect(page.getByRole('button', { name: 'Exit fullscreen' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('stage'))).toBe(true);
  await expect.poll(() => page.locator('canvas').evaluate(el => Math.abs(el.clientWidth - innerWidth) < 2 && Math.abs(el.clientHeight - innerHeight) < 2)).toBe(true);
  await page.screenshot({ path: 'test-results/fullscreen-after.png' });
  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  // Native Escape exits fullscreen via fullscreenchange; emulate browser-driven exit.
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.querySelector('.stage').requestFullscreen = undefined; });
  await page.getByRole('button', { name: 'Enter fullscreen' }).click();
  await expect(page.locator('.stage')).toHaveClass(/stage-expanded/);
  await expect.poll(() => page.locator('canvas').evaluate(el => Math.abs(el.clientWidth - innerWidth) < 2 && Math.abs(el.clientHeight - innerHeight) < 2)).toBe(true);
  await page.screenshot({ path: 'test-results/fullscreen-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.stage')).not.toHaveClass(/stage-expanded/);
  expect(errors).toEqual([]);
  console.log('PASS native fullscreen, exit button, browser exit synchronization, canvas resizing, mobile fallback, and Escape; zero page errors.');
} finally { await browser.close(); }
