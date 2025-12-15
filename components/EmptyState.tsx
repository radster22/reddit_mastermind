"use client";

export default function EmptyState() {
  return (
    <div className="card p-10 text-center border-dashed border-2 border-slate-300 bg-slate-50">
      <p className="text-lg font-semibold text-slate-600">
        No content scheduled yet
      </p>
      <p className="muted mt-2">
        Generate a calendar to see posts appear on the schedule.
      </p>
    </div>
  );
}
