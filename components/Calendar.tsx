"use client";

import React from "react";
import { format } from "date-fns";
import Link from "next/link";

type Post = {
  post_id: string;
  title: string;
  timestamp: string;
  persona_username: string;
};

type Props = {
  posts: Post[];
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Calendar({ posts }: Props) {
  const grouped = posts.reduce<Record<string, Post[]>>((acc, post) => {
    const day = format(new Date(post.timestamp), "EEE");
    acc[day] = acc[day] ? [...acc[day], post] : [post];
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
      {days.map((day) => (
        <div key={day} className="card p-3 min-h-[140px] relative">
          <div className="text-xs uppercase text-slate-400 mb-2">{day}</div>
          {!grouped[day] && (
            <p className="muted text-xs">No posts</p>
          )}
          <div className="space-y-2">
            {grouped[day]?.map((post) => (
              <Link
                href={`/post/${post.post_id}`}
                key={post.post_id}
                className="block p-2 rounded-lg bg-slate-50 border border-slate-200 hover:border-sunset hover:bg-orange-50 transition"
              >
                <p className="text-sm font-semibold leading-tight">
                  {post.title}
                </p>
                <p className="muted text-xs">
                  {format(new Date(post.timestamp), "h:mmaaa")} ·{" "}
                  {post.persona_username}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
