import { type Page, type Locator } from "@playwright/test";
import { SERVICE_TEXT } from "../helpers/service-selectors";

export class ServicePage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly pageSubtitle: Locator;

  // Stats cards
  readonly statsOpen: Locator;
  readonly statsInProgress: Locator;
  readonly statsUrgent: Locator;
  readonly statsBreached: Locator;
  readonly statsClosed: Locator;

  // Search & view toggle
  readonly searchInput: Locator;
  readonly kanbanViewBtn: Locator;
  readonly listViewBtn: Locator;

  // Header action buttons
  readonly newTicketBtn: Locator;
  readonly slaBreachesBtn: Locator;
  readonly automationsBtn: Locator;
  readonly archiveBtn: Locator;
  readonly slaSettingsBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    this.pageTitle = page.getByRole("heading", { name: SERVICE_TEXT.pageTitle });
    this.pageSubtitle = page.getByText(SERVICE_TEXT.pageSubtitle);

    // Stats cards — target by the card title text
    this.statsOpen = page.getByText(SERVICE_TEXT.statsOpen);
    this.statsInProgress = page.getByText(SERVICE_TEXT.statsInProgress).first();
    this.statsUrgent = page.getByText(SERVICE_TEXT.statsUrgent);
    this.statsBreached = page.getByText(SERVICE_TEXT.statsBreached);
    this.statsClosed = page.getByText(SERVICE_TEXT.statsClosed);

    // Search
    this.searchInput = page.getByPlaceholder(SERVICE_TEXT.searchPlaceholder);

    // View toggle buttons — icon-only with no text/aria-label.
    // SVG class is the only reliable target; acceptable trade-off.
    this.kanbanViewBtn = page.locator("button").filter({ has: page.locator("svg.lucide-kanban") });
    this.listViewBtn = page.locator("button").filter({ has: page.locator("svg.lucide-list") });

    // Header action buttons
    this.newTicketBtn = page.getByRole("button", { name: SERVICE_TEXT.newTicket });
    this.slaBreachesBtn = page.getByRole("link", { name: SERVICE_TEXT.slaBreaches });
    this.automationsBtn = page.getByRole("link", { name: SERVICE_TEXT.automations });
    this.archiveBtn = page.getByRole("link", { name: SERVICE_TEXT.archive });
    this.slaSettingsBtn = page.getByRole("button", { name: SERVICE_TEXT.slaSettings });
  }

  /** Get the numeric value (<h3>) from a stats card by its title text */
  getStatsCardValue(cardTitle: string): Locator {
    return this.page.locator("div").filter({
      has: this.page.locator("p", { hasText: cardTitle }),
    }).locator("h3").first();
  }

  async goto() {
    await this.page.goto("/service");
    await this.page.waitForLoadState("networkidle");
  }

  async switchToListView() {
    await this.listViewBtn.click();
  }

  async switchToKanbanView() {
    await this.kanbanViewBtn.click();
  }

  async clickNewTicket() {
    await this.newTicketBtn.click();
  }

  async openSlaSettings() {
    await this.slaSettingsBtn.click();
  }

  async search(query: string) {
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await this.searchInput.clear();
  }
}
