import MaintenanceClient from "./maintenance-client";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

async function getInitialMaintenanceData() {
  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      records: [],
      labs: [],
      computers: [],
      errorMessage: "Supabase service role 未配置",
      hasInitialData: false,
    };
  }

  const [maintenanceQuery, computersQuery, labsQuery] = await Promise.all([
    client
      .from("maintenance_records")
      .select("id,computer_id,computer_position,issue_type,fault_nature,fault_cause,issue,handling_method,status,reporter,report_date,resolved_date")
      .order("report_date", { ascending: false }),
    client
      .from("computers")
      .select("id,lab_id,asset_code,cpu,ram,storage,c_drive_size,gpu,monitor,os,other,status")
      .order("asset_code"),
    client.from("labs").select("id,name,college,room_code").order("college").order("room_code"),
  ]);

  if (maintenanceQuery.error) {
    return {
      records: [],
      labs: [],
      computers: [],
      errorMessage: maintenanceQuery.error.message,
      hasInitialData: false,
    };
  }

  if (computersQuery.error) {
    return {
      records: [],
      labs: [],
      computers: [],
      errorMessage: computersQuery.error.message,
      hasInitialData: false,
    };
  }

  if (labsQuery.error) {
    return {
      records: [],
      labs: [],
      computers: [],
      errorMessage: labsQuery.error.message,
      hasInitialData: false,
    };
  }

  return {
    records: (maintenanceQuery.data ?? []).map((row) => ({
      id: row.id,
      computerId: row.computer_id,
      computerPosition: row.computer_position ?? "",
      issueType: row.issue_type ?? "other",
      faultNature: row.fault_nature ?? "other",
      faultCause: row.fault_cause ?? "other",
      issue: row.issue,
      handlingMethod: row.handling_method ?? "",
      status: row.status,
      reporter: row.reporter,
      reportDate: row.report_date,
      resolvedDate: row.resolved_date ?? undefined,
    })),
    labs: (labsQuery.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      college: row.college,
      roomCode: row.room_code,
    })),
    computers: (computersQuery.data ?? []).map((row) => ({
      id: row.id,
      labId: row.lab_id,
      assetCode: row.asset_code,
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

export default async function MaintenancePage() {
  const { records, labs, computers, errorMessage, hasInitialData } = await getInitialMaintenanceData();

  return (
    <MaintenanceClient
      initialRecords={records}
      initialLabs={labs}
      initialComputers={computers}
      initialErrorMessage={errorMessage}
      hasInitialData={hasInitialData}
    />
  );
}