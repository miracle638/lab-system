import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SummaryRow = {
  id: string;
  report_date: string;
  ai_category: string;
  ai_is_hardware: boolean;
  ai_is_recurrent: boolean;
  ai_recur_gap_days: number | null;
  ai_device_key: string;
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

function isValidDate(value?: string) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, item) => sum + item, 0) / values.length).toFixed(2));
}

export async function GET(request: Request) {
  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const fromDate = searchParams.get("fromDate") ?? undefined;
  const toDate = searchParams.get("toDate") ?? undefined;
  const roomCode = searchParams.get("roomCode") ?? undefined;
  const topN = Math.min(Math.max(Number(searchParams.get("topN") ?? "5"), 1), 20);

  if (!isValidDate(fromDate) || !isValidDate(toDate)) {
    return NextResponse.json({ message: "日期格式应为 YYYY-MM-DD" }, { status: 400 });
  }

  let query = client
    .from("maintenance_records")
    .select("id,report_date,ai_category,ai_is_hardware,ai_is_recurrent,ai_recur_gap_days,ai_device_key")
    .order("report_date", { ascending: false });

  if (fromDate) {
    query = query.gte("report_date", fromDate);
  }

  if (toDate) {
    query = query.lte("report_date", toDate);
  }

  const { data, error } = await query;

  if (error) {
    if (error.message.includes("ai_category") || error.message.includes("ai_device_key")) {
      return NextResponse.json(
        { message: "请先在 Supabase 执行最新的 supabase/schema.sql，补充维修记录 AI 分析字段" },
        { status: 500 },
      );
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const rows = ((data ?? []) as SummaryRow[]).filter((row) => {
    if (!roomCode) return true;
    return row.ai_device_key.startsWith(`${roomCode}#`);
  });

  const categoryCount = new Map<string, number>();
  let hardwareCount = 0;
  let softwareCount = 0;
  let recurrentCount = 0;
  const gapDays: number[] = [];

  for (const row of rows) {
    const category = row.ai_category?.trim() || "其他/待确认";
    categoryCount.set(category, (categoryCount.get(category) ?? 0) + 1);

    if (row.ai_is_hardware) {
      hardwareCount += 1;
    } else {
      softwareCount += 1;
    }

    if (row.ai_is_recurrent) {
      recurrentCount += 1;
    }

    if (typeof row.ai_recur_gap_days === "number") {
      gapDays.push(row.ai_recur_gap_days);
    }
  }

  const topCategories = Array.from(categoryCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([category, count]) => ({ category, count }));

  const total = rows.length;
  const recurrentRate = total === 0 ? 0 : Number(((recurrentCount / total) * 100).toFixed(2));

  return NextResponse.json({
    total,
    topCategories,
    recurrence: {
      recurrentCount,
      recurrentRate,
      avgGapDays: avg(gapDays),
      minGapDays: gapDays.length > 0 ? Math.min(...gapDays) : 0,
    },
    issueTypeRatio: {
      hardwareCount,
      softwareCount,
      hardwareRate: total === 0 ? 0 : Number(((hardwareCount / total) * 100).toFixed(2)),
      softwareRate: total === 0 ? 0 : Number(((softwareCount / total) * 100).toFixed(2)),
    },
  });
}
