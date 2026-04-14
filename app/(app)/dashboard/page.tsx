import Link from "next/link";
import { getDashboardData } from "@/lib/dashboard-data";

type DashboardPageProps = {
  searchParams?: Promise<{ college?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedCollege = resolvedSearchParams?.college ?? "all";
  const { labs, computers, maintenance, latestReport, loadError } = await getDashboardData();

  const totalComputerCount = labs.reduce((sum, lab) => sum + lab.seatCount, 0);
  const faultCount = maintenance.filter((item) => item.status === "pending" || item.status === "in_progress").length;
  const runningCount = Math.max(totalComputerCount - faultCount, 0);
  const collegeMap = new Map<string, typeof labs>();

  for (const lab of labs) {
    const current = collegeMap.get(lab.college) ?? [];
    current.push(lab);
    collegeMap.set(lab.college, current);
  }

  const preferredOrder = ["软件学院", "数字孪生产业学院"];
  const orderedColleges = Array.from(collegeMap.entries()).sort(([left], [right]) => {
    const leftIndex = preferredOrder.indexOf(left);
    const rightIndex = preferredOrder.indexOf(right);

    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });

  const filteredColleges =
    selectedCollege === "all"
      ? orderedColleges
      : orderedColleges.filter(([college]) => college === selectedCollege);

  return (
    <div>
      {/* 标题行 + 学院筛选 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">实验室看板</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className={`chip-switch rounded-full border px-3 py-1.5 text-sm transition ${
              selectedCollege === "all"
                ? "border-sky-300 bg-sky-50 text-sky-700"
                : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            全部
          </Link>
          {preferredOrder.map((college) => (
            <Link
              key={college}
              href={`/dashboard?college=${encodeURIComponent(college)}`}
              className={`chip-switch rounded-full border px-3 py-1.5 text-sm transition ${
                selectedCollege === college
                  ? "border-sky-300 bg-sky-50 text-sky-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {college}
            </Link>
          ))}
        </div>
      </div>

      {loadError && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</p>
      )}

      {/* 顶部四个核心指标 */}
      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-slate-400">学院</p>
          <p className="mt-3 text-4xl font-bold text-slate-900">{collegeMap.size}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-slate-400">实验室</p>
          <p className="mt-3 text-4xl font-bold text-slate-900">{labs.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-slate-400">电脑总数</p>
          <p className="mt-3 text-4xl font-bold text-slate-900">{totalComputerCount}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-slate-400">正常 / 故障</p>
          <p className="mt-3 text-4xl font-bold">
            <span className="text-emerald-600">{runningCount}</span>
            <span className="mx-1 text-slate-300">/</span>
            <span className="text-rose-500">{faultCount}</span>
          </p>
        </article>
      </section>

      {/* 维修 + 月报摘要 */}
      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-slate-400">维修工单</p>
          <div className="mt-3 flex items-baseline gap-4">
            <span className="text-3xl font-bold text-slate-900">{maintenance.length}</span>
            <span className="text-sm text-slate-500">进行中 <strong className="text-amber-600">{maintenance.filter((x) => x.status === "in_progress").length}</strong></span>
          </div>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs uppercase tracking-widest text-slate-400">最新月报</p>
          <div className="mt-3 flex items-baseline gap-4">
            <span className="text-xl font-bold text-slate-900">{latestReport?.month ?? "—"}</span>
            <span className="text-sm text-slate-500">¥{(latestReport?.equipmentValue ?? 0).toLocaleString()} · {(latestReport?.activeMinutes ?? 0).toLocaleString()} min</span>
          </div>
        </article>
      </section>

      {/* 学院详情 */}
      <section className="mt-8 space-y-8">
        {filteredColleges.map(([college, labs]) => (
          <article key={college} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold text-slate-900">{college}</h2>
              <span className="text-sm text-slate-400">¥{labs.reduce((sum, lab) => sum + lab.value, 0).toLocaleString()}</span>
            </div>

            <div className="mt-4 space-y-4">
              {[...labs]
                .sort((a, b) => a.roomCode.localeCompare(b.roomCode, "zh-CN", { numeric: true }))
                .map((lab) => {
                const labComputers = computers.filter((pc) => pc.labId === lab.id);
                const computerIds = new Set(labComputers.map((pc) => pc.id));
                const inRepairCount = maintenance.filter(
                  (record) =>
                    computerIds.has(record.computerId) &&
                    (record.status === "pending" || record.status === "in_progress"),
                ).length;

                return (
                  <section key={lab.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">{lab.name}
                          <span className="ml-2 text-xs font-normal text-slate-400">{lab.roomCode}</span>
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-400">{lab.manager} · {lab.seatCount} 座</p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-slate-500">¥{lab.value.toLocaleString()}</span>
                        <span className="text-emerald-600 font-medium">{Math.max(lab.seatCount - inRepairCount, 0)} 正常</span>
                        {inRepairCount > 0 && <span className="text-amber-600 font-medium">{inRepairCount} 故障</span>}
                      </div>
                    </div>

                    {labComputers.length > 0 && (
                      <div className="mt-3 overflow-auto rounded-lg border border-slate-200 bg-white">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-left text-xs text-slate-500">
                            <tr>
                              <th className="px-3 py-2">编号</th>
                              <th className="px-3 py-2">CPU</th>
                              <th className="px-3 py-2">内存</th>
                              <th className="px-3 py-2">硬盘</th>
                              <th className="px-3 py-2">显卡</th>
                              <th className="px-3 py-2">显示器</th>
                              <th className="px-3 py-2">C盘</th>
                              <th className="px-3 py-2">系统</th>
                              <th className="px-3 py-2">购置日期</th>
                            </tr>
                          </thead>
                          <tbody>
                            {labComputers.map((computer) => (
                              <tr key={computer.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-slate-400">{lab.labNumber ?? "—"}</td>
                                <td className="px-3 py-2">{computer.cpu}</td>
                                <td className="px-3 py-2">{computer.ram}</td>
                                <td className="px-3 py-2">{computer.storage}</td>
                                <td className="px-3 py-2">{computer.gpu || "—"}</td>
                                <td className="px-3 py-2">{computer.monitor}</td>
                                <td className="px-3 py-2">{computer.cDriveSize}</td>
                                <td className="px-3 py-2">{computer.os}</td>
                                <td className="px-3 py-2">{computer.purchaseDate || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
