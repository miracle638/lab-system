"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { deriveSemesterOptionsFromDateStrings, findSemesterOption, isDateInRange } from "@/lib/semester";
import { maintenanceSeed } from "@/lib/demo-data";
import type { FaultCause, FaultNature, IssueType, MaintenanceRecord, RepairStatus } from "@/lib/types";

const repairStatusLabel: Record<RepairStatus, string> = {
  pending: "待处理",
  in_progress: "维修中",
  done: "已完成",
};

const issueTypeLabel: Record<IssueType, string> = {
  blue_screen: "蓝屏",
  black_screen: "黑屏",
  monitor_no_display: "显示器无显示",
  monitor_artifact: "显示器花屏",
  reboot_loop: "一直重启",
  stuck_logo: "卡 Logo",
  cannot_boot: "无法进入系统",
  slow_performance: "运行卡顿",
  network_issue: "无法联网",
  audio_issue: "无声音",
  cannot_power_on: "无法开机",
  other: "其他",
};

const faultNatureLabel: Record<FaultNature, string> = {
  hardware: "硬件故障",
  software: "软件故障",
  other: "其他",
};

const faultCauseLabel: Record<FaultCause, string> = {
  ssd: "固态硬盘",
  hdd: "机械硬盘",
  memory: "内存条",
  mainboard: "主板",
  fan: "风扇",
  monitor: "显示器",
  power_switch: "电源开关",
  os: "操作系统",
  other: "其他",
};

function getRoleFromCookie(): string {
  if (typeof document === "undefined") return "viewer";
  const hit = document.cookie
    .split("; ")
    .find((row) => row.startsWith("lab_role="));
  return hit?.split("=")[1] ?? "viewer";
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

type LabItem = {
  id: string;
  name: string;
  college: string;
  roomCode: string;
};

type ComputerItem = {
  id: string;
  labId: string;
  assetCode: string;
  cpu: string;
  ram: string;
  storage: string;
  cDriveSize: string;
  gpu: string;
  monitor: string;
  os: string;
  other: string;
  status: "running" | "idle" | "fault" | "offline";
};

type NewRecordDraft = {
  labId: string;
  computerId: string;
  computerPosition: string;
  issueType: IssueType;
  faultNature: FaultNature;
  faultCause: FaultCause;
  issue: string;
  handlingMethod: string;
  reporter: string;
  reportDate: string;
};

type EditRecordDraft = {
  computerPosition: string;
  issueType: IssueType;
  faultNature: FaultNature;
  faultCause: FaultCause;
  issue: string;
  handlingMethod: string;
  reporter: string;
  reportDate: string;
  status: RepairStatus;
  resolvedDate: string;
};

function buildEditDraft(record: MaintenanceRecord): EditRecordDraft {
  return {
    computerPosition: record.computerPosition,
    issueType: record.issueType,
    faultNature: record.faultNature,
    faultCause: record.faultCause,
    issue: record.issue,
    handlingMethod: record.handlingMethod ?? "",
    reporter: record.reporter,
    reportDate: record.reportDate,
    status: record.status,
    resolvedDate: record.resolvedDate ?? "",
  };
}

type MaintenanceClientProps = {
  initialRecords?: MaintenanceRecord[];
  initialLabs?: LabItem[];
  initialComputers?: ComputerItem[];
  initialErrorMessage?: string;
  hasInitialData?: boolean;
};

function buildInitialDraft(labs: LabItem[], computers: ComputerItem[]): NewRecordDraft {
  const initialLabId = labs[0]?.id ?? "";
  const initialComputerId = computers.find((item) => item.labId === initialLabId)?.id ?? "";

  return {
    labId: initialLabId,
    computerId: initialComputerId,
    computerPosition: "",
    issueType: "other",
    faultNature: "other",
    faultCause: "other",
    issue: "",
    handlingMethod: "",
    reporter: "管理员",
    reportDate: getTodayString(),
  };
}

export default function MaintenanceClient({
  initialRecords = [],
  initialLabs = [],
  initialComputers = [],
  initialErrorMessage = "",
  hasInitialData = false,
}: MaintenanceClientProps) {
  const [records, setRecords] = useState<MaintenanceRecord[]>(hasInitialData ? initialRecords : maintenanceSeed);
  const [labs, setLabs] = useState<LabItem[]>(initialLabs);
  const [computers, setComputers] = useState<ComputerItem[]>(initialComputers);
  const [loading, setLoading] = useState(!hasInitialData);
  const [loadingError, setLoadingError] = useState(initialErrorMessage);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditRecordDraft | null>(null);
  const [editError, setEditError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const [reportDateStartFilter, setReportDateStartFilter] = useState("");
  const [reportDateEndFilter, setReportDateEndFilter] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RepairStatus | "all">("all");
  const [role] = useState(getRoleFromCookie);
  const canEdit = role === "admin";
  const [draft, setDraft] = useState<NewRecordDraft>(buildInitialDraft(initialLabs, initialComputers));

  const computerMap = useMemo(() => {
    return new Map(computers.map((item) => [item.id, item]));
  }, [computers]);

  const labMap = useMemo(() => {
    return new Map(labs.map((item) => [item.id, item]));
  }, [labs]);

  const configOptions = useMemo(() => {
    return computers.filter((item) => item.labId === draft.labId);
  }, [computers, draft.labId]);

  const roomCodeOptions = useMemo(() => {
    const allRoomCodes = labs.map((lab) => lab.roomCode).filter((code) => code.trim() !== "");
    return Array.from(new Set(allRoomCodes)).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [labs]);

  const semesterOptions = useMemo(() => {
    return deriveSemesterOptionsFromDateStrings(records.map((item) => item.reportDate));
  }, [records]);

  const selectedSemester = useMemo(
    () => findSemesterOption(semesterOptions, semesterFilter),
    [semesterFilter, semesterOptions],
  );

  const filteredRecords = useMemo(() => {
    return records.filter((item) => {
      const computer = computerMap.get(item.computerId);
      const lab = computer ? labMap.get(computer.labId) : null;
      const roomCode = lab?.roomCode ?? "";
      const reportDateTime = new Date(item.reportDate).getTime();

      const passRoom = roomFilter === "all" || roomCode === roomFilter;
      const passDateStart = reportDateStartFilter === "" || reportDateTime >= new Date(reportDateStartFilter).getTime();
      const passDateEnd = reportDateEndFilter === "" || reportDateTime <= new Date(reportDateEndFilter).getTime();
      const passSemester = !selectedSemester || isDateInRange(item.reportDate, selectedSemester.startDate, selectedSemester.endDate);
      const passStatus = statusFilter === "all" || item.status === statusFilter;

      return passRoom && passDateStart && passDateEnd && passSemester && passStatus;
    });
  }, [records, computerMap, labMap, roomFilter, reportDateStartFilter, reportDateEndFilter, selectedSemester, statusFilter]);

  const loadRecords = async () => {
    setLoading(true);
    setLoadingError("");
    try {
      const [maintenanceResponse, computersResponse] = await Promise.all([
        fetchWithTimeout(withBasePath("/api/maintenance"), { cache: "no-store" }, 12000),
        fetchWithTimeout(withBasePath("/api/computers"), { cache: "no-store" }, 12000),
      ]);

      const maintenanceResult = (await maintenanceResponse.json()) as {
        records?: MaintenanceRecord[];
        message?: string;
      };

      const computersResult = (await computersResponse.json()) as {
        labs?: LabItem[];
        computers?: ComputerItem[];
      };

      if (!maintenanceResponse.ok) {
        setLoadingError(maintenanceResult.message ?? "读取维修记录失败，当前展示本地示例数据");
        setLoading(false);
        return;
      }

      setRecords(maintenanceResult.records ?? []);

      if (computersResponse.ok) {
        const loadedLabs = computersResult.labs ?? [];
        const loadedComputers = computersResult.computers ?? [];
        setLabs(loadedLabs);
        setComputers(loadedComputers);
        setDraft((prev) => {
          if (prev.labId || loadedLabs.length === 0) return prev;
          const nextLabId = loadedLabs[0]?.id ?? "";
          const nextComputerId = loadedComputers.find((item) => item.labId === nextLabId)?.id ?? "";
          return {
            ...prev,
            labId: nextLabId,
            computerId: nextComputerId,
          };
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setLoadingError("读取维修记录超时，当前展示本地示例数据");
      } else {
        setLoadingError("读取维修记录失败，当前展示本地示例数据");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasInitialData) {
      void loadRecords();
    }
  }, [hasInitialData]);

  useEffect(() => {
    if (draft.labId || labs.length === 0) {
      return;
    }

    const nextLabId = labs[0]?.id ?? "";
    const nextComputerId = computers.find((item) => item.labId === nextLabId)?.id ?? "";
    setDraft((prev) => ({
      ...prev,
      labId: nextLabId,
      computerId: nextComputerId,
    }));
  }, [computers, draft.labId, labs]);

  const updateStatus = async (id: string, status: RepairStatus) => {
    if (!canEdit) return;

    const target = records.find((item) => item.id === id);
    if (!target || target.status === status) return;

    setSavingId(id);
    const previousStatus = target.status;
    const resolvedDate = status === "done" ? getTodayString() : "";
    setRecords((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status, resolvedDate: resolvedDate || undefined } : item,
      ),
    );

    try {
      const response = await fetch(withBasePath(`/api/maintenance/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolvedDate }),
      });
      const result = (await response.json()) as {
        record?: MaintenanceRecord;
        message?: string;
      };

      if (!response.ok || !result.record) {
        setRecords((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: previousStatus, resolvedDate: target.resolvedDate } : item,
          ),
        );
        setLoadingError(result.message ?? "保存失败，状态已回滚");
        setSavingId(null);
        return;
      }

      const updatedRecord = result.record;
      setRecords((prev) => prev.map((item) => (item.id === id ? updatedRecord : item)));
      setLoadingError("");
    } catch {
      setRecords((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: previousStatus, resolvedDate: target.resolvedDate } : item,
        ),
      );
      setLoadingError("保存失败，请检查网络后重试");
    } finally {
      setSavingId(null);
    }
  };

  const startEdit = (record: MaintenanceRecord) => {
    setEditingId(record.id);
    setEditDraft(buildEditDraft(record));
    setEditError("");
    setLoadingError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
    setEditError("");
  };

  const saveRecord = async (id: string) => {
    if (!canEdit || !editDraft) return;

    if (!editDraft.computerPosition.trim() || !editDraft.issue.trim() || !editDraft.reportDate) {
      setEditError("请填写电脑位置、故障描述和报修日期");
      return;
    }

    const resolvedDate = editDraft.status === "done" ? editDraft.resolvedDate || getTodayString() : "";

    setSavingId(id);
    setEditError("");

    try {
      const response = await fetch(withBasePath(`/api/maintenance/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          computerPosition: editDraft.computerPosition,
          issueType: editDraft.issueType,
          faultNature: editDraft.faultNature,
          faultCause: editDraft.faultCause,
          issue: editDraft.issue,
          handlingMethod: editDraft.handlingMethod,
          reporter: editDraft.reporter,
          reportDate: editDraft.reportDate,
          status: editDraft.status,
          resolvedDate,
        }),
      });

      const result = (await response.json()) as {
        record?: MaintenanceRecord;
        message?: string;
      };

      if (!response.ok || !result.record) {
        setEditError(result.message ?? "保存失败，请稍后重试");
        setSavingId(null);
        return;
      }

      const updatedRecord = result.record;
      setRecords((prev) => prev.map((item) => (item.id === id ? updatedRecord : item)));
      setEditingId(null);
      setEditDraft(null);
      setLoadingError("");
    } catch {
      setEditError("保存失败，请检查网络后重试");
    } finally {
      setSavingId(null);
    }
  };

  const createRecord = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;

    if (!draft.labId || !draft.computerPosition.trim() || !draft.issue.trim() || !draft.reportDate) {
      setCreateError("请填写实验室、电脑位置、故障描述和报修日期");
      return;
    }

    if (!draft.computerId) {
      setCreateError("当前实验室暂无可关联的配置记录，请先到电脑配置管理新增配置");
      return;
    }

    setCreating(true);
    setCreateError("");

    try {
      const response = await fetch(withBasePath("/api/maintenance"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          computerId: draft.computerId,
          computerPosition: draft.computerPosition,
          issueType: draft.issueType,
          faultNature: draft.faultNature,
          faultCause: draft.faultCause,
          issue: draft.issue,
          handlingMethod: draft.handlingMethod,
          reporter: draft.reporter,
          reportDate: draft.reportDate,
          status: "pending",
        }),
      });
      const result = (await response.json()) as {
        record?: MaintenanceRecord;
        message?: string;
      };

      if (!response.ok || !result.record) {
        setCreateError(result.message ?? "新增维修记录失败");
        setCreating(false);
        return;
      }

      const createdRecord = result.record;
      setRecords((prev) => [createdRecord, ...prev]);
      setDraft((prev) => ({
        ...prev,
        computerPosition: "",
        issueType: "other",
        faultNature: "other",
        faultCause: "other",
        issue: "",
        handlingMethod: "",
        reporter: "管理员",
        reportDate: getTodayString(),
      }));
    } catch {
      setCreateError("新增维修记录失败，请检查网络后重试");
    } finally {
      setCreating(false);
    }
  };

  const statusButtonClassName = (currentStatus: RepairStatus, buttonStatus: RepairStatus, disabled: boolean) => {
    const isActive = currentStatus === buttonStatus;
    const base = "rounded-md border px-2 py-1 text-xs transition";

    if (disabled) {
      return `${base} border-slate-200 bg-slate-100 text-slate-400`;
    }

    if (isActive) {
      if (buttonStatus === "pending") return `${base} border-amber-300 bg-amber-100 text-amber-800`;
      if (buttonStatus === "in_progress") return `${base} border-sky-300 bg-sky-100 text-sky-800`;
      return `${base} border-emerald-300 bg-emerald-100 text-emerald-800`;
    }

    return `${base} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
  };

  const filterStatusButtonClassName = (buttonStatus: RepairStatus) => {
    const isActive = statusFilter === buttonStatus;
    const base = "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition";

    if (isActive) {
      if (buttonStatus === "pending") return `${base} border-amber-300 bg-amber-100 text-amber-800`;
      if (buttonStatus === "in_progress") return `${base} border-sky-300 bg-sky-100 text-sky-800`;
      return `${base} border-emerald-300 bg-emerald-100 text-emerald-800`;
    }

    return `${base} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
  };

  const reportDateFilterLabel = useMemo(() => {
    if (selectedSemester) {
      return selectedSemester.label;
    }
    if (reportDateStartFilter && reportDateEndFilter) {
      return `${reportDateStartFilter} ~ ${reportDateEndFilter}`;
    }
    if (reportDateStartFilter) {
      return `${reportDateStartFilter} 起`;
    }
    if (reportDateEndFilter) {
      return `截至 ${reportDateEndFilter}`;
    }
    return "选择日期范围";
  }, [reportDateStartFilter, reportDateEndFilter, selectedSemester]);

  const exportRecords = (targetRecords: MaintenanceRecord[], fileTag: string) => {
    if (targetRecords.length === 0) return;

    const headers = [
      "学院",
      "实验室",
      "房间号",
      "电脑位置",
      "故障描述",
      "如何处理",
      "处理状态",
      "报修人",
      "报修日期",
      "完成日期",
    ];

    const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;

    const rows = targetRecords.map((item) => {
      const computer = computerMap.get(item.computerId);
      const lab = computer ? labMap.get(computer.labId) : null;

      return [
        lab?.college ?? "",
        lab?.name ?? "",
        lab?.roomCode ?? "",
        item.computerPosition ?? "",
        item.issue ?? "",
        item.handlingMethod ?? "",
        repairStatusLabel[item.status],
        item.reporter ?? "",
        item.reportDate ?? "",
        item.resolvedDate ?? "",
      ];
    });

    const csvContent = [headers, ...rows]
      .map((line) => line.map((cell) => escapeCsv(String(cell))).join(","))
      .join("\n");

    const blob = new Blob([`\ufeff${csvContent}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `维修记录_${fileTag}_${getTodayString()}.csv`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">维修记录管理</h1>
        <Link
          href={withBasePath("/maintenance-analysis")}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
        >
          查看维修分析
        </Link>
      </div>

      {canEdit && (
        <form onSubmit={createRecord} className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">新增维修记录</h2>

          {createError && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</p>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm text-slate-600">
              <span className="mb-1 block">所属实验室</span>
              <select
                value={draft.labId}
                onChange={(e) => {
                  const nextLabId = e.target.value;
                  const nextComputerId = computers.find((item) => item.labId === nextLabId)?.id ?? "";
                  setDraft((prev) => ({ ...prev, labId: nextLabId, computerId: nextComputerId }));
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {labs.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.college} / {lab.name}（{lab.roomCode}）
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block">电脑位置</span>
              <input
                value={draft.computerPosition}
                onChange={(e) => setDraft((prev) => ({ ...prev, computerPosition: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="例如 1-10"
              />
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block">报修人（可留空）</span>
              <input
                value={draft.reporter}
                onChange={(e) => setDraft((prev) => ({ ...prev, reporter: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="留空则默认管理员"
              />
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block">报修日期</span>
              <input
                type="date"
                value={draft.reportDate}
                onChange={(e) => setDraft((prev) => ({ ...prev, reportDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block">故障现象</span>
              <select
                value={draft.issueType}
                onChange={(e) => setDraft((prev) => ({ ...prev, issueType: e.target.value as IssueType }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {(Object.entries(issueTypeLabel) as [IssueType, string][]).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block">故障性质</span>
              <select
                value={draft.faultNature}
                onChange={(e) => setDraft((prev) => ({ ...prev, faultNature: e.target.value as FaultNature }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {(Object.entries(faultNatureLabel) as [FaultNature, string][]).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-600">
              <span className="mb-1 block">故障原因</span>
              <select
                value={draft.faultCause}
                onChange={(e) => setDraft((prev) => ({ ...prev, faultCause: e.target.value as FaultCause }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {(Object.entries(faultCauseLabel) as [FaultCause, string][]).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-600 md:col-span-2 xl:col-span-3">
              <span className="mb-1 block">故障描述</span>
              <textarea
                value={draft.issue}
                onChange={(e) => setDraft((prev) => ({ ...prev, issue: e.target.value }))}
                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="请补充故障现场描述"
              />
            </label>

            <label className="text-sm text-slate-600 md:col-span-2 xl:col-span-3">
              <span className="mb-1 block">如何处理</span>
              <textarea
                value={draft.handlingMethod}
                onChange={(e) => setDraft((prev) => ({ ...prev, handlingMethod: e.target.value }))}
                className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="例如 重装系统、重插内存、清灰、更换配件"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={creating || labs.length === 0 || configOptions.length === 0}
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
          >
            {creating ? "保存中..." : "新增维修记录"}
          </button>
        </form>
      )}

      {loadingError && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <p>{loadingError}</p>
          <button
            type="button"
            className="mt-2 rounded border border-rose-300 px-2 py-1 text-xs"
            onClick={() => void loadRecords()}
          >
            重试
          </button>
        </div>
      )}

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
            <span>房间</span>
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className="h-7 rounded border border-slate-300 px-2 text-xs"
              aria-label="房间号筛选"
            >
              <option value="all">全部</option>
              {roomCodeOptions.map((roomCode) => (
                <option key={roomCode} value={roomCode}>
                  {roomCode}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setDatePickerOpen((prev) => !prev)}
              className="flex h-10 min-w-48 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 transition hover:bg-slate-50"
              aria-label="选择报修日期范围"
            >
              <span className="truncate">{reportDateFilterLabel}</span>
              <span className="text-slate-400">▾</span>
            </button>

            {datePickerOpen ? (
              <div className="absolute left-0 z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                <p className="text-xs text-slate-500">报修日期范围</p>
                <div className="mt-2 grid gap-2">
                  <label className="text-xs text-slate-600">
                    学期
                    <select
                      value={semesterFilter}
                      onChange={(e) => setSemesterFilter(e.target.value)}
                      className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs"
                      aria-label="报修学期筛选"
                    >
                      <option value="">全部学期</option>
                      {semesterOptions.map((semester) => (
                        <option key={semester.id} value={semester.id}>
                          {semester.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600">
                    开始日期
                    <input
                      type="date"
                      value={reportDateStartFilter}
                      onChange={(e) => setReportDateStartFilter(e.target.value)}
                      className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs"
                      aria-label="报修开始日期筛选"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    结束日期
                    <input
                      type="date"
                      value={reportDateEndFilter}
                      onChange={(e) => setReportDateEndFilter(e.target.value)}
                      className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs"
                      aria-label="报修结束日期筛选"
                    />
                  </label>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSemesterFilter("");
                      setReportDateStartFilter("");
                      setReportDateEndFilter("");
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50"
                  >
                    清空日期
                  </button>
                  <button
                    type="button"
                    onClick={() => setDatePickerOpen(false)}
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white transition hover:bg-slate-700"
                  >
                    完成
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(Object.entries(repairStatusLabel) as [RepairStatus, string][]).map(([statusKey, label]) => (
              <button
                key={statusKey}
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === statusKey ? "all" : statusKey))}
                className={filterStatusButtonClassName(statusKey)}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setRoomFilter("all");
              setSemesterFilter("");
              setReportDateStartFilter("");
              setReportDateEndFilter("");
              setDatePickerOpen(false);
              setStatusFilter("all");
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            清空
          </button>

          <button
            type="button"
            onClick={() => exportRecords(filteredRecords, "筛选结果")}
            disabled={filteredRecords.length === 0 || loading}
            className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
          >
            导出筛选结果
          </button>

          <button
            type="button"
            onClick={() => exportRecords(records, "全部")}
            disabled={records.length === 0 || loading}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-400"
          >
            导出全部
          </button>

          <span className="ml-auto rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
            共 {filteredRecords.length} 条
          </span>
        </div>
      </section>

      <section className="mt-5 space-y-3">
        {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">维修记录加载中...</div> : null}

        {!loading && filteredRecords.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            {records.length === 0
              ? canEdit
                ? "当前还没有维修记录，请先在上方新增一条工单。"
                : "当前还没有维修记录。"
              : "当前筛选条件下没有匹配记录。"}
          </div>
        ) : null}

        {!loading && filteredRecords.length > 0 ? (
          <div className="max-h-[68vh] overflow-y-auto space-y-3 pr-1">
            {filteredRecords.map((item) => {
            const computer = computerMap.get(item.computerId);
            const lab = computer ? labMap.get(computer.labId) : null;
            const labText = lab ? `${lab.college} / ${lab.name}（${lab.roomCode}）` : "未知实验室";
            const configText = computer ? `${computer.cpu} / ${computer.ram} / ${computer.storage}` : "-";
            const isEditing = canEdit && editingId === item.id && editDraft;

            return (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{labText}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                      报修日期：{item.reportDate}
                    </p>
                    {canEdit && !isEditing ? (
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        disabled={savingId === item.id}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:text-slate-400"
                      >
                        编辑
                      </button>
                    ) : null}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    {editError ? (
                      <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{editError}</p>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block">电脑位置</span>
                        <input
                          value={editDraft.computerPosition}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, computerPosition: e.target.value } : prev))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>

                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block">报修人</span>
                        <input
                          value={editDraft.reporter}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, reporter: e.target.value } : prev))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>

                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block">报修日期</span>
                        <input
                          type="date"
                          value={editDraft.reportDate}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, reportDate: e.target.value } : prev))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>

                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block">维修状态</span>
                        <select
                          value={editDraft.status}
                          onChange={(e) => {
                            const nextStatus = e.target.value as RepairStatus;
                            setEditDraft((prev) => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                status: nextStatus,
                                resolvedDate: nextStatus === "done" ? prev.resolvedDate || getTodayString() : "",
                              };
                            });
                          }}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        >
                          {(Object.entries(repairStatusLabel) as [RepairStatus, string][]).map(([statusKey, label]) => (
                            <option key={statusKey} value={statusKey}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block">故障现象</span>
                        <select
                          value={editDraft.issueType}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, issueType: e.target.value as IssueType } : prev))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        >
                          {(Object.entries(issueTypeLabel) as [IssueType, string][]).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block">故障性质</span>
                        <select
                          value={editDraft.faultNature}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, faultNature: e.target.value as FaultNature } : prev))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        >
                          {(Object.entries(faultNatureLabel) as [FaultNature, string][]).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block">故障原因</span>
                        <select
                          value={editDraft.faultCause}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, faultCause: e.target.value as FaultCause } : prev))}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2"
                        >
                          {(Object.entries(faultCauseLabel) as [FaultCause, string][]).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block">完成日期</span>
                        <input
                          type="date"
                          value={editDraft.resolvedDate}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, resolvedDate: e.target.value } : prev))}
                          disabled={editDraft.status !== "done"}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </label>

                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                        <p className="text-xs text-slate-400">配置摘要</p>
                        <p className="mt-1 font-medium">{configText}</p>
                      </div>

                      <label className="text-sm text-slate-600 md:col-span-2 xl:col-span-3">
                        <span className="mb-1 block">故障描述</span>
                        <textarea
                          value={editDraft.issue}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, issue: e.target.value } : prev))}
                          className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
                        />
                      </label>

                      <label className="text-sm text-slate-600 md:col-span-2 xl:col-span-3">
                        <span className="mb-1 block">如何处理</span>
                        <textarea
                          value={editDraft.handlingMethod}
                          onChange={(e) => setEditDraft((prev) => (prev ? { ...prev, handlingMethod: e.target.value } : prev))}
                          className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2"
                          placeholder="例如 重装系统、已更换配件、待进一步检测"
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void saveRecord(item.id)}
                        disabled={savingId === item.id}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
                      >
                        {savingId === item.id ? "保存中..." : "保存修改"}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={savingId === item.id}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:text-slate-400"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                        <p className="text-xs text-slate-400">电脑位置</p>
                        <p className="mt-1 font-medium">{item.computerPosition || "未填写"}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                        <p className="text-xs text-slate-400">故障现象</p>
                        <p className="mt-1 font-medium">{issueTypeLabel[item.issueType]}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                        <p className="text-xs text-slate-400">故障性质 / 原因</p>
                        <p className="mt-1 font-medium">{faultNatureLabel[item.faultNature]} / {faultCauseLabel[item.faultCause]}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                        <p className="text-xs text-slate-400">配置摘要</p>
                        <p className="mt-1 font-medium">{configText}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                        <p className="text-xs text-slate-400">报修人</p>
                        <p className="mt-1 font-medium">{item.reporter}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                        <p className="text-xs text-slate-400">完成日期</p>
                        <p className="mt-1 font-medium">{savingId === item.id ? "保存中..." : item.resolvedDate || "-"}</p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm text-slate-700">
                      <p className="text-xs text-slate-400">故障描述</p>
                      <p className="mt-1 whitespace-pre-wrap">{item.issue}</p>
                    </div>

                    <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/50 px-3 py-2 text-sm text-slate-700">
                      <p className="text-xs text-slate-400">如何处理</p>
                      <p className="mt-1 whitespace-pre-wrap">{item.handlingMethod?.trim() || "暂未填写"}</p>
                    </div>

                    <div className="mt-4">
                      <div className="flex flex-wrap gap-2">
                        {(Object.entries(repairStatusLabel) as [RepairStatus, string][]).map(([statusKey, label]) => (
                          <button
                            key={statusKey}
                            type="button"
                            disabled={!canEdit || savingId === item.id}
                            onClick={() => void updateStatus(item.id, statusKey)}
                            className={statusButtonClassName(item.status, statusKey, !canEdit || savingId === item.id)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </article>
            );
          })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
