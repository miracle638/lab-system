import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AI_VERSION, buildDeviceKey, calculateDayGap, classifyIssue } from "@/lib/maintenance-ai";
import type { AiAnalysisStatus } from "@/lib/types";

type AnalyzePayload = {
  recurrenceDays?: number;
  fromDate?: string;
  toDate?: string;
  roomCode?: string;
};

type MaintenanceRow = {
  id: string;
  computer_id: string;
  computer_position: string;
  issue: string;
  report_date: string;
  ai_category: string;
  ai_confidence: number;
  ai_status: AiAnalysisStatus;
  ai_is_hardware: boolean;
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

function sanitizeRecurrenceDays(input?: number) {
  if (!input || Number.isNaN(input)) return 7;
  const value = Math.floor(input);
  if (value < 1) return 1;
  if (value > 60) return 60;
  return value;
}

function isValidDate(value?: string) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const body = (await request.json()) as AnalyzePayload;
  const recurrenceDays = sanitizeRecurrenceDays(body.recurrenceDays);

  if (!isValidDate(body.fromDate) || !isValidDate(body.toDate)) {
    return NextResponse.json({ message: "日期格式应为 YYYY-MM-DD" }, { status: 400 });
  }

  let maintenanceQuery = client
    .from("maintenance_records")
    .select("id,computer_id,computer_position,issue,report_date,ai_category,ai_confidence,ai_status,ai_is_hardware")
    .order("report_date", { ascending: true });

  if (body.fromDate) {
    maintenanceQuery = maintenanceQuery.gte("report_date", body.fromDate);
  }
  if (body.toDate) {
    maintenanceQuery = maintenanceQuery.lte("report_date", body.toDate);
  }

  const maintenanceResult = await maintenanceQuery;

  if (maintenanceResult.error) {
    if (maintenanceResult.error.message.includes("ai_category") || maintenanceResult.error.message.includes("ai_status")) {
      return NextResponse.json(
        { message: "请先在 Supabase 执行最新的 supabase/schema.sql，补充维修记录 AI 分析字段" },
        { status: 500 },
      );
    }
    return NextResponse.json({ message: maintenanceResult.error.message }, { status: 500 });
  }

  const maintenanceRows = (maintenanceResult.data ?? []) as MaintenanceRow[];

  const [computerResult, labResult] = await Promise.all([
    client.from("computers").select("id,lab_id"),
    client.from("labs").select("id,room_code"),
  ]);

  if (computerResult.error) {
    return NextResponse.json({ message: computerResult.error.message }, { status: 500 });
  }

  if (labResult.error) {
    return NextResponse.json({ message: labResult.error.message }, { status: 500 });
  }

  const computerToLab = new Map((computerResult.data ?? []).map((item) => [item.id, item.lab_id]));
  const labToRoom = new Map((labResult.data ?? []).map((item) => [item.id, item.room_code ?? ""]));

  const filteredRows = maintenanceRows.filter((row) => {
    if (!body.roomCode) return true;
    const labId = computerToLab.get(row.computer_id);
    const roomCode = labId ? labToRoom.get(labId) ?? "" : "";
    return roomCode === body.roomCode;
  });

  const lastSeenByDeviceCategory = new Map<string, string>();
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  let recurrentCount = 0;

  for (const row of filteredRows) {
    const labId = computerToLab.get(row.computer_id);
    const roomCode = labId ? labToRoom.get(labId) ?? "" : "";
    const deviceKey = buildDeviceKey(roomCode, row.computer_position ?? "");

    const isLocked = (row.ai_status === "confirmed" || row.ai_status === "edited") && !!row.ai_category?.trim();
    const classified = isLocked
      ? {
          category: row.ai_category,
          confidence: Number(row.ai_confidence ?? 0),
          isHardware: !!row.ai_is_hardware,
        }
      : classifyIssue(row.issue ?? "");

    const recurrenceKey = `${deviceKey}::${classified.category}`;
    const previousDate = lastSeenByDeviceCategory.get(recurrenceKey);
    const gapDays = previousDate ? calculateDayGap(previousDate, row.report_date) : Number.MAX_SAFE_INTEGER;
    const isRecurrent = gapDays >= 0 && gapDays <= recurrenceDays;

    if (isRecurrent) {
      recurrentCount += 1;
    }

    lastSeenByDeviceCategory.set(recurrenceKey, row.report_date);

    const patch: Record<string, unknown> = {
      ai_device_key: deviceKey,
      ai_is_recurrent: isRecurrent,
      ai_recur_gap_days: Number.isFinite(gapDays) && gapDays !== Number.MAX_SAFE_INTEGER ? gapDays : null,
      ai_analyzed_at: new Date().toISOString(),
      ai_version: AI_VERSION,
    };

    if (!isLocked) {
      patch.ai_category = classified.category;
      patch.ai_confidence = classified.confidence;
      patch.ai_status = "pending";
      patch.ai_is_hardware = classified.isHardware;
    }

    updates.push({ id: row.id, patch });
  }

  for (const item of updates) {
    const { error } = await client.from("maintenance_records").update(item.patch).eq("id", item.id);
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    analyzed: updates.length,
    recurrentCount,
    recurrenceDays,
    aiVersion: AI_VERSION,
    message: "AI 分析完成",
  });
}
