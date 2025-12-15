import DashboardClient from "../../components/DashboardClient";

async function getCalendar() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/calendar`, {
    cache: "no-store"
  });
  if (!res.ok) return { posts: [] };
  return res.json();
}

export default async function DashboardPage() {
  const data = await getCalendar();
  const posts = data.posts || [];

  // Render a client component that manages generation, modal, and live refresh.
  return <DashboardClient initialPosts={posts} />;
}
