export type LiveUpdateSegment = {
  sets: number;
  started: boolean;
};

export type LiveUpdateNotificationPayload = {
  title: string;
  text: string;
  startedAtMillis: number;
  shortCriticalText: string;
  progress: number;
  segments: LiveUpdateSegment[];
};
