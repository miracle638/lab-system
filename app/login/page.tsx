"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { withBasePath } from "@/lib/base-path";

function getCredentialFromQuery(key: "username" | "password"): string {
  if (typeof window === "undefined") {
    return "";
  }

  const query = new URLSearchParams(window.location.search);
  if (key === "username") {
    return query.get("admin-username") ?? query.get("username") ?? "";
  }

  return query.get("admin-password") ?? query.get("password") ?? "";
}

function resolveNextPath() {
  const query = new URLSearchParams(window.location.search);
  const rawNext = query.get("next") || "/dashboard";

  let nextPath = rawNext;
  if (nextPath.startsWith("http://") || nextPath.startsWith("https://")) {
    try {
      nextPath = new URL(nextPath).pathname;
    } catch {
      nextPath = "/dashboard";
    }
  }

  if (!nextPath.startsWith("/")) {
    nextPath = `/${nextPath}`;
  }

  if (nextPath === "/lab") {
    return "/lab/dashboard";
  }

  if (nextPath.startsWith("/lab/")) {
    return nextPath;
  }

  return withBasePath(nextPath);
}

export default function LoginPage() {
  const autoLoginTriggeredRef = useRef(false);
  const [username, setUsername] = useState(() => getCredentialFromQuery("username"));
  const [password, setPassword] = useState(() => getCredentialFromQuery("password"));
  const [submitting, setSubmitting] = useState(false);
  const errorMessage = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const query = new URLSearchParams(window.location.search);
    const error = query.get("error");
    if (error === "invalid") {
      return "账号或密码错误";
    }
    if (error === "missing-config") {
      return "管理员账号未配置，请检查环境变量";
    }
    if (error === "bad-request") {
      return "请输入管理员账号和密码";
    }
    return "";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const queryUsername = query.get("admin-username") ?? query.get("username") ?? "";
    const queryPassword = query.get("admin-password") ?? query.get("password") ?? "";

    if (queryUsername && queryPassword && !autoLoginTriggeredRef.current) {
      autoLoginTriggeredRef.current = true;
      const target = new URL(withBasePath("/auth/admin-login"), window.location.origin);
      target.searchParams.set("username", queryUsername);
      target.searchParams.set("password", queryPassword);
      target.searchParams.set("next", resolveNextPath());
      window.location.replace(target.toString());
    }
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-[linear-gradient(145deg,#f8fafc_0%,#e2e8f0_50%,#fde68a_100%)] px-4">
      <form
        action={withBasePath("/auth/admin-login")}
        method="post"
        autoComplete="off"
        onSubmit={() => setSubmitting(true)}
        className="w-full max-w-md rounded-2xl border border-white/40 bg-white/80 p-6 shadow-xl backdrop-blur"
      >
        <input type="hidden" name="next" value={typeof window === "undefined" ? withBasePath("/dashboard") : resolveNextPath()} />
        <h1 className="text-2xl font-bold text-slate-900">实验室信息系统登录</h1>
        <p className="mt-2 text-sm text-slate-600">
          游客无需登录可直接查看。仅管理员输入账号密码后可编辑数据。
        </p>

        <label className="mt-5 block text-sm font-semibold text-slate-700">管理员账号</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          name="username"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-300"
          placeholder="请输入管理员账号"
        />

        <label className="mt-4 block text-sm font-semibold text-slate-700">管理员密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          name="password"
          autoComplete="new-password"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-300"
          placeholder="请输入管理员密码"
        />

        {errorMessage && <p className="mt-3 text-sm text-rose-600">{errorMessage}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400"
        >
          {submitting ? "登录中..." : "管理员登录"}
        </button>
      </form>
    </div>
  );
}
