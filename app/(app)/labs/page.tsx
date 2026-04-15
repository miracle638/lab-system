"use client";

import { useEffect, useMemo, useState } from "react";
import type { Lab } from "@/lib/types";
import ConfirmDialog from "@/components/ConfirmDialog";

function getRoleFromCookie(): string {
  if (typeof document === "undefined") return "viewer";
  const hit = document.cookie
    .split("; ")
    .find((row) => row.startsWith("lab_role="));
  return hit?.split("=")[1] ?? "viewer";
}

export default function LabsPage() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savedFlashId, setSavedFlashId] = useState<string | null>(null);
  const [collegeFilter, setCollegeFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmedLab, setConfirmedLab] = useState<Lab | null>(null);
  const [draft, setDraft] = useState({
    labNumber: "",
    name: "",
    college: "",
    roomCode: "",
    value: "",
    manager: "",
    seatCount: "",
    usageArea: "",
    buildingArea: "",
    notes: "",
  });
  const [role] = useState(getRoleFromCookie);
  const canEdit = role === "admin";

  const [editDraft, setEditDraft] = useState({
    labNumber: "",
    name: "",
    college: "",
    roomCode: "",
    value: 0,
    manager: "",
    seatCount: 0,
    usageArea: 0,
    buildingArea: 0,
    notes: "",
  });

  const loadData = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/labs", { cache: "no-store" });
      const result = (await response.json()) as {
        labs?: Lab[];
        message?: string;
      };

      if (!response.ok) {
        setErrorMessage(result.message ?? "读取实验室数据失败");
        setLoading(false);
        return;
      }

      setLabs(result.labs ?? []);
    } catch {
      setErrorMessage("读取实验室数据失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const collegeOptions = useMemo(() => {
    return Array.from(new Set(labs.map((lab) => lab.college))).sort((a, b) => a.localeCompare(b));
  }, [labs]);

  const filteredLabs = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return labs
      .filter((lab) => {
        const matchCollege = !collegeFilter || lab.college === collegeFilter;
        const matchKeyword =
          !query ||
          lab.name.toLowerCase().includes(query) ||
          lab.roomCode.toLowerCase().includes(query) ||
          lab.manager.toLowerCase().includes(query);
        return matchCollege && matchKeyword;
      })
      .sort((a, b) => {
        const collegeCompare = a.college.localeCompare(b.college);
        if (collegeCompare !== 0) return collegeCompare;
        return a.roomCode.localeCompare(b.roomCode);
      });
  }, [labs, collegeFilter, keyword]);

  const exportRoomTableCsv = () => {
    type ExportComputer = {
      labId: string;
      cpu: string;
      ram: string;
      storage: string;
      cDriveSize: string;
      gpu: string;
      monitor: string;
      os: string;
      purchaseDate: string;
      assetCode: string;
    };

    const mergeConfigField = (list: ExportComputer[], getValue: (item: ExportComputer) => string) => {
      const values = Array.from(
        new Set(
          list
            .map((item) => getValue(item).trim())
            .filter((value) => value.length > 0),
        ),
      );
      return values.length > 0 ? values.join("；") : "-";
    };

    void (async () => {
      try {
        const response = await fetch("/api/computers", { cache: "no-store" });
        const result = (await response.json()) as { computers?: ExportComputer[]; message?: string };

        if (!response.ok) {
          setErrorMessage(result.message ?? "读取电脑配置失败，无法导出包含配置信息的表格");
          return;
        }

        const computers = result.computers ?? [];
        const rows = [...labs].sort((a, b) => {
          const collegeCompare = a.college.localeCompare(b.college, "zh-CN", { numeric: true });
          if (collegeCompare !== 0) return collegeCompare;

          const labNumberCompare = (a.labNumber ?? "").localeCompare(b.labNumber ?? "", "zh-CN", {
            numeric: true,
          });
          if (labNumberCompare !== 0) return labNumberCompare;

          const nameCompare = a.name.localeCompare(b.name, "zh-CN", { numeric: true });
          if (nameCompare !== 0) return nameCompare;

          return a.roomCode.localeCompare(b.roomCode, "zh-CN", { numeric: true });
        });

        const header = [
          "学院",
          "实验室编号",
          "实验室名称",
          "实验室房间号",
          "管理员",
          "座位数",
          "使用面积",
          "建筑面积",
          "实验室价值",
          "备注",
          "配置条数",
          "CPU",
          "内存",
          "硬盘",
          "C盘大小",
          "显卡",
          "显示器",
          "操作系统",
          "购置日期",
          "配置标识",
        ];

        const csvRows = rows.map((lab) => {
          const labComputers = computers.filter((item) => item.labId === lab.id);
          return [
            lab.college,
            lab.labNumber ?? "",
            lab.name,
            lab.roomCode,
            lab.manager,
            String(lab.seatCount),
            String(lab.usageArea),
            String(lab.buildingArea),
            String(lab.value),
            lab.notes ?? "",
            String(labComputers.length),
            mergeConfigField(labComputers, (item) => item.cpu),
            mergeConfigField(labComputers, (item) => item.ram),
            mergeConfigField(labComputers, (item) => item.storage),
            mergeConfigField(labComputers, (item) => item.cDriveSize),
            mergeConfigField(labComputers, (item) => item.gpu),
            mergeConfigField(labComputers, (item) => item.monitor),
            mergeConfigField(labComputers, (item) => item.os),
            mergeConfigField(labComputers, (item) => item.purchaseDate),
            mergeConfigField(labComputers, (item) => item.assetCode),
          ];
        });

        const csv = [header, ...csvRows]
          .map((line) => line.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
          .join("\n");

        const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `labs-rooms-with-computers-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setErrorMessage("");
      } catch {
        setErrorMessage("导出失败，请稍后重试");
      }
    })();
  };

  const addLab = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) return;

    if (!draft.name.trim() || !draft.college.trim() || !draft.roomCode.trim() || !draft.manager.trim()) {
      setErrorMessage("请完整填写实验室名称、学院、房间号和管理员");
      return;
    }

    const seatCount = Number(draft.seatCount);
    const usageArea = Number(draft.usageArea);
    const buildingArea = Number(draft.buildingArea);
    const value = Number(draft.value);
    if (!Number.isFinite(seatCount) || seatCount <= 0) {
      setErrorMessage("座位数必须为大于 0 的数字");
      return;
    }

    if (!Number.isFinite(usageArea) || usageArea < 0) {
      setErrorMessage("使用面积不能为负数");
      return;
    }

    if (!Number.isFinite(buildingArea) || buildingArea < 0) {
      setErrorMessage("建筑面积不能为负数");
      return;
    }

    if (!Number.isFinite(value) || value < 0) {
      setErrorMessage("实验室价值不能为负数");
      return;
    }

    void (async () => {
      const response = await fetch("/api/labs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { lab?: Lab; message?: string };

      if (!response.ok || !result.lab) {
        setErrorMessage(result.message ?? "新增实验室失败");
        return;
      }

      setLabs((prev) => [...prev, result.lab as Lab]);
      setDraft({
        labNumber: "",
        name: "",
        college: "",
        roomCode: "",
        value: "",
        manager: "",
        seatCount: "",
        usageArea: "",
        buildingArea: "",
        notes: "",
      });
      setErrorMessage("");
    })();
  };

  const startEdit = (lab: Lab) => {
    if (!canEdit) return;

    if (editingId && editingId !== lab.id) {
      const current = labs.find((item) => item.id === editingId);
      const hasUnsavedChanges =
        current !== undefined &&
        (editDraft.labNumber !== (current.labNumber ?? "") ||
          editDraft.name !== current.name ||
          editDraft.college !== current.college ||
          editDraft.roomCode !== current.roomCode ||
          editDraft.value !== current.value ||
          editDraft.manager !== current.manager ||
          editDraft.seatCount !== current.seatCount ||
          editDraft.usageArea !== current.usageArea ||
          editDraft.buildingArea !== current.buildingArea ||
          editDraft.notes !== (current.notes ?? ""));

      if (hasUnsavedChanges) {
        const confirmed = window.confirm("当前行有未保存修改，是否放弃并切换到另一行？");
        if (!confirmed) return;
      }
    }

    setEditingId(lab.id);
    setEditDraft({
      labNumber: lab.labNumber ?? "",
      name: lab.name,
      college: lab.college,
      roomCode: lab.roomCode,
      value: lab.value,
      manager: lab.manager,
      seatCount: lab.seatCount,
      usageArea: lab.usageArea,
      buildingArea: lab.buildingArea,
      notes: lab.notes ?? "",
    });
  };

  const saveEdit = async (id: string) => {
    if (!canEdit) return;

    if (!editDraft.name.trim() || !editDraft.college.trim() || !editDraft.roomCode.trim() || !editDraft.manager.trim()) {
      setErrorMessage("请完整填写实验室名称、学院、房间号和管理员");
      return;
    }

    if (!Number.isFinite(editDraft.seatCount) || editDraft.seatCount <= 0) {
      setErrorMessage("座位数必须为大于 0 的数字");
      return;
    }

    if (!Number.isFinite(editDraft.usageArea) || editDraft.usageArea < 0) {
      setErrorMessage("使用面积不能为负数");
      return;
    }

    if (!Number.isFinite(editDraft.buildingArea) || editDraft.buildingArea < 0) {
      setErrorMessage("建筑面积不能为负数");
      return;
    }

    if (!Number.isFinite(editDraft.value) || editDraft.value < 0) {
      setErrorMessage("实验室价值不能为负数");
      return;
    }

    setSavingId(id);
    const response = await fetch(`/api/labs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    const result = (await response.json()) as { lab?: Lab; message?: string };

    if (!response.ok || !result.lab) {
      setErrorMessage(result.message ?? "保存失败");
      setSavingId(null);
      return;
    }

    setLabs((prev) => prev.map((item) => (item.id === id ? result.lab as Lab : item)));
    setEditingId(null);
    setSavingId(null);
    setSavedFlashId(id);
    setTimeout(() => setSavedFlashId((current) => (current === id ? null : current)), 1300);
    setErrorMessage("");
  };

  const removeLab = async (id: string) => {
    if (!canEdit) return;
    setDeletingId(id);
    const response = await fetch(`/api/labs/${id}`, { method: "DELETE" });
    const result = (await response.json()) as { message?: string };
    if (!response.ok) {
      setErrorMessage(result.message ?? "删除失败");
      setDeletingId(null);
      setConfirmDeleteId(null);
      return;
    }

    setLabs((prev) => prev.filter((item) => item.id !== id));
    setDeletingId(null);
    setConfirmDeleteId(null);
    setErrorMessage("");
  };

  const handleDeleteClick = (lab: Lab) => {
    setConfirmedLab(lab);
    setConfirmDeleteId(lab.id);
  };

  const handleConfirmDelete = () => {
    if (confirmDeleteId) {
      void removeLab(confirmDeleteId);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">实验室管理</h1>

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
        <div className="md:col-span-3">
          <p className="mb-2 text-sm font-medium text-slate-600">学院筛选</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCollegeFilter("")}
              className={`chip-switch rounded-full border px-3 py-1.5 text-sm transition ${
                collegeFilter === ""
                  ? "border-sky-300 bg-sky-100 text-sky-900"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              全部
            </button>
            {collegeOptions.map((college) => (
              <button
                key={college}
                type="button"
                onClick={() => setCollegeFilter(college)}
                className={`chip-switch rounded-full border px-3 py-1.5 text-sm transition ${
                  collegeFilter === college
                    ? "border-sky-300 bg-sky-100 text-sky-900"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {college}
              </button>
            ))}
          </div>
        </div>
        <input
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="按名称/房间/管理员搜索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setCollegeFilter("");
              setKeyword("");
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
          >
            清空筛选
          </button>
          <button
            type="button"
            onClick={exportRoomTableCsv}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-700 hover:bg-emerald-100"
          >
            导出房间表 CSV
          </button>
        </div>
      </div>

      <form onSubmit={addLab} className="mt-5 grid gap-3 rounded-xl bg-white p-4 border border-slate-200">
        <div className="grid md:grid-cols-5 gap-3">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="实验室编号"
            value={draft.labNumber}
            onChange={(e) => setDraft({ ...draft, labNumber: e.target.value })}
            disabled={!canEdit}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="实验室名称"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            disabled={!canEdit}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="所属学院"
            value={draft.college}
            onChange={(e) => setDraft({ ...draft, college: e.target.value })}
            disabled={!canEdit}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="房间号"
            value={draft.roomCode}
            onChange={(e) => setDraft({ ...draft, roomCode: e.target.value })}
            disabled={!canEdit}
          />
          <input
            type="number"
            className="rounded-lg border border-slate-300 px-3 py-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            placeholder="实验室价值"
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <div className="grid md:grid-cols-5 gap-3">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="管理员"
            value={draft.manager}
            onChange={(e) => setDraft({ ...draft, manager: e.target.value })}
            disabled={!canEdit}
          />
          <input
            type="number"
            className="rounded-lg border border-slate-300 px-3 py-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            placeholder="座位数"
            value={draft.seatCount}
            onChange={(e) => setDraft({ ...draft, seatCount: e.target.value })}
            disabled={!canEdit}
          />
          <input
            type="number"
            className="rounded-lg border border-slate-300 px-3 py-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            placeholder="使用面积"
            value={draft.usageArea}
            onChange={(e) => setDraft({ ...draft, usageArea: e.target.value })}
            disabled={!canEdit}
          />
          <input
            type="number"
            className="rounded-lg border border-slate-300 px-3 py-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            placeholder="建筑面积"
            value={draft.buildingArea}
            onChange={(e) => setDraft({ ...draft, buildingArea: e.target.value })}
            disabled={!canEdit}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="备注"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            disabled={!canEdit}
          />
        </div>
        <button
          type="submit"
          disabled={!canEdit}
          className="justify-self-start rounded-lg bg-slate-900 px-4 py-2 text-white disabled:bg-slate-300"
        >
          新增实验室
        </button>
      </form>

      <section className="mt-5 space-y-4">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">正在加载实验室数据...</div>
        ) : filteredLabs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">当前条件下暂无实验室数据。</div>
        ) : (
          filteredLabs.map((lab) => {
            const isEditing = editingId === lab.id;
            const isSaved = savedFlashId === lab.id;

            return (
              <article
                key={lab.id}
                className={`hover-lift rounded-2xl border p-4 transition-colors md:p-5 ${
                  isEditing
                    ? "border-sky-200 bg-sky-50/60"
                    : isSaved
                      ? "border-emerald-200 bg-emerald-50/70"
                      : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {isEditing ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <input
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg font-semibold text-slate-900 md:w-72"
                          value={editDraft.name}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        />
                        <input
                          className="w-36 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                          value={editDraft.roomCode}
                          onChange={(e) => setEditDraft({ ...editDraft, roomCode: e.target.value })}
                          placeholder="房间号"
                        />
                      </div>
                    ) : (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900">{lab.name}</h2>
                        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold tracking-wide text-cyan-800">
                          房间 {lab.roomCode}
                        </span>
                      </div>
                    )}
                  </div>

                  {canEdit ? (
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            disabled={savingId === lab.id}
                            className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
                            onClick={() => void saveEdit(lab.id)}
                          >
                            {savingId === lab.id ? "保存中..." : "保存"}
                          </button>
                          <button
                            type="button"
                            disabled={savingId === lab.id}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition active:scale-95 hover:bg-slate-50"
                            onClick={() => startEdit(lab)}
                          >
                            {isSaved ? "已保存" : "编辑"}
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === lab.id}
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700 transition active:scale-95 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
                            onClick={() => handleDeleteClick(lab)}
                          >
                            {deletingId === lab.id ? "删除中..." : "删除"}
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">只读</span>
                  )}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">编号</span>
                    {isEditing ? (
                      <input
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                        value={editDraft.labNumber}
                        onChange={(e) => setEditDraft({ ...editDraft, labNumber: e.target.value })}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{lab.labNumber || "-"}</span>
                    )}
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">学院</span>
                    {isEditing ? (
                      <input
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                        value={editDraft.college}
                        onChange={(e) => setEditDraft({ ...editDraft, college: e.target.value })}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{lab.college}</span>
                    )}
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">管理员</span>
                    {isEditing ? (
                      <input
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                        value={editDraft.manager}
                        onChange={(e) => setEditDraft({ ...editDraft, manager: e.target.value })}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{lab.manager}</span>
                    )}
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">实验室价值</span>
                    {isEditing ? (
                      <input
                        type="number"
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        value={editDraft.value}
                        onChange={(e) => setEditDraft({ ...editDraft, value: Number(e.target.value) })}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">¥{lab.value.toLocaleString()}</span>
                    )}
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">座位数</span>
                    {isEditing ? (
                      <input
                        type="number"
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        value={editDraft.seatCount}
                        onChange={(e) => setEditDraft({ ...editDraft, seatCount: Number(e.target.value) })}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{lab.seatCount}</span>
                    )}
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">使用面积</span>
                    {isEditing ? (
                      <input
                        type="number"
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        value={editDraft.usageArea}
                        onChange={(e) => setEditDraft({ ...editDraft, usageArea: Number(e.target.value) })}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{lab.usageArea}</span>
                    )}
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">建筑面积</span>
                    {isEditing ? (
                      <input
                        type="number"
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        value={editDraft.buildingArea}
                        onChange={(e) => setEditDraft({ ...editDraft, buildingArea: Number(e.target.value) })}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{lab.buildingArea}</span>
                    )}
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600 md:col-span-2 xl:col-span-2">
                    <span className="mb-1 block text-xs text-slate-400">备注</span>
                    {isEditing ? (
                      <input
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-slate-900"
                        value={editDraft.notes}
                        onChange={(e) => setEditDraft({ ...editDraft, notes: e.target.value })}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{lab.notes || "-"}</span>
                    )}
                  </label>
                </div>
              </article>
            );
          })
        )}
      </section>

      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        title="确认删除实验室"
        message={
          confirmedLab
            ? `确定要删除实验室"${confirmedLab.name}"吗？此操作无法撤销。`
            : "确定要删除此实验室吗？此操作无法撤销。"
        }
        confirmText="删除"
        cancelText="取消"
        isDangerous={true}
        isLoading={deletingId !== null}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setConfirmDeleteId(null);
          setConfirmedLab(null);
        }}
      />
    </div>
  );
}
