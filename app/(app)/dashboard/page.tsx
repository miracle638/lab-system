import Link from "next/link";
import { cookies } from "next/headers";
import { getDashboardData } from "@/lib/dashboard-data";

type DashboardPageProps = {
  searchParams?: Promise<{ college?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedCollege = resolvedSearchParams?.college ?? "all";
  const cookieStore = await cookies();
  const role = cookieStore.get("lab_role")?.value;
  const currentRole = role === "admin" ? "管理员" : "查看者（游客）";
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900">学院实验室看板</h1>
        <p className="mt-1 text-slate-600">按学院查看实验室整体情况。电脑配置为配置方案视图（非逐台清单），电脑总数按实验室座位数统计。</p>
      </div>

      {loadError && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadError}</p>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">学院数量</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{collegeMap.size}</p>
        </article>
        <article className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">实验室数量</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{labs.length}</p>
        </article>
        <article className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">电脑总数</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{totalComputerCount}</p>
        </article>
        <article className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <p className="text-sm text-slate-500">正常 / 故障</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            <span className="text-emerald-600">{runningCount}</span>
            <span className="mx-1 text-slate-400">/</span>
            <span className="text-rose-600">{faultCount}</span>
          </p>
        </article>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">维修工单</h2>
          <p className="mt-2 text-slate-700">当前总工单：{maintenance.length}</p>
          <p className="text-slate-700">进行中：{maintenance.filter((x) => x.status === "in_progress").length}</p>
        </article>

        <article className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">最新月报</h2>
          <p className="mt-2 text-slate-700">月份：{latestReport?.month ?? "暂无"}</p>
          <p className="text-slate-700">设备价值：¥{(latestReport?.equipmentValue ?? 0).toLocaleString()}</p>
          <p className="text-slate-700">活动分钟：{(latestReport?.activeMinutes ?? 0).toLocaleString()}</p>
        </article>

        <article className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">当前访问角色</h2>
          <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
            {currentRole}
          </p>
        </article>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">学院快速切换</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className={`chip-switch rounded-full border px-3 py-1.5 text-sm transition ${
              selectedCollege === "all"
                ? "border-sky-300 bg-sky-50 text-sky-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            全部学院
          </Link>
          {preferredOrder.map((college) => (
            <Link
              key={college}
              href={`/dashboard?college=${encodeURIComponent(college)}`}
              className={`chip-switch rounded-full border px-3 py-1.5 text-sm transition ${
                selectedCollege === college
                  ? "border-sky-300 bg-sky-50 text-sky-700"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {college}
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-8">
        {filteredColleges.map(([college, labs]) => (
          <article key={college} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">{college}</h2>
                <p className="mt-1 text-sm text-slate-500">实验室数量：{labs.length}</p>
              </div>
              <p className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                学院实验室总价值：¥{labs.reduce((sum, lab) => sum + lab.value, 0).toLocaleString()}
              </p>
            </div>

            <div className="mt-5 grid gap-5">
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
                  <section key={lab.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{lab.name}</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          房间号：{lab.roomCode} | 管理员：{lab.manager} | 座位数：{lab.seatCount}
                        </p>
                      </div>
                      <div className="grid min-w-[280px] grid-cols-2 gap-3 text-sm md:grid-cols-4">
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-slate-500">价值</p>
                          <p className="mt-1 font-semibold text-slate-900">¥{lab.value.toLocaleString()}</p>
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-slate-500">电脑总数</p>
                          <p className="mt-1 font-semibold text-slate-900">{lab.seatCount}</p>
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-slate-500">正常</p>
                          <p className="mt-1 font-semibold text-emerald-700">
                            {Math.max(lab.seatCount - inRepairCount, 0)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-slate-500">故障</p>
                          <p className="mt-1 font-semibold text-amber-700">{inRepairCount}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-left">
                          <tr>
                            <th className="p-3">实验室编号</th>
                            <th className="p-3">CPU</th>
                            <th className="p-3">内存</th>
                            <th className="p-3">硬盘</th>
                            <th className="p-3">显卡</th>
                            <th className="p-3">显示器</th>
                            <th className="p-3">C盘大小</th>
                            <th className="p-3">操作系统</th>
                            <th className="p-3">购置日期</th>
                          </tr>
                        </thead>
                        <tbody>
                          {labComputers.length > 0 ? (
                            labComputers.map((computer) => (
                              <tr key={computer.id} className="border-t border-slate-100">
                                <td className="p-3">{lab.labNumber ?? "未设置"}</td>
                                <td className="p-3">{computer.cpu}</td>
                                <td className="p-3">{computer.ram}</td>
                                <td className="p-3">{computer.storage}</td>
                                <td className="p-3">{computer.gpu || "-"}</td>
                                <td className="p-3">{computer.monitor}</td>
                                <td className="p-3">{computer.cDriveSize}</td>
                                <td className="p-3">{computer.os}</td>
                                <td className="p-3">{computer.purchaseDate || "-"}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={9} className="p-6 text-center text-slate-500">
                                暂无设备配置数据。
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
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
