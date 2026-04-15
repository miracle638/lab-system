import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ReportPatchPayload = {
  college?: string;
  month?: string;
  equipmentUnits?: number;
  equipmentValue?: number;
  usageMinutes?: number;
  activeMinutes?: number;
};

type SupabaseReportRow = {
  id: string;
  college: string;
  month: string;
  equipment_units: number;
  equipment_value: number;
  usage_minutes: number;
  active_minutes: number;
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

function isValidMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function toMonthDate(value: string) {
  return `${value}-01`;
}

function toMonthText(value: string) {
  return value.slice(0, 7);
}

function mapRow(row: SupabaseReportRow) {
  return {
    id: row.id,
    college: row.college,
    month: toMonthText(row.month),
    equipmentUnits: Number(row.equipment_units ?? 0),
    equipmentValue: Number(row.equipment_value ?? 0),
    usageMinutes: Number(row.usage_minutes ?? 0),
    activeMinutes: Number(row.active_minutes ?? 0),
  };
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
  const body = (await request.json()) as ReportPatchPayload;
  const patch: Record<string, unknown> = {};

  if (body.college !== undefined) {
    const college = body.college.trim();
    if (!college) {
      return NextResponse.json({ message: "学院不能为空" }, { status: 400 });
    }
    patch.college = college;
  }

  if (body.month !== undefined) {
    const month = body.month.trim();
    if (!isValidMonth(month)) {
      return NextResponse.json({ message: "月份格式应为 YYYY-MM" }, { status: 400 });
    }
    patch.month = toMonthDate(month);
  }

  if (body.equipmentUnits !== undefined) {
    if (Number.isNaN(body.equipmentUnits) || body.equipmentUnits < 0) {
      return NextResponse.json({ message: "设备台套数必须为非负数" }, { status: 400 });
    }
    patch.equipment_units = Math.round(body.equipmentUnits);
  }

  if (body.equipmentValue !== undefined) {
    if (Number.isNaN(body.equipmentValue) || body.equipmentValue < 0) {
      return NextResponse.json({ message: "设备价值必须为非负数" }, { status: 400 });
    }
    patch.equipment_value = Number(body.equipmentValue);
  }

  if (body.usageMinutes !== undefined) {
    if (Number.isNaN(body.usageMinutes) || body.usageMinutes < 0) {
      return NextResponse.json({ message: "开机分钟数必须为非负数" }, { status: 400 });
    }
    patch.usage_minutes = Math.round(body.usageMinutes);
  }

  if (body.activeMinutes !== undefined) {
    if (Number.isNaN(body.activeMinutes) || body.activeMinutes < 0) {
      return NextResponse.json({ message: "活动分钟数必须为非负数" }, { status: 400 });
    }
    patch.active_minutes = Math.round(body.activeMinutes);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ message: "未提供可更新字段" }, { status: 400 });
  }

  const { data, error } = await client
    .from("monthly_reports")
    .update(patch)
    .eq("id", id)
    .select("id,college,month,equipment_units,equipment_value,usage_minutes,active_minutes")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ report: mapRow(data as SupabaseReportRow) });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const { id } = await context.params;
  const { error } = await client.from("monthly_reports").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
