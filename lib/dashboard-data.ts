import { createClient } from "@supabase/supabase-js";

export interface LabView {
  id: string;
  labNumber?: string;
  name: string;
  college: string;
  roomCode: string;
  value: number;
  manager: string;
  seatCount: number;
  usageArea: number;
  buildingArea: number;
  notes: string;
}

export interface ComputerView {
  id: string;
  labId: string;
  cpu: string;
  ram: string;
  storage: string;
  gpu: string;
  monitor: string;
  cDriveSize: string;
  os: string;
  purchaseDate: string;
  status: "running" | "idle" | "fault" | "offline";
}

export interface MaintenanceView {
  computerId: string;
  status: "pending" | "in_progress" | "done";
}

export interface LatestReportView {
  month: string;
  equipmentValue: number;
  activeMinutes: number;
}

interface SupabaseLabRow {
  id: string;
  lab_number: string | null;
  name: string;
  college: string;
  room_code: string;
  value: number;
  manager: string;
  seat_count: number;
  usage_area: number;
  building_area: number;
  notes: string | null;
}

interface SupabaseComputerRow {
  id: string;
  lab_id: string;
  cpu: string;
  ram: string;
  storage: string;
  gpu?: string | null;
  monitor?: string | null;
  c_drive_size: string;
  os: string;
  purchase_date?: string | null;
  status: "running" | "idle" | "fault" | "offline";
}

interface SupabaseComputerRowNoMonitor {
  id: string;
  lab_id: string;
  cpu: string;
  ram: string;
  storage: string;
  gpu?: string | null;
  c_drive_size: string;
  os: string;
  purchase_date?: string | null;
  status: "running" | "idle" | "fault" | "offline";
}

interface SupabaseMaintenanceRow {
  computer_id: string;
  status: "pending" | "in_progress" | "done";
}

interface SupabaseReportRow {
  month: string;
  equipment_value: number;
  active_minutes: number;
}

export interface DashboardData {
  labs: LabView[];
  computers: ComputerView[];
  maintenance: MaintenanceView[];
  latestReport: LatestReportView | null;
  loadError: string | null;
}

export async function getDashboardData(): Promise<DashboardData> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      labs: [],
      computers: [],
      maintenance: [],
      latestReport: null,
      loadError: "未配置 Supabase 环境变量。",
    };
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false },
  });

  const [{ data: labsData, error: labsError }, { data: maintenanceData, error: maintenanceError }, { data: latestReportData, error: reportError }] = await Promise.all([
    supabase
      .from("labs")
      .select("id,lab_number,name,college,room_code,value,manager,seat_count,usage_area,building_area,notes")
      .order("college")
      .order("name"),
    supabase.from("maintenance_records").select("computer_id,status"),
    supabase.from("monthly_reports").select("month,equipment_value,active_minutes").order("month", { ascending: false }).limit(1),
  ]);

  let computersData: SupabaseComputerRow[] = [];
  let computersError: { message: string } | null = null;

  const monitorQuery = await supabase.from("computers").select("id,lab_id,cpu,ram,storage,gpu,monitor,c_drive_size,os,purchase_date,status");
  if (!monitorQuery.error) {
    computersData = (monitorQuery.data ?? []) as SupabaseComputerRow[];
  } else if (monitorQuery.error.message.includes("monitor")) {
    const fallbackQuery = await supabase.from("computers").select("id,lab_id,cpu,ram,storage,gpu,c_drive_size,os,purchase_date,status");
    if (fallbackQuery.error) {
      computersError = { message: fallbackQuery.error.message };
    } else {
      computersData = ((fallbackQuery.data ?? []) as SupabaseComputerRowNoMonitor[]).map((row) => ({
        ...row,
        monitor: "待补充",
      }));
    }
  } else {
    computersError = { message: monitorQuery.error.message };
  }

  if (labsError || computersError || maintenanceError || reportError) {
    const details = [labsError, computersError, maintenanceError, reportError]
      .filter((item): item is { message: string } => Boolean(item))
      .map((item) => item.message)
      .join("; ");

    return {
      labs: [],
      computers: [],
      maintenance: [],
      latestReport: null,
      loadError: `数据库读取失败：${details}`,
    };
  }

  const labs = ((labsData ?? []) as SupabaseLabRow[]).map((row) => ({
    id: row.id,
    labNumber: row.lab_number ?? undefined,
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

  const computers = ((computersData ?? []) as SupabaseComputerRow[]).map((row) => ({
    id: row.id,
    labId: row.lab_id,
    cpu: row.cpu,
    ram: row.ram,
    storage: row.storage,
    gpu: row.gpu ?? "",
    monitor: row.monitor ?? "待补充",
    cDriveSize: row.c_drive_size,
    os: row.os,
    purchaseDate: row.purchase_date ?? "",
    status: row.status,
  }));

  const maintenance = ((maintenanceData ?? []) as SupabaseMaintenanceRow[]).map((row) => ({
    computerId: row.computer_id,
    status: row.status,
  }));

  const latestRow = ((latestReportData ?? []) as SupabaseReportRow[])[0];
  const latestReport = latestRow
    ? {
        month: latestRow.month,
        equipmentValue: Number(latestRow.equipment_value ?? 0),
        activeMinutes: latestRow.active_minutes,
      }
    : null;

  return {
    labs,
    computers,
    maintenance,
    latestReport,
    loadError: null,
  };
}
