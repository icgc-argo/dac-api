import { Application } from '../domain/interface';

export type JobSuccessResultForApplication = {
  success: true;
  app: Application;
};

export type JobErrorResultForApplication = {
  success: false;
  app: Application;
  message: string;
};

export type JobResultForApplication = JobSuccessResultForApplication | JobErrorResultForApplication;

export interface BatchJobDetails {
  count: number;
  ids: string[]; // all ids affected by a batch job
  errors: { id: string; message: string }[];
  errorCount: number;
}

export interface JobReport<T> {
  jobName: string;
  startedAt?: Date;
  finishedAt?: Date;
  success?: boolean;
  error?: string;
  details?: T;
}

export interface Report {
  pausedApps: JobReport<BatchJobDetails>;
  expiredApps: JobReport<BatchJobDetails>;
  attestationNotifications: JobReport<BatchJobDetails>;
  expiryNotifications1: JobReport<BatchJobDetails>;
  expiryNotifications2: JobReport<BatchJobDetails>;
  closedApps: JobReport<BatchJobDetails>;
  approvedUsers: JobReport<void>;
}
