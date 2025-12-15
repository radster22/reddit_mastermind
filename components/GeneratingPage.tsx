"use client";

import React, { useEffect, useState } from "react";

type Props = {
  onComplete: (success: boolean) => void;
};

export default function GeneratingPage({ onComplete }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function runGeneration() {
      try {
        const res = await fetch("/api/generate-calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Generation failed: ${res.status} ${txt}`);
        }

        if (!mounted) return;
        setFinished(true);
        onComplete(true);
      } catch (err: any) {
        if (!mounted) return;
        const msg = err?.message || String(err);
        setError(msg);
        setFinished(true);
        onComplete(false);
      }
    }

    runGeneration();

    // cleanup
    return () => {
      mounted = false;
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* translucent blurred backdrop covering the page */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md pointer-events-auto" />

      <div className="relative z-[10000] w-full max-w-md rounded-lg bg-white p-6 text-center shadow-lg">
        <div className="flex items-center justify-center">
          <div className="mr-4 h-10 w-10 animate-spin rounded-full border-4 border-t-slate-700 border-slate-200" />
          <div className="text-left">
            <div className="text-lg font-semibold">Generating content</div>
            <div className="text-sm text-slate-600">This may take a minute.</div>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-700">{error}</div>
        )}

        {finished && !error && (
          <div className="mt-4 text-sm text-slate-600">Generation finished — returning to dashboard.</div>
        )}

        {finished && error && (
          <div className="mt-4">
            <button
              className="mt-2 rounded-md bg-red-600 px-3 py-1 text-white"
              onClick={() => {
                // allow user to dismiss and return
                onComplete(false);
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
