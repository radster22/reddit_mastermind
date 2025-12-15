import CommentThread from "../../../components/CommentThread";
import Link from "next/link";

async function getPost(id: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/post/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function PostDetail({
  params
}: {
  params: { id: string };
}) {
  const data = await getPost(params.id);
  if (!data) {
    return (
      <div className="space-y-4">
        <p className="text-slate-700">Post not found.</p>
        <Link href="/dashboard" className="text-sunset underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { post, comments } = data;

  return (
    <div className="space-y-4">
      <Link href="/dashboard" className="text-sunset underline">
        ← Back to calendar
      </Link>
      <div className="card p-6 space-y-2">
        <p className="text-xs uppercase text-slate-400">{post.subreddit}</p>
        <h1 className="text-2xl font-bold">{post.title}</h1>
        <p className="text-slate-700">{post.body}</p>
        <p className="muted">
          Persona: {post.persona_username} ·{" "}
          {new Date(post.timestamp).toLocaleString()}
        </p>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Comments</h2>
        {comments?.length ? (
          <CommentThread comments={comments} />
        ) : (
          <p className="muted">No comments yet.</p>
        )}
      </div>
    </div>
  );
}
