"use client";

import { useEffect, useMemo, useState } from "react";
import { maintenanceSeed } from "@/lib/demo-data";
import type { MaintenanceRecord, RepairStatus } from "@/lib/types";

const repairStatusLabel: Record<RepairStatus, string> = {
  pending: "待处理",
  in_progress: "维修中",
  done: "已完成",
};

function getRoleFromCookie(): string {
  if (typeof document === "undefined") return "viewer";
  const hit = document.cookie
    .split("; ")
    .find((row) => row.startsWith("lab_role="));
  return hit?.split("=")[1] ?? "viewer";
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
  issue: string;
  reporter: string;
  reportDate: string;
};

export default function MaintenancePage() {
  const [records, setRecords] = useState<MaintenanceRecord[]>(maintenanceSeed);
  const [labs, setLabs] = useState<LabItem[]>([]);
  const [computers, setComputers] = useState<ComputerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [role] = useState(getRoleFromCookie);
  const canEdit = role === "admin";
  const [draft, setDraft] = useState<NewRecordDraft>({
    labId: "",
    computerId: "",
    computerPosition: "",
    issue: "",
    reporter: "管理员",
    reportDate: new Date().toISOString().slice(0, 10),
  });

  const computerMap = useMemo(() => {
    return new Map(computers.map((item) => [item.id, item]));
  }, [computers]);

  const labMap = useMemo(() => {
    return new Map(labs.map((item) => [item.id, item]));
  }, [labs]);

  const configOptions = useMemo(() => {
    return computers.filter((item) => item.labId === draft.labId);
  }, [computers, draft.labId]);

  const loadRecords = async () => {
    setLoading(true);
    setLoadingError("");
    try {
      const [maintenanceResponse, computersResponse] = await Promise.all([
        fetch("/api/maintenance", { cache: "no-store" }),
        fetch("/api/computers", { cache: "no-store" }),
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
    } catch {
      setLoadingError("读取维修记录失败，当前展示本地示例数据");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  const updateStatus = async (id: string, status: RepairStatus) => {
    if (!canEdit) return;

    const target = records.find((item) => item.id === id);
    if (!target || target.status === status) return;

    setSavingId(id);
    const previousStatus = target.status;
    // 切换到已完成时自动写入今天日期；切回其他状态时清空
    const today = new Date().toISOString().slice(0, 10);
    const resolvedDate = status === "done" ? today : "";
    setRecords((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status, resolvedDate: resolvedDate || undefined } : item,
      ),
    );

    try {
      const response = await fetch(`/api/maintenance/${id}`, {
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

      setRecords((prev) => prev.map((item) => (item.id === id ? result.record as MaintenanceRecord : item)));
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
      const response = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          computerId: draft.computerId,
          computerPosition: draft.computerPosition,
          issue: draft.issue,
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

      setRecords((prev) => [result.record as MaintenanceRecord, ...prev]);
      setDraft((prev) => ({
        ...prev,
        computerPosition: "",
        issue: "",
        reporter: "管理员",
        reportDate: new Date().toISOString().slice(0, 10),
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

  return (
    <div>
      <h1 className="text-2xl font-bold">维修记录管理</h1>

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

            <label className="text-sm text-slate-600 xl:col-span-2">
              <span className="mb-1 block">故障描述</span>
              <input
                value={draft.issue}
                onChange={(e) => setDraft((prev) => ({ ...prev, issue: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="例如 无法开机、蓝屏、风扇异响"
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

      <section className="mt-5 space-y-3">
        {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">维修记录加载中...</div> : null}

        {!loading && records.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            {canEdit ? "当前还没有维修记录，请先在上方新增一条工单。" : "当前还没有维修记录。"}
          </div>
        ) : null}

        {!loading &&
          records.map((item) => {
            const computer = computerMap.get(item.computerId);
            const lab = computer ? labMap.get(computer.labId) : null;
            const labText = lab ? `${lab.college} / ${lab.name}（${lab.roomCode}）` : "未知实验室";
            const configText = computer ? `${computer.cpu} / ${computer.ram} / ${computer.storage}` : "-";

            return (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{labText}</h2>
                  </div>
                  <p className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                    报修日期：{item.reportDate}
                  </p>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                    <p className="text-xs text-slate-400">电脑位置</p>
                    <p className="mt-1 font-medium">{item.computerPosition || "未填写"}</p>
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
                  <p className="mt-1">{item.issue}</p>
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
              </article>
            );
          })}
      </section>
    </div>
  );
}
