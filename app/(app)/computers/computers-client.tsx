"use client";

import { useEffect, useMemo, useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { ComputerStatus } from "@/lib/types";
import ConfirmDialog from "@/components/ConfirmDialog";

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
  purchaseDate: string;
  cpu: string;
  ram: string;
  storage: string;
  cDriveSize: string;
  gpu: string;
  monitor: string;
  os: string;
  other: string;
  status: ComputerStatus;
};

type NewComputerDraft = {
  assetCode: string;
  purchaseDate: string;
  cpu: string;
  ram: string;
  storage: string;
  cDriveSize: string;
  gpu: string;
  monitor: string;
  os: string;
  other: string;
  status: ComputerStatus;
};

type ComputersClientProps = {
  initialLabs?: LabItem[];
  initialComputers?: ComputerItem[];
  initialErrorMessage?: string;
  hasInitialData?: boolean;
};

export default function ComputersClient({
  initialLabs = [],
  initialComputers = [],
  initialErrorMessage = "",
  hasInitialData = false,
}: ComputersClientProps) {
  const [labs, setLabs] = useState<LabItem[]>(initialLabs);
  const [computers, setComputers] = useState<ComputerItem[]>(initialComputers);
  const [loading, setLoading] = useState(!hasInitialData);
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savedFlashId, setSavedFlashId] = useState<string | null>(null);
  const [creatingLabId, setCreatingLabId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmedComputer, setConfirmedComputer] = useState<ComputerItem | null>(null);
  const [role] = useState(getRoleFromCookie);
  const canEdit = role === "admin";
  const [keyword, setKeyword] = useState("");
  const [selectedCollege, setSelectedCollege] = useState("all");
  const [expandedNewFormLabs, setExpandedNewFormLabs] = useState<Record<string, boolean>>({});
  const [newFormErrorByLab, setNewFormErrorByLab] = useState<Record<string, string>>({});
  const [newDraftByLab, setNewDraftByLab] = useState<Record<string, NewComputerDraft>>({});
  const [editDraft, setEditDraft] = useState({
    labId: "",
    assetCode: "",
    purchaseDate: "",
    cpu: "",
    ram: "",
    storage: "",
    cDriveSize: "",
    gpu: "",
    monitor: "",
    os: "",
    other: "",
    status: "running" as ComputerStatus,
  });

  const loadData = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetchWithTimeout(withBasePath("/api/computers"), { cache: "no-store" }, 12000);
      const result = (await response.json()) as {
        labs?: LabItem[];
        computers?: ComputerItem[];
        message?: string;
      };

      if (!response.ok) {
        setErrorMessage(result.message ?? "读取电脑配置失败");
        setLoading(false);
        return;
      }

      const labsData = result.labs ?? [];
      setLabs(labsData);
      setComputers(result.computers ?? []);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setErrorMessage("读取电脑配置超时，请重试");
      } else {
        setErrorMessage("读取电脑配置失败，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasInitialData) {
      void loadData();
    }
  }, [hasInitialData]);

  const collegeOptions = useMemo(() => {
    const values = Array.from(new Set(labs.map((lab) => lab.college).filter((college) => college.trim().length > 0)));
    return values.sort((a, b) => {
      if (a === "软件学院" && b !== "软件学院") return -1;
      if (b === "软件学院" && a !== "软件学院") return 1;
      return a.localeCompare(b, "zh-CN");
    });
  }, [labs]);

  const groupedLabs = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return [...labs]
      .filter((lab) => selectedCollege === "all" || lab.college === selectedCollege)
      .sort((a, b) => {
        if (a.college === "软件学院" && b.college !== "软件学院") return -1;
        if (b.college === "软件学院" && a.college !== "软件学院") return 1;
        const collegeCompare = a.college.localeCompare(b.college, "zh-CN");
        if (collegeCompare !== 0) return collegeCompare;
        return a.roomCode.localeCompare(b.roomCode, "zh-CN");
      })
      .map((lab) => ({
        lab,
        computers: computers.filter((item) => item.labId === lab.id),
      }))
      .filter(({ lab, computers: labComputers }) => {
        if (!query) return true;

        if (lab.name.toLowerCase().includes(query) || lab.roomCode.toLowerCase().includes(query) || lab.college.toLowerCase().includes(query)) {
          return true;
        }

        return labComputers.some((computer) => {
          return (
            computer.assetCode.toLowerCase().includes(query) ||
            computer.purchaseDate.toLowerCase().includes(query) ||
            computer.cpu.toLowerCase().includes(query) ||
            computer.ram.toLowerCase().includes(query) ||
            computer.storage.toLowerCase().includes(query) ||
            computer.cDriveSize.toLowerCase().includes(query) ||
            computer.gpu.toLowerCase().includes(query) ||
            computer.monitor.toLowerCase().includes(query) ||
            computer.os.toLowerCase().includes(query) ||
            computer.other.toLowerCase().includes(query)
          );
        });
      });
  }, [labs, computers, keyword, selectedCollege]);

  const getNewDraft = (labId: string): NewComputerDraft => {
    return (
      newDraftByLab[labId] ?? {
        cpu: "",
        assetCode: "",
        purchaseDate: "",
        ram: "",
        storage: "",
        cDriveSize: "",
        gpu: "",
        monitor: "",
        os: "",
        other: "",
        status: "running" as ComputerStatus,
      }
    );
  };

  const setNewDraftField = <K extends keyof NewComputerDraft>(
    labId: string,
    key: K,
    value: NewComputerDraft[K],
  ) => {
    setNewDraftByLab((prev) => ({
      ...prev,
      [labId]: {
        ...getNewDraft(labId),
        [key]: value,
      },
    }));
    setNewFormErrorByLab((prev) => ({ ...prev, [labId]: "" }));
  };

  const startEdit = (computer: ComputerItem) => {
    if (!canEdit) return;
    setEditingId(computer.id);
    setEditDraft({
      labId: computer.labId,
      assetCode: computer.assetCode,
      purchaseDate: computer.purchaseDate,
      cpu: computer.cpu,
      ram: computer.ram,
      storage: computer.storage,
      cDriveSize: computer.cDriveSize,
      gpu: computer.gpu,
      monitor: computer.monitor,
      os: computer.os,
      other: computer.other,
      status: computer.status,
    });
  };

  const createComputerForLab = async (labId: string) => {
    if (!canEdit) return;
    const draft = getNewDraft(labId);
    if (!draft.cpu.trim() || !draft.ram.trim() || !draft.storage.trim() || !draft.os.trim()) {
      const message = "请完整填写 CPU、内存、存储和系统后再保存";
      setNewFormErrorByLab((prev) => ({ ...prev, [labId]: message }));
      setErrorMessage(message);
      return;
    }

    setCreatingLabId(labId);
    setNewFormErrorByLab((prev) => ({ ...prev, [labId]: "" }));

    try {
      const response = await fetch(withBasePath("/api/computers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, labId }),
      });
      const result = (await response.json()) as { computer?: ComputerItem; message?: string };

      if (!response.ok || !result.computer) {
        const message = result.message ?? "新增电脑配置失败";
        setNewFormErrorByLab((prev) => ({ ...prev, [labId]: message }));
        setErrorMessage(message);
        setCreatingLabId(null);
        return;
      }

      setComputers((prev) => [...prev, result.computer as ComputerItem]);
      setNewDraftByLab((prev) => ({
        ...prev,
        [labId]: {
          assetCode: "",
          purchaseDate: "",
          cpu: "",
          ram: "",
          storage: "",
          cDriveSize: "",
          gpu: "",
          monitor: "",
          os: "",
          other: "",
          status: "running",
        },
      }));
      setExpandedNewFormLabs((prev) => ({ ...prev, [labId]: false }));
      setNewFormErrorByLab((prev) => ({ ...prev, [labId]: "" }));
      setErrorMessage("");
    } catch {
      const message = "新增电脑配置失败，请检查网络后重试";
      setNewFormErrorByLab((prev) => ({ ...prev, [labId]: message }));
      setErrorMessage(message);
    } finally {
      setCreatingLabId(null);
    }
  };

  const saveEdit = async (id: string) => {
    if (!canEdit) return;

    if (!editDraft.cpu.trim() || !editDraft.ram.trim() || !editDraft.storage.trim() || !editDraft.os.trim()) {
      setErrorMessage("请完整填写 CPU、内存、存储和系统后再保存");
      return;
    }

    setSavingId(id);
    const response = await fetch(withBasePath(`/api/computers/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    const result = (await response.json()) as { computer?: ComputerItem; message?: string };

    if (!response.ok || !result.computer) {
      setErrorMessage(result.message ?? "保存失败");
      setSavingId(null);
      return;
    }

    setComputers((prev) => prev.map((item) => (item.id === id ? result.computer as ComputerItem : item)));
    setEditingId(null);
    setSavingId(null);
    setSavedFlashId(id);
    setTimeout(() => setSavedFlashId((current) => (current === id ? null : current)), 1300);
    setErrorMessage("");
  };

  const removeComputer = async (id: string) => {
    if (!canEdit) return;
    setDeletingId(id);
    const response = await fetch(withBasePath(`/api/computers/${id}`), { method: "DELETE" });
    const result = (await response.json()) as { message?: string };
    if (!response.ok) {
      setErrorMessage(result.message ?? "删除失败");
      setDeletingId(null);
      setConfirmDeleteId(null);
      return;
    }

    setComputers((prev) => prev.filter((item) => item.id !== id));
    setDeletingId(null);
    setConfirmDeleteId(null);
    setErrorMessage("");
  };

  const handleDeleteClick = (computer: ComputerItem) => {
    setConfirmedComputer(computer);
    setConfirmDeleteId(computer.id);
  };

  const handleConfirmDelete = () => {
    if (confirmDeleteId) {
      void removeComputer(confirmDeleteId);
    }
  };

  const toggleNewConfigForm = (labId: string) => {
    setExpandedNewFormLabs((prev) => ({
      ...prev,
      [labId]: !prev[labId],
    }));
    setNewFormErrorByLab((prev) => ({ ...prev, [labId]: "" }));
  };

  const renderNewConfigForm = (labId: string, hasExisting: boolean) => {
    const isExpanded = expandedNewFormLabs[labId] ?? false;
    const newDraft = getNewDraft(labId);
    const formError = newFormErrorByLab[labId] ?? "";
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {hasExisting ? "该操作较少使用，按需展开后再填写。" : "当前实验室还没有电脑配置记录。"}
          </p>
          {canEdit ? (
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100"
              onClick={() => toggleNewConfigForm(labId)}
            >
              {isExpanded ? "收起新增" : hasExisting ? "新增一套配置" : "登记首套配置"}
            </button>
          ) : null}
        </div>

        {isExpanded ? (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="配置标识（如 配置1、高配区）"
                disabled={!canEdit}
                value={newDraft.assetCode}
                onChange={(e) => setNewDraftField(labId, "assetCode", e.target.value)}
              />
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-3 py-2"
                disabled={!canEdit}
                value={newDraft.purchaseDate}
                onChange={(e) => setNewDraftField(labId, "purchaseDate", e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="CPU"
                disabled={!canEdit}
                value={newDraft.cpu}
                onChange={(e) => setNewDraftField(labId, "cpu", e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="内存"
                disabled={!canEdit}
                value={newDraft.ram}
                onChange={(e) => setNewDraftField(labId, "ram", e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="存储（硬盘）"
                disabled={!canEdit}
                value={newDraft.storage}
                onChange={(e) => setNewDraftField(labId, "storage", e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="C盘大小"
                disabled={!canEdit}
                value={newDraft.cDriveSize}
                onChange={(e) => setNewDraftField(labId, "cDriveSize", e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="显卡"
                disabled={!canEdit}
                value={newDraft.gpu}
                onChange={(e) => setNewDraftField(labId, "gpu", e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="显示器"
                disabled={!canEdit}
                value={newDraft.monitor}
                onChange={(e) => setNewDraftField(labId, "monitor", e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 px-3 py-2"
                placeholder="系统"
                disabled={!canEdit}
                value={newDraft.os}
                onChange={(e) => setNewDraftField(labId, "os", e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-300 px-3 py-2 xl:col-span-2"
                placeholder="其他"
                disabled={!canEdit}
                value={newDraft.other}
                onChange={(e) => setNewDraftField(labId, "other", e.target.value)}
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">填写后可直接保存到当前实验室</span>
              <button
                type="button"
                disabled={creatingLabId === labId}
                className="rounded-lg border border-emerald-300 px-3 py-2 text-sm text-emerald-700 transition active:scale-95 hover:bg-emerald-50 disabled:opacity-70"
                onClick={() => void createComputerForLab(labId)}
              >
                {creatingLabId === labId ? "保存中..." : "保存新增配置"}
              </button>
            </div>
            {formError ? <p className="mt-2 text-sm text-rose-600">{formError}</p> : null}
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">电脑配置管理</h1>

      {errorMessage && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
          >
            重试
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
        <input
          className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2"
          placeholder="按实验室/CPU/配置搜索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button
          type="button"
          className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
          onClick={() => {
            setKeyword("");
            setSelectedCollege("all");
          }}
        >
          重置筛选
        </button>
        <div className="md:col-span-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedCollege("all")}
            className={`chip-switch rounded-full border px-3 py-1.5 text-sm transition ${
              selectedCollege === "all"
                ? "border-sky-300 bg-sky-50 text-sky-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            全部学院
          </button>
          {collegeOptions.map((college) => (
            <button
              key={college}
              type="button"
              onClick={() => setSelectedCollege(college)}
              className={`chip-switch rounded-full border px-3 py-1.5 text-sm transition ${
                selectedCollege === college
                  ? "border-sky-300 bg-sky-50 text-sky-700"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {college}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            正在加载电脑配置数据...
          </div>
        ) : groupedLabs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            当前条件下暂无数据。
          </div>
        ) : (
          groupedLabs.map(({ lab, computers: labComputers }) => {
            return (
              <section key={lab.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700">{lab.college}</span>
                        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs text-slate-600">房间号 {lab.roomCode}</span>
                      </div>
                      <h2 className="mt-2 text-lg font-semibold text-slate-900">{lab.name}</h2>
                    </div>
                    <div className="text-sm text-slate-500">{labComputers.length > 0 ? `已登记 ${labComputers.length} 条配置` : "暂未登记配置"}</div>
                  </div>
                </div>

                <div className="space-y-3 p-5">
                  {labComputers.length === 0 ? (
                    renderNewConfigForm(lab.id, false)
                  ) : (
                    <>
                      {labComputers.map((pc, index) => {
                        const isEditing = editingId === pc.id;
                        const isSaved = savedFlashId === pc.id;

                        return (
                          <article
                            key={pc.id}
                            className={`rounded-xl border p-4 transition-colors ${
                              isEditing
                                ? "border-sky-200 bg-sky-50/60"
                                : isSaved
                                  ? "border-emerald-200 bg-emerald-50/70"
                                  : "border-slate-200 bg-white"
                            }`}
                          >
                          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div className="text-sm font-medium text-slate-700">配置 {index + 1}</div>
                            {canEdit ? (
                              <div className="flex gap-2">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={savingId === pc.id}
                                      className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 transition active:scale-95 disabled:opacity-70"
                                      onClick={() => void saveEdit(pc.id)}
                                    >
                                      {savingId === pc.id ? "保存中..." : "保存"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={savingId === pc.id}
                                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 transition active:scale-95 disabled:opacity-70"
                                      onClick={() => setEditingId(null)}
                                    >
                                      取消
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 transition active:scale-95 hover:bg-slate-50"
                                      onClick={() => startEdit(pc)}
                                    >
                                      {isSaved ? "已保存" : "编辑"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={deletingId === pc.id}
                                      className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-700 transition active:scale-95 hover:bg-rose-50 disabled:opacity-70"
                                      onClick={() => handleDeleteClick(pc)}
                                    >
                                      {deletingId === pc.id ? "删除中..." : "删除"}
                                    </button>
                                  </>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">只读</span>
                            )}
                          </div>

                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                              <span className="mb-1 block text-xs text-slate-400">配置标识</span>
                              {isEditing ? (
                                <input
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                                  value={editDraft.assetCode}
                                  onChange={(e) => setEditDraft({ ...editDraft, assetCode: e.target.value })}
                                  placeholder="如 配置1"
                                />
                              ) : (
                                <span className="font-medium text-slate-800">{pc.assetCode || `配置 ${index + 1}`}</span>
                              )}
                            </label>
                            <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                              <span className="mb-1 block text-xs text-slate-400">购置日期</span>
                              {isEditing ? (
                                <input
                                  type="date"
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                                  value={editDraft.purchaseDate}
                                  onChange={(e) => setEditDraft({ ...editDraft, purchaseDate: e.target.value })}
                                />
                              ) : (
                                <span className="font-medium text-slate-800">{pc.purchaseDate || "未填写"}</span>
                              )}
                            </label>
                            <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                              <span className="mb-1 block text-xs text-slate-400">CPU</span>
                              {isEditing ? (
                                <input
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                                  value={editDraft.cpu}
                                  onChange={(e) => setEditDraft({ ...editDraft, cpu: e.target.value })}
                                />
                              ) : (
                                <span className="font-medium text-slate-800">{pc.cpu || "未填写"}</span>
                              )}
                            </label>
                            <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                              <span className="mb-1 block text-xs text-slate-400">内存</span>
                              {isEditing ? (
                                <input
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                                  value={editDraft.ram}
                                  onChange={(e) => setEditDraft({ ...editDraft, ram: e.target.value })}
                                />
                              ) : (
                                <span className="font-medium text-slate-800">{pc.ram || "未填写"}</span>
                              )}
                            </label>
                            <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                              <span className="mb-1 block text-xs text-slate-400">存储（硬盘）</span>
                              {isEditing ? (
                                <input
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                                  value={editDraft.storage}
                                  onChange={(e) => setEditDraft({ ...editDraft, storage: e.target.value })}
                                />
                              ) : (
                                <span className="font-medium text-slate-800">{pc.storage || "未填写"}</span>
                              )}
                            </label>
                            <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                              <span className="mb-1 block text-xs text-slate-400">C盘大小</span>
                              {isEditing ? (
                                <input
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                                  value={editDraft.cDriveSize}
                                  onChange={(e) => setEditDraft({ ...editDraft, cDriveSize: e.target.value })}
                                />
                              ) : (
                                <span className="font-medium text-slate-800">{pc.cDriveSize || "未填写"}</span>
                              )}
                            </label>
                            <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                              <span className="mb-1 block text-xs text-slate-400">显卡</span>
                              {isEditing ? (
                                <input
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                                  value={editDraft.gpu}
                                  onChange={(e) => setEditDraft({ ...editDraft, gpu: e.target.value })}
                                />
                              ) : (
                                <span className="font-medium text-slate-800">{pc.gpu || "未填写"}</span>
                              )}
                            </label>
                            <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                              <span className="mb-1 block text-xs text-slate-400">显示器</span>
                              {isEditing ? (
                                <input
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                                  value={editDraft.monitor}
                                  onChange={(e) => setEditDraft({ ...editDraft, monitor: e.target.value })}
                                />
                              ) : (
                                <span className="font-medium text-slate-800">{pc.monitor || "未填写"}</span>
                              )}
                            </label>
                            <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                              <span className="mb-1 block text-xs text-slate-400">系统</span>
                              {isEditing ? (
                                <input
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                                  value={editDraft.os}
                                  onChange={(e) => setEditDraft({ ...editDraft, os: e.target.value })}
                                />
                              ) : (
                                <span className="font-medium text-slate-800">{pc.os || "未填写"}</span>
                              )}
                            </label>
                            <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600 xl:col-span-2">
                              <span className="mb-1 block text-xs text-slate-400">其他</span>
                              {isEditing ? (
                                <input
                                  className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                                  value={editDraft.other}
                                  onChange={(e) => setEditDraft({ ...editDraft, other: e.target.value })}
                                />
                              ) : (
                                <span className="font-medium text-slate-800">{pc.other || "—"}</span>
                              )}
                            </label>
                          </div>
                          </article>
                        );
                      })}
                      {canEdit ? renderNewConfigForm(lab.id, true) : null}
                    </>
                  )}
                </div>
              </section>
            );
          })
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        title="确认删除电脑配置"
        message={
          confirmedComputer
            ? `确定要删除该电脑配置吗？(CPU: ${confirmedComputer.cpu})此操作无法撤销。`
            : "确定要删除此电脑配置吗？此操作无法撤销。"
        }
        confirmText="删除"
        cancelText="取消"
        isDangerous={true}
        isLoading={deletingId !== null}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setConfirmDeleteId(null);
          setConfirmedComputer(null);
        }}
      />
    </div>
  );
}
