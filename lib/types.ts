export type UserRole = "admin" | "viewer";

export type ComputerStatus = "running" | "idle" | "fault" | "offline";
export type RepairStatus = "pending" | "in_progress" | "done";
export type IssueType =
  | "blue_screen"
  | "black_screen"
  | "monitor_no_display"
  | "monitor_artifact"
  | "reboot_loop"
  | "stuck_logo"
  | "cannot_boot"
  | "slow_performance"
  | "network_issue"
  | "audio_issue"
  | "cannot_power_on"
  | "other";
export type FaultNature = "hardware" | "software" | "other";
export type FaultCause =
  | "ssd"
  | "hdd"
  | "memory"
  | "mainboard"
  | "fan"
  | "monitor"
  | "power_switch"
  | "os"
  | "other";

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
  issueType: IssueType;
  faultNature: FaultNature;
  faultCause: FaultCause;
  issue: string;
  handlingMethod?: string;
  status: RepairStatus;
  reporter: string;
  reportDate: string;
  resolvedDate?: string;
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
