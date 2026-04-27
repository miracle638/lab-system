import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { FaultCause, FaultNature, IssueType, RepairStatus } from "@/lib/types";

type MaintenancePatchPayload = {
  computerPosition?: string;
  issueType?: IssueType;
  faultNature?: FaultNature;
  faultCause?: FaultCause;
  issue?: string;
  handlingMethod?: string;
  status?: RepairStatus;
  reporter?: string;
  reportDate?: string;
  resolvedDate?: string;
};

const issueTypes: IssueType[] = [
  "blue_screen",
  "black_screen",
  "monitor_no_display",
  "monitor_artifact",
  "reboot_loop",
  "stuck_logo",
  "cannot_boot",
  "slow_performance",
  "network_issue",
  "audio_issue",
  "cannot_power_on",
  "other",
];

const faultNatures: FaultNature[] = ["hardware", "software", "other"];
const faultCauses: FaultCause[] = ["ssd", "hdd", "memory", "mainboard", "fan", "monitor", "power_switch", "os", "other"];

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
  if (body.issueType !== undefined) {
    if (!issueTypes.includes(body.issueType)) {
      return NextResponse.json({ message: "故障现象非法" }, { status: 400 });
    }
    patch.issue_type = body.issueType;
  }
  if (body.faultNature !== undefined) {
    if (!faultNatures.includes(body.faultNature)) {
      return NextResponse.json({ message: "故障性质非法" }, { status: 400 });
    }
    patch.fault_nature = body.faultNature;
  }
  if (body.faultCause !== undefined) {
    if (!faultCauses.includes(body.faultCause)) {
      return NextResponse.json({ message: "故障原因非法" }, { status: 400 });
    }
    patch.fault_cause = body.faultCause;
  }
  if (body.issue !== undefined) patch.issue = body.issue.trim();
  if (body.handlingMethod !== undefined) patch.handling_method = body.handlingMethod.trim();
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

  // 先尝试完整更新（含 resolved_date）
  let { data, error } = await client
    .from("maintenance_records")
    .update(patch)
    .eq("id", id)
    .select("id,computer_id,computer_position,issue_type,fault_nature,fault_cause,issue,handling_method,status,reporter,report_date,resolved_date")
    .single();

  // 如果 resolved_date 列还未添加到数据库，降级为只更新其余字段
  if (error?.message.includes("resolved_date")) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.resolved_date;
    if (Object.keys(fallbackPatch).length > 0) {
      const fallback = await client
        .from("maintenance_records")
        .update(fallbackPatch)
        .eq("id", id)
        .select("id,computer_id,computer_position,issue_type,fault_nature,fault_cause,issue,handling_method,status,reporter,report_date")
        .single();
      data = fallback.data ? { ...fallback.data, resolved_date: null } : null;
      error = fallback.error;
    } else {
      error = null;
      data = null;
    }
  }

  if (error?.message.includes("handling_method")) {
    const fallbackPatch = { ...patch };
    delete fallbackPatch.handling_method;
    if (Object.keys(fallbackPatch).length > 0) {
      const fallback = await client
        .from("maintenance_records")
        .update(fallbackPatch)
        .eq("id", id)
        .select("id,computer_id,computer_position,issue_type,fault_nature,fault_cause,issue,status,reporter,report_date,resolved_date")
        .single();
      data = fallback.data ? { ...fallback.data, handling_method: "" } : null;
      error = fallback.error;
    } else {
      return NextResponse.json({ message: "请先在 Supabase 执行最新的 supabase/schema.sql，补充维修记录的 handling_method 字段" }, { status: 500 });
    }
  }

  if (error?.message.includes("issue_type") || error?.message.includes("fault_nature") || error?.message.includes("fault_cause")) {
    return NextResponse.json({ message: "请先在 Supabase 执行最新的 supabase/schema.sql，补充维修分析字段" }, { status: 500 });
  }

  if (error) {
    if (error.message.includes("computer_position")) {
      return NextResponse.json({ message: "请先在 Supabase 执行最新的 supabase/schema.sql，补充维修记录的 computer_position 字段" }, { status: 500 });
    }
    if (error.message.includes("handling_method")) {
      return NextResponse.json({ message: "请先在 Supabase 执行最新的 supabase/schema.sql，补充维修记录的 handling_method 字段" }, { status: 500 });
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ message: "更新失败，请稍后重试" }, { status: 500 });
  }

  return NextResponse.json({
    record: {
      id: data.id,
      computerId: data.computer_id,
      computerPosition: data.computer_position ?? "",
      issueType: data.issue_type ?? "other",
      faultNature: data.fault_nature ?? "other",
      faultCause: data.fault_cause ?? "other",
      issue: data.issue,
      handlingMethod: data.handling_method ?? "",
      status: data.status,
      reporter: data.reporter,
      reportDate: data.report_date,
      resolvedDate: data.resolved_date ?? undefined,
    },
  });
}
