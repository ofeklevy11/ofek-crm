-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('basic', 'admin', 'manager');

-- CreateEnum
CREATE TYPE "UserTier" AS ENUM ('basic', 'premium', 'super');

-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('MANUAL', 'TASK_STATUS_CHANGE', 'RECORD_CREATE', 'NEW_RECORD', 'RECORD_FIELD_CHANGE', 'MULTI_EVENT_DURATION', 'DIRECT_DIAL', 'VIEW_METRIC_THRESHOLD', 'TIME_SINCE_CREATION', 'TICKET_STATUS_CHANGE', 'SLA_BREACH', 'EVENT_TIME');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('SEND_NOTIFICATION', 'CALCULATE_DURATION', 'CALCULATE_MULTI_EVENT_DURATION', 'UPDATE_RECORD_FIELD', 'SEND_WHATSAPP', 'WEBHOOK', 'ADD_TO_NURTURE_LIST', 'CREATE_TASK', 'CREATE_RECORD', 'CREATE_CALENDAR_EVENT', 'MULTI_ACTION');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'waiting_client', 'on_hold', 'completed_month', 'done');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "RetainerStatus" AS ENUM ('active', 'paused', 'cancelled');

-- CreateEnum
CREATE TYPE "RetainerFrequency" AS ENUM ('monthly', 'quarterly', 'annually');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('active', 'completed');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('SERVICE', 'PRODUCT', 'PACKAGE');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GoalMetricType" AS ENUM ('REVENUE', 'SALES', 'CUSTOMERS', 'TASKS', 'RETAINERS', 'QUOTES', 'CALENDAR', 'RECORDS');

-- CreateEnum
CREATE TYPE "GoalTargetType" AS ENUM ('COUNT', 'SUM');

-- CreateEnum
CREATE TYPE "GoalPeriodType" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TransactionRelatedType" AS ENUM ('retainer', 'one_time');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('ILS', 'USD', 'EUR', 'GBP');

-- CreateEnum
CREATE TYPE "FinanceRecordType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceRecordStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceSyncSourceType" AS ENUM ('TABLE', 'TRANSACTIONS', 'RETAINERS', 'FIXED_EXPENSES', 'PAYMENTS_RETAINERS');

-- CreateEnum
CREATE TYPE "FinanceSyncJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "FixedExpenseFrequency" AS ENUM ('MONTHLY', 'YEARLY', 'WEEKLY', 'QUARTERLY', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "FixedExpenseStatus" AS ENUM ('ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "TaskSheetType" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "TaskSheetItemPriority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'ON_LEAVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "OnboardingStepType" AS ENUM ('TASK', 'TRAINING', 'DOCUMENT', 'MEETING', 'CHECKLIST');

-- CreateEnum
CREATE TYPE "WorkerOnboardingStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "WorkerOnboardingStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WorkerTaskPriority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "WorkerTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DashboardWidgetType" AS ENUM ('ANALYTICS', 'TABLE', 'GOAL', 'TABLE_VIEWS_DASHBOARD', 'MINI_CALENDAR', 'MINI_TASKS', 'MINI_QUOTES');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'VALIDATED', 'IMPORTING', 'IMPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalyticsViewType" AS ENUM ('COUNT', 'AVERAGE', 'SUM', 'CONVERSION', 'DISTRIBUTION', 'GRAPH');

-- CreateEnum
CREATE TYPE "ViewFolderType" AS ENUM ('ANALYTICS', 'AUTOMATION');

-- CreateEnum
CREATE TYPE "WhatsAppAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "WaMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WaMessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'LOCATION', 'STICKER', 'CONTACTS', 'TEMPLATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WaMessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WaConversationStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('SERVICE', 'COMPLAINT', 'RETENTION', 'OTHER');

-- CreateEnum
CREATE TYPE "SlaBreachType" AS ENUM ('RESPONSE', 'RESOLVE');

-- CreateEnum
CREATE TYPE "SlaBreachStatus" AS ENUM ('PENDING', 'REVIEWED', 'ACKNOWLEDGED');

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "businessType" TEXT,
    "taxId" TEXT,
    "businessAddress" TEXT,
    "businessWebsite" TEXT,
    "businessEmail" TEXT,
    "logoUrl" TEXT,
    "greenApiInstanceId" TEXT,
    "greenApiToken" TEXT,
    "webhookSigningSecret" TEXT,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "companyId" INTEGER NOT NULL,
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'basic',
    "isPremium" "UserTier" NOT NULL DEFAULT 'basic',
    "permissions" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "allowedWriteTableIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "tablePermissions" JSONB DEFAULT '{}',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "senderId" INTEGER NOT NULL,
    "receiverId" INTEGER,
    "groupId" INTEGER,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "creatorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" "AutomationTriggerType" NOT NULL,
    "triggerConfig" JSONB,
    "actionType" "AutomationActionType" NOT NULL,
    "actionConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "analyticsOrder" INTEGER,
    "analyticsColor" TEXT,
    "cachedStats" JSONB,
    "lastCachedAt" TIMESTAMP(3),
    "folderId" INTEGER,
    "calendarEventId" TEXT,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" BIGSERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableMeta" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "schemaJson" JSONB NOT NULL,
    "tabsConfig" JSONB,
    "displayConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "categoryId" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TableMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableCategory" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "View" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tableId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "View_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Record" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tableId" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdBy" INTEGER,
    "updatedBy" INTEGER,
    "dialedById" INTEGER,
    "dialedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "recordId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "displayName" TEXT,
    "uploadedBy" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "recordId" INTEGER,
    "userId" INTEGER,
    "taskId" TEXT,
    "action" TEXT NOT NULL,
    "diffJson" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL,
    "assigneeId" INTEGER,
    "priority" "TaskPriority",
    "dueDate" TIMESTAMP(3),
    "tags" TEXT[],
    "duration_status_change" TEXT,
    "creatorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "businessName" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retainer" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "frequency" "RetainerFrequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "nextDueDate" TIMESTAMP(3),
    "status" "RetainerStatus" NOT NULL,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneTimePayment" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneTimePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "relatedType" "TransactionRelatedType" NOT NULL,
    "relatedId" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "attemptedBy" INTEGER,
    "attemptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidDate" TIMESTAMP(3),
    "status" "PaymentStatus" NOT NULL,
    "receiptFile" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethodInternal" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "methodType" TEXT NOT NULL,
    "details" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethodInternal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusDuration" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "automationRuleId" INTEGER NOT NULL,
    "recordId" INTEGER,
    "taskId" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "durationString" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusDuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultiEventDuration" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "automationRuleId" INTEGER NOT NULL,
    "recordId" INTEGER,
    "taskId" TEXT,
    "eventChain" JSONB NOT NULL,
    "eventDeltas" JSONB NOT NULL,
    "totalDurationSeconds" INTEGER NOT NULL,
    "totalDurationString" TEXT NOT NULL,
    "weightedScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MultiEventDuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsView" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" "AnalyticsViewType" NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT DEFAULT 'bg-white',
    "cachedStats" JSONB,
    "lastCachedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "folderId" INTEGER,

    CONSTRAINT "AnalyticsView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewFolder" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ViewFolderType" NOT NULL DEFAULT 'ANALYTICS',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViewFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT 'blue',
    "icon" TEXT DEFAULT 'GitBranch',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStage" (
    "id" SERIAL NOT NULL,
    "workflowId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowInstance" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workflowId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'active',
    "currentStageId" INTEGER,
    "creatorId" INTEGER NOT NULL,
    "assigneeId" INTEGER,
    "completedStages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "type" "ProductType" NOT NULL DEFAULT 'SERVICE',
    "price" DECIMAL(10,2) NOT NULL,
    "cost" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "quoteNumber" INTEGER,
    "clientId" INTEGER,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "clientTaxId" TEXT,
    "clientAddress" TEXT,
    "total" DECIMAL(10,2) NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "pdfUrl" TEXT,
    "shareToken" TEXT,
    "isTrashed" BOOLEAN NOT NULL DEFAULT false,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isPriceWithVat" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "currency" "Currency" NOT NULL DEFAULT 'ILS',
    "exchangeRate" DECIMAL(10,4),
    "discountType" TEXT,
    "discountValue" DECIMAL(10,2),

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" SERIAL NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" INTEGER,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "unitCost" DECIMAL(10,2),

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "type" "TicketType" NOT NULL DEFAULT 'SERVICE',
    "clientId" INTEGER,
    "assigneeId" INTEGER,
    "creatorId" INTEGER NOT NULL,
    "tags" TEXT[],
    "slaDueDate" TIMESTAMP(3),
    "slaResponseDueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketComment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketActivityLog" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "oldLabel" TEXT,
    "newLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TicketPriority" NOT NULL,
    "responseTimeMinutes" INTEGER NOT NULL,
    "resolveTimeMinutes" INTEGER NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaBreach" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "priority" TEXT NOT NULL,
    "slaDueDate" TIMESTAMP(3) NOT NULL,
    "breachType" "SlaBreachType" NOT NULL DEFAULT 'RESOLVE',
    "breachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SlaBreachStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,

    CONSTRAINT "SlaBreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "folderId" INTEGER,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "source" TEXT,
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recordId" INTEGER,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "metricType" "GoalMetricType" NOT NULL,
    "targetType" "GoalTargetType" NOT NULL DEFAULT 'SUM',
    "targetValue" DECIMAL(15,2) NOT NULL,
    "filters" JSONB DEFAULT '{}',
    "periodType" "GoalPeriodType" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "warningThreshold" INTEGER NOT NULL DEFAULT 70,
    "criticalThreshold" INTEGER NOT NULL DEFAULT 50,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceRecord" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "type" "FinanceRecordType" NOT NULL,
    "category" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "FinanceRecordStatus" NOT NULL DEFAULT 'COMPLETED',
    "clientId" INTEGER,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncRuleId" INTEGER,
    "originId" TEXT,

    CONSTRAINT "FinanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSyncRule" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "targetType" "FinanceRecordType" NOT NULL,
    "sourceType" "FinanceSyncSourceType" NOT NULL,
    "sourceId" INTEGER,
    "fieldMapping" JSONB NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSyncRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSyncJob" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "syncRuleId" INTEGER NOT NULL,
    "status" "FinanceSyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedExpense" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "frequency" "FixedExpenseFrequency" NOT NULL,
    "payDay" INTEGER,
    "category" TEXT,
    "description" TEXT,
    "status" "FixedExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSheet" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "TaskSheetType" NOT NULL DEFAULT 'DAILY',
    "assigneeId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSheetItem" (
    "id" SERIAL NOT NULL,
    "sheetId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskSheetItemPriority" NOT NULL DEFAULT 'NORMAL',
    "category" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "dueTime" TEXT,
    "notes" TEXT,
    "linkedTaskId" TEXT,
    "onCompleteActions" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSheetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#3B82F6',
    "icon" TEXT DEFAULT 'Building2',
    "managerId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "avatar" TEXT,
    "departmentId" INTEGER NOT NULL,
    "position" TEXT,
    "employeeId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "status" "WorkerStatus" NOT NULL DEFAULT 'ONBOARDING',
    "linkedUserId" INTEGER,
    "customFields" JSONB DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingPath" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "departmentId" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "estimatedDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingPath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingStep" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "pathId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "OnboardingStepType" NOT NULL DEFAULT 'TASK',
    "order" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutes" INTEGER,
    "resourceUrl" TEXT,
    "resourceType" TEXT,
    "requiresSteps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "onCompleteActions" JSONB DEFAULT '[]',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerOnboarding" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "pathId" INTEGER NOT NULL,
    "status" "WorkerOnboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerOnboardingStep" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "onboardingId" INTEGER NOT NULL,
    "stepId" INTEGER NOT NULL,
    "status" "WorkerOnboardingStepStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "score" INTEGER,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerOnboardingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerTask" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "WorkerTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "WorkerTaskStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NurtureList" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NurtureList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NurtureSubscriber" (
    "id" SERIAL NOT NULL,
    "nurtureListId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "emailActive" BOOLEAN NOT NULL DEFAULT true,
    "phoneActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "sourceTableId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NurtureSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "widgetType" "DashboardWidgetType" NOT NULL,
    "referenceId" TEXT,
    "tableId" INTEGER,
    "settings" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewRefreshLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "viewId" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewRefreshLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsRefreshLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsRefreshLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationLog" (
    "id" BIGSERIAL NOT NULL,
    "automationRuleId" INTEGER NOT NULL,
    "recordId" INTEGER,
    "calendarEventId" TEXT,
    "companyId" INTEGER NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "tableId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "originalName" TEXT,
    "fileHash" TEXT,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'UPLOADED',
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppAccount" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "wabaId" TEXT NOT NULL,
    "appId" TEXT,
    "businessName" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "accessTokenIv" TEXT NOT NULL,
    "accessTokenTag" TEXT NOT NULL,
    "webhookVerifyToken" TEXT NOT NULL,
    "status" "WhatsAppAccountStatus" NOT NULL DEFAULT 'PENDING',
    "connectedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppPhoneNumber" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhone" TEXT NOT NULL,
    "verifiedName" TEXT,
    "qualityRating" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppPhoneNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaContact" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "waId" TEXT NOT NULL,
    "profileName" TEXT,
    "phone" TEXT,
    "clientId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaConversation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "phoneNumberId" INTEGER NOT NULL,
    "contactId" INTEGER NOT NULL,
    "status" "WaConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastInboundAt" TIMESTAMP(3),
    "assignedUserId" INTEGER,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaMessage" (
    "id" BIGSERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "conversationId" INTEGER NOT NULL,
    "phoneNumberId" INTEGER NOT NULL,
    "contactId" INTEGER NOT NULL,
    "wamId" TEXT,
    "direction" "WaMessageDirection" NOT NULL,
    "type" "WaMessageType" NOT NULL DEFAULT 'TEXT',
    "status" "WaMessageStatus" NOT NULL DEFAULT 'PENDING',
    "body" TEXT,
    "mediaId" TEXT,
    "mediaUrl" TEXT,
    "mediaMime" TEXT,
    "mediaFileName" TEXT,
    "mediaSha256" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationName" TEXT,
    "locationAddress" TEXT,
    "contextWamId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "sentByUserId" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_companyId_idx" ON "ApiKey"("companyId");

-- CreateIndex
CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "Message_companyId_idx" ON "Message"("companyId");

-- CreateIndex
CREATE INDEX "Message_senderId_receiverId_createdAt_idx" ON "Message"("senderId", "receiverId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Message_groupId_createdAt_idx" ON "Message"("groupId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Message_receiverId_read_idx" ON "Message"("receiverId", "read");

-- CreateIndex
CREATE INDEX "Group_companyId_idx" ON "Group"("companyId");

-- CreateIndex
CREATE INDEX "GroupMember_companyId_idx" ON "GroupMember"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "AutomationRule_companyId_isActive_triggerType_idx" ON "AutomationRule"("companyId", "isActive", "triggerType");

-- CreateIndex
CREATE INDEX "AutomationRule_companyId_isActive_actionType_idx" ON "AutomationRule"("companyId", "isActive", "actionType");

-- CreateIndex
CREATE INDEX "AutomationRule_calendarEventId_idx" ON "AutomationRule"("calendarEventId");

-- CreateIndex
CREATE INDEX "AutomationRule_companyId_triggerType_calendarEventId_idx" ON "AutomationRule"("companyId", "triggerType", "calendarEventId");

-- CreateIndex
CREATE INDEX "Notification_companyId_idx" ON "Notification"("companyId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_userId_companyId_createdAt_idx" ON "Notification"("userId", "companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");

-- CreateIndex
CREATE INDEX "TableMeta_companyId_deletedAt_idx" ON "TableMeta"("companyId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TableMeta_companyId_slug_key" ON "TableMeta"("companyId", "slug");

-- CreateIndex
CREATE INDEX "TableCategory_companyId_idx" ON "TableCategory"("companyId");

-- CreateIndex
CREATE INDEX "View_companyId_idx" ON "View"("companyId");

-- CreateIndex
CREATE INDEX "View_tableId_order_idx" ON "View"("tableId", "order");

-- CreateIndex
CREATE INDEX "View_tableId_companyId_isEnabled_idx" ON "View"("tableId", "companyId", "isEnabled");

-- CreateIndex
CREATE INDEX "View_companyId_isEnabled_order_createdAt_idx" ON "View"("companyId", "isEnabled", "order", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "View_tableId_slug_key" ON "View"("tableId", "slug");

-- CreateIndex
CREATE INDEX "Record_companyId_idx" ON "Record"("companyId");

-- CreateIndex
CREATE INDEX "Record_tableId_companyId_createdAt_idx" ON "Record"("tableId", "companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Record_tableId_companyId_idx" ON "Record"("tableId", "companyId");

-- CreateIndex
CREATE INDEX "Record_tableId_id_idx" ON "Record"("tableId", "id" DESC);

-- CreateIndex
CREATE INDEX "Attachment_recordId_idx" ON "Attachment"("recordId");

-- CreateIndex
CREATE INDEX "Attachment_uploadedBy_idx" ON "Attachment"("uploadedBy");

-- CreateIndex
CREATE INDEX "Attachment_companyId_idx" ON "Attachment"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_idx" ON "AuditLog"("companyId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_timestamp_idx" ON "AuditLog"("companyId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_recordId_action_timestamp_idx" ON "AuditLog"("recordId", "action", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_taskId_companyId_action_timestamp_idx" ON "AuditLog"("taskId", "companyId", "action", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "Task_companyId_assigneeId_createdAt_idx" ON "Task"("companyId", "assigneeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Task_companyId_status_idx" ON "Task"("companyId", "status");

-- CreateIndex
CREATE INDEX "Task_companyId_status_updatedAt_idx" ON "Task"("companyId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Task_companyId_createdAt_idx" ON "Task"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CalendarEvent_companyId_startTime_endTime_idx" ON "CalendarEvent"("companyId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "Client_companyId_idx" ON "Client"("companyId");

-- CreateIndex
CREATE INDEX "Client_companyId_createdAt_idx" ON "Client"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Retainer_clientId_status_idx" ON "Retainer"("clientId", "status");

-- CreateIndex
CREATE INDEX "Retainer_companyId_createdAt_idx" ON "Retainer"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Retainer_companyId_status_idx" ON "Retainer"("companyId", "status");

-- CreateIndex
CREATE INDEX "OneTimePayment_clientId_status_paidDate_idx" ON "OneTimePayment"("clientId", "status", "paidDate");

-- CreateIndex
CREATE INDEX "OneTimePayment_companyId_createdAt_idx" ON "OneTimePayment"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OneTimePayment_companyId_status_paidDate_idx" ON "OneTimePayment"("companyId", "status", "paidDate");

-- CreateIndex
CREATE INDEX "Transaction_clientId_status_paidDate_idx" ON "Transaction"("clientId", "status", "paidDate");

-- CreateIndex
CREATE INDEX "Transaction_companyId_createdAt_idx" ON "Transaction"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Transaction_companyId_status_paidDate_idx" ON "Transaction"("companyId", "status", "paidDate");

-- CreateIndex
CREATE INDEX "Transaction_attemptedBy_idx" ON "Transaction"("attemptedBy");

-- CreateIndex
CREATE INDEX "PaymentMethodInternal_clientId_idx" ON "PaymentMethodInternal"("clientId");

-- CreateIndex
CREATE INDEX "StatusDuration_companyId_idx" ON "StatusDuration"("companyId");

-- CreateIndex
CREATE INDEX "StatusDuration_automationRuleId_createdAt_idx" ON "StatusDuration"("automationRuleId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StatusDuration_recordId_idx" ON "StatusDuration"("recordId");

-- CreateIndex
CREATE INDEX "StatusDuration_taskId_idx" ON "StatusDuration"("taskId");

-- CreateIndex
CREATE INDEX "MultiEventDuration_companyId_idx" ON "MultiEventDuration"("companyId");

-- CreateIndex
CREATE INDEX "MultiEventDuration_automationRuleId_createdAt_idx" ON "MultiEventDuration"("automationRuleId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MultiEventDuration_recordId_idx" ON "MultiEventDuration"("recordId");

-- CreateIndex
CREATE INDEX "MultiEventDuration_taskId_idx" ON "MultiEventDuration"("taskId");

-- CreateIndex
CREATE INDEX "MultiEventDuration_automationRuleId_recordId_createdAt_idx" ON "MultiEventDuration"("automationRuleId", "recordId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MultiEventDuration_automationRuleId_recordId_key" ON "MultiEventDuration"("automationRuleId", "recordId");

-- CreateIndex
CREATE INDEX "AnalyticsView_companyId_idx" ON "AnalyticsView"("companyId");

-- CreateIndex
CREATE INDEX "AnalyticsView_companyId_type_idx" ON "AnalyticsView"("companyId", "type");

-- CreateIndex
CREATE INDEX "ViewFolder_companyId_idx" ON "ViewFolder"("companyId");

-- CreateIndex
CREATE INDEX "Workflow_companyId_idx" ON "Workflow"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStage_workflowId_order_key" ON "WorkflowStage"("workflowId", "order");

-- CreateIndex
CREATE INDEX "WorkflowInstance_companyId_updatedAt_idx" ON "WorkflowInstance"("companyId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "WorkflowInstance_companyId_status_idx" ON "WorkflowInstance"("companyId", "status");

-- CreateIndex
CREATE INDEX "WorkflowInstance_workflowId_idx" ON "WorkflowInstance"("workflowId");

-- CreateIndex
CREATE INDEX "Product_companyId_name_idx" ON "Product"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_shareToken_key" ON "Quote"("shareToken");

-- CreateIndex
CREATE INDEX "Quote_companyId_isTrashed_idx" ON "Quote"("companyId", "isTrashed");

-- CreateIndex
CREATE INDEX "Quote_companyId_isTrashed_createdAt_idx" ON "Quote"("companyId", "isTrashed", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_companyId_quoteNumber_key" ON "Quote"("companyId", "quoteNumber");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteItem_productId_idx" ON "QuoteItem"("productId");

-- CreateIndex
CREATE INDEX "Ticket_companyId_status_updatedAt_idx" ON "Ticket"("companyId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Ticket_clientId_idx" ON "Ticket"("clientId");

-- CreateIndex
CREATE INDEX "Ticket_assigneeId_idx" ON "Ticket"("assigneeId");

-- CreateIndex
CREATE INDEX "Ticket_status_slaResponseDueDate_idx" ON "Ticket"("status", "slaResponseDueDate");

-- CreateIndex
CREATE INDEX "Ticket_status_slaDueDate_idx" ON "Ticket"("status", "slaDueDate");

-- CreateIndex
CREATE INDEX "Ticket_companyId_status_slaResponseDueDate_idx" ON "Ticket"("companyId", "status", "slaResponseDueDate");

-- CreateIndex
CREATE INDEX "Ticket_companyId_status_slaDueDate_idx" ON "Ticket"("companyId", "status", "slaDueDate");

-- CreateIndex
CREATE INDEX "TicketComment_ticketId_createdAt_idx" ON "TicketComment"("ticketId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TicketComment_userId_idx" ON "TicketComment"("userId");

-- CreateIndex
CREATE INDEX "TicketActivityLog_ticketId_createdAt_idx" ON "TicketActivityLog"("ticketId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TicketActivityLog_userId_idx" ON "TicketActivityLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicy_companyId_priority_key" ON "SlaPolicy"("companyId", "priority");

-- CreateIndex
CREATE INDEX "SlaBreach_companyId_status_idx" ON "SlaBreach"("companyId", "status");

-- CreateIndex
CREATE INDEX "SlaBreach_companyId_breachedAt_idx" ON "SlaBreach"("companyId", "breachedAt" DESC);

-- CreateIndex
CREATE INDEX "SlaBreach_ticketId_idx" ON "SlaBreach"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "SlaBreach_ticketId_breachType_slaDueDate_key" ON "SlaBreach"("ticketId", "breachType", "slaDueDate");

-- CreateIndex
CREATE INDEX "Folder_companyId_idx" ON "Folder"("companyId");

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

-- CreateIndex
CREATE INDEX "File_companyId_idx" ON "File"("companyId");

-- CreateIndex
CREATE INDEX "File_folderId_idx" ON "File"("folderId");

-- CreateIndex
CREATE INDEX "File_recordId_idx" ON "File"("recordId");

-- CreateIndex
CREATE INDEX "Goal_companyId_isArchived_order_idx" ON "Goal"("companyId", "isArchived", "order");

-- CreateIndex
CREATE INDEX "Goal_companyId_isArchived_endDate_idx" ON "Goal"("companyId", "isArchived", "endDate");

-- CreateIndex
CREATE INDEX "Goal_companyId_isActive_endDate_idx" ON "Goal"("companyId", "isActive", "endDate");

-- CreateIndex
CREATE INDEX "FinanceRecord_companyId_idx" ON "FinanceRecord"("companyId");

-- CreateIndex
CREATE INDEX "FinanceRecord_companyId_type_date_idx" ON "FinanceRecord"("companyId", "type", "date");

-- CreateIndex
CREATE INDEX "FinanceRecord_companyId_originId_idx" ON "FinanceRecord"("companyId", "originId");

-- CreateIndex
CREATE INDEX "FinanceRecord_clientId_idx" ON "FinanceRecord"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceRecord_syncRuleId_originId_key" ON "FinanceRecord"("syncRuleId", "originId");

-- CreateIndex
CREATE INDEX "FinanceSyncRule_companyId_idx" ON "FinanceSyncRule"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceSyncRule_companyId_sourceType_sourceId_key" ON "FinanceSyncRule"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "FinanceSyncJob_syncRuleId_companyId_status_idx" ON "FinanceSyncJob"("syncRuleId", "companyId", "status");

-- CreateIndex
CREATE INDEX "FixedExpense_companyId_idx" ON "FixedExpense"("companyId");

-- CreateIndex
CREATE INDEX "TaskSheet_companyId_isActive_createdAt_idx" ON "TaskSheet"("companyId", "isActive", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TaskSheet_companyId_assigneeId_isActive_validFrom_idx" ON "TaskSheet"("companyId", "assigneeId", "isActive", "validFrom");

-- CreateIndex
CREATE INDEX "TaskSheet_createdById_idx" ON "TaskSheet"("createdById");

-- CreateIndex
CREATE INDEX "TaskSheetItem_sheetId_idx" ON "TaskSheetItem"("sheetId");

-- CreateIndex
CREATE INDEX "TaskSheetItem_sheetId_isCompleted_idx" ON "TaskSheetItem"("sheetId", "isCompleted");

-- CreateIndex
CREATE INDEX "TaskSheetItem_linkedTaskId_idx" ON "TaskSheetItem"("linkedTaskId");

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE INDEX "Department_managerId_idx" ON "Department"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_linkedUserId_key" ON "Worker"("linkedUserId");

-- CreateIndex
CREATE INDEX "Worker_companyId_status_firstName_idx" ON "Worker"("companyId", "status", "firstName");

-- CreateIndex
CREATE INDEX "Worker_companyId_departmentId_idx" ON "Worker"("companyId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_companyId_employeeId_key" ON "Worker"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "OnboardingPath_departmentId_idx" ON "OnboardingPath"("departmentId");

-- CreateIndex
CREATE INDEX "OnboardingPath_companyId_departmentId_isDefault_isActive_idx" ON "OnboardingPath"("companyId", "departmentId", "isDefault", "isActive");

-- CreateIndex
CREATE INDEX "OnboardingStep_pathId_order_idx" ON "OnboardingStep"("pathId", "order");

-- CreateIndex
CREATE INDEX "WorkerOnboarding_workerId_idx" ON "WorkerOnboarding"("workerId");

-- CreateIndex
CREATE INDEX "WorkerOnboarding_pathId_idx" ON "WorkerOnboarding"("pathId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerOnboarding_workerId_pathId_key" ON "WorkerOnboarding"("workerId", "pathId");

-- CreateIndex
CREATE INDEX "WorkerOnboardingStep_onboardingId_idx" ON "WorkerOnboardingStep"("onboardingId");

-- CreateIndex
CREATE INDEX "WorkerOnboardingStep_stepId_idx" ON "WorkerOnboardingStep"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerOnboardingStep_onboardingId_stepId_key" ON "WorkerOnboardingStep"("onboardingId", "stepId");

-- CreateIndex
CREATE INDEX "WorkerTask_workerId_idx" ON "WorkerTask"("workerId");

-- CreateIndex
CREATE INDEX "WorkerTask_companyId_workerId_status_idx" ON "WorkerTask"("companyId", "workerId", "status");

-- CreateIndex
CREATE INDEX "NurtureList_companyId_idx" ON "NurtureList"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "NurtureList_companyId_slug_key" ON "NurtureList"("companyId", "slug");

-- CreateIndex
CREATE INDEX "NurtureSubscriber_nurtureListId_idx" ON "NurtureSubscriber"("nurtureListId");

-- CreateIndex
CREATE INDEX "NurtureSubscriber_email_idx" ON "NurtureSubscriber"("email");

-- CreateIndex
CREATE INDEX "NurtureSubscriber_phone_idx" ON "NurtureSubscriber"("phone");

-- CreateIndex
CREATE INDEX "DashboardWidget_userId_companyId_order_idx" ON "DashboardWidget"("userId", "companyId", "order");

-- CreateIndex
CREATE INDEX "DashboardWidget_companyId_widgetType_idx" ON "DashboardWidget"("companyId", "widgetType");

-- CreateIndex
CREATE INDEX "ViewRefreshLog_userId_viewId_timestamp_idx" ON "ViewRefreshLog"("userId", "viewId", "timestamp");

-- CreateIndex
CREATE INDEX "ViewRefreshLog_companyId_timestamp_idx" ON "ViewRefreshLog"("companyId", "timestamp");

-- CreateIndex
CREATE INDEX "AnalyticsRefreshLog_userId_timestamp_idx" ON "AnalyticsRefreshLog"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "AnalyticsRefreshLog_companyId_timestamp_idx" ON "AnalyticsRefreshLog"("companyId", "timestamp");

-- CreateIndex
CREATE INDEX "AutomationLog_recordId_idx" ON "AutomationLog"("recordId");

-- CreateIndex
CREATE INDEX "AutomationLog_calendarEventId_idx" ON "AutomationLog"("calendarEventId");

-- CreateIndex
CREATE INDEX "AutomationLog_companyId_idx" ON "AutomationLog"("companyId");

-- CreateIndex
CREATE INDEX "AutomationLog_companyId_executedAt_idx" ON "AutomationLog"("companyId", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationLog_automationRuleId_recordId_key" ON "AutomationLog"("automationRuleId", "recordId");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationLog_automationRuleId_calendarEventId_key" ON "AutomationLog"("automationRuleId", "calendarEventId");

-- CreateIndex
CREATE INDEX "ImportJob_companyId_idx" ON "ImportJob"("companyId");

-- CreateIndex
CREATE INDEX "ImportJob_tableId_idx" ON "ImportJob"("tableId");

-- CreateIndex
CREATE INDEX "WhatsAppAccount_companyId_idx" ON "WhatsAppAccount"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAccount_companyId_wabaId_key" ON "WhatsAppAccount"("companyId", "wabaId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppPhoneNumber_phoneNumberId_key" ON "WhatsAppPhoneNumber"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppPhoneNumber_companyId_idx" ON "WhatsAppPhoneNumber"("companyId");

-- CreateIndex
CREATE INDEX "WhatsAppPhoneNumber_accountId_idx" ON "WhatsAppPhoneNumber"("accountId");

-- CreateIndex
CREATE INDEX "WaContact_companyId_idx" ON "WaContact"("companyId");

-- CreateIndex
CREATE INDEX "WaContact_clientId_idx" ON "WaContact"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "WaContact_companyId_waId_key" ON "WaContact"("companyId", "waId");

-- CreateIndex
CREATE INDEX "WaConversation_companyId_status_lastMessageAt_idx" ON "WaConversation"("companyId", "status", "lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "WaConversation_companyId_assignedUserId_status_idx" ON "WaConversation"("companyId", "assignedUserId", "status");

-- CreateIndex
CREATE INDEX "WaConversation_contactId_idx" ON "WaConversation"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "WaConversation_phoneNumberId_contactId_key" ON "WaConversation"("phoneNumberId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "WaMessage_wamId_key" ON "WaMessage"("wamId");

-- CreateIndex
CREATE INDEX "WaMessage_conversationId_timestamp_idx" ON "WaMessage"("conversationId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "WaMessage_companyId_wamId_idx" ON "WaMessage"("companyId", "wamId");

-- CreateIndex
CREATE INDEX "WaMessage_contactId_timestamp_idx" ON "WaMessage"("contactId", "timestamp" DESC);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ViewFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableMeta" ADD CONSTRAINT "TableMeta_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableMeta" ADD CONSTRAINT "TableMeta_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TableCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableMeta" ADD CONSTRAINT "TableMeta_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableCategory" ADD CONSTRAINT "TableCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "View" ADD CONSTRAINT "View_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "View" ADD CONSTRAINT "View_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "TableMeta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_dialedById_fkey" FOREIGN KEY ("dialedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "TableMeta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Record" ADD CONSTRAINT "Record_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retainer" ADD CONSTRAINT "Retainer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneTimePayment" ADD CONSTRAINT "OneTimePayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_attemptedBy_fkey" FOREIGN KEY ("attemptedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethodInternal" ADD CONSTRAINT "PaymentMethodInternal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusDuration" ADD CONSTRAINT "StatusDuration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusDuration" ADD CONSTRAINT "StatusDuration_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusDuration" ADD CONSTRAINT "StatusDuration_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusDuration" ADD CONSTRAINT "StatusDuration_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiEventDuration" ADD CONSTRAINT "MultiEventDuration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiEventDuration" ADD CONSTRAINT "MultiEventDuration_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiEventDuration" ADD CONSTRAINT "MultiEventDuration_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiEventDuration" ADD CONSTRAINT "MultiEventDuration_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsView" ADD CONSTRAINT "AnalyticsView_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ViewFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsView" ADD CONSTRAINT "AnalyticsView_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewFolder" ADD CONSTRAINT "ViewFolder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "WorkflowStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketComment" ADD CONSTRAINT "TicketComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketActivityLog" ADD CONSTRAINT "TicketActivityLog_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketActivityLog" ADD CONSTRAINT "TicketActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaPolicy" ADD CONSTRAINT "SlaPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaBreach" ADD CONSTRAINT "SlaBreach_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaBreach" ADD CONSTRAINT "SlaBreach_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_syncRuleId_fkey" FOREIGN KEY ("syncRuleId") REFERENCES "FinanceSyncRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSyncRule" ADD CONSTRAINT "FinanceSyncRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSyncJob" ADD CONSTRAINT "FinanceSyncJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSyncJob" ADD CONSTRAINT "FinanceSyncJob_syncRuleId_fkey" FOREIGN KEY ("syncRuleId") REFERENCES "FinanceSyncRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedExpense" ADD CONSTRAINT "FixedExpense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSheet" ADD CONSTRAINT "TaskSheet_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSheet" ADD CONSTRAINT "TaskSheet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSheet" ADD CONSTRAINT "TaskSheet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSheetItem" ADD CONSTRAINT "TaskSheetItem_linkedTaskId_fkey" FOREIGN KEY ("linkedTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSheetItem" ADD CONSTRAINT "TaskSheetItem_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "TaskSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPath" ADD CONSTRAINT "OnboardingPath_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingPath" ADD CONSTRAINT "OnboardingPath_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingStep" ADD CONSTRAINT "OnboardingStep_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingStep" ADD CONSTRAINT "OnboardingStep_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "OnboardingPath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerOnboarding" ADD CONSTRAINT "WorkerOnboarding_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerOnboarding" ADD CONSTRAINT "WorkerOnboarding_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "OnboardingPath"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerOnboarding" ADD CONSTRAINT "WorkerOnboarding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerOnboardingStep" ADD CONSTRAINT "WorkerOnboardingStep_onboardingId_fkey" FOREIGN KEY ("onboardingId") REFERENCES "WorkerOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerOnboardingStep" ADD CONSTRAINT "WorkerOnboardingStep_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "OnboardingStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerOnboardingStep" ADD CONSTRAINT "WorkerOnboardingStep_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerTask" ADD CONSTRAINT "WorkerTask_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerTask" ADD CONSTRAINT "WorkerTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NurtureList" ADD CONSTRAINT "NurtureList_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NurtureSubscriber" ADD CONSTRAINT "NurtureSubscriber_nurtureListId_fkey" FOREIGN KEY ("nurtureListId") REFERENCES "NurtureList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewRefreshLog" ADD CONSTRAINT "ViewRefreshLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewRefreshLog" ADD CONSTRAINT "ViewRefreshLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViewRefreshLog" ADD CONSTRAINT "ViewRefreshLog_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "View"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsRefreshLog" ADD CONSTRAINT "AnalyticsRefreshLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsRefreshLog" ADD CONSTRAINT "AnalyticsRefreshLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationLog" ADD CONSTRAINT "AutomationLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "TableMeta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppAccount" ADD CONSTRAINT "WhatsAppAccount_connectedBy_fkey" FOREIGN KEY ("connectedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppAccount" ADD CONSTRAINT "WhatsAppAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppPhoneNumber" ADD CONSTRAINT "WhatsAppPhoneNumber_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppPhoneNumber" ADD CONSTRAINT "WhatsAppPhoneNumber_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "WhatsAppAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaContact" ADD CONSTRAINT "WaContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "WhatsAppPhoneNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaConversation" ADD CONSTRAINT "WaConversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "WaConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES "WhatsAppPhoneNumber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaMessage" ADD CONSTRAINT "WaMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "WaContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
