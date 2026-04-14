import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ComputerPayload = {
  labId: string;
  assetCode?: string;
  purchaseDate?: string;
  cpu: string;
  ram: string;
  storage: string;
  cDriveSize: string;
  gpu?: string;
  monitor: string;
  os: string;
  other?: string;
  status: "running" | "idle" | "fault" | "offline";
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

function buildAssetCode(labId: string) {
  const suffix = Date.now().toString().slice(-6);
  return `PC-${labId.slice(0, 8).toUpperCase()}-${suffix}`;
}

export async function GET() {
  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const [{ data: labsData, error: labsError }, monitorQuery] = await Promise.all([
    client.from("labs").select("id,name,college,room_code").order("college").order("room_code"),
    client.from("computers").select("id,lab_id,asset_code,purchase_date,cpu,ram,storage,c_drive_size,gpu,monitor,os,other,status").order("asset_code"),
  ]);

  if (labsError) {
    return NextResponse.json({ message: labsError.message }, { status: 500 });
  }

  const computerRows = monitorQuery.data;
  if (monitorQuery.error) {
    return NextResponse.json({ message: monitorQuery.error.message }, { status: 500 });
  }

  const labs = (labsData ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    college: row.college,
    roomCode: row.room_code,
  }));

  const computers = (computerRows ?? []).map((row) => ({
    id: row.id,
    labId: row.lab_id,
    assetCode: row.asset_code,
    purchaseDate: row.purchase_date ?? "",
    cpu: row.cpu,
    ram: row.ram,
    storage: row.storage,
    cDriveSize: row.c_drive_size,
    gpu: row.gpu ?? "",
    monitor: row.monitor ?? "",
    os: row.os,
    other: row.other ?? "",
    status: row.status,
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

  const body = (await request.json()) as Partial<ComputerPayload>;
  if (!body.labId || !body.cpu) {
    return NextResponse.json({ message: "实验室和 CPU 不能为空" }, { status: 400 });
  }

  const { data, error } = await client
    .from("computers")
    .insert([
      {
        lab_id: body.labId,
        asset_code: body.assetCode?.trim() || buildAssetCode(body.labId),
        purchase_date: body.purchaseDate?.trim() || null,
        cpu: body.cpu.trim(),
        ram: (body.ram ?? "").trim(),
        storage: (body.storage ?? "").trim(),
        c_drive_size: (body.cDriveSize ?? "").trim(),
        gpu: (body.gpu ?? "").trim(),
        monitor: (body.monitor ?? "").trim(),
        os: (body.os ?? "").trim(),
        other: (body.other ?? "").trim(),
        status: body.status ?? "running",
      },
    ])
    .select("id,lab_id,asset_code,purchase_date,cpu,ram,storage,c_drive_size,gpu,monitor,os,other,status")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    computer: {
      id: data.id,
      labId: data.lab_id,
      assetCode: data.asset_code,
      purchaseDate: data.purchase_date ?? "",
      cpu: data.cpu,
      ram: data.ram,
      storage: data.storage,
      cDriveSize: data.c_drive_size,
      gpu: data.gpu ?? "",
      monitor: data.monitor ?? "",
      os: data.os,
      other: data.other ?? "",
      status: data.status,
    },
  });
}
