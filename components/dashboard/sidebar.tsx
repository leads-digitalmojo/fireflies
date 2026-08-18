"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "Overview", icon: "◉" },
  { href: "/dashboard/meetings", label: "Meetings", icon: "📋" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "📊" },
  { href: "/dashboard/employees", label: "Employees", icon: "👥" },
  { href: "/dashboard/clients", label: "Clients", icon: "🏢" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-slate-900 text-white min-h-screen flex flex-col">
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="text-lg font-bold text-white">Digital Mojo</div>
        <div className="text-xs text-slate-400 mt-0.5">Meeting Intelligence</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-700">
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <span>↩</span> Logout
          </button>
        </form>
      </div>
    </aside>
  );
}
