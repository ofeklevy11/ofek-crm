-- AlterEnum
ALTER TYPE "DashboardWidgetType" RENAME TO "DashboardWidgetType_old";
CREATE TYPE "DashboardWidgetType" AS ENUM ('ANALYTICS', 'TABLE', 'GOAL', 'TABLE_VIEWS_DASHBOARD', 'MINI_CALENDAR', 'MINI_TASKS', 'MINI_QUOTES', 'MINI_MEETINGS');
ALTER TABLE "DashboardWidget" ALTER COLUMN "widgetType" TYPE "DashboardWidgetType" USING ("widgetType"::text::"DashboardWidgetType");
DROP TYPE "DashboardWidgetType_old";
