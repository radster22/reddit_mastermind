"use client";

import Link from "next/link";
import { format } from "date-fns";

export type CalendarPost = {
  post_id: string;
  title: string;
  persona_username: string;
  timestamp: string;
  subreddit: string;
};

export default function PostCard({ post }: { post: CalendarPost }) {
  const date = new Date(post.timestamp);
  return (
    <Link href={`/post/${post.post_id}`} className="block card p-4 mb-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">
            {post.subreddit}
          </p>
          <p className="font-semibold text-lg">{post.title}</p>
          <p className="muted">Persona: {post.persona_username}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-500">
            {format(date, "EEE, MMM d")}
          </p>
          <p className="text-sm text-slate-500">{format(date, "h:mmaaa")}</p>
        </div>
      </div>
    </Link>
  );
}
