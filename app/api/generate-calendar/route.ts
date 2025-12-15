import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { assignPersonasToPosts } from "@/lib/personas";
import { childTimestamp, iso } from "@/lib/timestamps";
import { PostRow, CommentRow } from "../_data/mockStore";

// Allow long-running generation (needed on serverless hosts)
export const maxDuration = 60;

type PersonaRow = { persona_username: string; persona_description: string; company_id?: string | null };
type CompanyRow = {
  company_id: string;
  company_name: string;
  company_description: string;
  website_url: string;
  subreddit?: string;
  posts_per_week: number;
};
type KeywordRow = { keyword_id: string; keyword_phrase: string };

const PY_SERVICE = process.env.PYTHON_SERVICE_URL || "http://localhost:8000";

function supabaseConfigured() {
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://your-project.supabase.co"
  );
}

async function callPython<T>(path: string, payload: any): Promise<T> {
  const controller = new AbortController();
  // NOTE: Local Ollama generation can exceed 5 mins.
  const timeout = setTimeout(() => controller.abort(), 600000); // 10 minute timeout for long generations
  const res = await fetch(`${PY_SERVICE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal
  }).catch((err) => {
    throw new Error(`Python service unreachable: ${err?.message || err}`);
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Python service error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function runGeneration(body: any) {
  // Allow the client to provide overrides (personas, keywords, subreddit, posts_per_week)
  const companyId: string | null = typeof body.company_id === "string" ? body.company_id : null;

  if (!supabaseConfigured()) {
    return { ok: false, error: "supabase_required", details: "Supabase must be configured to generate content." };
  }

  // Load authoritative data from Supabase when configured, otherwise use provided/fallback data
  let company: CompanyRow | null = null;
  let personas: PersonaRow[] = [];
  let keywords: KeywordRow[] = [];
  let fetchedSubreddit: string | null = null;

  if (supabaseConfigured()) {
    try {
      const companyQuery = supabaseAdmin.from("company_details").select("*");
      const { data: companyRow } = companyId
        ? await companyQuery.eq("company_id", companyId).single()
        : await companyQuery.limit(1).single();

      // fetch richer persona/keyword/subreddit data to map to DB IDs later
      const companyFilterId = companyRow?.company_id || companyId;

      const { data: personaRows } = companyFilterId
        ? await supabaseAdmin
            .from("personas")
            .select("persona_username, persona_description, company_id")
            .eq("company_id", companyFilterId)
        : { data: [] };
      const { data: keywordRows } = companyFilterId
        ? await supabaseAdmin
            .from("chatgpt_queries")
            .select("keyword_id, keyword_phrase")
            .eq("company_id", companyFilterId)
        : { data: [] };
      const { data: subredditRows } = companyFilterId
        ? await supabaseAdmin
            .from("subreddits")
            .select("subreddit_id, subreddit_name, company_id")
            .eq("company_id", companyFilterId)
        : { data: [] };

      company = companyRow || null;
      personas = (personaRows as any) || [];
      keywords = (keywordRows as any) || [];
      if (subredditRows && subredditRows.length) {
        const idx = Math.floor(Math.random() * subredditRows.length);
        fetchedSubreddit = (subredditRows[idx]?.subreddit_name as string) || null;
      }

      // if company has a subreddit configured but it's not present in DB, leave company.subreddit as-is; we'll create it later
      if (!company && companyRow) company = companyRow;
    } catch (err) {
      console.warn("Supabase fetch failed, falling back to request/defaults", err);
    }
  }

  // Client-provided overrides take precedence when Supabase isn't available
  if (!company) {
    if (body.company) {
      company = body.company as CompanyRow;
    } else {
      company = {
        company_id: "demo-company",
        company_name: "DemoCorp",
        company_description: "AI-powered slide tooling for marketers to plan Reddit content.",
        website_url: "https://demo.example.com",
        subreddit: "DemoTrials",
        posts_per_week: 3
      };
    }
  }

  if (!personas || personas.length === 0) {
    personas = (body.personas as PersonaRow[]) || [
      { persona_username: "brandvoice", persona_description: "Helpful marketer sharing slide tips" },
      { persona_username: "curious_dev", persona_description: "Curious engineer who builds side projects" },
      { persona_username: "ops_guru", persona_description: "Operations lead who loves efficiency hacks" }
    ];
  }

  if (!keywords || keywords.length === 0) {
    keywords = (body.keywords as KeywordRow[]) || [
      { keyword_id: "k1", keyword_phrase: "content calendar" },
      { keyword_id: "k2", keyword_phrase: "reddit engagement" },
      { keyword_id: "k3", keyword_phrase: "slide deck tips" }
    ];
  }

  // Prefer client override, then company.subreddit, then fetched subreddits from DB
  const effectiveSubreddit: string =
    (body.subreddit as string) ||
    fetchedSubreddit ||
    company.subreddit ||
    "unknown";

  const postsPerWeek = body.posts_per_week || company.posts_per_week || 3;

  // Request keyword scoring from Python service
  let selectedKeywords: { keyword_id: string; keyword_phrase: string }[] = [];
  try {
    const keywordRes = await callPython<{ selected: { keyword_id: string; score: number; keyword_phrase: string }[] }>(
      "/generate/keywords",
      {
        company_description: company.company_description,
        keywords,
        posts_per_week: postsPerWeek
      }
    );
    selectedKeywords = (keywordRes.selected || []).slice(0, postsPerWeek).map((k) => ({ keyword_id: k.keyword_id, keyword_phrase: k.keyword_phrase }));
  } catch (err: any) {
    console.error("Keyword scoring failed:", err?.message || err);
    return { ok: false, error: "keyword_scoring_failed", details: String(err) };
  }

  // Distribute personas across selected posts (ensures persona/day constraints via assignPersonasToPosts)
  const assignments = assignPersonasToPosts(personas, selectedKeywords.length);

  // Reset mock storage only when using mock fallback
  const createdPosts: PostRow[] = [];
  const createdComments: CommentRow[] = [];

  // Track how many comments each persona has made to avoid over-commenting
  const personaCommentCounts: Record<string, number> = {};

  try {
    for (let i = 0; i < selectedKeywords.length; i++) {
      const keyword = selectedKeywords[i];
      const assignment = assignments[i];
      const persona = assignment.persona;

      // Generate post via Python
      const postGen = await callPython<{ title: string; body: string }>(
        "/generate/post",
        {
          subreddit: effectiveSubreddit,
          keyword_phrase: keyword.keyword_phrase,
          persona_description: persona.persona_description,
          company_description: company.company_description
        }
      );

      const postId = `P${createdPosts.length + 1}`;
      const timestamp = iso(assignment.date);

      const postRow: PostRow = {
        post_id: postId,
        subreddit: effectiveSubreddit,
        persona_username: persona.persona_username,
        title: (postGen.title || "").trim(),
        body: (postGen.body || "").trim(),
        timestamp,
        keyword_ids: [keyword.keyword_id]
      };

      createdPosts.push(postRow);

      // Generate between 1 and 3 comments from other personas
      const minComments = 1;
      const maxComments = 3;
      const commentCount = Math.max(minComments, Math.min(maxComments, Math.round(1 + Math.random() * 2)));

      const possibleCommenters = personas.filter((p) => p.persona_username !== persona.persona_username);
      // shuffle commenters to avoid repetition on a single post
      const shuffledCommenters = [...possibleCommenters].sort(() => Math.random() - 0.5);
      let commenterIdx = 0;

      let parentText = postRow.body;
      let parentId: string | null = null;

      for (let c = 0; c < commentCount; c++) {
        // Rotate through shuffled commenters to reduce repetition
        const commenter =
          shuffledCommenters[commenterIdx % (shuffledCommenters.length || 1)] ||
          personas.find((p) => p.persona_username !== persona.persona_username) ||
          personas[0];
        commenterIdx += 1;

        personaCommentCounts[commenter.persona_username] = (personaCommentCounts[commenter.persona_username] || 0) + 1;

        // Generate comment via Python
        const commentGen = await callPython<{ comment_text: string }>(
          "/generate/comment",
          {
            persona_description: commenter.persona_description,
            parent_text: parentText,
            post_title: postRow.title,
            post_body: postRow.body,
            company_description: company.company_description
          }
        );

        const commentId = `C${createdComments.length + 1}`;
        const ts = parentId === null ? childTimestamp(postRow.timestamp) : childTimestamp(createdComments.find((cc) => cc.comment_id === parentId)!.timestamp);

        const commentRow: CommentRow = {
          comment_id: commentId,
          post_id: postId,
          parent_comment_id: parentId,
          persona_username: commenter.persona_username,
          comment_text: (commentGen.comment_text || "").trim(),
          timestamp: ts
        };

        createdComments.push(commentRow);

        // Alternate replies to create simple threads; don't let the original persona reply to itself
        if (c % 2 === 0) {
          parentId = commentId;
          parentText = commentRow.comment_text;
        } else {
          parentId = null;
          parentText = postRow.body;
        }
      }
    }
  } catch (err) {
    console.error("Generation failed:", err);
    return { ok: false, error: "generation_failed", details: String(err) };
  }

  // Persist to Supabase when available, otherwise keep in-memory mock
  try {
    // Build persona map from fetched personas
    const personaMap = new Map<string, any>();
    if (personas && personas.length) (personas as any[]).forEach((p) => personaMap.set(p.persona_username, p));

    // Upsert missing personas used in generation so we have persona rows keyed by username
    const usedPersonas = Array.from(new Set(createdPosts.map((p) => p.persona_username).concat(createdComments.map((c) => c.persona_username))));
    const missingPersonas = usedPersonas.filter((u) => !personaMap.has(u));
    if (missingPersonas.length) {
      const toUpsert = missingPersonas.map((username) => {
        const proto = (personas as any[]).find((p) => p.persona_username === username) || { persona_description: "" };
        return {
          persona_username: username,
          persona_description: proto.persona_description || "",
          company_id: (company as any)?.company_id || null
        };
      });
      const { data: upserted } = await supabaseAdmin
        .from("personas")
        .upsert(toUpsert, { onConflict: "persona_username" })
        .select("persona_username, persona_description, company_id");
      if (upserted && upserted.length) upserted.forEach((p: any) => personaMap.set(p.persona_username, p));
    }

    // Ensure subreddit exists for company; fetch and create if necessary
    let subredditRow: any | null = null;
    try {
      const { data: srows } = await supabaseAdmin
        .from("subreddits")
        .select("subreddit_id, subreddit_name, company_id")
        .eq("company_id", (company as any)?.company_id || companyId || "");
      if (srows && srows.length) subredditRow = srows.find((s: any) => s.subreddit_name === effectiveSubreddit) || srows[0];

      if (!subredditRow && effectiveSubreddit) {
        const { data: created } = await supabaseAdmin
          .from("subreddits")
          .insert([{ subreddit_name: effectiveSubreddit, company_id: (company as any)?.company_id || null }])
          .select("subreddit_id, subreddit_name, company_id");
        if (created && created.length) subredditRow = created[0];
      }
    } catch (e) {
      // ignore
    }

    // Build DB payload for posts (do not set post_id so DB will generate UUIDs)
    const safeCompanyId = typeof (company as any)?.company_id === "string" ? (company as any).company_id : null;

    const dbPostsPayload = createdPosts.map((p) => ({
      company_id: safeCompanyId,
      subreddit_id: subredditRow ? subredditRow.subreddit_id : null,
      persona_username: p.persona_username,
      title: p.title,
      body: p.body,
      timestamp: p.timestamp,
      keyword_ids: p.keyword_ids
    }));

    // Insert posts and retrieve generated post_ids
    const { data: insertedPosts, error: postInsertError } = await supabaseAdmin
      .from("calendar_posts")
      .insert(dbPostsPayload)
      .select("post_id, title, timestamp, persona_username, subreddit_id");
    if (postInsertError) throw postInsertError;

    // Map createdPosts index -> inserted post_id
    const postIdMap = new Map<number, string>();
    (insertedPosts || []).forEach((row: any, idx: number) => postIdMap.set(idx, row.post_id));

    // Build comments payload for DB with mapped post_ids and persona_ids
    const dbCommentsPayload: any[] = createdComments.map((c) => {
      const matchIndex = createdPosts.findIndex((pp) => pp.post_id === c.post_id);
      const mappedPostId = postIdMap.get(matchIndex) || null;
      return {
        post_id: mappedPostId,
        parent_comment_id: null,
        persona_username: c.persona_username,
        comment_text: c.comment_text,
        timestamp: c.timestamp
      };
    });

    if (dbCommentsPayload.length) {
      const { error: commentErr } = await supabaseAdmin.from("calendar_comments").insert(dbCommentsPayload);
      if (commentErr) throw commentErr;
    }
  } catch (err) {
    console.warn("Persisting to Supabase failed:", err);
    return { ok: false, error: "persist_failed", details: String(err) };
  }

  return { ok: true, posts: createdPosts, comments: createdComments };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await runGeneration(body);
  const status = result.ok ? 200 : 500;
  return NextResponse.json(result, { status });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "use_generate_start", details: "Call /api/generate/start to enqueue a job." }, { status: 400 });
}
