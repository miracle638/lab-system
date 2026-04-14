"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setErrorMessage("请输入管理员账号和密码");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    const response = await fetch("/api/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setSubmitting(false);

    if (!response.ok) {
      setErrorMessage("账号或密码错误");
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const next = query.get("next") || "/dashboard";
    router.push(next);
  };

  return (
    <div className="min-h-screen grid place-items-center bg-[linear-gradient(145deg,#f8fafc_0%,#e2e8f0_50%,#fde68a_100%)] px-4">
      <form
        onSubmit={handleSubmit}
        autoComplete="off"
        className="w-full max-w-md rounded-2xl border border-white/40 bg-white/80 p-6 shadow-xl backdrop-blur"
      >
        <h1 className="text-2xl font-bold text-slate-900">实验室系统登录</h1>
        <p className="mt-2 text-sm text-slate-600">
          游客无需登录可直接查看。仅管理员输入账号密码后可编辑数据。
        </p>

        <label className="mt-5 block text-sm font-semibold text-slate-700">管理员账号</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          name="admin-username"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-300"
          placeholder="请输入管理员账号"
        />

        <label className="mt-4 block text-sm font-semibold text-slate-700">管理员密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          name="admin-password"
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
