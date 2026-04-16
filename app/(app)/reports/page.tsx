"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import ConfirmDialog from "@/components/ConfirmDialog";
import { labsSeed } from "@/lib/demo-data";
import type { Lab, MonthlyReport } from "@/lib/types";

type ParsedLabMetric = {
  roomCode: string;
  college: string;
  usageMinutes: number;
  activeMinutes: number;
};

type RoomMonthlyMetric = ParsedLabMetric & {
  id?: string;
  month: string;
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
  tableHead: "#dfeeed",
};

function getRoleFromCookie(): string {
  if (typeof document === "undefined") return "viewer";
  const hit = document.cookie
    .split("; ")
    .find((row) => row.startsWith("lab_role="));
  return hit?.split("=")[1] ?? "viewer";
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_()\[\]{}:：]/g, "")
    .replace(/计算机组/g, "机房")
    .replace(/实验室编号/g, "实验室")
    .replace(/开机时长/g, "开机时间")
    .replace(/活动时长/g, "活动时间");
}

function normalizeRoomCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[\s]/g, "");
}

function normalizeRoomAlnum(value: string): string {
  return normalizeRoomCode(value).replace(/[^A-Z0-9]/g, "");
}

function normalizeRoomDigits(value: string): string {
  return normalizeRoomCode(value).replace(/[^0-9]/g, "");
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
  for (let i = 0; i < headers.length; i += 1) {
    const hit = normalizeHeader(headers[i] ?? "");
    if (normalizedAliases.some((alias) => hit.includes(alias))) {
      return i;
    }
  }
  return -1;
}

function detectTemplateColumns(matrix: unknown[][]): {
  headerRowIndex: number;
  roomIndex: number;
  usageIndex: number;
  activeIndex: number;
} | null {
  const maxScan = Math.min(matrix.length, 80);
  for (let i = 0; i < maxScan; i += 1) {
    const row = (matrix[i] ?? []).map((cell) => String(cell ?? ""));
    const roomIndex = findColumnIndex(row, ["计算机组", "房间号", "机房", "实验室", "房号", "room", "roomcode"]);
    const usageIndex = findColumnIndex(row, ["开机时间", "开机时长", "使用时间", "usage"]);
    const activeIndex = findColumnIndex(row, ["活动时间", "活动时长", "活跃时间", "active"]);

    if (roomIndex >= 0 && usageIndex >= 0 && activeIndex >= 0) {
      return {
        headerRowIndex: i,
        roomIndex,
        usageIndex,
        activeIndex,
      };
    }
  }

  return null;
}

function extractRoomCandidates(rawValue: string): string[] {
  const candidates = new Set<string>();
  const original = String(rawValue ?? "").trim();
  if (!original) {
    return [];
  }

  candidates.add(original);

  const alnumMatch = original.match(/[A-Za-z]\s*[-]?\s*\d{2,4}/g);
  if (alnumMatch) {
    for (const token of alnumMatch) {
      candidates.add(token);
    }
  }

  const digitMatch = original.match(/\d{2,4}/g);
  if (digitMatch) {
    for (const token of digitMatch) {
      candidates.add(token);
    }
  }

  return Array.from(candidates);
}

function findLabByRoomToken(
  rawRoom: string,
  exactRoomMap: Map<string, Lab>,
  alnumRoomMap: Map<string, Lab>,
  digitsRoomMap: Map<string, Lab>
): Lab | null {
  const candidates = extractRoomCandidates(rawRoom);

  for (const token of candidates) {
    const exactHit = exactRoomMap.get(normalizeRoomCode(token));
    if (exactHit) return exactHit;
  }

  for (const token of candidates) {
    const alnumHit = alnumRoomMap.get(normalizeRoomAlnum(token));
    if (alnumHit) return alnumHit;
  }

  for (const token of candidates) {
    const digits = normalizeRoomDigits(token);
    if (!digits) continue;
    const digitsHit = digitsRoomMap.get(digits);
    if (digitsHit) return digitsHit;
  }

  return null;
}

function parseDurationToSeconds(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.round(raw * 24 * 60 * 60);
  }

  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;

  const fullMatch = text.match(/^(?:(\d+)\s*(?:d|天)\s*)?(\d{1,2}):(\d{2}):(\d{2})$/i);
  if (fullMatch) {
    const days = Number(fullMatch[1] ?? 0);
    const hours = Number(fullMatch[2]);
    const minutes = Number(fullMatch[3]);
    const seconds = Number(fullMatch[4]);
    if ([days, hours, minutes, seconds].some((n) => Number.isNaN(n))) return null;
    return days * 24 * 60 * 60 + hours * 60 * 60 + minutes * 60 + seconds;
  }

  const colonOnly = text.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (colonOnly) {
    const hours = Number(colonOnly[1]);
    const minutes = Number(colonOnly[2]);
    const seconds = Number(colonOnly[3]);
    if ([hours, minutes, seconds].some((n) => Number.isNaN(n))) return null;
    return hours * 60 * 60 + minutes * 60 + seconds;
  }

  return null;
}

function formatMinutesAsHours(totalMinutes: number): string {
  const hours = Math.max(0, totalMinutes) / 60;
  return `${hours.toFixed(2)} h`;
}

function getCurrentMonthText(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function normalizeRange(start: string, end: string): { start: string; end: string } {
  if (!start || !end) {
    return { start, end };
  }

  return start <= end ? { start, end } : { start: end, end: start };
}

function matchesMonthRange(month: string, start: string, end: string): boolean {
  const range = normalizeRange(start, end);
  if (range.start && month < range.start) return false;
  if (range.end && month > range.end) return false;
  return true;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [roomMonthlyMetrics, setRoomMonthlyMetrics] = useState<RoomMonthlyMetric[]>([]);
  const [allLabs, setAllLabs] = useState<Lab[]>(labsSeed);
  const [reportsLoadError, setReportsLoadError] = useState("");
  const [savingReportId, setSavingReportId] = useState<string | null>(null);
  const [role, setRole] = useState("viewer");
  const canEdit = role === "admin";

  const [collegeFilter, setCollegeFilter] = useState("");
  const [rangeStartMonth, setRangeStartMonth] = useState("");
  const [rangeEndMonth, setRangeEndMonth] = useState("");
  const [roomChartSort, setRoomChartSort] = useState<"usage" | "active" | "ratio">("active");

  const deferredCollegeFilter = useDeferredValue(collegeFilter);
  const deferredRangeStartMonth = useDeferredValue(rangeStartMonth);
  const deferredRangeEndMonth = useDeferredValue(rangeEndMonth);
  const normalizedCollegeFilter = useMemo(
    () => deferredCollegeFilter.trim().toLowerCase(),
    [deferredCollegeFilter]
  );

  const handleRangeStartMonthChange = (nextStart: string) => {
    setRangeStartMonth(nextStart);
    if (nextStart && rangeEndMonth && nextStart > rangeEndMonth) {
      setRangeEndMonth(nextStart);
    }
  };

  const handleRangeEndMonthChange = (nextEnd: string) => {
    setRangeEndMonth(nextEnd);
    if (nextEnd && rangeStartMonth && nextEnd < rangeStartMonth) {
      setRangeStartMonth(nextEnd);
    }
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmedReport, setConfirmedReport] = useState<MonthlyReport | null>(null);

  const [formError, setFormError] = useState("");

  const [importMonth, setImportMonth] = useState(getCurrentMonthText);
  const [importError, setImportError] = useState("");
  const [importSummary, setImportSummary] = useState("");

  const collegeOptions = useMemo(() => {
    const all = new Set<string>();
    for (const lab of allLabs) {
      all.add(lab.college);
    }
    for (const row of reports) {
      all.add(row.college);
    }
    return Array.from(all).sort((a, b) => a.localeCompare(b));
  }, [allLabs, reports]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRole(getRoleFromCookie());
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      try {
        const [labsResponse, reportsResponse] = await Promise.all([
          fetch("/api/labs", { cache: "no-store" }),
          fetch("/api/reports", { cache: "no-store" }),
        ]);

        if (!cancelled && labsResponse.ok) {
          const labsPayload = (await labsResponse.json()) as { labs?: Lab[] };
          if (Array.isArray(labsPayload.labs) && labsPayload.labs.length > 0) {
            setAllLabs(labsPayload.labs);
          }
        }

        if (!cancelled && reportsResponse.ok) {
          const reportsPayload = (await reportsResponse.json()) as {
            reports?: MonthlyReport[];
            roomReports?: RoomMonthlyMetric[];
          };
          if (Array.isArray(reportsPayload.reports)) {
            setReports(reportsPayload.reports);
          }
          if (Array.isArray(reportsPayload.roomReports)) {
            setRoomMonthlyMetrics(reportsPayload.roomReports);
          }
        } else if (!cancelled) {
          const payload = (await reportsResponse.json().catch(() => ({ message: "报表加载失败" }))) as { message?: string };
          setReportsLoadError(payload.message ?? "报表加载失败");
        }
      } catch {
        if (!cancelled) {
          setReportsLoadError("报表加载失败，请稍后重试");
        }
      }
    };

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !canEdit) return;

    setImportError("");
    setImportSummary("");

    const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!monthPattern.test(importMonth.trim())) {
      setImportError("导入月份格式应为 YYYY-MM，例如 2026-01");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setImportError("未在文件中找到工作表");
        return;
      }

      const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
        header: 1,
        defval: "",
        raw: true,
      });

      if (matrix.length === 0) {
        setImportError("工作表为空，无法导入");
        return;
      }

      const templateColumns = detectTemplateColumns(matrix);
      if (!templateColumns) {
        setImportError("未识别到必要列，请确保包含 计算机组、开机时间、活动时间");
        return;
      }

      const exactRoomMap = new Map<string, Lab>();
      const alnumRoomMap = new Map<string, Lab>();
      const digitsRoomMap = new Map<string, Lab>();
      for (const lab of allLabs) {
        exactRoomMap.set(normalizeRoomCode(lab.roomCode), lab);

        const roomAlnum = normalizeRoomAlnum(lab.roomCode);
        if (roomAlnum) {
          alnumRoomMap.set(roomAlnum, lab);
        }

        const roomDigits = normalizeRoomDigits(lab.roomCode);
        if (roomDigits && !digitsRoomMap.has(roomDigits)) {
          digitsRoomMap.set(roomDigits, lab);
        }
      }

      const parsedRows: ParsedLabMetric[] = [];
      let ignoredUnknownRoom = 0;
      let ignoredBadDuration = 0;
      let ignoredEmptyRow = 0;

      const dataRows = matrix.slice(templateColumns.headerRowIndex + 1);

      for (const row of dataRows) {
        const rowValues = Array.isArray(row) ? row : [];

        const rawRoom = String(rowValues[templateColumns.roomIndex] ?? "").trim();
        const usageValue = rowValues[templateColumns.usageIndex];
        const activeValue = rowValues[templateColumns.activeIndex];

        if (!rawRoom && !String(usageValue ?? "").trim() && !String(activeValue ?? "").trim()) {
          ignoredEmptyRow += 1;
          continue;
        }

        const lab = findLabByRoomToken(rawRoom, exactRoomMap, alnumRoomMap, digitsRoomMap);
        if (!lab) {
          ignoredUnknownRoom += 1;
          continue;
        }

        const usageSeconds = parseDurationToSeconds(usageValue);
        const activeSeconds = parseDurationToSeconds(activeValue);
        if (usageSeconds === null || activeSeconds === null) {
          ignoredBadDuration += 1;
          continue;
        }

        parsedRows.push({
          roomCode: lab.roomCode,
          college: lab.college,
          usageMinutes: Math.round(usageSeconds / 60),
          activeMinutes: Math.round(activeSeconds / 60),
        });
      }

      if (parsedRows.length === 0) {
        setImportError("没有可导入的有效记录。请检查房间号和时间格式（例如 7d 15:09:41）");
        return;
      }

      const collegeMetrics = new Map<
        string,
        {
          usageMinutes: number;
          activeMinutes: number;
          equipmentValue: number;
          labSet: Set<string>;
        }
      >();

      for (const metric of parsedRows) {
        const foundLab = findLabByRoomToken(metric.roomCode, exactRoomMap, alnumRoomMap, digitsRoomMap);
        if (!foundLab) continue;

        const bucket = collegeMetrics.get(metric.college) ?? {
          usageMinutes: 0,
          activeMinutes: 0,
          equipmentValue: 0,
          labSet: new Set<string>(),
        };

        bucket.usageMinutes += metric.usageMinutes;
        bucket.activeMinutes += metric.activeMinutes;
        if (!bucket.labSet.has(foundLab.id)) {
          bucket.labSet.add(foundLab.id);
          bucket.equipmentValue += Number(foundLab.value ?? 0);
        }

        collegeMetrics.set(metric.college, bucket);
      }

      const importedReports: MonthlyReport[] = Array.from(collegeMetrics.entries()).map(([college, data], index) => ({
        id: `rp-import-${Date.now()}-${index}`,
        college,
        month: importMonth.trim(),
        equipmentUnits: data.labSet.size,
        equipmentValue: Math.round(data.equipmentValue),
        usageMinutes: data.usageMinutes,
        activeMinutes: data.activeMinutes,
      }));

      const roomMerged = new Map<string, ParsedLabMetric>();
      for (const row of parsedRows) {
        const key = normalizeRoomCode(row.roomCode);
        const current = roomMerged.get(key) ?? {
          roomCode: row.roomCode,
          college: row.college,
          usageMinutes: 0,
          activeMinutes: 0,
        };
        current.usageMinutes += row.usageMinutes;
        current.activeMinutes += row.activeMinutes;
        roomMerged.set(key, current);
      }

      const mergedRows = Array.from(roomMerged.values()).sort((a, b) => b.activeMinutes - a.activeMinutes);

      const saveResponse = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reports: importedReports,
          roomReports: mergedRows.map((row) => ({
            month: importMonth.trim(),
            college: row.college,
            roomCode: row.roomCode,
            usageMinutes: row.usageMinutes,
            activeMinutes: row.activeMinutes,
          })),
        }),
      });

      if (!saveResponse.ok) {
        const payload = (await saveResponse.json().catch(() => ({ message: "导入保存失败" }))) as { message?: string };
        setImportError(payload.message ?? "导入保存失败");
        return;
      }

      const savePayload = (await saveResponse.json()) as {
        reports: MonthlyReport[];
        roomReports?: RoomMonthlyMetric[];
      };
      const savedRoomReports = savePayload.roomReports ?? [];

      setReports((prev) => {
        const next = [...prev];
        for (const incoming of savePayload.reports ?? []) {
          const targetIndex = next.findIndex((item) => item.college === incoming.college && item.month === incoming.month);
          if (targetIndex >= 0) {
            next[targetIndex] = incoming;
          } else {
            next.push(incoming);
          }
        }
        return next;
      });
      if (savedRoomReports.length > 0) {
        setRoomMonthlyMetrics((prev) => {
          const carry = prev.filter((row) => row.month !== importMonth.trim());
          return [...carry, ...savedRoomReports];
        });
      } else {
        setRoomMonthlyMetrics((prev) => {
          const carry = prev.filter((row) => row.month !== importMonth.trim());
          const incoming = mergedRows.map((row) => ({
            ...row,
            month: importMonth.trim(),
          }));
          return [...carry, ...incoming];
        });
      }

      setImportSummary(
        `导入完成：有效记录 ${parsedRows.length} 条，涉及实验室 ${mergedRows.length} 个，忽略未知房间 ${ignoredUnknownRoom} 条，忽略无效时间 ${ignoredBadDuration} 条，忽略空行 ${ignoredEmptyRow} 条。`
      );
    } catch {
      setImportError("导入失败，请确认文件格式正确（支持 .xls / .xlsx）");
    }
  };

  const filteredReports = useMemo(() => {
    return reports
      .filter((report) => {
        const matchCollege =
          !normalizedCollegeFilter || report.college.toLowerCase().includes(normalizedCollegeFilter);
        const matchRange = matchesMonthRange(report.month, deferredRangeStartMonth, deferredRangeEndMonth);
        return matchCollege && matchRange;
      })
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [reports, normalizedCollegeFilter, deferredRangeStartMonth, deferredRangeEndMonth]);

  const roomDetailsScope = useMemo(() => {
    const range = normalizeRange(rangeStartMonth, rangeEndMonth);
    if (range.start && range.end) {
      return `${range.start} ~ ${range.end}`;
    }
    if (range.start) {
      return `${range.start} 起`;
    }
    if (range.end) {
      return `至 ${range.end}`;
    }
    return "全部月份";
  }, [rangeStartMonth, rangeEndMonth]);

  const effectiveRangeText = useMemo(() => {
    const range = normalizeRange(rangeStartMonth, rangeEndMonth);
    if (range.start && range.end) {
      return `${range.start} ~ ${range.end}`;
    }
    if (range.start) {
      return `${range.start} 起`;
    }
    if (range.end) {
      return `至 ${range.end}`;
    }
    return "全部月份";
  }, [rangeStartMonth, rangeEndMonth]);

  const filteredRoomMetrics = useMemo(() => {
    return roomMonthlyMetrics.filter((item) => {
      const matchCollege = !normalizedCollegeFilter || item.college.toLowerCase().includes(normalizedCollegeFilter);
      const matchRange = matchesMonthRange(item.month, deferredRangeStartMonth, deferredRangeEndMonth);
      return matchCollege && matchRange;
    });
  }, [roomMonthlyMetrics, normalizedCollegeFilter, deferredRangeStartMonth, deferredRangeEndMonth]);

  const roomDetailsRows = useMemo(() => {
    const byRoom = new Map<string, { usageMinutes: number; activeMinutes: number }>();
    for (const item of filteredRoomMetrics) {
      const key = normalizeRoomCode(item.roomCode);
      const current = byRoom.get(key) ?? { usageMinutes: 0, activeMinutes: 0 };
      current.usageMinutes += item.usageMinutes;
      current.activeMinutes += item.activeMinutes;
      byRoom.set(key, current);
    }

    return [...allLabs]
      .filter((lab) => !normalizedCollegeFilter || lab.college.toLowerCase().includes(normalizedCollegeFilter))
      .sort((a, b) => a.roomCode.localeCompare(b.roomCode))
      .map((lab) => {
        const hit = byRoom.get(normalizeRoomCode(lab.roomCode));
        const usageMinutes = hit?.usageMinutes ?? 0;
        const activeMinutes = hit?.activeMinutes ?? 0;
        const ratio = usageMinutes ? activeMinutes / usageMinutes : 0;
        return {
          roomCode: lab.roomCode,
          college: lab.college,
          usageMinutes,
          activeMinutes,
          ratio,
        };
      });
  }, [allLabs, normalizedCollegeFilter, filteredRoomMetrics]);

  const summary = useMemo(() => {
    const labsForSummary = allLabs.filter(
      (lab) => !normalizedCollegeFilter || lab.college.toLowerCase().includes(normalizedCollegeFilter)
    );

    const totalLabCount = labsForSummary.length;
    const totalEquipmentValue = labsForSummary.reduce((sum, lab) => sum + Number(lab.value ?? 0), 0);
    const totalUsageMinutes = filteredReports.reduce((sum, row) => sum + row.usageMinutes, 0);
    const totalActiveMinutes = filteredReports.reduce((sum, row) => sum + row.activeMinutes, 0);
    const activeRatio = totalUsageMinutes ? totalActiveMinutes / totalUsageMinutes : 0;
    const activeRate = activeRatio * 100;

    return {
      totalLabCount,
      totalEquipmentValue,
      totalUsageMinutes,
      totalActiveMinutes,
      activeRatio,
      activeRate,
    };
  }, [allLabs, normalizedCollegeFilter, filteredReports]);

  const trendData = useMemo(() => {
    const byMonth = new Map<string, { usageMinutes: number; activeMinutes: number }>();

    for (const row of filteredReports) {
      const hit = byMonth.get(row.month) ?? { usageMinutes: 0, activeMinutes: 0 };
      hit.usageMinutes += row.usageMinutes;
      hit.activeMinutes += row.activeMinutes;
      byMonth.set(row.month, hit);
    }

    return Array.from(byMonth.entries())
      .map(([month, val]) => ({
        month,
        usageMinutes: val.usageMinutes,
        activeMinutes: val.activeMinutes,
        ratio: val.usageMinutes ? val.activeMinutes / val.usageMinutes : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredReports]);

  const collegeRateData = useMemo(() => {
    const byCollege = new Map<string, { usageMinutes: number; activeMinutes: number }>();

    for (const row of filteredReports) {
      const hit = byCollege.get(row.college) ?? { usageMinutes: 0, activeMinutes: 0 };
      hit.usageMinutes += row.usageMinutes;
      hit.activeMinutes += row.activeMinutes;
      byCollege.set(row.college, hit);
    }

    return Array.from(byCollege.entries())
      .map(([college, val]) => ({
        college,
        usageMinutes: val.usageMinutes,
        activeMinutes: val.activeMinutes,
        ratio: val.usageMinutes ? val.activeMinutes / val.usageMinutes : 0,
      }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 8);
  }, [filteredReports]);

  const roomRankBase = useMemo(() => {
    const byRoom = new Map<string, ParsedLabMetric>();

    for (const item of filteredRoomMetrics) {
      const key = normalizeRoomCode(item.roomCode);
      const current = byRoom.get(key) ?? {
        roomCode: item.roomCode,
        college: item.college,
        usageMinutes: 0,
        activeMinutes: 0,
      };
      current.usageMinutes += item.usageMinutes;
      current.activeMinutes += item.activeMinutes;
      byRoom.set(key, current);
    }

    return Array.from(byRoom.values()).map((row) => ({
      ...row,
      ratio: row.usageMinutes ? row.activeMinutes / row.usageMinutes : 0,
    }));
  }, [filteredRoomMetrics]);

  const groupedRoomChartData = useMemo(() => {
    return [...roomRankBase]
      .sort((a, b) => {
        if (roomChartSort === "usage") {
          return b.usageMinutes - a.usageMinutes;
        }
        if (roomChartSort === "ratio") {
          return b.ratio - a.ratio;
        }
        return b.activeMinutes - a.activeMinutes;
      });
  }, [roomChartSort, roomRankBase]);

  const groupedRoomChartMax = useMemo(
    () => ({
      usageMinutes: Math.max(1, ...groupedRoomChartData.map((item) => item.usageMinutes)),
      activeMinutes: Math.max(1, ...groupedRoomChartData.map((item) => item.activeMinutes)),
      ratio: Math.max(0.01, ...groupedRoomChartData.map((item) => item.ratio)),
    }),
    [groupedRoomChartData]
  );

  const collegeActivityShare = useMemo(() => {
    const byCollege = new Map<string, number>();
    for (const row of filteredReports) {
      byCollege.set(row.college, (byCollege.get(row.college) ?? 0) + row.activeMinutes);
    }

    const total = Array.from(byCollege.values()).reduce((sum, value) => sum + value, 0);
    const palette = [
      MORANDI.mistBlue,
      MORANDI.oatGray,
      MORANDI.milkCoffee,
      MORANDI.dustyPurple,
      MORANDI.mintTeal,
      MORANDI.creamYellow,
      MORANDI.lakeGreen,
      MORANDI.dustyRose,
    ];

    return Array.from(byCollege.entries())
      .map(([college, minutes], index) => ({
        college,
        minutes,
        share: total ? minutes / total : 0,
        color: palette[index % palette.length],
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 6);
  }, [filteredReports]);

  const collegeShareGradient = useMemo(() => {
    if (collegeActivityShare.length === 0) {
      return "conic-gradient(#e2e8f0 0deg 360deg)";
    }

    let cursor = 0;
    const segments = collegeActivityShare.map((item) => {
      const start = cursor;
      cursor += item.share * 360;
      return `${item.color} ${start}deg ${cursor}deg`;
    });

    if (cursor < 360) {
      segments.push(`#e2e8f0 ${cursor}deg 360deg`);
    }

    return `conic-gradient(${segments.join(", ")})`;
  }, [collegeActivityShare]);

  const startEdit = (id: string) => {
    if (!canEdit) return;
    setEditingId(id);
  };

  const deleteReport = async (id: string) => {
    if (!canEdit) return;

    const response = await fetch(`/api/reports/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ message: "删除失败" }))) as { message?: string };
      setFormError(payload.message ?? "删除失败");
      return;
    }

    setReports((prev) => prev.filter((report) => report.id !== id));
    if (editingId === id) setEditingId(null);
    setConfirmDeleteId(null);
    setConfirmedReport(null);
  };

  const handleDeleteClick = (report: MonthlyReport) => {
    setConfirmedReport(report);
    setConfirmDeleteId(report.id);
  };

  const handleConfirmDelete = async () => {
    if (confirmDeleteId) {
      await deleteReport(confirmDeleteId);
    }
  };

  const updateField = <K extends keyof MonthlyReport>(id: string, key: K, value: MonthlyReport[K]) => {
    if (!canEdit) return;
    setReports((prev) => prev.map((report) => (report.id === id ? { ...report, [key]: value } : report)));
  };

  const saveReport = async (report: MonthlyReport) => {
    if (!canEdit) return;

    if (!report.college.trim() || !report.month.trim()) {
      setFormError("学院和月份不能为空");
      return;
    }

    const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!monthPattern.test(report.month.trim())) {
      setFormError("月份格式应为 YYYY-MM");
      return;
    }

    setSavingReportId(report.id);

    const response = await fetch(`/api/reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        college: report.college,
        month: report.month,
        equipmentUnits: report.equipmentUnits,
        equipmentValue: report.equipmentValue,
        usageMinutes: report.usageMinutes,
        activeMinutes: report.activeMinutes,
      }),
    });

    setSavingReportId(null);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({ message: "更新失败" }))) as { message?: string };
      setFormError(payload.message ?? "更新失败");
      return;
    }

    const payload = (await response.json()) as { report: MonthlyReport };
    setReports((prev) => prev.map((row) => (row.id === payload.report.id ? payload.report : row)));
    setEditingId(null);
  };

  const exportCsv = () => {
    const header = ["展示范围", "房间号", "学院", "开机时间(小时)", "活动时间(小时)", "活动/开机比例", "活动率"];
    const rows = roomDetailsRows.map((row) => [
      roomDetailsScope,
      row.roomCode,
      row.college,
      formatMinutesAsHours(row.usageMinutes),
      formatMinutesAsHours(row.activeMinutes),
      row.ratio.toFixed(3),
      `${(row.ratio * 100).toFixed(1)}%`,
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

  const trendMax = Math.max(1, ...trendData.map((item) => Math.max(item.usageMinutes, item.activeMinutes)));
  const collegeRatioMax = Math.max(0.01, ...collegeRateData.map((item) => item.ratio));

  return (
    <div className="report-page rounded-2xl p-4 md:p-5" style={{ backgroundColor: REPORT_SURFACE.page }}>
      <h1 className="text-2xl font-bold">学院实验室报表</h1>

      {reportsLoadError && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{reportsLoadError}</p>
      )}

      {formError && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
      )}

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-44 flex-col gap-1">
            <label className="text-xs text-slate-500">导入月份</label>
            <input
              type="month"
              className="rounded-lg border border-slate-300 px-3 py-2"
              value={importMonth}
              disabled={!canEdit}
              onChange={(e) => setImportMonth(e.target.value)}
            />
          </div>

          <label
            className="inline-flex cursor-pointer items-center rounded-lg px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            style={{ backgroundColor: MORANDI.lakeGreen }}
          >
            导入月报 Excel (.xls/.xlsx)
            <input
              type="file"
              className="hidden"
              accept=".xls,.xlsx"
              disabled={!canEdit}
              onChange={(e) => void handleImportFile(e)}
            />
          </label>

          {!canEdit && <p className="text-sm text-slate-500">当前为只读角色，无法导入。</p>}
        </div>

        {importError && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{importError}</p>
        )}
        {importSummary && (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{importSummary}</p>
        )}
      </section>

      <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-3">
        <select
          className="rounded-lg border border-slate-300 px-3 py-2"
          value={collegeFilter}
          onChange={(e) => setCollegeFilter(e.target.value)}
        >
          <option value="">全部学院</option>
          {collegeOptions.map((college) => (
            <option key={college} value={college}>
              {college}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="month"
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={rangeStartMonth}
            max={rangeEndMonth || undefined}
            onChange={(e) => handleRangeStartMonthChange(e.target.value)}
            placeholder="起始月"
          />
          <input
            type="month"
            className="rounded-lg border border-slate-300 px-3 py-2"
            value={rangeEndMonth}
            min={rangeStartMonth || undefined}
            onChange={(e) => handleRangeEndMonthChange(e.target.value)}
            placeholder="结束月"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setCollegeFilter("");
              setRangeStartMonth("");
              setRangeEndMonth("");
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700"
          >
            清空筛选
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-lg px-4 py-2 text-white"
            style={{ backgroundColor: MORANDI.mistBlue }}
          >
            导出 CSV
          </button>
        </div>
        <p className="text-xs text-slate-500 md:col-span-3">当前生效月份范围：{effectiveRangeText}</p>
      </div>

      <div className="report-summary mt-5 grid gap-3 md:grid-cols-6">
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: MORANDI.mistBlue, backgroundColor: REPORT_SURFACE.card }}>
          <p className="text-xs text-slate-500">实验室数量</p>
          <p className="mt-1 text-xl font-semibold">{summary.totalLabCount.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: MORANDI.dustyRose, backgroundColor: REPORT_SURFACE.cardAlt }}>
          <p className="text-xs text-slate-500">设备价值总额</p>
          <p className="mt-1 text-xl font-semibold">¥{summary.totalEquipmentValue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: MORANDI.mistBlue, backgroundColor: REPORT_SURFACE.card }}>
          <p className="text-xs text-slate-500">开机分钟总数</p>
          <p className="mt-1 text-xl font-semibold">{summary.totalUsageMinutes.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: MORANDI.creamYellow, backgroundColor: REPORT_SURFACE.cardAlt }}>
          <p className="text-xs text-slate-500">活动分钟总数</p>
          <p className="mt-1 text-xl font-semibold">{summary.totalActiveMinutes.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: MORANDI.milkCoffee, backgroundColor: REPORT_SURFACE.card }}>
          <p className="text-xs text-slate-500">活动时间 / 开机时间</p>
          <p className="mt-1 text-xl font-semibold">{summary.activeRatio.toFixed(3)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4" style={{ borderColor: MORANDI.dustyPurple, backgroundColor: REPORT_SURFACE.cardAlt }}>
          <p className="text-xs text-slate-500">活动占用率</p>
          <p className="mt-1 text-xl font-semibold">{summary.activeRate.toFixed(1)}%</p>
        </div>
      </div>

      <section className="report-panels mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4" style={{ backgroundColor: REPORT_SURFACE.panel }}>
          <h2 className="text-sm font-semibold text-slate-800">月度开机/活动趋势</h2>
          <div className="mt-3 space-y-2">
            {trendData.length === 0 ? (
              <p className="text-sm text-slate-500">暂无趋势数据</p>
            ) : (
              trendData.map((item) => (
                <div key={item.month} className="space-y-1 rounded-lg border p-2" style={{ borderColor: MORANDI.milkCoffee, backgroundColor: "rgba(255,255,255,0.82)" }}>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{item.month}</span>
                    <span>比例 {(item.ratio * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded" style={{ backgroundColor: REPORT_SURFACE.track }}>
                    <div className="h-2 rounded" style={{ width: `${(item.usageMinutes / trendMax) * 100}%`, backgroundColor: MORANDI.mistBlue }} />
                  </div>
                  <div className="h-2 rounded" style={{ backgroundColor: REPORT_SURFACE.track }}>
                    <div className="h-2 rounded" style={{ width: `${(item.activeMinutes / trendMax) * 100}%`, backgroundColor: MORANDI.lakeGreen }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4" style={{ backgroundColor: REPORT_SURFACE.panel }}>
          <h2 className="text-sm font-semibold text-slate-800">学院活动率排行</h2>
          <div className="mt-3 space-y-2">
            {collegeRateData.length === 0 ? (
              <p className="text-sm text-slate-500">暂无学院数据</p>
            ) : (
              collegeRateData.map((item) => (
                <div key={item.college} className="space-y-1 rounded-lg border p-2" style={{ borderColor: MORANDI.milkCoffee, backgroundColor: "rgba(255,255,255,0.82)" }}>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{item.college}</span>
                    <span>{(item.ratio * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded" style={{ backgroundColor: REPORT_SURFACE.track }}>
                    <div
                      className="h-2 rounded"
                      style={{ width: `${(item.ratio / collegeRatioMax) * 100}%`, backgroundColor: MORANDI.dustyPurple }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-4" style={{ backgroundColor: REPORT_SURFACE.panel }}>
          <h2 className="text-sm font-semibold text-slate-800">学院活动时间占比</h2>
          <div className="mt-3 flex items-center gap-4">
            <div
              className="h-24 w-24 rounded-full border border-slate-200"
              style={{ background: collegeShareGradient }}
            />
            <div className="flex-1 space-y-1 text-xs text-slate-600">
              {collegeActivityShare.length === 0 ? (
                <p className="text-sm text-slate-500">暂无学院活动占比数据</p>
              ) : (
                collegeActivityShare.map((item) => (
                  <div key={item.college} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                      <span>{item.college}</span>
                    </div>
                    <span>{(item.share * 100).toFixed(1)}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </article>

        <article className="rounded-xl border-2 bg-white p-4 md:col-span-2 xl:col-span-3" style={{ borderColor: MORANDI.milkCoffee, backgroundColor: REPORT_SURFACE.panel }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">房间指标条形图</h2>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-500">
                <span>排序</span>
                <select
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                  value={roomChartSort}
                  onChange={(e) => setRoomChartSort(e.target.value as "usage" | "active" | "ratio")}
                >
                  <option value="usage">按开机时间</option>
                  <option value="active">按活动时间</option>
                  <option value="ratio">按活动比</option>
                </select>
              </label>
              <div className="grid gap-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MORANDI.mistBlue }} />开机时间</span>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MORANDI.lakeGreen }} />活动时间</span>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MORANDI.dustyPurple }} />活动比</span>
              </div>
            </div>
          </div>
          <div className="mt-4 hidden grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b pb-2 text-xs font-medium text-slate-500 md:grid" style={{ borderColor: MORANDI.milkCoffee }}>
            <span>房间</span>
            <span>开机时间</span>
            <span>活动时间</span>
            <span>活动比</span>
          </div>
          <div className="mt-4 max-h-[720px] space-y-3 overflow-y-auto pr-1">
            {groupedRoomChartData.length === 0 ? (
              <p className="text-sm text-slate-500">暂无符合筛选条件的房间数据</p>
            ) : (
              groupedRoomChartData.map((item) => (
                <div key={item.roomCode} className="report-grid rounded-lg border p-3" style={{ borderColor: MORANDI.milkCoffee, backgroundColor: "rgba(255,255,255,0.9)" }}>
                  <div className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center">
                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500 md:block">
                      <div>
                        <span className="font-medium text-slate-800">{item.roomCode}</span>
                        <span className="ml-2 md:ml-0 md:mt-1 md:block">{item.college}</span>
                      </div>
                      <span className="md:hidden">活动比 {(item.ratio * 100).toFixed(1)}%</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2 text-xs text-slate-500">
                      <div className="h-3 rounded-full" style={{ backgroundColor: REPORT_SURFACE.track }}>
                        <div
                          className="h-3 rounded-full"
                          style={{ width: `${(item.usageMinutes / groupedRoomChartMax.usageMinutes) * 100}%`, backgroundColor: MORANDI.mistBlue }}
                        />
                      </div>
                      <span className="text-right text-slate-700">{formatMinutesAsHours(item.usageMinutes)}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2 text-xs text-slate-500">
                      <div className="h-3 rounded-full" style={{ backgroundColor: REPORT_SURFACE.track }}>
                        <div
                          className="h-3 rounded-full"
                          style={{ width: `${(item.activeMinutes / groupedRoomChartMax.activeMinutes) * 100}%`, backgroundColor: MORANDI.lakeGreen }}
                        />
                      </div>
                      <span className="text-right text-slate-700">{formatMinutesAsHours(item.activeMinutes)}</span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-2 text-xs text-slate-500">
                      <div className="h-3 rounded-full" style={{ backgroundColor: REPORT_SURFACE.track }}>
                        <div
                          className="h-3 rounded-full"
                          style={{ width: `${(item.ratio / groupedRoomChartMax.ratio) * 100}%`, backgroundColor: MORANDI.dustyPurple }}
                        />
                      </div>
                      <span className="text-right text-slate-700">{(item.ratio * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4" style={{ backgroundColor: REPORT_SURFACE.panel }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">全部房间开机/活动明细</h2>
          <span className="text-xs text-slate-500">展示范围：{roomDetailsScope}</span>
        </div>

        <div className="mt-3 overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="text-slate-600" style={{ backgroundColor: REPORT_SURFACE.tableHead }}>
              <tr>
                <th className="px-3 py-2 text-left">房间号</th>
                <th className="px-3 py-2 text-left">学院</th>
                <th className="px-3 py-2 text-right">开机时间(小时)</th>
                <th className="px-3 py-2 text-right">活动时间(小时)</th>
                <th className="px-3 py-2 text-right">活动/开机比例</th>
              </tr>
            </thead>
            <tbody>
              {roomDetailsRows.map((row) => (
                <tr key={`${roomDetailsScope}-${row.roomCode}`} className="border-t border-slate-100">
                  <td className="px-3 py-2">{row.roomCode}</td>
                  <td className="px-3 py-2">{row.college}</td>
                  <td className="px-3 py-2 text-right">{formatMinutesAsHours(row.usageMinutes)}</td>
                  <td className="px-3 py-2 text-right">{formatMinutesAsHours(row.activeMinutes)}</td>
                  <td className="px-3 py-2 text-right">{row.ratio.toFixed(3)} ({(row.ratio * 100).toFixed(1)}%)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-5 space-y-3">
        {filteredReports.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">没有匹配的报表记录。</div>
        ) : (
          filteredReports.map((report) => {
            const isEditing = editingId === report.id;
            const rowRatio = report.usageMinutes ? report.activeMinutes / report.usageMinutes : 0;

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
                            onClick={() => void saveReport(report)}
                            disabled={savingReportId === report.id}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
                          >
                            {savingReportId === report.id ? "保存中..." : "完成"}
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

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
                    <span className="mb-1 block text-xs text-slate-400">开机分钟数</span>
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

                  <label className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600">
                    <span className="mb-1 block text-xs text-slate-400">活动/开机比例</span>
                    <span className="font-medium text-slate-800">{rowRatio.toFixed(3)} ({(rowRatio * 100).toFixed(1)}%)</span>
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
