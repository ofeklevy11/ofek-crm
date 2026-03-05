import { type Page, type Locator } from "@playwright/test";
import { SERVICE_TEXT } from "../helpers/service-selectors";

const COLUMN_TITLES = [
  SERVICE_TEXT.colOpen,
  SERVICE_TEXT.colInProgress,
  SERVICE_TEXT.colWaiting,
  SERVICE_TEXT.colResolved,
];

export class ServiceKanbanPO {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  static get columnTitles() {
    return COLUMN_TITLES;
  }

  /**
   * Get a kanban column container by its Hebrew label.
   * DOM: div.flex-1.flex.flex-col > div(header) > span(label)
   */
  getColumn(label: string): Locator {
    return this.page.locator("div.flex-1.flex.flex-col").filter({
      has: this.page.locator("span.font-semibold").filter({ hasText: label }),
    });
  }

  /** Get the ticket count badge from a column header */
  async getColumnTicketCount(label: string): Promise<string | null> {
    const column = this.getColumn(label);
    const badge = column.locator("span.rounded-full").first();
    if (await badge.isVisible()) {
      return badge.textContent();
    }
    return null;
  }

  /** Get a ticket card by its title text (targets the h4 element) */
  getTicketCard(title: string): Locator {
    return this.page.locator("h4").filter({ hasText: title }).first();
  }

  /** Get a ticket card within a specific column */
  getTicketInColumn(ticketTitle: string, columnLabel: string): Locator {
    const column = this.getColumn(columnLabel);
    return column.locator("h4").filter({ hasText: ticketTitle });
  }

  /** Get the drag handle (GripVertical icon) for a ticket card */
  getDragHandle(ticketTitle: string): Locator {
    const card = this.page.locator("div.bg-white.p-3").filter({
      has: this.page.locator("h4").filter({ hasText: ticketTitle }),
    });
    return card.locator("svg.lucide-grip-vertical").first();
  }

  /** Get all visible column labels */
  async getVisibleColumns(): Promise<string[]> {
    const columns: string[] = [];
    for (const label of COLUMN_TITLES) {
      const heading = this.page.locator("span.font-semibold").filter({ hasText: label });
      if (await heading.isVisible()) {
        columns.push(label);
      }
    }
    return columns;
  }
}
