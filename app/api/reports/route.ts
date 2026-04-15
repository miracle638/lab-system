import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ReportInput = {
  college: string;
  month: string;
  equipmentUnits: number;
  equipmentValue: number;
  usageMinutes: number;
  activeMinutes: number;
};

type RoomReportInput = {
  month: string;
  college: string;
  roomCode: string;
  usageMinutes: number;
  activeMinutes: number;
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

type SupabaseRoomReportRow = {
  id: string;
  month: string;
  college: string;
  room_code: string;
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

function validateReport(input: Partial<ReportInput>) {
  if (!input.college?.trim() || !input.month?.trim()) {
    return "学院和月份不能为空";
  }

  if (!isValidMonth(input.month.trim())) {
    return "月份格式应为 YYYY-MM";
  }

  const numericFields = [
    input.equipmentUnits,
    input.equipmentValue,
    input.usageMinutes,
    input.activeMinutes,
  ];

  if (numericFields.some((item) => typeof item !== "number" || Number.isNaN(item) || item < 0)) {
    return "报表数值必须为非负数";
  }

  return null;
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

function mapRoomRow(row: SupabaseRoomReportRow) {
  return {
    id: row.id,
    month: toMonthText(row.month),
    college: row.college,
    roomCode: row.room_code,
    usageMinutes: Number(row.usage_minutes ?? 0),
    activeMinutes: Number(row.active_minutes ?? 0),
  };
}

function validateRoomReport(input: Partial<RoomReportInput>) {
  if (!input.month?.trim() || !input.college?.trim() || !input.roomCode?.trim()) {
    return "房间级月报缺少月份、学院或房间号";
  }

  if (!isValidMonth(input.month.trim())) {
    return "房间级月报月份格式应为 YYYY-MM";
  }

  const numericFields = [input.usageMinutes, input.activeMinutes];
  if (numericFields.some((item) => typeof item !== "number" || Number.isNaN(item) || item < 0)) {
    return "房间级月报时长必须为非负数";
  }

  return null;
}

export async function GET() {
  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const [{ data: reportData, error: reportError }, roomQuery] = await Promise.all([
    client
      .from("monthly_reports")
      .select("id,college,month,equipment_units,equipment_value,usage_minutes,active_minutes")
      .order("month", { ascending: false })
      .order("college", { ascending: true }),
    client
      .from("monthly_room_reports")
      .select("id,month,college,room_code,usage_minutes,active_minutes")
      .order("month", { ascending: false })
      .order("room_code", { ascending: true }),
  ]);

  if (reportError) {
    return NextResponse.json({ message: reportError.message }, { status: 500 });
  }

  let roomReports: Array<ReturnType<typeof mapRoomRow>> = [];
  if (!roomQuery.error) {
    roomReports = ((roomQuery.data ?? []) as SupabaseRoomReportRow[]).map(mapRoomRow);
  } else if (!roomQuery.error.message.includes("monthly_room_reports")) {
    return NextResponse.json({ message: roomQuery.error.message }, { status: 500 });
  }

  const reports = ((reportData ?? []) as SupabaseReportRow[]).map(mapRow);
  return NextResponse.json({ reports, roomReports });
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const body = (await request.json()) as
    | { report?: Partial<ReportInput> }
    | { reports?: Partial<ReportInput>[]; roomReports?: Partial<RoomReportInput>[] };

  if (Array.isArray((body as { reports?: Partial<ReportInput>[] }).reports)) {
    const reports = ((body as { reports?: Partial<ReportInput>[] }).reports ?? []).filter(Boolean);
    const roomReports = ((body as { roomReports?: Partial<RoomReportInput>[] }).roomReports ?? []).filter(Boolean);
    if (reports.length === 0) {
      return NextResponse.json({ message: "未提供导入数据" }, { status: 400 });
    }

    for (const report of reports) {
      const errorMessage = validateReport(report);
      if (errorMessage) {
        return NextResponse.json({ message: `导入数据校验失败：${errorMessage}` }, { status: 400 });
      }
    }

    for (const row of roomReports) {
      const errorMessage = validateRoomReport(row);
      if (errorMessage) {
        return NextResponse.json({ message: `房间级导入数据校验失败：${errorMessage}` }, { status: 400 });
      }
    }

    const rows = reports.map((report) => ({
      college: report.college!.trim(),
      month: toMonthDate(report.month!.trim()),
      equipment_units: Math.round(report.equipmentUnits!),
      equipment_value: Number(report.equipmentValue!),
      usage_minutes: Math.round(report.usageMinutes!),
      active_minutes: Math.round(report.activeMinutes!),
    }));

    const { data, error } = await client
      .from("monthly_reports")
      .upsert(rows, { onConflict: "college,month" })
      .select("id,college,month,equipment_units,equipment_value,usage_minutes,active_minutes");

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    let savedRoomReports: Array<ReturnType<typeof mapRoomRow>> = [];
    if (roomReports.length > 0) {
      const roomRows = roomReports.map((row) => ({
        month: toMonthDate(row.month!.trim()),
        college: row.college!.trim(),
        room_code: row.roomCode!.trim(),
        usage_minutes: Math.round(row.usageMinutes!),
        active_minutes: Math.round(row.activeMinutes!),
      }));

      const roomUpsert = await client
        .from("monthly_room_reports")
        .upsert(roomRows, { onConflict: "month,room_code" })
        .select("id,month,college,room_code,usage_minutes,active_minutes");

      if (roomUpsert.error) {
        if (roomUpsert.error.message.includes("monthly_room_reports")) {
          return NextResponse.json({ message: "数据库缺少 monthly_room_reports 表，请先执行最新的 supabase/schema.sql" }, { status: 500 });
        }
        return NextResponse.json({ message: roomUpsert.error.message }, { status: 500 });
      }

      savedRoomReports = ((roomUpsert.data ?? []) as SupabaseRoomReportRow[]).map(mapRoomRow);
    }

    const savedReports = ((data ?? []) as SupabaseReportRow[]).map(mapRow);
    return NextResponse.json({ reports: savedReports, roomReports: savedRoomReports });
  }

  const report = (body as { report?: Partial<ReportInput> }).report;
  if (!report) {
    return NextResponse.json({ message: "未提供报表数据" }, { status: 400 });
  }

  const errorMessage = validateReport(report);
  if (errorMessage) {
    return NextResponse.json({ message: errorMessage }, { status: 400 });
  }

  const { data, error } = await client
    .from("monthly_reports")
    .upsert(
      [
        {
          college: report.college!.trim(),
          month: toMonthDate(report.month!.trim()),
          equipment_units: Math.round(report.equipmentUnits!),
          equipment_value: Number(report.equipmentValue!),
          usage_minutes: Math.round(report.usageMinutes!),
          active_minutes: Math.round(report.activeMinutes!),
        },
      ],
      { onConflict: "college,month" }
    )
    .select("id,college,month,equipment_units,equipment_value,usage_minutes,active_minutes")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ report: mapRow(data as SupabaseReportRow) });
}
