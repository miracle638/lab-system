"use client";

import { useMemo, useState } from "react";
import { reportsSeed } from "@/lib/demo-data";
import type { MonthlyReport } from "@/lib/types";
import ConfirmDialog from "@/components/ConfirmDialog";

function getRoleFromCookie(): string {
  if (typeof document === "undefined") return "viewer";
  const hit = document.cookie
    .split("; ")
    .find((row) => row.startsWith("lab_role="));
  return hit?.split("=")[1] ?? "viewer";
}

export default function ReportsPage() {
  const [reports, setReports] = useState<MonthlyReport[]>(reportsSeed);
  const [role] = useState(getRoleFromCookie);
  const canEdit = role === "admin";
  const [collegeFilter, setCollegeFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmedReport, setConfirmedReport] = useState<MonthlyReport | null>(null);
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState({
    college: "",
    month: "",
    equipmentUnits: 0,
    equipmentValue: 0,
    usageMinutes: 0,
    activeMinutes: 0,
  });

  const addReport = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;

    if (!draft.college.trim() || !draft.month.trim()) {
      setFormError("请填写学院和月份");
      return;
    }

    const monthPattern = /^\d{4}-\d{2}$/;
    if (!monthPattern.test(draft.month.trim())) {
      setFormError("月份格式应为 YYYY-MM，例如 2026-03");
      return;
    }

    if (draft.equipmentUnits < 0 || draft.equipmentValue < 0 || draft.usageMinutes < 0 || draft.activeMinutes < 0) {
      setFormError("报表数值不能为负数");
      return;
    }

    setFormError("");

    setReports((prev) => [
      ...prev,
      {
        id: `rp-${Date.now()}`,
        ...draft,
      },
    ]);

    setDraft({
      college: "",
      month: "",
      equipmentUnits: 0,
      equipmentValue: 0,
      usageMinutes: 0,
      activeMinutes: 0,
    });
  };

  const filteredReports = useMemo(() => {
    const normalizedCollege = collegeFilter.trim().toLowerCase();
    const normalizedMonth = monthFilter.trim();

    return reports
      .filter((report) => {
        const matchCollege =
          !normalizedCollege || report.college.toLowerCase().includes(normalizedCollege);
        const matchMonth = !normalizedMonth || report.month.includes(normalizedMonth);
        return matchCollege && matchMonth;
      })
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [reports, collegeFilter, monthFilter]);

  const summary = useMemo(() => {
    const totalEquipmentUnits = filteredReports.reduce((sum, row) => sum + row.equipmentUnits, 0);
    const totalEquipmentValue = filteredReports.reduce((sum, row) => sum + row.equipmentValue, 0);
    const totalUsageMinutes = filteredReports.reduce((sum, row) => sum + row.usageMinutes, 0);
    const totalActiveMinutes = filteredReports.reduce((sum, row) => sum + row.activeMinutes, 0);
    const activeRate = totalUsageMinutes ? (totalActiveMinutes / totalUsageMinutes) * 100 : 0;

    return {
      totalEquipmentUnits,
      totalEquipmentValue,
      totalUsageMinutes,
      totalActiveMinutes,
      activeRate,
    };
  }, [filteredReports]);

  const startEdit = (id: string) => {
    if (!canEdit) return;
    setEditingId(id);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const deleteReport = (id: string) => {
    if (!canEdit) return;
    setReports((prev) => prev.filter((report) => report.id !== id));
    if (editingId === id) setEditingId(null);
    setConfirmDeleteId(null);
    setConfirmedReport(null);
  };

  const handleDeleteClick = (report: MonthlyReport) => {
    setConfirmedReport(report);
    setConfirmDeleteId(report.id);
  };

  const handleConfirmDelete = () => {
    if (confirmDeleteId) {
      deleteReport(confirmDeleteId);
    }
  };

  const updateField = <K extends keyof MonthlyReport>(id: string, key: K, value: MonthlyReport[K]) => {
    if (!canEdit) return;
    setReports((prev) => prev.map((report) => (report.id === id ? { ...report, [key]: value } : report)));
  };

  const exportCsv = () => {
    const header = ["学院", "月份", "设备台套数", "设备价值", "使用分钟数", "活动分钟数"];
    const rows = filteredReports.map((r) => [
      r.college,
      r.month,
      String(r.equipmentUnits),
      String(r.equipmentValue),
      String(r.usageMinutes),
      String(r.activeMinutes),
    ]);
    const csv = [header, ...rows]
      .map((line) => line.map((cell) => `"${cell.replaceAll("\"", "\"\"")}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lab-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold">学院实验室报表</h1>

      <form onSubmit={addReport} className="mt-5 grid gap-3 rounded-xl bg-white p-4 border border-slate-200">
        {formError && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
        )}

        <div className="grid md:grid-cols-2 gap-3">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="学院"
            disabled={!canEdit}
            value={draft.college}
            onChange={(e) => setDraft({ ...draft, college: e.target.value })}
          />
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="月份（如 2026-03）"
            disabled={!canEdit}
            value={draft.month}
            onChange={(e) => setDraft({ ...draft, month: e.target.value })}
          />
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <input
            type="number"
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="设备台套数"
            disabled={!canEdit}
            value={draft.equipmentUnits}
            onChange={(e) => setDraft({ ...draft, equipmentUnits: Number(e.target.value) })}
          />
          <input
            type="number"
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="设备价值"
            disabled={!canEdit}
            value={draft.equipmentValue}
            onChange={(e) => setDraft({ ...draft, equipmentValue: Number(e.target.value) })}
          />
          <input
            type="number"
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="使用分钟数"
            disabled={!canEdit}
            value={draft.usageMinutes}
            onChange={(e) => setDraft({ ...draft, usageMinutes: Number(e.target.value) })}
          />
          <input
            type="number"
            className="rounded-lg border border-slate-300 px-3 py-2"
            placeholder="活动分钟数"
            disabled={!canEdit}
            value={draft.activeMinutes}
            onChange={(e) => setDraft({ ...draft, activeMinutes: Number(e.target.value) })}
          />
        </div>

        <button
          type="submit"
          disabled={!canEdit}
          className="justify-self-start rounded-lg bg-slate-900 px-4 py-2 text-white disabled:bg-slate-300"
        >
          新增月报
        </button>
      </form>

      <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="按学院筛选"
          value={collegeFilter}
          onChange={(e) => setCollegeFilter(e.target.value)}
        />
        <input
          className="rounded-lg border border-slate-300 px-3 py-2"
          placeholder="按月份筛选（如 2026-03）"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setCollegeFilter("");
              setMonthFilter("");
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700"
          >
            清空筛选
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-white"
          >
            导出 CSV
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">设备台套总数</p>
          <p className="mt-1 text-xl font-semibold">{summary.totalEquipmentUnits.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">设备价值总额</p>
          <p className="mt-1 text-xl font-semibold">¥{summary.totalEquipmentValue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">使用分钟总数</p>
          <p className="mt-1 text-xl font-semibold">{summary.totalUsageMinutes.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">活动分钟总数</p>
          <p className="mt-1 text-xl font-semibold">{summary.totalActiveMinutes.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">活动占用率</p>
          <p className="mt-1 text-xl font-semibold">{summary.activeRate.toFixed(1)}%</p>
        </div>
      </div>

      <section className="mt-5 space-y-3">
        {filteredReports.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">没有匹配的报表记录。</div>
        ) : (
          filteredReports.map((report) => {
            const isEditing = editingId === report.id;

            return (
              <article key={report.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {isEditing ? (
                      <div className="mt-1 flex flex-wrap gap-2">
                        <input
                          className="w-40 rounded border border-slate-300 px-2 py-1"
                          value={report.college}
                          onChange={(e) => updateField(report.id, "college", e.target.value)}
                        />
                        <input
                          className="w-32 rounded border border-slate-300 px-2 py-1"
                          value={report.month}
                          onChange={(e) => updateField(report.id, "month", e.target.value)}
                        />
                      </div>
                    ) : (
                      <h2 className="mt-1 text-base font-semibold text-slate-900">{report.college} / {report.month}</h2>
                    )}
                  </div>

                  {canEdit ? (
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                          >
                            完成
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(report)}
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700"
                          >
                            删除
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(report.id)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                        >
                          编辑
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">只读</span>
                  )}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">设备台套数</span>
                    {isEditing ? (
                      <input
                        type="number"
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1"
                        value={report.equipmentUnits}
                        onChange={(e) => updateField(report.id, "equipmentUnits", Number(e.target.value))}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{report.equipmentUnits.toLocaleString()}</span>
                    )}
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">设备价值</span>
                    {isEditing ? (
                      <input
                        type="number"
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1"
                        value={report.equipmentValue}
                        onChange={(e) => updateField(report.id, "equipmentValue", Number(e.target.value))}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">¥{report.equipmentValue.toLocaleString()}</span>
                    )}
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">使用分钟数</span>
                    {isEditing ? (
                      <input
                        type="number"
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1"
                        value={report.usageMinutes}
                        onChange={(e) => updateField(report.id, "usageMinutes", Number(e.target.value))}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{report.usageMinutes.toLocaleString()}</span>
                    )}
                  </label>

                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">活动分钟数</span>
                    {isEditing ? (
                      <input
                        type="number"
                        className="w-full rounded border border-slate-300 bg-white px-2 py-1"
                        value={report.activeMinutes}
                        onChange={(e) => updateField(report.id, "activeMinutes", Number(e.target.value))}
                      />
                    ) : (
                      <span className="font-medium text-slate-800">{report.activeMinutes.toLocaleString()}</span>
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
        title="确认删除报表记录"
        message={
          confirmedReport
            ? `确定要删除"${confirmedReport.college} - ${confirmedReport.month}"的报表记录吗？此操作无法撤销。`
            : "确定要删除此报表记录吗？此操作无法撤销。"
        }
        confirmText="删除"
        cancelText="取消"
        isDangerous={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setConfirmDeleteId(null);
          setConfirmedReport(null);
        }}
      />
    </div>
  );
}
