export type UserRole = "admin" | "viewer";

export type ComputerStatus = "running" | "idle" | "fault" | "offline";
export type RepairStatus = "pending" | "in_progress" | "done";
export type AiAnalysisStatus = "pending" | "confirmed" | "edited";

export interface Lab {
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
  notes?: string;
}

export interface Computer {
  id: string;
  labId: string;
  assetCode: string;
  purchaseDate?: string;
  cpu: string;
  ram: string;
  storage: string;
  cDriveSize: string;
  gpu: string;
  monitor: string;
  os: string;
  other: string;
  status: ComputerStatus;
}

export interface MaintenanceRecord {
  id: string;
  computerId: string;
  computerPosition: string;
  issue: string;
  handlingMethod?: string;
  status: RepairStatus;
  reporter: string;
  reportDate: string;
  resolvedDate?: string;
  aiCategory?: string;
  aiConfidence?: number;
  aiStatus?: AiAnalysisStatus;
  aiIsHardware?: boolean;
  aiIsRecurrent?: boolean;
  aiRecurGapDays?: number;
  aiDeviceKey?: string;
  aiAnalyzedAt?: string;
  aiVersion?: string;
}

export interface MonthlyReport {
  id: string;
  college: string;
  month: string;
  equipmentUnits: number;
  equipmentValue: number;
  usageMinutes: number;
  activeMinutes: number;
}
