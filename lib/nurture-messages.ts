export interface NurtureMessage {
  id: string;
  name: string;
  isActive: boolean;
  smsBody: string;
  whatsappGreenBody: string;
  whatsappCloudTemplateName: string;
  whatsappCloudLanguageCode: string;
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
  }];
}

/** Get the active message from the array */
export function getActiveMessage(messages: NurtureMessage[]): NurtureMessage | null {
  return messages.find((m) => m.isActive) || null;
}
