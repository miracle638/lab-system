import { createClient } from "@supabase/supabase-js";
import type { Lab } from "@/lib/types";
import LabsClient from "./labs-client";

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

async function getInitialLabs(): Promise<{ labs: Lab[]; errorMessage: string; hasInitialData: boolean }> {
  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      labs: [],
      errorMessage: "Supabase service role 未配置",
      hasInitialData: false,
    };
  }

  const { data, error } = await client
    .from("labs")
    .select("id,name,college,room_code,lab_number,value,manager,seat_count,usage_area,building_area,notes")
    .order("college")
    .order("room_code");

  if (error) {
    return {
      labs: [],
      errorMessage: error.message,
      hasInitialData: false,
    };
  }

  return {
    labs: (data ?? []).map((row) => ({
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
    })),
    errorMessage: "",
    hasInitialData: true,
  };
}

export default async function LabsPage() {
  const { labs, errorMessage, hasInitialData } = await getInitialLabs();

  return <LabsClient initialLabs={labs} initialErrorMessage={errorMessage} hasInitialData={hasInitialData} />;
}
