"use client";

import { useEffect, useMemo, useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { deriveSemesterOptionsFromDateStrings, findSemesterOption, type SemesterOption } from "@/lib/semester";
import type { FaultNature, IssueType, MaintenanceRecord } from "@/lib/types";

type LabItem = {
  id: string;
  name: string;
  college: string;
  roomCode: string;
};

type ComputerItem = {
  id: string;
  labId: string;
};

type RangeMode = "recent4weeks" | "week" | "month" | "custom";
type TrendMode = "month" | "quarter";

type EnrichedRecord = MaintenanceRecord & {
  college: string;
  roomCode: string;
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
  hardware: "硬件",
  software: "软件",
  other: "其他",
};

const MORANDI = {
  mistBlue: "#8A9BA8",
  oatGray: "#C8C6C6",
  milkCoffee: "#B7AFA3",
  dustyPurple: "#C6B4CE",
  mintTeal: "#A2C4C9",
  creamYellow: "#E6D5B8",
  lakeGreen: "#93B7BE",
  dustyRose: "#D4B4B8",
};

const REPORT_SURFACE = {
  page: "#eef6f4",
  panel: "#f7fcfb",
  card: "#edf5f3",
  cardAlt: "#e6f1ef",
  track: "#dbe9e7",
};

type DonutSlice = {
  label: string;
  value: number;
  color: string;
};

const DONUT_PALETTE = [
  MORANDI.mistBlue,
  MORANDI.oatGray,
  MORANDI.milkCoffee,
  MORANDI.dustyPurple,
  MORANDI.mintTeal,
  MORANDI.creamYellow,
  MORANDI.lakeGreen,
  MORANDI.dustyRose,
  "#86a89f",
  "#a79fb8",
];

function buildDonutBackground(slices: DonutSlice[]) {
  const total = slices.reduce((sum, slice) => sum + Math.max(slice.value, 0), 0);
  if (total <= 0) {
    return "conic-gradient(#e2e8f0 0 100%)";
  }

  let current = 0;
  const segments: string[] = [];
  for (const slice of slices) {
    const value = Math.max(slice.value, 0);
    if (value <= 0) continue;
    const start = (current / total) * 100;
    current += value;
    const end = (current / total) * 100;
    segments.push(`${slice.color} ${start}% ${end}%`);
  }

  return segments.length > 0 ? `conic-gradient(${segments.join(",")})` : "conic-gradient(#e2e8f0 0 100%)";
}

function DonutChart({
  slices,
  centerLabel,
  size = 140,
  ringWidth = 26,
}: {
  slices: DonutSlice[];
  centerLabel?: string;
  size?: number;
  ringWidth?: number;
}) {
  const innerSize = Math.max(size - ringWidth * 2, 28);

  return (
    <div
      aria-label="donut-chart"
      className="relative shrink-0 rounded-full"
      style={{ width: size, height: size, background: buildDonutBackground(slices) }}
    >
      <div
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600"
        style={{ width: innerSize, height: innerSize }}
      >
        {centerLabel ?? ""}
      </div>
    </div>
  );
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatDate(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonday(date: Date) {
  const clone = new Date(date);
  const day = clone.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  clone.setDate(clone.getDate() + diff);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function getSunday(date: Date) {
  const monday = getMonday(date);
  monday.setDate(monday.getDate() + 6);
  return monday;
}

function getQuarterLabel(value: string) {
  const month = Number(value.slice(5, 7));
  const year = value.slice(0, 4);
  const quarter = Math.floor((month - 1) / 3) + 1;
  return `${year}-Q${quarter}`;
}

export default function MaintenanceAnalysisPage() {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [labs, setLabs] = useState<LabItem[]>([]);
  const [computers, setComputers] = useState<ComputerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [collegeFilter, setCollegeFilter] = useState("all");
  const [rangeMode, setRangeMode] = useState<RangeMode>("recent4weeks");
  const [weekAnchor, setWeekAnchor] = useState(formatDate(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(formatDate(new Date()).slice(0, 7));
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [semesterFilter, setSemesterFilter] = useState("");
  const [trendMode, setTrendMode] = useState<TrendMode>("month");

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const [maintenanceResponse, computersResponse] = await Promise.all([
          fetchWithTimeout(withBasePath("/api/maintenance"), { cache: "no-store" }, 12000),
          fetchWithTimeout(withBasePath("/api/computers"), { cache: "no-store" }, 12000),
        ]);

        const maintenancePayload = (await maintenanceResponse.json()) as {
          records?: MaintenanceRecord[];
          message?: string;
        };
        const computersPayload = (await computersResponse.json()) as {
          labs?: LabItem[];
          computers?: ComputerItem[];
          message?: string;
        };

        if (!maintenanceResponse.ok) {
          throw new Error(maintenancePayload.message ?? "维修记录读取失败");
        }
        if (!computersResponse.ok) {
          throw new Error(computersPayload.message ?? "实验室与设备信息读取失败");
        }

        if (!cancelled) {
          setRecords(maintenancePayload.records ?? []);
          setLabs(computersPayload.labs ?? []);
          setComputers(computersPayload.computers ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof Error && error.name === "AbortError") {
            setLoadError("读取维修分析数据超时，请重试");
          } else {
            setLoadError(error instanceof Error ? error.message : "读取维修分析数据失败");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const labMap = useMemo(() => new Map(labs.map((lab) => [lab.id, lab])), [labs]);
  const computerLabMap = useMemo(() => new Map(computers.map((item) => [item.id, item.labId])), [computers]);

  const collegeOptions = useMemo(() => {
    const set = new Set(labs.map((lab) => lab.college));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [labs]);

  const semesterOptions = useMemo<SemesterOption[]>(() => {
    return deriveSemesterOptionsFromDateStrings(records.map((item) => item.reportDate));
  }, [records]);

  const selectedSemester = useMemo(
    () => findSemesterOption(semesterOptions, semesterFilter),
    [semesterFilter, semesterOptions],
  );

  const range = useMemo(() => {
    if (selectedSemester) {
      return {
        start: selectedSemester.startDate,
        end: selectedSemester.endDate,
        label: selectedSemester.label,
      };
    }

    const today = new Date();
    if (rangeMode === "recent4weeks") {
      const thisWeekMonday = getMonday(today);
      const start = new Date(thisWeekMonday);
      start.setDate(start.getDate() - 21);
      const end = getSunday(today);
      return { start: formatDate(start), end: formatDate(end), label: `${formatDate(start)} ~ ${formatDate(end)}` };
    }

    if (rangeMode === "week") {
      const anchor = parseDate(weekAnchor);
      const start = getMonday(anchor);
      const end = getSunday(anchor);
      return { start: formatDate(start), end: formatDate(end), label: `${formatDate(start)} ~ ${formatDate(end)}` };
    }

    if (rangeMode === "month") {
      const [year, month] = monthAnchor.split("-").map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return { start: formatDate(start), end: formatDate(end), label: `${formatDate(start)} ~ ${formatDate(end)}` };
    }

    const start = customStart || "0001-01-01";
    const end = customEnd || "9999-12-31";
    return {
      start,
      end,
      label: customStart || customEnd ? `${customStart || "不限"} ~ ${customEnd || "不限"}` : "不限",
    };
  }, [customEnd, customStart, monthAnchor, rangeMode, selectedSemester, weekAnchor]);

  const doneRecords = useMemo(() => {
    const enriched: EnrichedRecord[] = records
      .filter((record) => record.status === "done")
      .map((record) => {
        const labId = computerLabMap.get(record.computerId);
        const lab = labId ? labMap.get(labId) : undefined;
        return {
          ...record,
          college: lab?.college ?? "未知学院",
          roomCode: lab?.roomCode ?? "未知房间",
        };
      });

    return enriched.filter((record) => {
      if (collegeFilter !== "all" && record.college !== collegeFilter) return false;
      return record.reportDate >= range.start && record.reportDate <= range.end;
    });
  }, [collegeFilter, computerLabMap, labMap, range.end, range.start, records]);

  const issueTop = useMemo(() => {
    const map = new Map<IssueType, number>();
    for (const row of doneRecords) {
      map.set(row.issueType, (map.get(row.issueType) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([key, count]) => ({ key, label: issueTypeLabel[key], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [doneRecords]);

  const natureRatio = useMemo(() => {
    const map: Record<FaultNature, number> = {
      hardware: 0,
      software: 0,
      other: 0,
    };
    for (const row of doneRecords) {
      map[row.faultNature] += 1;
    }
    const total = doneRecords.length;
    return (Object.keys(map) as FaultNature[]).map((key) => ({
      key,
      label: faultNatureLabel[key],
      count: map[key],
      ratio: total === 0 ? 0 : Math.round((map[key] / total) * 1000) / 10,
    }));
  }, [doneRecords]);

  const roomTop = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of doneRecords) {
      map.set(row.roomCode, (map.get(row.roomCode) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([roomCode, count]) => ({ roomCode, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [doneRecords]);

  const recurring = useMemo(() => {
    const map = new Map<string, { roomCode: string; seat: string; days: Set<string>; lastDate: string }>();
    for (const row of doneRecords) {
      const key = `${row.roomCode}::${row.computerPosition.trim()}`;
      const seat = row.computerPosition.trim() || "未填写";
      const current = map.get(key) ?? {
        roomCode: row.roomCode,
        seat,
        days: new Set<string>(),
        lastDate: row.reportDate,
      };
      current.days.add(row.reportDate);
      if (row.reportDate > current.lastDate) current.lastDate = row.reportDate;
      map.set(key, current);
    }

    const devices = Array.from(map.values())
      .map((item) => ({
        roomCode: item.roomCode,
        seat: item.seat,
        uniqueReports: item.days.size,
        lastDate: item.lastDate,
      }))
      .filter((item) => item.uniqueReports >= 2)
      .sort((a, b) => b.uniqueReports - a.uniqueReports || b.lastDate.localeCompare(a.lastDate));

    const roomMap = new Map<string, number>();
    for (const item of devices) {
      roomMap.set(item.roomCode, (roomMap.get(item.roomCode) ?? 0) + 1);
    }

    const roomRanking = Array.from(roomMap.entries())
      .map(([roomCode, count]) => ({ roomCode, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { devices, roomRanking };
  }, [doneRecords]);

  const trend = useMemo(() => {
    const baseMap = new Map<string, { total: number; hardware: number }>();
    for (const row of doneRecords) {
      const bucket = trendMode === "month" ? row.reportDate.slice(0, 7) : getQuarterLabel(row.reportDate);
      const current = baseMap.get(bucket) ?? { total: 0, hardware: 0 };
      current.total += 1;
      if (row.faultNature === "hardware") current.hardware += 1;
      baseMap.set(bucket, current);
    }

    return Array.from(baseMap.entries())
      .map(([bucket, value]) => ({
        bucket,
        total: value.total,
        hardwareRatio: value.total === 0 ? 0 : Math.round((value.hardware / value.total) * 1000) / 10,
      }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .slice(-10);
  }, [doneRecords, trendMode]);

  const summaryText = useMemo(() => {
    const topType = issueTop[0];
    const topRoom = roomTop[0];
    const recurringTopRoom = recurring.roomRanking[0];

    if (!topType || !topRoom) {
      return "当前筛选范围内暂无已完成维修记录。";
    }

    const recurringPart = recurringTopRoom
      ? `复发设备主要集中在 ${recurringTopRoom.roomCode}`
      : "暂无明显复发设备";

    return `本期已完成维修 ${doneRecords.length} 条，主要故障现象是“${topType.label}”（${topType.count} 次），高发房间是 ${topRoom.roomCode}（${topRoom.count} 次）；${recurringPart}。`;
  }, [doneRecords.length, issueTop, recurring.roomRanking, roomTop]);

  return (
    <div className="rounded-2xl p-4 md:p-5" style={{ backgroundColor: REPORT_SURFACE.page }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">维修分析</h1>
        <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600">
          时间范围：{range.label}
        </span>
      </div>

      <section className="mt-4 rounded-xl border border-slate-200 p-4" style={{ backgroundColor: REPORT_SURFACE.panel }}>
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="text-sm text-slate-600">
            <span className="mb-1 block">学院</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={collegeFilter}
              onChange={(e) => setCollegeFilter(e.target.value)}
            >
              <option value="all">全部学院</option>
              {collegeOptions.map((college) => (
                <option key={college} value={college}>
                  {college}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            <span className="mb-1 block">学期</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
            >
              <option value="">全部学期</option>
              {semesterOptions.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-600">
            <span className="mb-1 block">时间维度</span>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              value={rangeMode}
              onChange={(e) => setRangeMode(e.target.value as RangeMode)}
              disabled={Boolean(selectedSemester)}
            >
              <option value="recent4weeks">最近四周</option>
              <option value="week">按周</option>
              <option value="month">按月</option>
              <option value="custom">自定义</option>
            </select>
          </label>

          {rangeMode === "week" && !selectedSemester ? (
            <label className="text-sm text-slate-600">
              <span className="mb-1 block">选择周（任意当天）</span>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={weekAnchor}
                onChange={(e) => setWeekAnchor(e.target.value)}
              />
            </label>
          ) : null}

          {rangeMode === "month" && !selectedSemester ? (
            <label className="text-sm text-slate-600">
              <span className="mb-1 block">选择月份</span>
              <input
                type="month"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                value={monthAnchor}
                onChange={(e) => setMonthAnchor(e.target.value)}
              />
            </label>
          ) : null}

          {rangeMode === "custom" && !selectedSemester ? (
            <>
              <label className="text-sm text-slate-600">
                <span className="mb-1 block">开始日期</span>
                <input
                  type="date"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </label>
              <label className="text-sm text-slate-600">
                <span className="mb-1 block">结束日期</span>
                <input
                  type="date"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </label>
            </>
          ) : null}
        </div>
      </section>

      {loadError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{loadError}</div>
      ) : null}

      {loading ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">维修分析数据加载中...</div>
      ) : null}

      {!loading ? (
        <>
          <section className="mt-4 rounded-xl border border-slate-200 p-4" style={{ backgroundColor: REPORT_SURFACE.panel }}>
            <p className="text-sm text-slate-700">{summaryText}</p>
          </section>

          <section className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4" style={{ backgroundColor: REPORT_SURFACE.panel }}>
              <h2 className="mb-3 text-base font-semibold text-slate-900">故障现象 Top 10</h2>
              {issueTop.length === 0 ? <p className="text-sm text-slate-500">暂无数据</p> : null}
              {issueTop.length > 0 ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <DonutChart
                    slices={issueTop.map((row, index) => ({
                      label: row.label,
                      value: row.count,
                      color: DONUT_PALETTE[index % DONUT_PALETTE.length],
                    }))}
                    centerLabel={`${doneRecords.length} 条`}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    {issueTop.map((row, index) => (
                      <div key={row.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: DONUT_PALETTE[index % DONUT_PALETTE.length] }}
                          />
                          {row.label}
                        </span>
                        <span className="text-xs text-slate-500">{row.count} 次</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 p-4" style={{ backgroundColor: REPORT_SURFACE.panel }}>
              <h2 className="mb-3 text-base font-semibold text-slate-900">故障性质占比</h2>
              {natureRatio.every((row) => row.count === 0) ? <p className="text-sm text-slate-500">暂无数据</p> : null}
              {!natureRatio.every((row) => row.count === 0) ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <DonutChart
                    slices={natureRatio.map((row, index) => ({
                      label: row.label,
                      value: row.count,
                      color: DONUT_PALETTE[index % DONUT_PALETTE.length],
                    }))}
                    centerLabel="占比"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    {natureRatio.map((row, index) => (
                      <div key={row.key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: DONUT_PALETTE[index % DONUT_PALETTE.length] }}
                          />
                          {row.label}
                        </span>
                        <span className="text-xs text-slate-500">{row.count} 条（{row.ratio}%）</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 p-4" style={{ backgroundColor: REPORT_SURFACE.panel }}>
              <h2 className="mb-3 text-base font-semibold text-slate-900">房间故障 Top 10</h2>
              {roomTop.length === 0 ? <p className="text-sm text-slate-500">暂无数据</p> : null}
              {roomTop.length > 0 ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <DonutChart
                    slices={roomTop.map((row, index) => ({
                      label: row.roomCode,
                      value: row.count,
                      color: DONUT_PALETTE[index % DONUT_PALETTE.length],
                    }))}
                    centerLabel="房间"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    {roomTop.map((row, index) => (
                      <div key={row.roomCode} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: DONUT_PALETTE[index % DONUT_PALETTE.length] }}
                          />
                          {row.roomCode}
                        </span>
                        <span className="text-xs text-slate-500">{row.count} 次</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

          </section>

          <section className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4" style={{ backgroundColor: REPORT_SURFACE.panel }}>
              <h2 className="mb-3 text-base font-semibold text-slate-900">复发设备（按房间）</h2>
              {recurring.roomRanking.length === 0 ? <p className="text-sm text-slate-500">暂无复发设备</p> : null}
              {recurring.roomRanking.length > 0 ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <DonutChart
                    slices={recurring.roomRanking.map((row, index) => ({
                      label: row.roomCode,
                      value: row.count,
                      color: DONUT_PALETTE[index % DONUT_PALETTE.length],
                    }))}
                    centerLabel="复发"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    {recurring.roomRanking.map((row, index) => (
                      <div key={row.roomCode} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: DONUT_PALETTE[index % DONUT_PALETTE.length] }}
                          />
                          {row.roomCode}
                        </span>
                        <span className="text-xs text-slate-500">{row.count} 台</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 p-4" style={{ backgroundColor: REPORT_SURFACE.panel }}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">硬件故障占比趋势</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTrendMode("month")}
                  className={`rounded border px-2 py-1 text-xs ${
                    trendMode === "month" ? "text-white" : "border-slate-300 text-slate-600"
                  }`}
                  style={trendMode === "month" ? { borderColor: MORANDI.mistBlue, backgroundColor: MORANDI.mistBlue } : undefined}
                >
                  月
                </button>
                <button
                  type="button"
                  onClick={() => setTrendMode("quarter")}
                  className={`rounded border px-2 py-1 text-xs ${
                    trendMode === "quarter" ? "text-white" : "border-slate-300 text-slate-600"
                  }`}
                  style={trendMode === "quarter" ? { borderColor: MORANDI.mistBlue, backgroundColor: MORANDI.mistBlue } : undefined}
                >
                  季度
                </button>
              </div>
              </div>
              <div className="space-y-2">
              {trend.length === 0 ? <p className="text-sm text-slate-500">暂无趋势数据</p> : null}
              {trend.map((row) => (
                <div key={row.bucket} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p>{row.bucket}</p>
                      <p className="text-xs text-slate-500">硬件占比 {row.hardwareRatio}%（共 {row.total} 条）</p>
                    </div>
                    <DonutChart
                      size={64}
                      ringWidth={11}
                      centerLabel={`${row.hardwareRatio}%`}
                      slices={[
                        { label: "硬件", value: row.hardwareRatio, color: MORANDI.dustyPurple },
                        { label: "其他", value: Math.max(100 - row.hardwareRatio, 0), color: REPORT_SURFACE.track },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
