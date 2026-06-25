import type { Metadata } from "next";
import "./dashboard.css";
import Sidebar from "@/components/dashboard/Sidebar";

export const metadata: Metadata = {
  title: "Dashboard — Drongo AI",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dash">
      <Sidebar />
      <main className="dash-main">{children}</main>
    </div>
  );
}
