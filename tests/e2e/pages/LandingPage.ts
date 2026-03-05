import { type Page, type Locator } from "@playwright/test";
import { TEXT } from "../helpers/test-utils";

export class LandingPage {
  readonly page: Page;

  // Hero section
  readonly heroTitle: Locator;
  readonly heroSubtitle: Locator;
  readonly loginButton: Locator;
  readonly registerButton: Locator;

  // Features
  readonly featureLeads: Locator;
  readonly featureAutomations: Locator;
  readonly featureReports: Locator;

  // Badge
  readonly crmBadge: Locator;

  // Navbar
  readonly navLoginLink: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heroTitle = page.getByText(TEXT.heroTitle);
    this.heroSubtitle = page.getByText(TEXT.heroSubtitle);
    this.loginButton = page.getByRole("link", { name: TEXT.loginButton });
    this.registerButton = page.getByRole("link", { name: TEXT.registerButton });

    this.featureLeads = page.getByText(TEXT.featureLeads);
    this.featureAutomations = page.getByText(TEXT.featureAutomations);
    this.featureReports = page.getByText(TEXT.featureReports);

    this.crmBadge = page.getByText(TEXT.crmBadge);

    this.navLoginLink = page.getByRole("link", { name: TEXT.navLogin });
  }

  async goto() {
    await this.page.goto("/");
  }

  async clickLogin() {
    await this.loginButton.click();
  }

  async clickRegister() {
    await this.registerButton.click();
  }
}
