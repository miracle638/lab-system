import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type LabPatchPayload = {
  labNumber?: string;
  name?: string;
  college?: string;
  roomCode?: string;
  value?: number;
  manager?: string;
  seatCount?: number;
  usageArea?: number;
  buildingArea?: number;
  notes?: string;
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
  const body = (await request.json()) as LabPatchPayload;

  const patch: Record<string, unknown> = {};
  if (body.labNumber !== undefined) patch.lab_number = body.labNumber?.trim() || null;
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.college !== undefined) patch.college = body.college.trim();
  if (body.roomCode !== undefined) patch.room_code = body.roomCode.trim();
  if (body.value !== undefined) patch.value = Number(body.value);
  if (body.manager !== undefined) patch.manager = body.manager.trim();
  if (body.seatCount !== undefined) patch.seat_count = Number(body.seatCount);
  if (body.usageArea !== undefined) patch.usage_area = Number(body.usageArea);
  if (body.buildingArea !== undefined) patch.building_area = Number(body.buildingArea);
  if (body.notes !== undefined) patch.notes = body.notes.trim();

  const { data, error } = await client
    .from("labs")
    .update(patch)
    .eq("id", id)
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

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ message: "无权限" }, { status: 403 });
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return NextResponse.json({ message: "Supabase service role 未配置" }, { status: 500 });
  }

  const { id } = await context.params;
  const { error } = await client.from("labs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
