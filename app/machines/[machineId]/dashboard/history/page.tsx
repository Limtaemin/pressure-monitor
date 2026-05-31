// PATH: app/machines/[machineId]/dashboard/history/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardNav from "@/components/DashboardNav";

type ResultFilter = "all" | "OK" | "NG" | "pending";

type SessionRow = {
  id: number;
  machine_id: string;
  started_at: string | null;
  ended_at: string | null;
  result: string | null;
  avg_pressure: number | null;
  max_pressure: number | null;
  final_pressure: number | null;
  pressure_drop: number | null;

  profile_id?: string | null;
  profile_label?: string | null;
  similarity_avg?: number | null;
  sensor1_result?: string | null;
  sensor2_result?: string | null;
  sensor3_result?: string | null;
  defect_summary?: string | null;
};

export default function HistoryPage() {
  const params = useParams();
  const router = useRouter();
  const machineId = String(params.machineId);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadSessions();
  }, [machineId]);

  async function loadSessions() {
    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("measurement_sessions")
      .select("*")
      .eq("machine_id", machineId)
      .order("id", { ascending: false });

    if (error) {
      console.error("이력 불러오기 실패:", error);
      setSessions([]);
      setErrorMessage("측정 이력을 불러오지 못했습니다.");
    } else {
      setSessions((data ?? []) as SessionRow[]);
    }

    setLoading(false);
  }

  function goToAnalysis(sessionId: number) {
    router.push(`/machines/${machineId}/dashboard/analysis?sessionId=${sessionId}`);
  }

  const summary = useMemo(() => {
    const total = sessions.length;
    const ok = sessions.filter((row) => row.result === "OK").length;
    const ng = sessions.filter((row) => row.result === "NG").length;
    const pending = sessions.filter((row) => !row.result).length;

    const completed = sessions.filter(
      (row) => typeof row.avg_pressure === "number" && Number.isFinite(row.avg_pressure)
    );

    const avgPressure =
      completed.length > 0
        ? completed.reduce((sum, row) => sum + Number(row.avg_pressure ?? 0), 0) /
          completed.length
        : 0;

    return { total, ok, ng, pending, avgPressure };
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    if (filter === "all") return sessions;
    if (filter === "pending") return sessions.filter((row) => !row.result);
    return sessions.filter((row) => row.result === filter);
  }, [sessions, filter]);

  return (
    <main className="min-h-screen bg-[#050817] px-4 py-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-sm font-bold text-cyan-300">
              Machine ID: {machineId}
            </p>
            <h1 className="text-2xl font-black md:text-4xl">품질 판정 이력</h1>
            <p className="mt-2 text-sm text-slate-400 md:text-base">
              측정 세션별 OK/NG 결과, 센서별 판정, 예상 불량을 확인합니다.
            </p>
          </div>

          <button
            type="button"
            onClick={loadSessions}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800"
          >
            새로고침
          </button>
        </header>

        <DashboardNav machineId={machineId} />

        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <SummaryCard label="전체 세션" value={`${summary.total}개`} tone="default" />
          <SummaryCard label="OK" value={`${summary.ok}개`} tone="ok" />
          <SummaryCard label="NG" value={`${summary.ng}개`} tone="ng" />
          <SummaryCard label="대기/미판정" value={`${summary.pending}개`} tone="pending" />
          <SummaryCard
            label="평균 압력"
            value={summary.avgPressure > 0 ? summary.avgPressure.toFixed(1) : "-"}
            tone="default"
          />
        </section>

        <section className="mb-5 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold">세션 필터</h2>
              <p className="mt-1 text-sm text-slate-400">
                NG 세션만 빠르게 골라서 상세 분석 화면으로 이동할 수 있습니다.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
                전체
              </FilterButton>
              <FilterButton active={filter === "OK"} onClick={() => setFilter("OK")}>
                OK
              </FilterButton>
              <FilterButton active={filter === "NG"} onClick={() => setFilter("NG")}>
                NG
              </FilterButton>
              <FilterButton
                active={filter === "pending"}
                onClick={() => setFilter("pending")}
              >
                미판정
              </FilterButton>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 md:p-6">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-bold md:text-2xl">측정 세션 기록</h2>
              <p className="mt-1 text-sm text-slate-400">
                행을 누르면 해당 세션의 EO 분석 화면으로 이동합니다.
              </p>
            </div>

            <p className="text-sm text-slate-400">
              표시 중: <span className="font-bold text-cyan-300">{filteredSessions.length}</span>개
            </p>
          </div>

          {loading ? (
            <EmptyState title="불러오는 중..." description="측정 이력을 조회하고 있습니다." />
          ) : errorMessage ? (
            <EmptyState title="이력 조회 실패" description={errorMessage} danger />
          ) : filteredSessions.length === 0 ? (
            <EmptyState
              title="표시할 측정 기록이 없습니다."
              description="필터를 변경하거나 새 측정을 진행해 주세요."
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 lg:hidden">
                {filteredSessions.map((row) => (
                  <SessionMobileCard
                    key={row.id}
                    row={row}
                    onClick={() => goToAnalysis(row.id)}
                  />
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[1120px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-slate-400">
                      <th className="py-3 pr-4">세션</th>
                      <th className="py-3 pr-4">판정</th>
                      <th className="py-3 pr-4">센서별</th>
                      <th className="py-3 pr-4">Reference Profile</th>
                      <th className="py-3 pr-4">유사도</th>
                      <th className="py-3 pr-4">평균</th>
                      <th className="py-3 pr-4">최대</th>
                      <th className="py-3 pr-4">최종</th>
                      <th className="py-3 pr-4">낙차</th>
                      <th className="py-3 pr-4">예상 불량</th>
                      <th className="py-3 pr-4">상세</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredSessions.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => goToAnalysis(row.id)}
                        className="cursor-pointer border-b border-slate-800 hover:bg-slate-800/80"
                      >
                        <td className="py-4 pr-4 align-top">
                          <div className="font-black text-white">#{row.id}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            시작 {formatDate(row.started_at)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            종료 {row.ended_at ? formatDate(row.ended_at) : "측정 중"}
                          </div>
                        </td>

                        <td className="py-4 pr-4 align-top">
                          <ResultBadge result={row.result} large />
                        </td>

                        <td className="py-4 pr-4 align-top">
                          <SensorResultBadges row={row} />
                        </td>

                        <td className="py-4 pr-4 align-top text-slate-300">
                          <div className="max-w-[180px] font-bold">
                            {row.profile_label || "-"}
                          </div>
                          {row.profile_id && (
                            <div className="mt-1 text-xs text-slate-500">
                              {row.profile_id}
                            </div>
                          )}
                        </td>

                        <td className="py-4 pr-4 align-top font-bold text-cyan-300">
                          {formatSimilarity(row.similarity_avg)}
                        </td>

                        <td className="py-4 pr-4 align-top text-slate-300">
                          {formatNumber(row.avg_pressure)}
                        </td>
                        <td className="py-4 pr-4 align-top text-slate-300">
                          {formatNumber(row.max_pressure)}
                        </td>
                        <td className="py-4 pr-4 align-top text-slate-300">
                          {formatNumber(row.final_pressure)}
                        </td>
                        <td className="py-4 pr-4 align-top text-slate-300">
                          {formatNumber(row.pressure_drop)}
                        </td>

                        <td className="py-4 pr-4 align-top">
                          <DefectText value={row.defect_summary} />
                        </td>

                        <td className="py-4 pr-4 align-top">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              goToAnalysis(row.id);
                            }}
                            className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950 hover:bg-cyan-400"
                          >
                            분석 보기
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "ok" | "ng" | "pending";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : tone === "ng"
      ? "border-red-500/30 bg-red-500/10 text-red-300"
      : tone === "pending"
      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
      : "border-slate-800 bg-slate-900 text-cyan-300";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs font-bold opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-black md:text-3xl">{value}</p>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-black transition ${
        active
          ? "bg-cyan-500 text-slate-950"
          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function SessionMobileCard({ row, onClick }: { row: SessionRow; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-left hover:bg-slate-800/80"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-white">Session #{row.id}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(row.started_at)}</p>
        </div>
        <ResultBadge result={row.result} large />
      </div>

      <div className="mb-3">
        <SensorResultBadges row={row} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <MobileMetric label="평균" value={formatNumber(row.avg_pressure)} />
        <MobileMetric label="최대" value={formatNumber(row.max_pressure)} />
        <MobileMetric label="최종" value={formatNumber(row.final_pressure)} />
        <MobileMetric label="낙차" value={formatNumber(row.pressure_drop)} />
      </div>

      <div className="mt-3 rounded-xl bg-slate-900 p-3 text-xs text-slate-300">
        <p className="mb-1 text-slate-500">예상 불량</p>
        <DefectText value={row.defect_summary} />
      </div>
    </button>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-900 p-3">
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-cyan-300">{value}</p>
    </div>
  );
}

function SensorResultBadges({ row }: { row: SessionRow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <SmallSensorBadge label="S1" result={row.sensor1_result} />
      <SmallSensorBadge label="S2" result={row.sensor2_result} />
      <SmallSensorBadge label="S3" result={row.sensor3_result} />
    </div>
  );
}

function SmallSensorBadge({ label, result }: { label: string; result?: string | null }) {
  const normalized = result || "-";
  const className =
    normalized === "OK"
      ? "bg-emerald-400 text-slate-950"
      : normalized === "NG"
      ? "bg-red-400 text-slate-950"
      : "bg-slate-700 text-slate-300";

  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${className}`}>
      {label} {normalized}
    </span>
  );
}

function ResultBadge({ result, large = false }: { result: string | null; large?: boolean }) {
  const label = result || "대기";
  const className =
    result === "OK"
      ? "bg-emerald-400 text-slate-950"
      : result === "NG"
      ? "bg-red-400 text-slate-950"
      : "bg-yellow-400 text-slate-950";

  return (
    <span
      className={`inline-flex items-center rounded-full font-black ${className} ${
        large ? "px-4 py-2 text-sm" : "px-3 py-1 text-xs"
      }`}
    >
      {label}
    </span>
  );
}

function DefectText({ value }: { value?: string | null }) {
  const text = value && value.trim().length > 0 ? value : "-";
  const isEmpty = text === "-" || text === "예상 불량 없음";

  return (
    <span className={isEmpty ? "text-slate-400" : "font-bold text-red-300"}>
      {text}
    </span>
  );
}

function EmptyState({
  title,
  description,
  danger = false,
}: {
  title: string;
  description: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-8 text-center ${
        danger
          ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-slate-800 bg-slate-950 text-slate-400"
      }`}
    >
      <p className="font-bold">{title}</p>
      <p className="mt-2 text-sm">{description}</p>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "-";
  }

  return Number(value).toFixed(1);
}

function formatSimilarity(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "-";
  }

  return `${(Number(value) * 100).toFixed(1)}%`;
}
