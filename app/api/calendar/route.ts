import { NextResponse } from "next/server";
import { supabaseClient } from "@/lib/supabase";
import { startOfWeek, endOfWeek } from "date-fns";

function supabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  if (url === "https://your-project.supabase.co") return false;
  if (anon === "public-anon-key") return false;
  return true;
}

export async function GET() {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString();

  try {
    if (supabaseConfigured()) {
      const { data: posts, error } = await supabaseClient
        .from("calendar_posts")
        .select("*")
        .gte("timestamp", weekStart)
        .lte("timestamp", weekEnd);

      if (error) {
        console.warn("Supabase calendar_posts read failed", error);
        return NextResponse.json({ posts: [] });
      }

      const rows = (posts || []) as any[];
      // If Supabase has no rows return empty list
      if (!rows.length) return NextResponse.json({ posts: [] });

      // fetch related subreddits and personas to enrich rows
      const subredditIds = Array.from(new Set(rows.map((r) => r.subreddit_id).filter(Boolean)));
      const personaUsernames = Array.from(new Set(rows.map((r) => r.persona_username).filter(Boolean)));

      const subredditMap = new Map<string, string>();
      if (subredditIds.length) {
        const { data: srows } = await supabaseClient
          .from("subreddits")
          .select("subreddit_id, subreddit_name")
          .in("subreddit_id", subredditIds);
        (srows || []).forEach((s: any) => subredditMap.set(s.subreddit_id, s.subreddit_name));
      }

      const enriched = rows.map((r) => ({
        ...r,
        subreddit: subredditMap.get(r.subreddit_id) || null,
        persona_username: r.persona_username || null
      }));

      return NextResponse.json({ posts: enriched });
    }
  } catch (error) {
    console.warn("Supabase read failed", error);
  }

  return NextResponse.json({ posts: [] });
}
