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

  throw new Error("AUTH_PASSWORD is required for E2E smoke test");
}

async function waitForTerminalInputRequest(
  page: Page,
  expectedCommand: string,
  action: () => Promise<void>
) {
  const requestPromise = page.waitForRequest((request) => {
    if (!request.url().includes("/api/private/terminal/input")) {
      return false;
    }
    if (request.method() !== "POST") {
      return false;
    }

    const raw = request.postData();
    if (!raw) {
      return false;
    }

    try {
      const parsed = JSON.parse(raw) as { input?: unknown };
      return (
        typeof parsed.input === "string" && parsed.input.includes(expectedCommand)
      );
    } catch {
      return false;
    }
  });

  await action();
  await requestPromise;
}

test("terminal private flow smoke", async ({ page }) => {
  const password = resolveAuthPassword();
  const marker = `E2E_SMOKE_${Date.now()}`;
  const command = `echo ${marker}`;
  let activeSessionId: string | null = null;

  page.on("response", async (response) => {
    if (!response.url().includes("/api/private/terminal/session")) {
      return;
    }
    if (response.request().method() !== "POST") {
      return;
    }
    if (response.status() !== 200) {
      return;
    }

    try {
      const parsed = (await response.json()) as { sessionId?: unknown };
      if (typeof parsed.sessionId === "string" && parsed.sessionId.length > 0) {
        activeSessionId = parsed.sessionId;
      }
    } catch {
      // ignore non-json terminal session responses
    }
  });

  try {
    await page.goto("/login?next=/app/terminal");
    await expect(page.getByRole("heading", { name: "Private Access" })).toBeVisible();

    await page.locator("#password").fill(password);
    await Promise.all([
      page.waitForURL("**/app**"),
      page.getByRole("button", { name: "Unlock private area" }).click(),
    ]);

    if (!page.url().includes("/app/terminal")) {
      await page.goto("/app/terminal");
    }

    await expect(
      page.getByRole("heading", { name: "Operator Terminal" })
    ).toBeVisible();
    await expect(page.locator(".xterm")).toBeVisible();
    await expect(page.getByText("Status: Ready")).toBeVisible({ timeout: 25_000 });

    await waitForTerminalInputRequest(page, command, async () => {
      await page.locator(".xterm").click({ position: { x: 24, y: 24 } });
      await page.keyboard.type(command);
      await page.keyboard.press("Enter");
    });

    await expect(page.locator(".xterm-rows")).toContainText(marker, {
      timeout: 25_000,
    });

    const recentPanel = page.locator("aside > div").filter({
      hasText: "Recent Commands",
    });
    await expect(recentPanel.getByText(command, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const recentCard = recentPanel.locator("div").filter({
      hasText: command,
    }).first();

    await waitForTerminalInputRequest(page, command, async () => {
      await recentCard.getByRole("button", { name: "Run" }).click();
    });

    await recentCard.getByRole("button", { name: "Star" }).click();

    const favoritesPanel = page.locator("aside > div").filter({
      hasText: "Favorite Commands",
    });
    const favoriteCard = favoritesPanel.locator("div").filter({
      hasText: command,
    }).first();

    await expect(favoriteCard.getByText(command, { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await waitForTerminalInputRequest(page, command, async () => {
      await favoriteCard.getByRole("button", { name: "Run" }).click();
    });

    await favoriteCard.getByRole("button", { name: "Unstar" }).click();
    await expect(favoritesPanel.getByText(command, { exact: true })).toHaveCount(0);
  } finally {
    if (activeSessionId) {
      await page.evaluate(async (sessionId) => {
        await fetch("/api/private/terminal/close", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId }),
        });
      }, activeSessionId);
    }
  }
});
