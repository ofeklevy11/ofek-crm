export type SmartFieldType = "text" | "select" | "date" | "boolean";

export type SmartField = {
  key: string;
  label: string;
  type: SmartFieldType;
  options?: { value: string; label: string }[];
};

const BASE_FIELDS: SmartField[] = [
  { key: "name", label: "שם", type: "text" },
  { key: "email", label: "אימייל", type: "text" },
  { key: "phone", label: "טלפון", type: "text" },
  {
    key: "sourceType",
    label: "מקור",
    type: "select",
    options: [
      { value: "ידני", label: "ידני" },
      { value: "אוטומציה", label: "אוטומציה" },
      { value: "Webhook", label: "Webhook" },
    ],
  },
  {
    key: "phoneActive",
    label: "טלפון פעיל",
    type: "boolean",
  },
];

export const BIRTHDAY_SMART_FIELDS: SmartField[] = [
  ...BASE_FIELDS,
  { key: "triggerDate", label: "תאריך לידה", type: "date" },
];

export const RENEWAL_SMART_FIELDS: SmartField[] = [
  ...BASE_FIELDS,
  { key: "triggerDate", label: "תאריך סיום חידוש", type: "date" },
];

export const WINBACK_SMART_FIELDS: SmartField[] = [
  ...BASE_FIELDS,
  { key: "triggerDate", label: "פעילות אחרונה", type: "date" },
];

export const REFERRAL_SMART_FIELDS: SmartField[] = BASE_FIELDS;
export const REVIEW_SMART_FIELDS: SmartField[] = BASE_FIELDS;
export const UPSELL_SMART_FIELDS: SmartField[] = BASE_FIELDS;

export const SMART_FIELDS_MAP: Record<string, SmartField[]> = {
  birthday: BIRTHDAY_SMART_FIELDS,
  renewal: RENEWAL_SMART_FIELDS,
  winback: WINBACK_SMART_FIELDS,
  referral: REFERRAL_SMART_FIELDS,
  review: REVIEW_SMART_FIELDS,
  upsell: UPSELL_SMART_FIELDS,
};
