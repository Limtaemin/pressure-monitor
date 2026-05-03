"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getReferenceCurve } from "@/lib/referenceCurve";
import PressureMonitorPanel from "@/components/PressureMonitorPanel";

const TEST_MODE = true;

type SensorData = {
  id?: string;
  machine_id: string;
  session_id: string;
  sensor1: number | null;
  sensor2: number | null;
  sensor3: number | null;
  elapsed_ms: number;
  created_at?: string;
};

type ReferencePoint = {
  time_ms: number;
  pressure: number;
};

type MeasurementSession = {
  id: string;
  machine_id: string;
  started_at: string | null;
  ended_at: string | null;
  result: string | null;
  avg_pressure: number | null;
  max_pressure: number | null;
  final_pressure: number | null;
  pressure_drop: number | null;
};

type ActualPoint = {
  time_ms: number;
  pressure: number;
};

export default function AnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const machineId = params.machineId as string;
  const querySessionId = searchParams.get("sessionId");

  const [session, setSession] = useState<MeasurementSession | null>(null);
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [referenceCurve, setReferenceCurve] = useState<ReferencePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!machineId) return;
    loadAnalysisData();
  }, [machineId, querySessionId]);

  async function loadAnalysisData() {
    setLoading(true);
    setErrorMessage("");

    try {
      console.log("[Analysis] machineId:", machineId);
      console.log("[Analysis] querySessionId:", querySessionId);

      const targetSession = await loadTargetSession();

      if (!targetSession) {
        setSession(null);
        setSensorData([]);
        setReferenceCurve([]);
        setErrorMessage("분석할 측정 세션을 찾지 못했습니다.");
        setLoading(false);
        return;
      }

      console.log("[Analysis] targetSession:", targetSession);

      setSession(targetSession);

      const { data: sensorRows, error: sensorError } = await supabase
        .from("sensor_data")
        .select("*")
        .eq("machine_id", machineId)
        .eq("session_id", targetSession.id)
        .order("elapsed_ms", { ascending: true });

      if (sensorError) {
        console.error("[Analysis] sensor_data fetch error:", sensorError);
        throw new Error("센서 데이터를 불러오지 못했습니다.");
      }

      let actualRows = sensorRows || [];

      if (TEST_MODE && actualRows.length === 0) {
        console.warn("[Analysis] sensor_data empty. TEST_MODE data generated.");
        actualRows = createTestSensorData(machineId, targetSession.id);
      }

      console.log("[Analysis] sensor rows:", actualRows.length);
      setSensorData(actualRows);

      const ref = await getReferenceCurve(machineId);

      console.log("[Analysis] reference rows:", ref.length);
      console.log("[Analysis] reference data:", ref);

      setReferenceCurve(ref);
    } catch (error) {
      console.error("[Analysis] load error:", error);
      setErrorMessage("분석 데이터를 불러오는 중 오류가 발생했습니다.");
    }

    setLoading(false);
  }

  async function loadTargetSession() {
    if (querySessionId) {
      const { data, error } = await supabase
        .from("measurement_sessions")
        .select("*")
        .eq("machine_id", machineId)
        .eq("id", querySessionId)
        .single();

      if (error) {
        console.error("[Analysis] specific session fetch error:", error);
        return null;
      }

      return data as MeasurementSession;
    }

    const { data, error } = await supabase
      .from("measurement_sessions")
      .select("*")
      .eq("machine_id", machineId)
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("[Analysis] latest session fetch error:", error);
      return null;
    }

    return data as MeasurementSession;
  }

  const actualCurve = useMemo<ActualPoint[]>(() => {
    return sensorData.map((row) => {
      const s1 = row.sensor1 ?? 0;
      const s2 = row.sensor2 ?? 0;
      const s3 = row.sensor3 ?? 0;

      return {
        time_ms: row.elapsed_ms,
        pressure: (s1 + s2 + s3) / 3,
      };
    });
  }, [sensorData]);

  const analysisResult = useMemo(() => {
    if (actualCurve.length === 0) {
      return {
        result: "미판정",
        avgPressure: 0,
        maxPressure: 0,
        finalPressure: 0,
        pressureDrop: 0,
        reasons: ["센서 데이터가 없습니다."],
      };
    }

    const pressures = actualCurve.map((point) => point.pressure);
    const avgPressure =
      pressures.reduce((sum, value) => sum + value, 0) / pressures.length;
    const maxPressure = Math.max(...pressures);
    const finalPressure = pressures[pressures.length - 1];
    const pressureDrop = maxPressure - finalPressure;

    const reasons: string[] = [];

    if (maxPressure < 200) {
      reasons.push("최대 압력이 200 미만입니다.");
    }

    if (finalPressure < 150) {
      reasons.push("최종 압력이 150 미만입니다.");
    }

    if (pressureDrop > 120) {
      reasons.push("최대 압력 대비 최종 압력 낙차가 120을 초과했습니다.");
    }

    return {
      result: reasons.length > 0 ? "NG" : "OK",
      avgPressure,
      maxPressure,
      finalPressure,
      pressureDrop,
      reasons:
        reasons.length > 0
          ? reasons
          : ["현재 기본 EO 판정 기준을 만족했습니다."],
    };
  }, [actualCurve]);

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

  function createTestSensorData(
    machineIdValue: string,
    sessionIdValue: string
  ): SensorData[] {
    const rows: SensorData[] = [];

    for (let t = 0; t <= 40000; t += 1000) {
      let basePressure = 0;

      if (t < 5000) {
        basePressure = 40 + t * 0.05;
      } else if (t < 28000) {
        basePressure = 300 + Math.sin(t / 3000) * 20;
      } else {
        basePressure = Math.max(160, 300 - (t - 28000) * 0.01);
      }

      rows.push({
        machine_id: machineIdValue,
        session_id: sessionIdValue,
        elapsed_ms: t,
        sensor1: basePressure + Math.random() * 15,
        sensor2: basePressure + Math.random() * 15,
        sensor3: basePressure + Math.random() * 15,
      });
    }

    return rows;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white px-6 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-cyan-300 mb-2">Machine ID: {machineId}</p>
            <h1 className="text-3xl font-bold">EO 판정 분석</h1>
            <p className="text-slate-400 mt-2">
              실제 측정 곡선과 DB에 저장된 기준 보압 곡선을 비교합니다.
            </p>

            {session && (
              <div className="mt-3 text-sm text-slate-400">
                <p>Session ID: {session.id}</p>
                <p>측정 시작: {formatDate(session.started_at)}</p>
                <p>측정 종료: {formatDate(session.ended_at)}</p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() =>
                router.push(`/machines/${machineId}/dashboard/history`)
              }
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              이력 보기
            </button>

            <button
              onClick={() => router.push(`/machines/${machineId}/dashboard`)}
              className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400"
            >
              대시보드
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
            분석 데이터를 불러오는 중...
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-8 text-center text-red-300">
            {errorMessage}
          </div>
        ) : (
          <>
            {referenceCurve.length === 0 && (
              <div className="mb-6 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-5 text-yellow-200">
                <p className="font-bold">기준 보압 곡선 데이터가 없습니다.</p>
                <p className="mt-2 text-sm text-yellow-100/80">
                  현재 machine_id는 <b>{machineId}</b> 입니다. Supabase의
                  reference_curves 테이블에 machine_id가 정확히{" "}
                  <b>{machineId}</b> 인 데이터가 있어야 노란 기준선이 표시됩니다.
                </p>
              </div>
            )}

            <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">판정 결과</p>
                <p
                  className={[
                    "mt-2 text-4xl font-black",
                    analysisResult.result === "OK"
                      ? "text-emerald-400"
                      : analysisResult.result === "NG"
                      ? "text-red-400"
                      : "text-slate-300",
                  ].join(" ")}
                >
                  {analysisResult.result}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">평균 압력</p>
                <p className="mt-2 text-3xl font-bold text-cyan-300">
                  {analysisResult.avgPressure.toFixed(1)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">최대 압력</p>
                <p className="mt-2 text-3xl font-bold text-cyan-300">
                  {analysisResult.maxPressure.toFixed(1)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">압력 낙차</p>
                <p className="mt-2 text-3xl font-bold text-cyan-300">
                  {analysisResult.pressureDrop.toFixed(1)}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 mb-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">보압 곡선 비교</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    하늘색: 실제 측정 데이터 / 노란색 점선: DB 기준 보압 곡선
                  </p>
                </div>

                <div className="text-xs text-slate-500">
                  X축 고정: 0~40000ms / Y축 고정: 0~700
                </div>
              </div>

              <PressureSvgChart
                actualCurve={actualCurve}
                referenceCurve={referenceCurve}
              />
              <div className="mt-8">
                {session && (
                    <PressureMonitorPanel
                    machineId={machineId}
                    sessionId={session.id}
                    />
                )}
                </div>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-xl font-bold mb-4">판정 사유</h2>

                <ul className="space-y-3">
                  {analysisResult.reasons.map((reason, index) => (
                    <li
                      key={index}
                      className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300"
                    >
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-xl font-bold mb-4">데이터 상태</h2>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">센서 데이터 개수</span>
                    <span className="text-slate-200">{sensorData.length}개</span>
                  </div>

                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">기준 곡선 데이터 개수</span>
                    <span
                      className={
                        referenceCurve.length > 0
                          ? "text-yellow-300 font-bold"
                          : "text-red-300 font-bold"
                      }
                    >
                      {referenceCurve.length}개
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">TEST_MODE</span>
                    <span
                      className={
                        TEST_MODE
                          ? "text-yellow-300 font-bold"
                          : "text-emerald-300"
                      }
                    >
                      {TEST_MODE ? "ON" : "OFF"}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">분석 session</span>
                    <span className="text-slate-200">
                      {querySessionId ? "history 선택 세션" : "최신 세션"}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function PressureSvgChart({
  actualCurve,
  referenceCurve,
}: {
  actualCurve: ActualPoint[];
  referenceCurve: ReferencePoint[];
}) {
  const width = 1000;
  const height = 420;

  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 20;
  const paddingBottom = 45;

  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const minTime = 0;
  const maxTime = 40000;
  const minPressure = 0;
  const maxPressure = 700;

  function xScale(timeMs: number) {
    return (
      paddingLeft +
      ((timeMs - minTime) / (maxTime - minTime)) * plotWidth
    );
  }

  function yScale(pressure: number) {
    return (
      paddingTop +
      (1 - (pressure - minPressure) / (maxPressure - minPressure)) *
        plotHeight
    );
  }

  function makePolyline(points: { time_ms: number; pressure: number }[]) {
    return points
      .filter(
        (point) =>
          Number.isFinite(point.time_ms) &&
          Number.isFinite(point.pressure) &&
          point.time_ms >= minTime &&
          point.time_ms <= maxTime
      )
      .map((point) => `${xScale(point.time_ms)},${yScale(point.pressure)}`)
      .join(" ");
  }

  const actualPolyline = makePolyline(actualCurve);
  const referencePolyline = makePolyline(referenceCurve);

  const xTicks = [
    0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000,
  ];

  const yTicks = [0, 100, 200, 300, 400, 500, 600, 700];

  return (
    <div className="w-full overflow-x-auto rounded-xl bg-slate-950 p-4">
      <svg
        width="100%"
        height="420"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block min-w-[900px]"
      >
        <rect x="0" y="0" width={width} height={height} fill="#020617" />

        {yTicks.map((tick) => {
          const y = yScale(tick);

          return (
            <g key={`y-${tick}`}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                stroke="#1e293b"
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 12}
                y={y + 4}
                textAnchor="end"
                fontSize="12"
                fill="#94a3b8"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => {
          const x = xScale(tick);

          return (
            <g key={`x-${tick}`}>
              <line
                x1={x}
                y1={paddingTop}
                x2={x}
                y2={height - paddingBottom}
                stroke="#1e293b"
                strokeWidth="1"
              />
              <text
                x={x}
                y={height - 15}
                textAnchor="middle"
                fontSize="12"
                fill="#94a3b8"
              >
                {tick / 1000}s
              </text>
            </g>
          );
        })}

        <line
          x1={paddingLeft}
          y1={height - paddingBottom}
          x2={width - paddingRight}
          y2={height - paddingBottom}
          stroke="#64748b"
          strokeWidth="2"
        />

        <line
          x1={paddingLeft}
          y1={paddingTop}
          x2={paddingLeft}
          y2={height - paddingBottom}
          stroke="#64748b"
          strokeWidth="2"
        />

        {referencePolyline && (
          <polyline
            points={referencePolyline}
            fill="none"
            stroke="#facc15"
            strokeWidth="4"
            strokeDasharray="10 8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {actualPolyline && (
          <polyline
            points={actualPolyline}
            fill="none"
            stroke="#22d3ee"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        <text x={paddingLeft} y="18" fontSize="13" fill="#22d3ee">
          actual
        </text>

        <text x={paddingLeft + 80} y="18" fontSize="13" fill="#facc15">
          reference
        </text>
      </svg>

      <div className="mt-3 flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1 w-8 rounded bg-cyan-300" />
          <span className="text-slate-300">actual</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-block h-1 w-8 rounded bg-yellow-300" />
          <span className="text-slate-300">reference</span>
        </div>
      </div>
    </div>
  );
}