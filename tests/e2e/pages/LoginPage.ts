import { type Page, type Locator } from "@playwright/test";
import { TEXT } from "../helpers/test-utils";

export class LoginPage {
  readonly page: Page;

  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly registerLink: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    this.emailInput = page.locator("#email");
    this.passwordInput = page.locator("#password");
    this.submitButton = page.getByRole("button", {
      name: TEXT.loginFormSubmit,
    });
    this.registerLink = page.getByRole("link", {
      name: TEXT.loginFormRegisterLink,
    });
    this.errorMessage = page.locator('[role="alert"]');
  }

  async goto() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async getError(): Promise<string | null> {
    try {
      await this.errorMessage.waitFor({ timeout: 5000 });
      return await this.errorMessage.textContent();
    } catch {
      return null;
    }
  }
}
