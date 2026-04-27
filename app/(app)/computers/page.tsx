import ComputersClient from "./computers-client";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

async function getInitialComputersData() {
  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      labs: [],
      computers: [],
      errorMessage: "Supabase service role 未配置",
      hasInitialData: false,
    };
  }

  const [{ data: labsData, error: labsError }, computersQuery] = await Promise.all([
    client.from("labs").select("id,name,college,room_code").order("college").order("room_code"),
    client
      .from("computers")
      .select("id,lab_id,asset_code,purchase_date,cpu,ram,storage,c_drive_size,gpu,monitor,os,other,status")
      .order("asset_code"),
  ]);

  if (labsError) {
    return {
      labs: [],
      computers: [],
      errorMessage: labsError.message,
      hasInitialData: false,
    };
  }

  if (computersQuery.error) {
    return {
      labs: [],
      computers: [],
      errorMessage: computersQuery.error.message,
      hasInitialData: false,
    };
  }

  return {
    labs: (labsData ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      college: row.college,
      roomCode: row.room_code,
    })),
    computers: (computersQuery.data ?? []).map((row) => ({
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
    })),
    errorMessage: "",
    hasInitialData: true,
  };
}

export default async function ComputersPage() {
  const { labs, computers, errorMessage, hasInitialData } = await getInitialComputersData();

  return (
    <ComputersClient
      initialLabs={labs}
      initialComputers={computers}
      initialErrorMessage={errorMessage}
      hasInitialData={hasInitialData}
    />
  );
}