"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Calendar from "./Calendar";
import PostCard from "./PostCard";
import EmptyState from "./EmptyState";
import GeneratingPage from "./GeneratingPage";

type Props = {
  initialPosts: any[];
  startGenerating?: boolean;
};

export default function DashboardClient({ initialPosts, startGenerating }: Props) {
  const router = useRouter();
  const [posts, setPosts] = useState<any[]>(initialPosts || []);
  const [error, setError] = useState<string | null>(null);
  // single status: 'idle' | 'generating' | 'refreshing'
  const [status, setStatus] = useState<"idle" | "generating" | "refreshing">("idle");
  const prevPathRef = useRef<string>("/dashboard");

  // If the server rendered this component with startGenerating=true (e.g. user
  // opened /generating directly), start the generating flow on mount.
  useEffect(() => {
    // If parent wants to start generation immediately (user navigated to /generating),
    // kick off the generating flow.
    if (startGenerating) {
      // when coming from a direct /generating URL, we want to return to /dashboard
      prevPathRef.current = "/dashboard";
      setStatus("generating");
    }
  }, []);

  // Close the generating overlay if the user navigates (back/forward) in history
  useEffect(() => {
    function onPop() {
      // if user navigates while generating, close overlay and try refresh
      if (status === "generating") {
        // restore URL to the previous path if available
        try {
          const prev = prevPathRef.current || "/dashboard";
          window.history.replaceState({}, "", prev);
        } catch (e) {
          // ignore
        }

        // refresh calendar data after closing
        (async () => {
          setStatus("refreshing");
          try {
            const cal = await fetch(`/api/calendar`, { cache: "no-store" });
            if (cal.ok) {
              const data = await cal.json();
              setPosts(data.posts || []);
            }
          } catch (e) {
            // ignore
          } finally {
            setStatus("idle");
          }
        })();
      }
    }

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [status]);

  const recent = [...posts]
    .sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, 5);

  // We'll navigate to a URL (/generating) and show a full-screen overlay that
  // performs generation. This keeps the dashboard visible in the background
  // (we'll blur it) and makes the flow behave like a separate page.
  function generateCalendar() {
    setError(null);
    // remember current path so we can restore it later
    if (typeof window !== "undefined") {
      prevPathRef.current = window.location.pathname || "/dashboard";
      // navigate to the server /generating page so direct open works and
      // Next.js router handles history correctly.
      router.push("/generating");
    }
    setStatus("generating");
  }

  return (
    <>
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Content Calendar</h1>
          <p className="text-slate-600">
            Weekly Reddit posts scheduled from personas and keywords.
          </p>
        </div>
        <button
          onClick={generateCalendar}
          className="px-4 py-2 bg-sunset text-white rounded-lg shadow-sm"
          disabled={status !== "idle"}
        >
          {status === "generating"
            ? "Generating..."
            : status === "refreshing"
            ? "Refreshing..."
            : "Generate calendar"}
        </button>
      </header>

      <section>
        <h2 className="text-xl font-semibold mb-3">This week</h2>
        {posts.length === 0 ? <EmptyState /> : <Calendar posts={posts} />}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Recent posts</h2>
        {recent.map((post: any) => (
          <PostCard key={post.post_id} post={post} />
        ))}
      </section>

    </div>
          {/* Modal / overlay for generation progress */}
      {status === "refreshing" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg bg-white p-6 shadow-lg flex items-center space-x-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-slate-700 border-slate-200" />
            <div>
              <div className="font-semibold">Refreshing calendar</div>
              <div className="text-sm text-slate-600">Updating view...</div>
            </div>
          </div>
        </div>
      )}
      {/* Old inline modal removed in favor of a full-screen generating "page" overlay. */}

      {/* Generating page overlay */}
      {status === "generating" && (
        <GeneratingPage
          onComplete={async (success: boolean) => {
            // navigate back to previous path (will trigger a full route change)
            try {
              const prev = prevPathRef.current || "/dashboard";
              await router.replace(prev);
            } catch (e) {
              // ignore
            }

            // switch to refreshing and re-fetch calendar
            setStatus("refreshing");
            try {
              const cal = await fetch(`/api/calendar`, { cache: "no-store" });
              if (!cal.ok) throw new Error(`Failed to refresh calendar: ${cal.status}`);
              const data = await cal.json();
              setPosts(data.posts || []);
            } catch (err: any) {
              setError(err?.message || String(err));
            } finally {
              setStatus("idle");
            }
          }}
        />
      )}
        {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

    </>
  );
}
