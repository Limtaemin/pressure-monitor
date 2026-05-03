"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
};

export default function HistoryPage() {
  const params = useParams();
  const router = useRouter();
  const machineId = String(params.machineId);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSessions() {
      setLoading(true);

      const { data, error } = await supabase
        .from("measurement_sessions")
        .select("*")
        .eq("machine_id", machineId)
        .order("id", { ascending: false });

      if (error) {
        console.error("이력 불러오기 실패:", error);
        setSessions([]);
      } else {
        setSessions(data ?? []);
      }

      setLoading(false);
    }

    loadSessions();
  }, [machineId]);

  const goToAnalysis = (sessionId: number) => {
    router.push(`/machines/${machineId}/dashboard/analysis?sessionId=${sessionId}`);
  };

  return (
    <main className="min-h-screen bg-[#050817] px-4 py-4 text-white md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold md:text-3xl">과거 보압 기록</h1>
          <p className="mt-2 text-sm text-slate-400">
            현재 사출기: {machineId}
          </p>
        </div>

        <div className="mb-8 flex gap-3 overflow-x-auto pb-2 whitespace-nowrap">
          <Link
            href={`/machines/${machineId}/dashboard`}
            className="rounded-xl bg-slate-800 px-5 py-3 font-bold hover:bg-slate-700"
          >
            실시간 측정
          </Link>

          <Link
            href={`/machines/${machineId}/dashboard/analysis`}
            className="rounded-xl bg-slate-800 px-5 py-3 font-bold hover:bg-slate-700"
          >
            EO 판정
          </Link>

          <Link
            href={`/machines/${machineId}/dashboard/history`}
            className="rounded-xl bg-blue-600 px-5 py-3 font-bold"
          >
            과거 기록
          </Link>
        </div>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4 md:p-6">
          <h2 className="mb-5 text-2xl font-bold">측정 세션 기록</h2>

          {loading ? (
            <p className="text-slate-400">불러오는 중...</p>
          ) : sessions.length === 0 ? (
            <p className="text-slate-400">저장된 측정 기록이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-slate-400">
                    <th className="py-3">세션 ID</th>
                    <th className="py-3">시작 시간</th>
                    <th className="py-3">종료 시간</th>
                    <th className="py-3">판정</th>
                    <th className="py-3">평균 압력</th>
                    <th className="py-3">최대 압력</th>
                    <th className="py-3">최종 압력</th>
                    <th className="py-3">하강량</th>
                    <th className="py-3">상세</th>
                  </tr>
                </thead>

                <tbody>
                  {sessions.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => goToAnalysis(row.id)}
                      className="cursor-pointer border-b border-slate-800 hover:bg-slate-800/80"
                    >
                      <td className="py-3 font-bold">{row.id}</td>

                      <td className="py-3">
                        {row.started_at
                          ? new Date(row.started_at).toLocaleString("ko-KR")
                          : "-"}
                      </td>

                      <td className="py-3">
                        {row.ended_at
                          ? new Date(row.ended_at).toLocaleString("ko-KR")
                          : "측정 중"}
                      </td>

                      <td
                        className={`py-3 font-bold ${
                          row.result === "NG"
                            ? "text-red-400"
                            : row.result === "OK"
                            ? "text-green-400"
                            : "text-slate-400"
                        }`}
                      >
                        {row.result ?? "대기"}
                      </td>

                      <td className="py-3">
                        {row.avg_pressure !== null
                          ? Number(row.avg_pressure).toFixed(1)
                          : "-"}
                      </td>

                      <td className="py-3">
                        {row.max_pressure !== null
                          ? Number(row.max_pressure).toFixed(1)
                          : "-"}
                      </td>

                      <td className="py-3">
                        {row.final_pressure !== null
                          ? Number(row.final_pressure).toFixed(1)
                          : "-"}
                      </td>

                      <td className="py-3">
                        {row.pressure_drop !== null
                          ? Number(row.pressure_drop).toFixed(1)
                          : "-"}
                      </td>

                      <td className="py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            goToAnalysis(row.id);
                          }}
                          className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
                        >
                          그래프 보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}