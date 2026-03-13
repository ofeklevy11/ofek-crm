export interface NurtureMessage {
  id: string;
  name: string;
  isActive: boolean;
  smsBody: string;
  whatsappGreenBody: string;
  whatsappCloudTemplateName: string;
  whatsappCloudLanguageCode: string;
  emailSubject: string;
  emailBody: string;
}

/** Migrate old flat-field config to messages array */
export function migrateConfigMessages(config: any): NurtureMessage[] {
  if (Array.isArray(config.messages) && config.messages.length > 0) {
    return config.messages;
  }
  return [{
    id: "msg_default",
    name: "הודעה ראשית",
    isActive: true,
    smsBody: config.smsBody || "",
    whatsappGreenBody: config.whatsappGreenBody || "",
    whatsappCloudTemplateName: config.whatsappCloudTemplateName || "",
    whatsappCloudLanguageCode: config.whatsappCloudLanguageCode || "he",
    emailSubject: config.emailSubject || "",
    emailBody: config.emailBody || "",
  }];
}

/** Get the active message from the array */
export function getActiveMessage(messages: NurtureMessage[]): NurtureMessage | null {
  return messages.find((m) => m.isActive) || null;
}

/** Shared timing → delay-ms map used across webhook routes, manual add, and automations */
export const NURTURE_TIMING_MAP: Record<string, number> = {
  immediate: 0,
  "1_hour": 3_600_000,
  "24_hours": 86_400_000,
  "3_days": 259_200_000,
  "1_week": 604_800_000,
  "2_weeks": 1_209_600_000,
  "1_month": 2_592_000_000,
};
