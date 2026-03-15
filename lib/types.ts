export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  color?: string | null;
  source?: "crm" | "google";
  googleEventUrl?: string | null;
}

export interface GoogleMeetAttendee {
  email: string;
  displayName?: string;
  responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  self?: boolean;
}

export interface GoogleMeetEvent {
  id: string;
  title: string;
  description?: string | null;
  startTime: Date;
  endTime: Date;
  meetLink: string;
  organizer: { email: string; displayName?: string };
  attendees: GoogleMeetAttendee[];
  isRecurring: boolean;
  googleEventUrl?: string | null;
}

export const defaultEventColors = [
  "#4285F4", // Google Blue
  "#EA4335", // Google Red
  "#FBBC04", // Google Yellow
  "#34A853", // Google Green
  "#9334E6", // Purple
  "#F97316", // Orange
  "#06B6D4", // Cyan
  "#EC4899", // Pink
];
