import { NextResponse } from "next/server";
import { BASE_PATH, withBasePath } from "@/lib/base-path";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function normalizeNextPath(value: string | null) {
  if (!value) {
    return withBasePath("/dashboard");
  }

  let nextPath = value;

  if (nextPath.startsWith("http://") || nextPath.startsWith("https://")) {
    try {
      nextPath = new URL(nextPath).pathname;
    } catch {
      return withBasePath("/dashboard");
    }
  }

  if (!nextPath.startsWith("/")) {
    nextPath = `/${nextPath}`;
  }

  if (nextPath === BASE_PATH) {
    return withBasePath("/dashboard");
  }

  if (nextPath.startsWith(`${BASE_PATH}/`)) {
    return nextPath;
  }

  return withBasePath(nextPath);
}

function buildLoginRedirect(request: Request, error: string, nextValue?: string | null) {
  const url = new URL(withBasePath("/login"), request.url);
  url.searchParams.set("error", error);
  if (nextValue) {
    url.searchParams.set("next", nextValue);
  }
  return NextResponse.redirect(url);
}

function buildSuccessRedirect(request: Request, nextValue?: string | null) {
  const url = new URL(normalizeNextPath(nextValue ?? null), request.url);
  const response = NextResponse.redirect(url);
  response.cookies.set("lab_role", "admin", {
    path: "/",
    maxAge: 60 * 60 * 8,
    sameSite: "lax",
    httpOnly: false,
  });
  return response;
}

function validateCredentials(username: string, password: string) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return "missing-config";
  }

  if (!username.trim() || !password) {
    return "bad-request";
  }

  if (username.trim() !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return "invalid";
  }

  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const username = url.searchParams.get("username") ?? url.searchParams.get("admin-username") ?? "";
  const password = url.searchParams.get("password") ?? url.searchParams.get("admin-password") ?? "";
  const nextValue = url.searchParams.get("next");

  const error = validateCredentials(username, password);
  if (error) {
    return buildLoginRedirect(request, error, nextValue);
  }

  return buildSuccessRedirect(request, nextValue);
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, message: "管理员账号未配置" }, { status: 500 });
    }

    try {
      const body = (await request.json()) as { username?: string; password?: string };
      const username = body.username?.trim() ?? "";
      const password = body.password ?? "";
      const error = validateCredentials(username, password);

      if (error === "missing-config") {
        return NextResponse.json({ ok: false, message: "管理员账号未配置" }, { status: 500 });
      }
      if (error === "bad-request") {
        return NextResponse.json({ ok: false, message: "请输入管理员账号和密码" }, { status: 400 });
      }
      if (error === "invalid") {
        return NextResponse.json({ ok: false, message: "账号或密码错误" }, { status: 401 });
      }

      const response = NextResponse.json({ ok: true, next: withBasePath("/dashboard") });
      response.cookies.set("lab_role", "admin", {
        path: "/",
        maxAge: 60 * 60 * 8,
        sameSite: "lax",
        httpOnly: false,
      });
      return response;
    } catch {
      return NextResponse.json({ ok: false, message: "请求参数格式错误" }, { status: 400 });
    }
  }

  const formData = await request.formData();
  const username = String(formData.get("username") ?? formData.get("admin-username") ?? "");
  const password = String(formData.get("password") ?? formData.get("admin-password") ?? "");
  const nextValue = String(formData.get("next") ?? "") || null;

  const error = validateCredentials(username, password);
  if (error) {
    return buildLoginRedirect(request, error, nextValue);
  }

  return buildSuccessRedirect(request, nextValue);
}
