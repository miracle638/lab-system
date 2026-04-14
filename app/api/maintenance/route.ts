import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { RepairStatus } from "@/lib/types";

type MaintenanceCreatePayload = {
  computerId: string;
  computerPosition: string;
  issue: string;
  status?: RepairStatus;
  reporter?: string;
  reportDate: string;
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

export async function GET() {
  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const positionQuery = await client
    .from("maintenance_records")
    .select("id,computer_id,computer_position,issue,status,reporter,report_date,resolved_date")
    .order("report_date", { ascending: false });

  let data = positionQuery.data;
  let error = positionQuery.error;

  if (error?.message.includes("computer_position")) {
    const fallbackQuery = await client
      .from("maintenance_records")
      .select("id,computer_id,issue,status,reporter,report_date,resolved_date")
      .order("report_date", { ascending: false });

    data = (fallbackQuery.data ?? []).map((row) => ({
      ...row,
      computer_position: "",
    }));
    error = fallbackQuery.error;
  }

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const records = (data ?? []).map((row) => ({
    id: row.id,
    computerId: row.computer_id,
    computerPosition: row.computer_position ?? "",
    issue: row.issue,
    status: row.status,
    reporter: row.reporter,
    reportDate: row.report_date,
    resolvedDate: row.resolved_date ?? undefined,
  }));

  return NextResponse.json({ records });
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const body = (await request.json()) as Partial<MaintenanceCreatePayload>;
  if (!body.computerId || !body.computerPosition?.trim() || !body.issue?.trim() || !body.reportDate) {
    return NextResponse.json({ message: "请填写实验室、电脑位置、故障描述和报修日期" }, { status: 400 });
  }

  if (!isValidDateString(body.reportDate)) {
    return NextResponse.json({ message: "报修日期格式应为 YYYY-MM-DD" }, { status: 400 });
  }

  if (body.resolvedDate && !isValidDateString(body.resolvedDate)) {
    return NextResponse.json({ message: "完成日期格式应为 YYYY-MM-DD" }, { status: 400 });
  }

  const { data, error } = await client
    .from("maintenance_records")
    .insert([
      {
        computer_id: body.computerId,
        computer_position: body.computerPosition.trim(),
        issue: body.issue.trim(),
        status: body.status ?? "pending",
        reporter: body.reporter?.trim() || "管理员",
        report_date: body.reportDate,
        resolved_date: body.resolvedDate?.trim() ? body.resolvedDate : null,
      },
    ])
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
