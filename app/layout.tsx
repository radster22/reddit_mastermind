import "@/styles/globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "SlideForge Reddit Calendar",
  description: "Auto-generate Reddit calendars with personas and comments"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-900">
        <div className="max-w-6xl mx-auto px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
