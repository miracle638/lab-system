import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AI_VERSION } from "@/lib/maintenance-ai";
import type { AiAnalysisStatus } from "@/lib/types";

type ConfirmPayload = {
  id: string;
  category: string;
  isHardware?: boolean;
  confidence?: number;
  status?: AiAnalysisStatus;
};

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function isAdminRequest() {
  const cookieStore = await cookies();
  return cookieStore.get("lab_role")?.value === "admin";
}

export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const body = (await request.json()) as Partial<ConfirmPayload>;

  if (!body.id || !body.category?.trim()) {
    return NextResponse.json({ message: "请提供记录ID和确认后的故障类别" }, { status: 400 });
  }

  const nextStatus: AiAnalysisStatus = body.status === "edited" ? "edited" : "confirmed";

  const { data, error } = await client
    .from("maintenance_records")
    .update({
      ai_category: body.category.trim(),
      ai_is_hardware: !!body.isHardware,
      ai_confidence:
        typeof body.confidence === "number" && Number.isFinite(body.confidence)
          ? Math.max(0, Math.min(1, body.confidence))
          : 1,
      ai_status: nextStatus,
      ai_analyzed_at: new Date().toISOString(),
      ai_version: AI_VERSION,
    })
    .eq("id", body.id)
    .select("id,ai_category,ai_is_hardware,ai_confidence,ai_status,ai_analyzed_at,ai_version")
    .single();

  if (error) {
    if (error.message.includes("ai_category") || error.message.includes("ai_status")) {
      return NextResponse.json(
        { message: "请先在 Supabase 执行最新的 supabase/schema.sql，补充维修记录 AI 分析字段" },
        { status: 500 },
      );
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "确认成功", analysis: data });
}
