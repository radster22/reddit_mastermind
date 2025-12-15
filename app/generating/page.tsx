import DashboardClient from "../../components/DashboardClient";

async function getCalendar() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/calendar`, {
    cache: "no-store"
  });
  if (!res.ok) return { posts: [] };
  return res.json();
}

export default async function GeneratingPage() {
  const data = await getCalendar();
  const posts = data.posts || [];

  // Render the same DashboardClient but start generating immediately.
  return <DashboardClient initialPosts={posts} startGenerating={true} />;
}
