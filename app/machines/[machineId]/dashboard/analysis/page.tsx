"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getReferenceCurve } from "@/lib/referenceCurve";
import PressureMonitorPanel from "@/components/PressureMonitorPanel";
import { analyzeEOQuality } from "@/lib/eoAnalysis";
import {
  REFERENCE_PROFILES,
  getReferenceProfile,
} from "@/lib/referenceProfiles";
import { analyzeDefects } from "@/lib/defectMapping";

const TEST_MODE = true;

type SensorKey = "sensor1" | "sensor2" | "sensor3";
type SelectedSensor = "all" | SensorKey;

const SENSOR_LIMITS = {
  sensor1: {
    label: "Sensor 1",
    minMaxPressure: 450,
    minFinalPressure: 200,
    maxPressureDrop: 400,
    minSimilarity: 0.8,
  },
  sensor2: {
    label: "Sensor 2",
    minMaxPressure: 650,
    minFinalPressure: 300,
    maxPressureDrop: 500,
    minSimilarity: 0.8,
  },
  sensor3: {
    label: "Sensor 3",
    minMaxPressure: 450,
    minFinalPressure: 200,
    maxPressureDrop: 400,
    minSimilarity: 0.8,
  },
};

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
  sensor1: number;
  sensor2: number;
  sensor3: number;
  avg: number;
};

type SensorJudgementItem = {
  label: string;
  maxPressure: number;
  finalPressure: number;
  pressureDrop: number;
  similarity: number;
  holdAvgPressure: number;
  referenceHoldAvgPressure: number;
  holdArea: number;
  referenceHoldArea: number;
  decaySlope: number;
  referenceDecaySlope: number;
  isOk: boolean;
};

type SensorJudgement = Record<SensorKey, SensorJudgementItem>;

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
  const [selectedSensor, setSelectedSensor] = useState<SelectedSensor>("all");
  const [selectedResultSensor, setSelectedResultSensor] =
    useState<SensorKey>("sensor1");
  const [selectedProfileId, setSelectedProfileId] = useState(
    REFERENCE_PROFILES[0].id
  );

  const selectedProfile = getReferenceProfile(selectedProfileId);

  useEffect(() => {
    if (!machineId) return;
    loadAnalysisData();
  }, [machineId, querySessionId, selectedProfileId]);

  async function loadAnalysisData() {
    setLoading(true);
    setErrorMessage("");

    try {
      const targetSession = await loadTargetSession();

      if (!targetSession) {
        setSession(null);
        setSensorData([]);
        setReferenceCurve([]);
        setErrorMessage("분석할 측정 세션을 찾지 못했습니다.");
        setLoading(false);
        return;
      }

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
        actualRows = createTestSensorData(machineId, targetSession.id);
      }

      setSensorData(actualRows);

      const ref = await getReferenceCurve(machineId, selectedProfileId);
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
        sensor1: s1,
        sensor2: s2,
        sensor3: s3,
        avg: (s1 + s2 + s3) / 3,
      };
    });
  }, [sensorData]);

  const analysisResult = useMemo(() => {
    const emptySensorJudgement: SensorJudgement = {
      sensor1: {
        label: "Sensor 1",
        maxPressure: 0,
        finalPressure: 0,
        pressureDrop: 0,
        similarity: 0,
        holdAvgPressure: 0,
        referenceHoldAvgPressure: 0,
        holdArea: 0,
        referenceHoldArea: 0,
        decaySlope: 0,
        referenceDecaySlope: 0,
        isOk: false,
      },
      sensor2: {
        label: "Sensor 2",
        maxPressure: 0,
        finalPressure: 0,
        pressureDrop: 0,
        similarity: 0,
        holdAvgPressure: 0,
        referenceHoldAvgPressure: 0,
        holdArea: 0,
        referenceHoldArea: 0,
        decaySlope: 0,
        referenceDecaySlope: 0,
        isOk: false,
      },
      sensor3: {
        label: "Sensor 3",
        maxPressure: 0,
        finalPressure: 0,
        pressureDrop: 0,
        similarity: 0,
        holdAvgPressure: 0,
        referenceHoldAvgPressure: 0,
        holdArea: 0,
        referenceHoldArea: 0,
        decaySlope: 0,
        referenceDecaySlope: 0,
        isOk: false,
      },
    };

    if (actualCurve.length === 0) {
      return {
        result: "미판정",
        avgPressure: 0,
        maxPressure: 0,
        finalPressure: 0,
        pressureDrop: 0,
        sensorJudgement: emptySensorJudgement,
        defects: {
          sensor1: { causes: [], defects: [] },
          sensor2: { causes: [], defects: [] },
          sensor3: { causes: [], defects: [] },
        },
        reasons: ["센서 데이터가 없습니다."],
      };
    }

    const eoInputData = actualCurve.map((point) => ({
      elapsed_ms: point.time_ms,
      sensor1: point.sensor1,
      sensor2: point.sensor2,
      sensor3: point.sensor3,
    }));

    const eoResult = analyzeEOQuality(
      eoInputData,
      referenceCurve,
      selectedProfile
    );

    const pressures = actualCurve.map((point) => point.avg);
    const avgPressure =
      pressures.reduce((sum, value) => sum + value, 0) / pressures.length;
    const maxPressure = Math.max(...pressures);
    const finalPressure = pressures[pressures.length - 1];
    const pressureDrop = maxPressure - finalPressure;

    const sensorJudgement: SensorJudgement = {
      sensor1: {
        label: SENSOR_LIMITS.sensor1.label,
        maxPressure: eoResult.sensorJudgement.sensor1.maxPressure,
        finalPressure: eoResult.sensorJudgement.sensor1.finalPressure,
        pressureDrop: eoResult.sensorJudgement.sensor1.pressureDrop,
        similarity: eoResult.sensorJudgement.sensor1.similarity,
        holdAvgPressure: eoResult.sensorJudgement.sensor1.holdAvgPressure,
        referenceHoldAvgPressure:
          eoResult.sensorJudgement.sensor1.referenceHoldAvgPressure,
        holdArea: eoResult.sensorJudgement.sensor1.holdArea,
        referenceHoldArea: eoResult.sensorJudgement.sensor1.referenceHoldArea,
        decaySlope: eoResult.sensorJudgement.sensor1.decaySlope,
        referenceDecaySlope:
          eoResult.sensorJudgement.sensor1.referenceDecaySlope,
        isOk: eoResult.sensorJudgement.sensor1.result === "OK",
      },
      sensor2: {
        label: SENSOR_LIMITS.sensor2.label,
        maxPressure: eoResult.sensorJudgement.sensor2.maxPressure,
        finalPressure: eoResult.sensorJudgement.sensor2.finalPressure,
        pressureDrop: eoResult.sensorJudgement.sensor2.pressureDrop,
        similarity: eoResult.sensorJudgement.sensor2.similarity,
        holdAvgPressure: eoResult.sensorJudgement.sensor2.holdAvgPressure,
        referenceHoldAvgPressure:
          eoResult.sensorJudgement.sensor2.referenceHoldAvgPressure,
        holdArea: eoResult.sensorJudgement.sensor2.holdArea,
        referenceHoldArea: eoResult.sensorJudgement.sensor2.referenceHoldArea,
        decaySlope: eoResult.sensorJudgement.sensor2.decaySlope,
        referenceDecaySlope:
          eoResult.sensorJudgement.sensor2.referenceDecaySlope,
        isOk: eoResult.sensorJudgement.sensor2.result === "OK",
      },
      sensor3: {
        label: SENSOR_LIMITS.sensor3.label,
        maxPressure: eoResult.sensorJudgement.sensor3.maxPressure,
        finalPressure: eoResult.sensorJudgement.sensor3.finalPressure,
        pressureDrop: eoResult.sensorJudgement.sensor3.pressureDrop,
        similarity: eoResult.sensorJudgement.sensor3.similarity,
        holdAvgPressure: eoResult.sensorJudgement.sensor3.holdAvgPressure,
        referenceHoldAvgPressure:
          eoResult.sensorJudgement.sensor3.referenceHoldAvgPressure,
        holdArea: eoResult.sensorJudgement.sensor3.holdArea,
        referenceHoldArea: eoResult.sensorJudgement.sensor3.referenceHoldArea,
        decaySlope: eoResult.sensorJudgement.sensor3.decaySlope,
        referenceDecaySlope:
          eoResult.sensorJudgement.sensor3.referenceDecaySlope,
        isOk: eoResult.sensorJudgement.sensor3.result === "OK",
      },
    };

    const reasons = [
      ...eoResult.sensorJudgement.sensor1.reasons.map(
        (reason) => `Sensor 1: ${reason}`
      ),
      ...eoResult.sensorJudgement.sensor2.reasons.map(
        (reason) => `Sensor 2: ${reason}`
      ),
      ...eoResult.sensorJudgement.sensor3.reasons.map(
        (reason) => `Sensor 3: ${reason}`
      ),
    ];

    const defectResults = {
      sensor1: analyzeDefects(eoResult.sensorJudgement.sensor1, selectedProfile),
      sensor2: analyzeDefects(eoResult.sensorJudgement.sensor2, selectedProfile),
      sensor3: analyzeDefects(eoResult.sensorJudgement.sensor3, selectedProfile),
    };

    return {
      result: eoResult.result,
      avgPressure,
      maxPressure,
      finalPressure,
      pressureDrop,
      sensorJudgement,
      defects: defectResults,
      reasons:
        reasons.length > 0
          ? reasons
          : ["모든 센서가 기준 보압 곡선과 정상 범위 안에 있습니다."],
    };
  }, [actualCurve, referenceCurve, selectedProfileId]);

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
    <main className="min-h-screen bg-slate-950 px-4 py-4 text-white md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="mb-2 text-sm text-cyan-300">Machine ID: {machineId}</p>
            <h1 className="text-2xl font-bold md:text-3xl">EO 판정 분석</h1>
            <p className="mt-2 text-slate-400">
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

          <div className="flex flex-wrap gap-2">
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
            <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-3 text-lg font-bold">
                Reference Profile 선택
              </h2>

              <div className="flex flex-wrap gap-2">
                {REFERENCE_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => setSelectedProfileId(profile.id)}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${
                      selectedProfileId === profile.id
                        ? "bg-cyan-500 text-slate-950"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {profile.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 text-sm text-slate-400">
                {selectedProfile.description}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-slate-500">유사도 기준</p>
                  <p className="mt-1 font-bold text-cyan-300">
                    {(selectedProfile.criteria.minSimilarity * 100).toFixed(0)}%
                    이상
                  </p>
                </div>

                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-slate-500">보압 면적 기준</p>
                  <p className="mt-1 font-bold text-cyan-300">
                    {(
                      selectedProfile.criteria.minHoldAreaRatio * 100
                    ).toFixed(0)}
                    % 이상
                  </p>
                </div>

                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-slate-500">감소 기울기 기준</p>
                  <p className="mt-1 font-bold text-cyan-300">
                    {selectedProfile.criteria.maxDecaySlopeRatio.toFixed(2)}배
                    이하
                  </p>
                </div>

                <div className="rounded-xl bg-slate-950 p-3">
                  <p className="text-slate-500">과보압 판정</p>
                  <p className="mt-1 font-bold text-cyan-300">
                    {selectedProfile.criteria.overPackingEnabled
                      ? "활성"
                      : "비활성"}
                  </p>
                </div>
              </div>
            </section>

            {referenceCurve.length === 0 && (
              <div className="mb-6 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-5 text-yellow-200">
                <p className="font-bold">기준 보압 곡선 데이터가 없습니다.</p>
                <p className="mt-2 text-sm text-yellow-100/80">
                  현재 machine_id는 <b>{machineId}</b>, profile_id는{" "}
                  <b>{selectedProfileId}</b> 입니다. Supabase의
                  reference_curves 테이블에 이 조합의 데이터가 있어야 합니다.
                </p>
              </div>
            )}

            <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">전체 판정 결과</p>
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
                <p className="text-sm text-slate-400">평균 최대 압력</p>
                <p className="mt-2 text-3xl font-bold text-cyan-300">
                  {analysisResult.maxPressure.toFixed(1)}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                <p className="text-sm text-slate-400">평균 압력 낙차</p>
                <p className="mt-2 text-3xl font-bold text-cyan-300">
                  {analysisResult.pressureDrop.toFixed(1)}
                </p>
              </div>
            </section>

            <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:p-6">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-bold">보압 곡선 비교</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    센서별 실제 측정 데이터와 선택된 Reference Profile 기준곡선을
                    비교합니다.
                  </p>
                </div>

                <div className="text-xs text-slate-500">
                  X축: 0~40초 / Y축: 0~2000
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  { key: "all", label: "전체" },
                  { key: "sensor1", label: "Sensor 1" },
                  { key: "sensor2", label: "Sensor 2" },
                  { key: "sensor3", label: "Sensor 3" },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedSensor(item.key as SelectedSensor)}
                    className={`rounded-xl px-4 py-2 text-sm font-bold ${
                      selectedSensor === item.key
                        ? "bg-cyan-500 text-slate-950"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <PressureSvgChart
                actualCurve={actualCurve}
                referenceCurve={referenceCurve}
                selectedSensor={selectedSensor}
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

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold">센서별 판정 요약</h2>
                </div>

                <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl bg-slate-950 p-2">
                  {(["sensor1", "sensor2", "sensor3"] as const).map((key) => {
                    const judgement = analysisResult.sensorJudgement[key];

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedResultSensor(key)}
                        className={`rounded-xl px-3 py-3 text-sm font-bold transition ${
                          selectedResultSensor === key
                            ? judgement.isOk
                              ? "bg-emerald-400 text-slate-950"
                              : "bg-red-400 text-slate-950"
                            : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {judgement.label}
                      </button>
                    );
                  })}
                </div>

                {(() => {
                  const key = selectedResultSensor;
                  const judgement = analysisResult.sensorJudgement[key];

                  const sensorReasons = analysisResult.reasons.filter((reason) =>
                    reason.startsWith(
                      key === "sensor1"
                        ? "Sensor 1"
                        : key === "sensor2"
                        ? "Sensor 2"
                        : "Sensor 3"
                    )
                  );

                  const defects = analysisResult.defects[key].defects;

                  return (
                    <div
                      className={`rounded-2xl border p-4 ${
                        judgement.isOk
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : "border-red-500/30 bg-red-500/10"
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-bold text-white">
                          {judgement.label}
                        </h3>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${
                            judgement.isOk
                              ? "bg-emerald-400 text-slate-950"
                              : "bg-red-400 text-slate-950"
                          }`}
                        >
                          {judgement.isOk ? "OK" : "NG"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                        <MetricCard
                          label="유사도"
                          value={`${(judgement.similarity * 100).toFixed(1)}%`}
                        />
                        <MetricCard
                          label="보압 평균"
                          value={judgement.holdAvgPressure.toFixed(1)}
                        />
                        <MetricCard
                          label="보압 면적"
                          value={judgement.holdArea.toFixed(0)}
                        />
                        <MetricCard
                          label="최대 압력"
                          value={judgement.maxPressure.toFixed(1)}
                        />
                        <MetricCard
                          label="최종 압력"
                          value={judgement.finalPressure.toFixed(1)}
                        />
                        <MetricCard
                          label="감소 기울기"
                          value={judgement.decaySlope.toFixed(2)}
                        />
                      </div>

                      <div className="mt-4">
                        <p className="mb-2 text-sm font-bold text-slate-300">
                          판정 사유
                        </p>

                        {sensorReasons.length > 0 ? (
                          <ul className="space-y-2">
                            {sensorReasons.map((reason, index) => (
                              <li
                                key={index}
                                className="rounded-xl bg-slate-950/80 px-3 py-2 text-xs text-slate-300"
                              >
                                {reason.replace(/^Sensor [123]: /, "")}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="rounded-xl bg-slate-950/80 px-3 py-2 text-xs text-emerald-300">
                            기준 범위 안에 있습니다.
                          </p>
                        )}
                      </div>

                      <div className="mt-4">
                        <p className="mb-2 text-sm font-bold text-red-300">
                          예상 불량
                        </p>

                        {defects.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {defects.map((defect, index) => (
                              <span
                                key={index}
                                className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-300"
                              >
                                {defect}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-xl bg-slate-950/80 px-3 py-2 text-xs text-emerald-300">
                            예상 불량 없음
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="mb-4 text-xl font-bold">데이터 상태</h2>

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
                          ? "font-bold text-yellow-300"
                          : "font-bold text-red-300"
                      }
                    >
                      {referenceCurve.length}개
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">Reference Profile</span>
                    <span className="text-right font-bold text-cyan-300">
                      {selectedProfile.label}
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">profile_id</span>
                    <span className="text-right text-slate-200">
                      {selectedProfileId}
                    </span>
                  </div>

                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-400">TEST_MODE</span>
                    <span
                      className={
                        TEST_MODE
                          ? "font-bold text-yellow-300"
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-950/70 p-3">
      <p className="text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-cyan-300">{value}</p>
    </div>
  );
}

function PressureSvgChart({
  actualCurve,
  referenceCurve,
  selectedSensor,
}: {
  actualCurve: ActualPoint[];
  referenceCurve: ReferencePoint[];
  selectedSensor: SelectedSensor;
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
  const maxPressure = 2000;

  function xScale(timeMs: number) {
    return paddingLeft + ((timeMs - minTime) / (maxTime - minTime)) * plotWidth;
  }

  function yScale(pressure: number) {
    return (
      paddingTop +
      (1 - (pressure - minPressure) / (maxPressure - minPressure)) * plotHeight
    );
  }

  function makeActualPolyline(sensorKey: SensorKey) {
    return actualCurve
      .filter(
        (point) =>
          Number.isFinite(point.time_ms) &&
          Number.isFinite(point[sensorKey]) &&
          point.time_ms >= minTime &&
          point.time_ms <= maxTime
      )
      .map((point) => `${xScale(point.time_ms)},${yScale(point[sensorKey])}`)
      .join(" ");
  }

  function makeReferencePolyline(points: ReferencePoint[]) {
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

  const sensor1Polyline = makeActualPolyline("sensor1");
  const sensor2Polyline = makeActualPolyline("sensor2");
  const sensor3Polyline = makeActualPolyline("sensor3");
  const referencePolyline = makeReferencePolyline(referenceCurve);

  const xTicks = [
    0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000,
  ];

  const yTicks = [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];

  function lineStyle(sensorKey: SensorKey) {
    const active = selectedSensor === "all" || selectedSensor === sensorKey;

    return {
      strokeWidth: active ? 5 : 2,
      opacity: active ? 1 : 0.2,
    };
  }

  return (
    <div className="w-full rounded-xl bg-slate-950 p-2 md:p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full"
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

        {sensor1Polyline && (
          <polyline
            points={sensor1Polyline}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={lineStyle("sensor1").strokeWidth}
            opacity={lineStyle("sensor1").opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {sensor2Polyline && (
          <polyline
            points={sensor2Polyline}
            fill="none"
            stroke="#a78bfa"
            strokeWidth={lineStyle("sensor2").strokeWidth}
            opacity={lineStyle("sensor2").opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {sensor3Polyline && (
          <polyline
            points={sensor3Polyline}
            fill="none"
            stroke="#34d399"
            strokeWidth={lineStyle("sensor3").strokeWidth}
            opacity={lineStyle("sensor3").opacity}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        <text x={paddingLeft} y="18" fontSize="13" fill="#22d3ee">
          Sensor 1
        </text>

        <text x={paddingLeft + 85} y="18" fontSize="13" fill="#a78bfa">
          Sensor 2
        </text>

        <text x={paddingLeft + 170} y="18" fontSize="13" fill="#34d399">
          Sensor 3
        </text>

        <text x={paddingLeft + 255} y="18" fontSize="13" fill="#facc15">
          reference
        </text>
      </svg>

      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1 w-8 rounded bg-cyan-300" />
          <span className="text-slate-300">Sensor 1</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-block h-1 w-8 rounded bg-violet-300" />
          <span className="text-slate-300">Sensor 2</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-block h-1 w-8 rounded bg-emerald-300" />
          <span className="text-slate-300">Sensor 3</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-block h-1 w-8 rounded bg-yellow-300" />
          <span className="text-slate-300">reference</span>
        </div>
      </div>
    </div>
  );
}