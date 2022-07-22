export interface ReportItem {
  count: number;
  ids: string[];
  errors: string[];
}

export interface Report {
  pausedApps: ReportItem | string;
  expiredApps: ReportItem | string;
  attestationNotifications: ReportItem | string;
  expiryNotifications1: ReportItem | string;
  expiryNotifications2: ReportItem | string;
}
