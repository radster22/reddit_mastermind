type JobStatus = "pending" | "running" | "success" | "error";

export type JobRecord = {
  status: JobStatus;
  result: any | null;
  error: string | null;
};

// In-memory store (resets on server restart)
export const jobs: Record<string, JobRecord> = {};
