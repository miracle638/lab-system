import ReportsClient from "./reports-client";
import { labsSeed } from "@/lib/demo-data";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

async function getInitialReportsData() {
  const client = getSupabaseAdminClient();
  if (!client) {
    return {
      reports: [],
      roomReports: [],
      labs: labsSeed,
      errorMessage: "Supabase service role 未配置",
      hasInitialData: false,
    };
  }

  const [labsQuery, reportsQuery, roomReportsQuery] = await Promise.all([
    client
      .from("labs")
      .select("id,name,college,room_code,lab_number,value,manager,seat_count,usage_area,building_area,notes")
      .order("college")
      .order("room_code"),
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

  if (labsQuery.error) {
    return {
      reports: [],
      roomReports: [],
      labs: labsSeed,
      errorMessage: labsQuery.error.message,
      hasInitialData: false,
    };
  }

  if (reportsQuery.error) {
    return {
      reports: [],
      roomReports: [],
      labs: labsSeed,
      errorMessage: reportsQuery.error.message,
      hasInitialData: false,
    };
  }

  const roomReportsError = roomReportsQuery.error;
  if (roomReportsError && !roomReportsError.message.includes("monthly_room_reports")) {
    return {
      reports: [],
      roomReports: [],
      labs: labsSeed,
      errorMessage: roomReportsError.message,
      hasInitialData: false,
    };
  }

  return {
    reports: (reportsQuery.data ?? []).map((row) => ({
      id: row.id,
      college: row.college,
      month: row.month.slice(0, 7),
      equipmentUnits: Number(row.equipment_units ?? 0),
      equipmentValue: Number(row.equipment_value ?? 0),
      usageMinutes: Number(row.usage_minutes ?? 0),
      activeMinutes: Number(row.active_minutes ?? 0),
    })),
    roomReports: ((roomReportsQuery.data ?? []) as Array<{
      id: string;
      month: string;
      college: string;
      room_code: string;
      usage_minutes: number;
      active_minutes: number;
    }>).map((row) => ({
      id: row.id,
      month: row.month.slice(0, 7),
      college: row.college,
      roomCode: row.room_code,
      usageMinutes: Number(row.usage_minutes ?? 0),
      activeMinutes: Number(row.active_minutes ?? 0),
    })),
    labs: (labsQuery.data ?? []).map((row) => ({
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

export default async function ReportsPage() {
  const { reports, roomReports, labs, errorMessage, hasInitialData } = await getInitialReportsData();

  return (
    <ReportsClient
      initialReports={reports}
      initialRoomMetrics={roomReports}
      initialLabs={labs}
      initialErrorMessage={errorMessage}
      hasInitialData={hasInitialData}
    />
  );
}