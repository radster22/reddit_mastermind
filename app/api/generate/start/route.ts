import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { jobs } from "../store";
import { runGeneration } from "../../generate-calendar/route";

async function triggerGeneration(jobId: string, body: any) {
  jobs[jobId] = { status: "running", result: null, error: null };

  try {
    const json = await runGeneration(body);
    jobs[jobId] = { status: json.ok ? "success" : "error", result: json, error: json.ok ? null : json.error || "unknown_error" };
  } catch (err: any) {
    jobs[jobId] = { status: "error", result: null, error: err?.message || String(err) };
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const jobId = randomUUID();

  jobs[jobId] = { status: "pending", result: null, error: null };
  // fire-and-forget
  setImmediate(() => triggerGeneration(jobId, body));

  return NextResponse.json({ ok: true, job_id: jobId });
}
