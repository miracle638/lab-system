import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ComputerPatchPayload = {
  labId?: string;
  assetCode?: string;
  purchaseDate?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  cDriveSize?: string;
  gpu?: string;
  monitor?: string;
  os?: string;
  other?: string;
  status?: "running" | "idle" | "fault" | "offline";
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

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as ComputerPatchPayload;

  const patch: Record<string, unknown> = {};
  if (body.labId !== undefined) patch.lab_id = body.labId;
  if (body.assetCode !== undefined) patch.asset_code = body.assetCode.trim();
  if (body.purchaseDate !== undefined) patch.purchase_date = body.purchaseDate.trim() ? body.purchaseDate.trim() : null;
  if (body.cpu !== undefined) patch.cpu = body.cpu.trim();
  if (body.ram !== undefined) patch.ram = body.ram.trim();
  if (body.storage !== undefined) patch.storage = body.storage.trim();
  if (body.cDriveSize !== undefined) patch.c_drive_size = body.cDriveSize.trim();
  if (body.gpu !== undefined) patch.gpu = body.gpu.trim();
  if (body.monitor !== undefined) patch.monitor = body.monitor.trim();
  if (body.os !== undefined) patch.os = body.os.trim();
  if (body.other !== undefined) patch.other = body.other.trim();
  if (body.status !== undefined) patch.status = body.status;

  const { data, error } = await client
    .from("computers")
    .update(patch)
    .eq("id", id)
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

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const { id } = await context.params;
  const { error } = await client.from("computers").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
