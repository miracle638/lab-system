import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { RepairStatus } from "@/lib/types";

type MaintenancePatchPayload = {
  computerPosition?: string;
  issue?: string;
  status?: RepairStatus;
  reporter?: string;
  reportDate?: string;
  resolvedDate?: string;
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

function isValidDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as MaintenancePatchPayload;
  const patch: Record<string, unknown> = {};

  if (body.computerPosition !== undefined) patch.computer_position = body.computerPosition.trim();
  if (body.issue !== undefined) patch.issue = body.issue.trim();
  if (body.status !== undefined) patch.status = body.status;
  if (body.reporter !== undefined) patch.reporter = body.reporter.trim();
  if (body.reportDate !== undefined) {
    if (!isValidDateString(body.reportDate)) {
      return NextResponse.json({ message: "报修日期格式应为 YYYY-MM-DD" }, { status: 400 });
    }
    patch.report_date = body.reportDate;
  }
  if (body.resolvedDate !== undefined) {
    if (body.resolvedDate.trim() === "") {
      patch.resolved_date = null;
    } else if (!isValidDateString(body.resolvedDate)) {
      return NextResponse.json({ message: "完成日期格式应为 YYYY-MM-DD" }, { status: 400 });
    } else {
      patch.resolved_date = body.resolvedDate;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ message: "未提供可更新字段" }, { status: 400 });
  }

  const { data, error } = await client
    .from("maintenance_records")
    .update(patch)
    .eq("id", id)
    .select("id,computer_id,computer_position,issue,status,reporter,report_date,resolved_date")
    .single();

  if (error) {
    if (error.message.includes("computer_position")) {
      return NextResponse.json({ message: "请先在 Supabase 执行最新的 supabase/schema.sql，补充维修记录的 computer_position 字段" }, { status: 500 });
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    record: {
      id: data.id,
      computerId: data.computer_id,
      computerPosition: data.computer_position ?? "",
      issue: data.issue,
      status: data.status,
      reporter: data.reporter,
      reportDate: data.report_date,
      resolvedDate: data.resolved_date ?? undefined,
    },
  });
}
