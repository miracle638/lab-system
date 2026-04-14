import Link from "next/link";
import { cookies } from "next/headers";
import type { UserRole } from "@/lib/types";
import NavLinks from "./nav-links";

const navItems = [
  { href: "/dashboard", label: "看板首页" },
  { href: "/labs", label: "实验室管理" },
  { href: "/computers", label: "电脑配置管理" },
  { href: "/maintenance", label: "维修记录" },
  { href: "/reports", label: "报表统计" },
];

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const role = cookieStore.get("lab_role")?.value as UserRole | undefined;
  const currentRole: UserRole = role === "admin" ? "admin" : "viewer";

  return (
    <div className="min-h-screen grid lg:grid-cols-[300px_1fr]">
      <aside className="border-r border-emerald-100/80 bg-white/70 px-5 py-6 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen">
        <Link href="/dashboard" className="block rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-cyan-50 px-4 py-4 transition hover:from-emerald-100 hover:to-cyan-100">
          <p className="text-xl font-bold tracking-tight text-slate-900">实验室资产系统</p>
          <p className="mt-1 text-sm text-slate-600">直观掌握设备、维修与报表</p>
        </Link>

        <p className="mt-4 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          当前角色：{currentRole === "admin" ? "管理员" : "查看者（游客）"}
        </p>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-3">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">导航菜单</p>
          <NavLinks items={navItems} />
        </div>

        {currentRole === "admin" ? (
          <form action="/logout" method="post" className="mt-8">
            <button
              type="submit"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              退出管理员
            </button>
          </form>
        ) : (
          <Link
            href="/login"
            className="mt-8 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            管理员登录
          </Link>
        )}
      </aside>

      <main className="p-4 md:p-8 lg:p-10">{children}</main>
    </div>
  );
}
