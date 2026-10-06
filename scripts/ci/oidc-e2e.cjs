const { chromium } = require("playwright");

const baseUrl = "http://localhost";
const idpUrl = "http://authentik.localhost";
const username = process.env.RALLLY_E2E_USERNAME || "rallly-ci-user";
const password = process.env.RALLLY_E2E_PASSWORD;

if (!password) throw new Error("RALLLY_E2E_PASSWORD is required");

async function clickFirstVisible(page, selectors) {
  for (const locator of selectors) {
    const candidate = page.getByRole(locator.role, { name: locator.name }).first();
    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click();
      return true;
    }
  }
  return false;
}

async function openProviderLogin(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const loginLink = page.getByRole("link", { name: /log in|sign in|login/i }).first();
  if (await loginLink.isVisible().catch(() => false)) await loginLink.click();

  let providerButton = page.getByText("Authentik", { exact: true }).first();
  if (!(await providerButton.isVisible().catch(() => false))) {
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
    providerButton = page.getByText("Authentik", { exact: true }).first();
  }
  await providerButton.waitFor({ state: "visible", timeout: 20_000 });
  await providerButton.click();
  await page.waitForURL((url) => url.hostname === "authentik.localhost", { timeout: 20_000 });
}

async function submitAuthentikCredentials(page, username) {
  const userField = page.locator('input[name="username"], input[name="uidField"], input#id_username').first();
  await userField.waitFor({ state: "visible", timeout: 20_000 });
  await userField.fill(username);

  const passwordField = page.locator('input[name="password"], input#id_password').first();
  if (await passwordField.isVisible().catch(() => false)) await passwordField.fill(password);
  else {
    if (!(await clickFirstVisible(page, [
      { role: "button", name: /continue|next|log in|sign in/i },
    ]))) throw new Error("Authentik username stage has no continue button");
    await passwordField.waitFor({ state: "visible", timeout: 20_000 });
    await passwordField.fill(password);
  }
  if (!(await clickFirstVisible(page, [
    { role: "button", name: /continue|next|log in|sign in/i },
  ]))) throw new Error("Authentik password stage has no submit button");
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const callbackResponses = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/auth/callback/oidc")) callbackResponses.push(response.status());
    });
    await openProviderLogin(page);
    await submitAuthentikCredentials(page, "rallly-ci-user");
    await page.waitForURL((url) => url.hostname === "localhost", { timeout: 30_000 });
    await page.waitForTimeout(1500);
    const sessionCookies = (await context.cookies(baseUrl)).filter((cookie) => /session/i.test(cookie.name));
    if (!sessionCookies.length) throw new Error("OIDC returned to Rallly but no session cookie was established");
    if (!callbackResponses.some((status) => status >= 200 && status < 400)) {
      throw new Error(`Rallly OIDC callback was not successful: ${callbackResponses.join(",") || "no response"}`);
    }
    console.log("PASS: Authentik authenticated the test user and Rallly created a session.");
    await context.close();

    const deniedContext = await browser.newContext();
    const deniedPage = await deniedContext.newPage();
    await openProviderLogin(deniedPage);
    await submitAuthentikCredentials(deniedPage, "rallly-ci-denied");
    await deniedPage.waitForTimeout(2500);
    const deniedText = await deniedPage.locator("body").innerText();
    if (deniedPage.url().startsWith(baseUrl) || !/access denied|not authorized|permission to access|not allowed/i.test(deniedText)) {
      throw new Error(`Authentik did not deny the user outside the allowed groups. URL: ${deniedPage.url()}\n${deniedText.slice(0, 1200)}`);
    }
    console.log("PASS: Authentik denied the user outside the allowed Rallly groups.");
    await deniedContext.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
