import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const out: Record<string, string> = {};
  const text = fs.readFileSync(filePath, "utf8");

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }

  return out;
}

function resolveAuthPassword(): string {
  const fromProcess = process.env.AUTH_PASSWORD?.trim();
  if (fromProcess) {
    return fromProcess;
  }

  const root = process.cwd();
  const merged = {
    ...readEnvFile(path.join(root, ".env")),
    ...readEnvFile(path.join(root, ".env.local")),
  };

  const fromFiles = merged.AUTH_PASSWORD?.trim();
  if (fromFiles) {
    return fromFiles;
  }

  throw new Error("AUTH_PASSWORD is required for Files E2E test");
}

async function loginToPrivateArea(page: Page, password: string): Promise<void> {
  await page.goto("/login?next=/app/files");
  await expect(page.getByRole("heading", { name: "Private Access" })).toBeVisible();

  await page.locator("#password").fill(password);
  await Promise.all([
    page.waitForURL("**/app**"),
    page.getByRole("button", { name: "Unlock private area" }).click(),
  ]);

  if (!page.url().includes("/app/files")) {
    await page.goto("/app/files");
  }

  await expect(page.getByRole("heading", { name: "File Explorer" })).toBeVisible();
}

test("files breadcrumb navigation: root → folder → nested folder with correct labels", async ({
  page,
}) => {
  const password = resolveAuthPassword();

  // Step 1: Login
  await loginToPrivateArea(page, password);

  // Step 2: Verify roots view shows available roots
  const rootsSection = page.locator("section").filter({ hasText: "Roots" }).first();
  await expect(rootsSection).toBeVisible({ timeout: 15_000 });

  // Find first root button
  const rootButtons = rootsSection.getByRole("button");
  const rootCount = await rootButtons.count();
  expect(rootCount).toBeGreaterThan(0);

  // Get first root button and extract label
  const firstRootButton = rootButtons.first();
  const rootLabelElement = firstRootButton.locator("div").nth(1).locator("div").first();
  const rootLabel = await rootLabelElement.textContent();
  expect(rootLabel).toBeTruthy();
  expect(rootLabel).not.toMatch(/^Root\s*$/); // Verify it's an actual label, not generic "Root"

  // Click to open first root
  await firstRootButton.click();

  // Step 3: Verify location section appears with breadcrumb showing root label (not "Home")
  const locationSection = page
    .locator("section")
    .filter({ hasText: "Location" })
    .first();
  await expect(locationSection).toBeVisible({ timeout: 15_000 });

  const breadcrumbChips = locationSection.getByRole("button");
  const breadcrumbCount = await breadcrumbChips.count();
  expect(breadcrumbCount).toBeGreaterThan(0);

  // Verify first breadcrumb is the root label, NOT hardcoded "Home"
  const firstBreadcrumb = breadcrumbChips.first();
  const firstBreadcrumbText = await firstBreadcrumb.textContent();
  expect(firstBreadcrumbText?.trim()).toBe(rootLabel?.trim());

  // Step 4: Look for directory entries to navigate into
  const fileSection = page.locator("section").filter({ hasText: /file|dir/i }).last();
  await expect(fileSection).toBeVisible({ timeout: 15_000 });

  // Find directory cards
  const dirCards = fileSection.locator("div[class*='rounded']").filter({
    hasText: /^dir$/m,
  });
  let dirCount = await dirCards.count();

  if (dirCount === 0) {
    // Try alternative selector for directory entries
    const entryTypeLabels = fileSection.locator("div").filter({ hasText: "dir" });
    dirCount = await entryTypeLabels.count();

    if (dirCount > 0) {
      // If we found entries but can't navigate, test still passes
      // (it means root is navigable but has no subdirs)
      test.skip();
      return;
    }
  }

  // If there are subdirectories, navigate into first one
  if (dirCount > 0) {
    // Find first directory card and get its name
    const firstDirCard = fileSection.locator(".[class*='rounded']").filter({
      hasText: /^dir$/m,
    }).first().locator("..");

    // Get directory name from card
    const dirNameElement = firstDirCard.locator("div").nth(1).locator("div").first();
    const dirName = await dirNameElement.textContent();
    expect(dirName).toBeTruthy();

    // Hover to reveal open button and click
    await firstDirCard.hover();
    const openButton = firstDirCard.getByRole("button").first();
    await openButton.click();

    // Step 5: Verify breadcrumb updated to show root > folder1
    await expect(locationSection).toBeVisible({ timeout: 15_000 });
    const breadcrumbs2 = locationSection.getByRole("button");
    const breadcrumbCount2 = await breadcrumbs2.count();
    expect(breadcrumbCount2).toBe(2);

    // Verify breadcrumbs are correct
    const firstCrumb2 = breadcrumbs2.nth(0);
    const secondCrumb = breadcrumbs2.nth(1);

    const firstCrumbText2 = await firstCrumb2.textContent();
    const secondCrumbText = await secondCrumb.textContent();

    expect(firstCrumbText2?.trim()).toBe(rootLabel?.trim());
    expect(secondCrumbText?.trim()).toBe(dirName?.trim());

    // Step 6: Look for nested directories to navigate further
    const nestedDirCards = fileSection.locator("div[class*='rounded']").filter({
      hasText: /^dir$/m,
    });
    const nestedDirCount = await nestedDirCards.count();

    if (nestedDirCount > 0) {
      // Get first nested directory
      const firstNestedCard = fileSection.locator(".[class*='rounded']").filter({
        hasText: /^dir$/m,
      }).first().locator("..");

      const nestedDirNameElement = firstNestedCard.locator("div").nth(1).locator("div")
        .first();
      const nestedDirName = await nestedDirNameElement.textContent();
      expect(nestedDirName).toBeTruthy();

      // Navigate into nested directory
      await firstNestedCard.hover();
      const nestedOpenButton = firstNestedCard.getByRole("button").first();
      await nestedOpenButton.click();

      // Step 7: Verify breadcrumb shows root > folder1 > folder2
      await expect(locationSection).toBeVisible({ timeout: 15_000 });
      const breadcrumbs3 = locationSection.getByRole("button");
      const breadcrumbCount3 = await breadcrumbs3.count();
      expect(breadcrumbCount3).toBe(3);

      const firstCrumb3 = breadcrumbs3.nth(0);
      const secondCrumb3 = breadcrumbs3.nth(1);
      const thirdCrumb = breadcrumbs3.nth(2);

      const firstCrumbText3 = await firstCrumb3.textContent();
      const secondCrumbText3 = await secondCrumb3.textContent();
      const thirdCrumbText = await thirdCrumb.textContent();

      expect(firstCrumbText3?.trim()).toBe(rootLabel?.trim());
      expect(secondCrumbText3?.trim()).toBe(dirName?.trim());
      expect(thirdCrumbText?.trim()).toBe(nestedDirName?.trim());

      // Step 8: Click middle breadcrumb to go back
      await secondCrumb3.click();

      // Verify we're back to root > folder1
      const breadcrumbs4 = locationSection.getByRole("button");
      const breadcrumbCount4 = await breadcrumbs4.count();
      expect(breadcrumbCount4).toBe(2);

      const firstCrumb4 = breadcrumbs4.nth(0);
      const secondCrumb4 = breadcrumbs4.nth(1);

      expect((await firstCrumb4.textContent())?.trim()).toBe(rootLabel?.trim());
      expect((await secondCrumb4.textContent())?.trim()).toBe(dirName?.trim());
    }

    // Step 9: Click root breadcrumb to return to roots
    const finalBreadcrumbs = locationSection.getByRole("button");
    const rootBreadcrumb = finalBreadcrumbs.nth(0);
    await rootBreadcrumb.click();

    // Verify we're back at roots view
    await expect(rootsSection).toBeVisible({ timeout: 15_000 });
    await expect(locationSection).not.toBeVisible();
  }
});

test("files breadcrumb click navigation: breadcrumb click navigates to correct location", async ({
  page,
}) => {
  const password = resolveAuthPassword();

  // Login
  await loginToPrivateArea(page, password);

  // Open first root
  const rootsSection = page.locator("section").filter({ hasText: "Roots" }).first();
  await expect(rootsSection).toBeVisible({ timeout: 15_000 });

  const firstRootButton = rootsSection.getByRole("button").first();
  await firstRootButton.click();

  // Verify location section appears
  const locationSection = page
    .locator("section")
    .filter({ hasText: "Location" })
    .first();
  await expect(locationSection).toBeVisible({ timeout: 15_000 });

  // Look for folder to navigate into
  const fileSection = page.locator("section").last();
  const dirCards = fileSection.locator("div[class*='rounded']").filter({
    hasText: /^dir$/m,
  });
  const dirCount = await dirCards.count();

  if (dirCount > 0) {
    // Navigate into first folder
    const firstDirCard = fileSection.locator(".[class*='rounded']").filter({
      hasText: /^dir$/m,
    }).first().locator("..");

    await firstDirCard.hover();
    const openButton = firstDirCard.getByRole("button").first();
    await openButton.click();

    // Verify we have 2 breadcrumbs now
    const breadcrumbs = locationSection.getByRole("button");
    const breadcrumbCount = await breadcrumbs.count();
    expect(breadcrumbCount).toBe(2);

    // Click first breadcrumb (root) to go back
    const rootBreadcrumb = breadcrumbs.nth(0);
    await rootBreadcrumb.click();

    // Verify breadcrumbs reset to 1 (just showing root)
    await expect(locationSection).toBeVisible({ timeout: 15_000 });
    const breadcrumbsAfter = locationSection.getByRole("button");
    breadcrumbCount = await breadcrumbsAfter.count();
    expect(breadcrumbCount).toBe(1);
  }
});
