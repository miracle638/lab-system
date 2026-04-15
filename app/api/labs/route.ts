import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type LabPayload = {
  labNumber?: string;
  name: string;
  college: string;
  roomCode: string;
  value: number;
  manager: string;
  seatCount: number;
  usageArea: number;
  buildingArea: number;
  notes?: string;
};

type SupabaseComputerRow = {
  id: string;
  lab_id: string;
  cpu: string;
  ram: string;
  storage: string;
  monitor?: string | null;
  c_drive_size: string;
  os: string;
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

export async function GET() {
  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const [{ data: labsData, error: labsError }, monitorQuery] = await Promise.all([
    client
      .from("labs")
      .select("id,name,college,room_code,lab_number,value,manager,seat_count,usage_area,building_area,notes")
      .order("college")
      .order("room_code"),
    client.from("computers").select("id,lab_id,cpu,ram,storage,monitor,c_drive_size,os"),
  ]);

  if (labsError) {
    return NextResponse.json({ message: labsError.message }, { status: 500 });
  }

  let computerRows: SupabaseComputerRow[] = [];

  if (!monitorQuery.error) {
    computerRows = (monitorQuery.data ?? []) as SupabaseComputerRow[];
  } else if (monitorQuery.error.message.includes("monitor")) {
    const fallback = await client.from("computers").select("id,lab_id,cpu,ram,storage,c_drive_size,os");
    if (fallback.error) {
      return NextResponse.json({ message: fallback.error.message }, { status: 500 });
    }

    computerRows = ((fallback.data ?? []) as Omit<SupabaseComputerRow, "monitor">[]).map((item) => ({
      ...item,
      monitor: "待补充",
    }));
  } else {
    return NextResponse.json({ message: monitorQuery.error.message }, { status: 500 });
  }

  const labs = (labsData ?? []).map((row) => ({
    id: row.id,
    labNumber: row.lab_number || undefined,
    name: row.name,
    college: row.college,
    roomCode: row.room_code,
    value: Number(row.value ?? 0),
    manager: row.manager,
    seatCount: row.seat_count,
    usageArea: Number(row.usage_area ?? 0),
    buildingArea: Number(row.building_area ?? 0),
    notes: row.notes ?? "",
  }));

  const computers = computerRows.map((row) => ({
    id: row.id,
    labId: row.lab_id,
    cpu: row.cpu,
    ram: row.ram,
    storage: row.storage,
    monitor: row.monitor ?? "待补充",
    cDriveSize: row.c_drive_size,
    os: row.os,
  }));

  return NextResponse.json({ labs, computers });
}

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const body = (await request.json()) as Partial<LabPayload>;
  if (!body.name || !body.college || !body.roomCode) {
    return NextResponse.json({ message: "名称、学院、房间号不能为空" }, { status: 400 });
  }

  const { data, error } = await client
    .from("labs")
    .insert([
      {
        lab_number: body.labNumber?.trim() || null,
        name: body.name.trim(),
        college: body.college.trim(),
        room_code: body.roomCode.trim(),
        value: Number(body.value ?? 0),
        manager: (body.manager ?? "待指定").trim(),
        seat_count: Number(body.seatCount ?? 0),
        usage_area: Number(body.usageArea ?? 0),
        building_area: Number(body.buildingArea ?? 0),
        notes: (body.notes ?? "").trim(),
      },
    ])
    .select("id,name,college,room_code,lab_number,value,manager,seat_count,usage_area,building_area,notes")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    lab: {
      id: data.id,
      labNumber: data.lab_number || undefined,
      name: data.name,
      college: data.college,
      roomCode: data.room_code,
      value: Number(data.value ?? 0),
      manager: data.manager,
      seatCount: data.seat_count,
      usageArea: Number(data.usage_area ?? 0),
      buildingArea: Number(data.building_area ?? 0),
      notes: data.notes ?? "",
    },
  });
}
