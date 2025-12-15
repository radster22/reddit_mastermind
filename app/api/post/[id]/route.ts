import { NextResponse } from "next/server";
import { supabaseClient } from "@/lib/supabase";
import { mockPosts, mockComments } from "../../_data/mockStore";

function supabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  if (url === "https://your-project.supabase.co") return false;
  if (anon === "public-anon-key") return false;
  return true;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const postId = params.id;

  try {
    if (supabaseConfigured()) {
      const { data: post } = await supabaseClient
        .from("calendar_posts")
        .select("*")
        .eq("post_id", postId)
        .single();
      const { data: comments } = await supabaseClient
        .from("calendar_comments")
        .select("*")
        .eq("post_id", postId);
      if (!post) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // enrich post with subreddit_name and persona_username
      let enrichedPost: any = post;
      try {
        if (post.subreddit_id) {
          const { data: srows } = await supabaseClient
            .from("subreddits")
            .select("subreddit_name")
            .eq("subreddit_id", post.subreddit_id)
            .single();
          enrichedPost.subreddit = srows?.subreddit_name || null;
        }
        // persona_username is already stored on the post row in this schema
        enrichedPost.persona_username = post.persona_username || null;
      } catch (e) {
        // ignore enrichment errors
      }

      return NextResponse.json({ post: enrichedPost, comments: comments || [] });
    }
  } catch (error) {
    console.warn("Supabase read failed, using mock", error);
  }

  const post = mockPosts.find((p) => p.post_id === postId);
  const comments = mockComments.filter((c) => c.post_id === postId);
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ post, comments });
}
