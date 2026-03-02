//tests/e2e.spec.ts
import { test, expect } from "@playwright/test";

// Load and scan the page for the title AnaToPrint
test.describe("AnaToPrint Webapp E2E", () => {
  test("homepage loads", async ({ page }) => {
    await page.goto("http://localhost:5173");
    await expect(page).toHaveTitle(/AnaToPrint/i);
    await expect(page.locator("h1")).toBeVisible();
  });

  // Testing for Navigation between pages (About, Preview, Export, etc.)
  test("navigation links work", async ({ page }) => {
    await page.goto("http://localhost:5173");

    await page.locator("a", { hasText: "About" }).click();
    await expect(page).toHaveURL(/about/);

    await page.locator("a", { hasText: "Preview" }).click();
    await expect(page).toHaveURL(/preview/);

    await page.locator("a", { hasText: "Export" }).click();
    await expect(page).toHaveURL(/export/);

    await page.locator("a", { hasText: "Settings" }).click();
    await expect(page).toHaveURL(/settings/);

    await page.locator("a", { hasText: "Upload" }).click();
    await expect(page).toHaveURL("http://localhost:5173/");
  });

  // Checking pages for the text on navigated pages
  test("About page content visible", async ({ page }) => {
    await page.goto("http://localhost:5173/about");
    await expect(page.locator('h1:has-text("AnaToPrint")')).toBeVisible();
    await expect(page.locator("text=Group Members")).toBeVisible();
    await expect(page.locator("text=Client")).toBeVisible();
  });

  test("Preview page shows no file message", async ({ page }) => {
    await page.goto("http://localhost:5173/preview");
    await expect(page.locator("text=No file loaded")).toBeVisible();
    await expect(page.locator("text=Go to Upload")).toBeVisible();
    await page.locator("text=Go to Upload").click();
    await expect(page).toHaveURL("http://localhost:5173");
  });

  test("Export page shows no file message", async ({ page }) => {
    await page.goto("http://localhost:5173/export");
    await expect(page.locator("text=No file loaded")).toBeVisible();
  });
});
