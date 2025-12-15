import { NextResponse } from "next/server";
import { jobs } from "../store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const job = jobs[id];
  if (!job) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, status: job.status, error: job.error });
}
