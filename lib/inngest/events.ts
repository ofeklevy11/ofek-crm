/**
 * Typed Inngest event schemas for tenant isolation enforcement.
 * Every tenant-scoped event requires companyId: number.
 * Global events (cron cleanup, SLA scan) are explicitly typed without companyId.
 */

export type Events = {
  // --- Ticket events ---
  "ticket/notification": {
    data: {
      companyId: number;
      type: "assignee" | "comment";
      ticketId: number;
      ticketTitle?: string;
      isNew?: boolean;
      assigneeId?: number;
      userId?: number;
      userName?: string;
    };
  };
  "ticket/status-change": {
    data: {
      companyId: number;
      ticketId: number;
      ticketTitle: string;
      fromStatus: string;
      toStatus: string;
    };
  };
  "ticket/activity-log": {
    data: {
      companyId: number;
      ticketId: number;
      userId: number;
      previousData: any;
      newData: any;
    };
  };

  // --- Automation events ---
  "automation/new-record": {
    data: {
      companyId: number;
      tableId: number;
      tableName: string;
      recordId: number;
    };
  };
  "automation/record-update": {
    data: {
      companyId: number;
      tableId: number;
      recordId: number;
      oldData: any;
      newData: any;
      tableName?: string;
    };
  };
  "automation/task-status-change": {
    data: {
      companyId: number;
      taskId: number | string;
      taskTitle?: string;
      fromStatus: string;
      toStatus: string;
    };
  };
  "automation/direct-dial": {
    data: {
      companyId: number;
      tableId: number;
      recordId: number;
      previousDialedAt?: string | null;
    };
  };
  "automation/time-based": {
    data: {
      companyId: number;
    };
  };
  "automation/event-based": {
    data: {
      companyId: number;
    };
  };
  "automation/send-whatsapp": {
    data: {
      companyId: number;
      phone: string;
      content: any;
      messageType?: any;
      mediaFileId?: any;
      delay?: any;
    };
  };
  "automation/send-webhook": {
    data: {
      companyId: number;
      url: string;
      payload: any;
      ruleId: number;
    };
  };
  "automation/multi-event-duration": {
    data: {
      companyId: number;
      tableId: number;
      recordId: number;
    };
  };
  "automation/meeting-reminders": {
    data: {
      triggeredAt?: string;
    };
  };

  // --- Workflow events ---
  "workflow/execute-stage-automations": {
    data: {
      companyId: number;
      stageDetails: any;
      stageName: string;
      stageId: number | string;
      instanceId: number | string;
      instanceName: string;
      userId: number;
    };
  };

  // --- Analytics events ---
  "analytics/refresh-company": {
    data: {
      companyId: number;
    };
  };
  "analytics/refresh-item": {
    data: {
      companyId: number;
      itemId: number;
      itemType: "AUTOMATION" | "CUSTOM";
    };
  };

  // --- Dashboard events ---
  "dashboard/refresh-widgets": {
    data: {
      companyId: number;
    };
  };
  "dashboard/refresh-goals": {
    data: {
      companyId: number;
    };
  };

  // --- WhatsApp Cloud events ---
  "whatsapp/incoming-message": {
    data: {
      companyId: number;
      phoneNumberDbId: number;
      accountId: number;
      phoneNumberId: string;
      message: any;
      contactProfile: string | null;
      contactWaId: string;
    };
  };
  "whatsapp/status-update": {
    data: {
      companyId: number;
      phoneNumberDbId: number;
      wamId: string;
      status: "sent" | "delivered" | "read" | "failed";
      timestamp: string;
      recipientId: string;
      errors: any[] | null;
    };
  };
  "whatsapp/send-message": {
    data: {
      companyId: number;
      conversationId: number;
      body: string;
      type: string;
      mediaUrl?: string;
      mediaFileName?: string;
      sentByUserId: number;
      templateName?: string;
      languageCode?: string;
      templateComponents?: unknown[];
    };
  };
  "whatsapp/download-media": {
    data: {
      companyId: number;
      accountId: number;
      messageId: string;
      mediaId: string;
    };
  };

  // --- SLA events ---
  "sla/manual-scan": {
    data: {
      triggeredAt: string;
    };
  };
  "sla/breach.detected": {
    data: {
      companyId: number;
      ticketId: number;
      breachId: number;
      breachType: "RESPONSE" | "RESOLVE";
      ticketTitle: string;
      ticketPriority: string;
      ticketStatus: string;
      assigneeName: string | null;
      assigneeId: number | null;
      automationRules: any[];
    };
  };

  // --- Task sheet events ---
  "task-sheet/item-completed": {
    data: {
      companyId: number;
      actions: any[];
      item: any;
      user: any;
    };
  };

  // --- PDF events ---
  "pdf/generate-quote": {
    data: {
      companyId: number;
      quoteId: string;
      oldPdfUrl?: string | null;
    };
  };

  // --- Notification events ---
  "notification/broadcast": {
    data: {
      companyId: number;
      userId: number;
      notification: any;
    };
  };

  // --- Import events ---
  "import/job.started": {
    data: {
      companyId: number;
      importJobId: string;
      tableId: number;
      userId: number;
    };
  };

  // --- Finance sync events ---
  "finance-sync/job.started": {
    data: {
      companyId: number;
      jobId: string;
      syncRuleId: number;
    };
  };

  // --- Bulk record events ---
  "records/bulk-delete": {
    data: {
      companyId: number;
      recordIds: number[];
      tableId: number;
      userId?: number;
    };
  };

  // --- SMS events ---
  "sms/send-message": {
    data: {
      companyId: number;
      toNumber: string;
      body: string;
      fromNumber?: string;
      sentByUserId?: number;
      automationRuleId?: number;
    };
  };
  "sms/status-update": {
    data: {
      companyId: number;
      twilioSid: string;
      status: string;
      errorCode?: string;
      errorMessage?: string;
    };
  };

  // --- Automation SMS event ---
  "automation/send-sms": {
    data: {
      companyId: number;
      phone: string;
      content: string;
      delay?: number;
    };
  };

  // --- AI events ---
  "ai/generation.requested": {
    data: {
      companyId: number;
      jobId: string;
      type: string;
      prompt: string;
      context?: any;
      mode?: string;
    };
  };

  // --- Nurture events ---
  "nurture/send-campaign-message": {
    data: {
      companyId: number;
      subscriberPhone: string;
      subscriberName: string;
      channels: { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean };
      smsBody: string;
      whatsappGreenBody: string;
      whatsappCloudTemplateName: string;
      whatsappCloudLanguageCode: string;
      slug: string;
    };
  };
  "nurture/process-date-triggers": {
    data: {
      companyId: number;
    };
  };
  "nurture/delayed-send": {
    data: {
      companyId: number;
      subscriberId: number;
      nurtureListId: number;
      subscriberPhone: string;
      subscriberName: string;
      channels: { sms: boolean; whatsappGreen: boolean; whatsappCloud: boolean };
      smsBody: string;
      whatsappGreenBody: string;
      whatsappCloudTemplateName: string;
      whatsappCloudLanguageCode: string;
      slug: string;
      delayMs: number;
      triggerKey: string;
    };
  };
};
