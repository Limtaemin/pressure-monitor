// PATH: app/machines/[machineId]/dashboard/analysis/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getReferenceCurve, getReferenceCurves } from "@/lib/referenceCurve";
import PressureMonitorPanel from "@/components/PressureMonitorPanel";
import { analyzeEOQuality } from "@/lib/eoAnalysis";
import {
  REFERENCE_PROFILES,
  getReferenceProfile,
} from "@/lib/referenceProfiles";
import { analyzeDefects } from "@/lib/defectMapping";
import DashboardNav from "@/components/DashboardNav";
import AppButton from "@/components/AppButton";
import SectionCard from "@/components/SectionCard";

const TEST_MODE = false;

// true면 Supabase의 실제 sensor_data를 무시하고,
// 아래 MOCK_ACTUAL_CURVE_POINTS 모양대로 실제 측정 곡선을 강제로 그립니다.
// 테스트 끝나면 false로 바꾸면 실제 DB 데이터로 돌아갑니다.
const FORCE_MOCK_ACTUAL_CURVE = false;

const MOCK_ACTUAL_CURVE_POINTS = [
  // reference 곡선과 비슷하게 만든 OK 테스트용 실제 측정 곡선
  // 유사도 85% 이상을 목표로 함

  { time_ms: 0, sensor1: 60, sensor2: 60, sensor3: 60 },
  { time_ms: 2000, sensor1: 50, sensor2: 50, sensor3: 50 },
  { time_ms: 4000, sensor1: 190, sensor2: 190, sensor3: 190 },
  { time_ms: 6000, sensor1: 300, sensor2: 300, sensor3: 300 },
  { time_ms: 8000, sensor1: 380, sensor2: 380, sensor3: 380 },

  { time_ms: 9000, sensor1: 520, sensor2: 520, sensor3: 520 },
  { time_ms: 10000, sensor1: 360, sensor2: 360, sensor3: 360 },
  { time_ms: 12000, sensor1: 560, sensor2: 560, sensor3: 560 },
  { time_ms: 14000, sensor1: 370, sensor2: 370, sensor3: 370 },

  { time_ms: 18000, sensor1: 360, sensor2: 360, sensor3: 360 },
  { time_ms: 20000, sensor1: 540, sensor2: 540, sensor3: 540 },
  { time_ms: 22000, sensor1: 350, sensor2: 350, sensor3: 350 },

  { time_ms: 26000, sensor1: 340, sensor2: 340, sensor3: 340 },
  { time_ms: 28000, sensor1: 320, sensor2: 320, sensor3: 320 },
  { time_ms: 30000, sensor1: 500, sensor2: 500, sensor3: 500 },
  { time_ms: 32000, sensor1: 240, sensor2: 240, sensor3: 240 },

  { time_ms: 34000, sensor1: 210, sensor2: 210, sensor3: 210 },
  { time_ms: 36000, sensor1: 190, sensor2: 190, sensor3: 190 },
  { time_ms: 38000, sensor1: 180, sensor2: 180, sensor3: 180 },
  { time_ms: 40000, sensor1: 470, sensor2: 470, sensor3: 470 },
];

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
  phase: "filling" | "holding" | "release"; // 👈 추가
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

type ReferenceCurveSet = Record<SensorKey, ReferencePoint[]>;

function createEmptyReferenceCurves(): ReferenceCurveSet {
  return {
    sensor1: [],
    sensor2: [],
    sensor3: [],
  };
}

export default function AnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const machineId = params.machineId as string;
  const querySessionId = searchParams.get("sessionId");

  const [session, setSession] = useState<MeasurementSession | null>(null);
  const [sensorData, setSensorData] = useState<SensorData[]>([]);
  const [referenceCurve, setReferenceCurve] = useState<ReferencePoint[]>([]);
  const [referenceCurves, setReferenceCurves] =
    useState<ReferenceCurveSet>(createEmptyReferenceCurves());
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedSensor, setSelectedSensor] = useState<SelectedSensor>("all");
  const [selectedResultSensor, setSelectedResultSensor] =
    useState<SensorKey>("sensor1");
  const [showLivePanel, setShowLivePanel] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState(
    REFERENCE_PROFILES[0].id
  );

  const savedAnalysisKeyRef = useRef("");

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
        setReferenceCurves(createEmptyReferenceCurves());
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

      if (FORCE_MOCK_ACTUAL_CURVE) {
        actualRows = createMockActualSensorData(machineId, targetSession.id);
      } else if (TEST_MODE && actualRows.length === 0) {
        actualRows = createTestSensorData(machineId, targetSession.id);
      }

      setSensorData(actualRows);

      const refSet = await getReferenceCurves(machineId, selectedProfileId);
      setReferenceCurves(refSet);

      // EO 판정은 현재 대표 센서인 Sensor 2 기준곡선을 사용합니다.
      // Sensor 1/3 기준곡선은 그래프 비교용으로 사용합니다.
      const representativeRef =
        refSet.sensor2.length > 0
          ? refSet.sensor2
          : await getReferenceCurve(machineId, selectedProfileId);
      setReferenceCurve(representativeRef);
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

  const pressureStartInfo = useMemo(() => {
    const sortedRows = [...sensorData].sort(
      (a, b) => a.elapsed_ms - b.elapsed_ms
    );

    const validRows = sortedRows.filter((row) => row.elapsed_ms >= 0);

    if (validRows.length === 0) {
      return {
        startMs: 0,
        maxS2: 0,
        threshold: 0,
        found: false,
      };
    }

    const maxS2 = Math.max(...validRows.map((row) => row.sensor2 ?? 0));
    const threshold = maxS2 * 0.4;

    const startPoint = validRows.find(
      (row) => (row.sensor2 ?? 0) >= threshold
    );

    return {
      startMs: startPoint?.elapsed_ms ?? validRows[0].elapsed_ms,
      maxS2,
      threshold,
      found: Boolean(startPoint),
    };
  }, [sensorData]);

  const actualCurve = useMemo<ActualPoint[]>(() => {
    const sortedRows = [...sensorData].sort(
      (a, b) => a.elapsed_ms - b.elapsed_ms
    );

    const normalizedRows = sortedRows
      .map((row) => ({
        ...row,
        normalized_time_ms: row.elapsed_ms - pressureStartInfo.startMs,
      }))
      .filter(
        (row) =>
          row.normalized_time_ms >= -5000 && row.normalized_time_ms <= 17000
      );

    return normalizedRows.map((row, i, arr) => {
      const s1 = row.sensor1 ?? 0;
      const s2 = row.sensor2 ?? 0;
      const s3 = row.sensor3 ?? 0;

      const avg = (s1 + s2 + s3) / 3;

      if (i === 0) {
        return {
          time_ms: row.normalized_time_ms,
          sensor1: s1,
          sensor2: s2,
          sensor3: s3,
          avg,
          phase: "holding",
        };
      }

      const prev = arr[i - 1];
      const prevAvg =
        ((prev.sensor1 ?? 0) + (prev.sensor2 ?? 0) + (prev.sensor3 ?? 0)) / 3;

      const dt = row.normalized_time_ms - prev.normalized_time_ms || 1;
      const dp = avg - prevAvg;
      const slope = dp / dt;

      let phase: "filling" | "holding" | "release" = "holding";

      // phase 판정 민감도 설정
      // 숫자가 작을수록 작은 압력 변화도 filling/release로 판단함.
      // 숫자가 클수록 큰 압력 변화가 있을 때만 filling/release로 판단함.
      if (slope > 0.08) phase = "filling";
      else if (slope < -0.08) phase = "release";

      return {
        time_ms: row.normalized_time_ms,
        sensor1: s1,
        sensor2: s2,
        sensor3: s3,
        avg,
        phase,
      };
    });
  }, [sensorData, pressureStartInfo.startMs]);

    useEffect(() => {
    if (!TEST_MODE) return;
    if (actualCurve.length === 0) return;

    console.log(
        "[PHASE CHECK]",
        actualCurve.map((p) => ({
        time: p.time_ms,
        avg: p.avg.toFixed(1),
        phase: p.phase,
        }))
    );
    }, [actualCurve]);

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

  useEffect(() => {
    if (loading) return;
    if (!session) return;
    if (actualCurve.length === 0) return;
    if (referenceCurve.length === 0) return;
    if (analysisResult.result === "미판정") return;

    const saveKey = [
      session.id,
      selectedProfileId,
      analysisResult.result,
      analysisResult.avgPressure.toFixed(2),
      analysisResult.maxPressure.toFixed(2),
      analysisResult.finalPressure.toFixed(2),
    ].join("|");

    if (savedAnalysisKeyRef.current === saveKey) return;

    savedAnalysisKeyRef.current = saveKey;
    saveAnalysisResult(true);
  }, [
    loading,
    session?.id,
    selectedProfileId,
    actualCurve.length,
    referenceCurve.length,
    analysisResult,
  ]);

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
  function createMockActualSensorData(
    machineIdValue: string,
    sessionIdValue: string
  ): SensorData[] {
    return MOCK_ACTUAL_CURVE_POINTS.map((point, index) => ({
      id: `mock-${index}`,
      machine_id: machineIdValue,
      session_id: sessionIdValue,
      elapsed_ms: point.time_ms,
      sensor1: point.sensor1,
      sensor2: point.sensor2,
      sensor3: point.sensor3,
      created_at: new Date().toISOString(),
    }));
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

  async function saveAnalysisResult(silent = false) {
    if (!session) {
      if (!silent) alert("저장할 측정 세션이 없습니다.");
      return;
    }

    if (analysisResult.result === "미판정") {
      if (!silent) alert("아직 저장할 분석 결과가 없습니다.");
      return;
    }

    const sensor1 = analysisResult.sensorJudgement.sensor1;
    const sensor2 = analysisResult.sensorJudgement.sensor2;
    const sensor3 = analysisResult.sensorJudgement.sensor3;

    const similarityAvg =
      (sensor1.similarity + sensor2.similarity + sensor3.similarity) / 3;

    const allDefects = [
      ...analysisResult.defects.sensor1.defects,
      ...analysisResult.defects.sensor2.defects,
      ...analysisResult.defects.sensor3.defects,
    ];

    const uniqueDefects = Array.from(new Set(allDefects));

    const { error } = await supabase
      .from("measurement_sessions")
      .update({
        result: analysisResult.result,
        avg_pressure: analysisResult.avgPressure,
        max_pressure: analysisResult.maxPressure,
        final_pressure: analysisResult.finalPressure,
        pressure_drop: analysisResult.pressureDrop,

        profile_id: selectedProfileId,
        profile_label: selectedProfile.label,
        similarity_avg: similarityAvg,

        sensor1_result: sensor1.isOk ? "OK" : "NG",
        sensor2_result: sensor2.isOk ? "OK" : "NG",
        sensor3_result: sensor3.isOk ? "OK" : "NG",

        defect_summary:
          uniqueDefects.length > 0 ? uniqueDefects.join(", ") : "예상 불량 없음",
      })
      .eq("id", session.id)
      .eq("machine_id", machineId);

    if (error) {
      console.error("[Analysis] save result error:", error);
      if (!silent) alert("분석 결과 저장 중 오류가 발생했습니다.");
      return;
    }

    setSession((prev) =>
      prev
        ? {
            ...prev,
            result: analysisResult.result,
            avg_pressure: analysisResult.avgPressure,
            max_pressure: analysisResult.maxPressure,
            final_pressure: analysisResult.finalPressure,
            pressure_drop: analysisResult.pressureDrop,
          }
        : prev
    );

    if (silent) {
      console.log("[Analysis] 자동 저장 완료");
    } else {
      alert("분석 결과가 저장되었습니다.");
    }
  }

  const problemSensors = (["sensor1", "sensor2", "sensor3"] as const).filter(
    (key) => !analysisResult.sensorJudgement[key].isOk
  );

  const problemSensorLabels =
    problemSensors.length > 0
      ? problemSensors
          .map((key) => analysisResult.sensorJudgement[key].label)
          .join(", ")
      : "문제 센서 없음";

  const uniqueDefects = Array.from(
    new Set([
      ...analysisResult.defects.sensor1.defects,
      ...analysisResult.defects.sensor2.defects,
      ...analysisResult.defects.sensor3.defects,
    ])
  );

  const topReasons = analysisResult.reasons.slice(0, 4);

  const resultMessage =
    analysisResult.result === "OK"
      ? "기준 보압 곡선과 센서별 판정 기준을 만족했습니다."
      : analysisResult.result === "NG"
      ? "기준에서 벗어난 센서 또는 보압 구간이 있습니다."
      : "분석할 데이터가 부족하거나 아직 판정 전입니다.";

   return (
    <main className="min-h-screen bg-[#050817] px-4 py-4 text-white md:px-6 md:py-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold text-cyan-300">EO 판정 분석</p>
            <h1 className="mt-1 text-2xl font-black md:text-4xl">
              Pressure Sensor Monitor
            </h1>
            <p className="mt-2 text-sm text-slate-400 md:text-base">
              현재 사출기:{" "}
              <span className="font-bold text-slate-200">{machineId}</span>
            </p>

            {session && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2">
                  Session {session.id}
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2">
                  시작 {formatDate(session.started_at)}
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2">
                  종료 {formatDate(session.ended_at)}
                </span>
              </div>
            )}
          </div>
        </div>

        <DashboardNav machineId={machineId} />

        {loading ? (
          <SectionCard compact>
            <div className="py-10 text-center text-slate-400">
              분석 데이터를 불러오는 중...
            </div>
          </SectionCard>
        ) : errorMessage ? (
          <SectionCard compact>
            <div className="py-10 text-center font-bold text-red-300">
              {errorMessage}
            </div>
          </SectionCard>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
              <SectionCard
                title="Reference Profile"
                description="재료/배합/목표 물성에 맞는 기준 프로파일을 선택합니다."
                compact
              >
                <div className="space-y-2">
                  {REFERENCE_PROFILES.map((profile) => (
                    <AppButton
                      key={profile.id}
                      onClick={() => setSelectedProfileId(profile.id)}
                      variant={
                        selectedProfileId === profile.id
                          ? "primary"
                          : "secondary"
                      }
                      size="sm"
                      className="w-full justify-start"
                    >
                      {profile.label}
                    </AppButton>
                  ))}
                </div>

                <p className="mt-4 text-sm text-slate-400">
                  {selectedProfile.description}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <MetricCard
                    label="유사도 기준"
                    value={`${(
                      selectedProfile.criteria.minSimilarity * 100
                    ).toFixed(0)}% 이상`}
                  />
                  <MetricCard
                    label="보압 면적"
                    value={`${(
                      selectedProfile.criteria.minHoldAreaRatio * 100
                    ).toFixed(0)}% 이상`}
                  />
                  <MetricCard
                    label="감소 기울기"
                    value={`${selectedProfile.criteria.maxDecaySlopeRatio.toFixed(
                      2
                    )}배 이하`}
                  />
                  <MetricCard
                    label="과보압"
                    value={
                      selectedProfile.criteria.overPackingEnabled
                        ? "활성"
                        : "비활성"
                    }
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="전체 판정 요약"
                description="현재 세션의 평균 압력, 최대 압력, 압력 낙차를 요약합니다."
                right={
                    <AppButton
                    onClick={() => saveAnalysisResult(false)}
                    variant="primary"
                    size="sm"
                    >
                    결과 저장
                    </AppButton>
                }
                compact
                >
                <div
                  className={`mb-4 rounded-2xl border p-5 ${
                    analysisResult.result === "OK"
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : analysisResult.result === "NG"
                      ? "border-red-500/30 bg-red-500/10"
                      : "border-slate-700 bg-slate-950"
                  }`}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-300">EO 최종 판정</p>
                      <p
                        className={`mt-2 text-5xl font-black md:text-6xl ${
                          analysisResult.result === "OK"
                            ? "text-emerald-300"
                            : analysisResult.result === "NG"
                            ? "text-red-300"
                            : "text-slate-300"
                        }`}
                      >
                        {analysisResult.result}
                      </p>
                      <p className="mt-2 text-sm text-slate-300">{resultMessage}</p>
                    </div>

                    <div className="grid min-w-0 gap-2 text-sm md:min-w-[320px]">
                      <div className="rounded-xl bg-slate-950/80 p-3">
                        <p className="text-xs text-slate-500">문제 센서</p>
                        <p
                          className={`mt-1 font-bold ${
                            problemSensors.length > 0
                              ? "text-red-300"
                              : "text-emerald-300"
                          }`}
                        >
                          {problemSensorLabels}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-950/80 p-3">
                        <p className="text-xs text-slate-500">예상 불량</p>
                        <p
                          className={`mt-1 font-bold ${
                            uniqueDefects.length > 0
                              ? "text-red-300"
                              : "text-emerald-300"
                          }`}
                        >
                          {uniqueDefects.length > 0
                            ? uniqueDefects.join(", ")
                            : "예상 불량 없음"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <ResultCard
                    label="전체 판정"
                    value={analysisResult.result}
                    result={analysisResult.result}
                  />
                  <ResultCard
                    label="평균 압력"
                    value={analysisResult.avgPressure.toFixed(1)}
                  />
                  <ResultCard
                    label="평균 최대 압력"
                    value={analysisResult.maxPressure.toFixed(1)}
                  />
                  <ResultCard
                    label="평균 압력 낙차"
                    value={analysisResult.pressureDrop.toFixed(1)}
                  />
                </div>

                <div className="mt-4 space-y-3">
                    <div className="rounded-xl bg-slate-950 p-3">
                        <p className="mb-2 text-sm font-bold text-red-300">판정 사유</p>

                        {topReasons.length > 0 ? (
                        <ul className="space-y-1 text-xs text-slate-300">
                            {topReasons.map((r, i) => (
                            <li key={i}>- {r}</li>
                            ))}
                        </ul>
                        ) : (
                        <p className="text-xs text-emerald-300">문제 없음</p>
                        )}
                    </div>

                    <div className="rounded-xl bg-slate-950 p-3 text-xs">
                        <p className="mb-2 font-bold text-slate-300">센서 상태</p>
                        <div className="flex gap-3">
                        {(["sensor1", "sensor2", "sensor3"] as const).map((key) => {
                            const ok = analysisResult.sensorJudgement[key].isOk;
                            return (
                            <span
                                key={key}
                                className={`font-bold ${
                                ok ? "text-emerald-300" : "text-red-300"
                                }`}
                            >
                                {key.toUpperCase()} {ok ? "OK" : "NG"}
                            </span>
                            );
                        })}
                        </div>
                    </div>
                    </div>

                {referenceCurve.length === 0 && (
                  <div className="mt-4 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-200">
                    <p className="font-bold">기준 보압 곡선 데이터가 없습니다.</p>
                    <p className="mt-1">
                      machine_id: <b>{machineId}</b>, profile_id:{" "}
                      <b>{selectedProfileId}</b> 조합의 reference_curves
                      데이터가 필요합니다.
                    </p>
                  </div>
                )}
              </SectionCard>
            </section>

            <SectionCard
              title="보압 곡선 비교"
              description="센서별 실제 측정 데이터와 선택된 Reference Profile 기준곡선을 비교합니다."
              right={
                <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                  시작점 정렬 X축 -5~17초 / Y축 0~2000
                </span>
              }
              className="mt-4"
              compact
            >
              <div className="mb-4 grid grid-cols-4 gap-2">
                {[
                  { key: "all", label: "전체" },
                  { key: "sensor1", label: "S1" },
                  { key: "sensor2", label: "S2" },
                  { key: "sensor3", label: "S3" },
                ].map((item) => (
                  <AppButton
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedSensor(item.key as SelectedSensor)}
                    variant={selectedSensor === item.key ? "primary" : "secondary"}
                    size="sm"
                  >
                    {item.label}
                  </AppButton>
                ))}
              </div>

              <PressureSvgChart
                actualCurve={actualCurve}
                referenceCurves={referenceCurves}
                selectedSensor={selectedSensor}
              />

              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                <p>
                  기준 정렬: Sensor 2 최대값의 40% 이상이 처음 감지된 시점을 0초로 맞추고,
                  시작 전 3초 구간도 함께 표시합니다.
                </p>
                <p className="mt-1">
                  start_ms: {pressureStartInfo.startMs.toFixed(0)}ms / threshold: {" "}
                  {pressureStartInfo.threshold.toFixed(1)} / max S2: {" "}
                  {pressureStartInfo.maxS2.toFixed(1)}
                </p>
                <p className="mt-1">
                  ※ 각 센서의 reference 선은 DB에 저장된 센서별 기준값 그대로 표시됩니다. Sensor 2는 대표 판정 센서입니다.
                </p>
              </div>
            </SectionCard>

            <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
              <SectionCard title="센서별 판정 요약" compact>
                <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-950 p-2">
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
              </SectionCard>

              <SectionCard title="데이터 상태" compact>
                <div className="space-y-3 text-sm">
                  <InfoRow label="센서 데이터 개수" value={`${sensorData.length}개`} />
                  <InfoRow
                    label="기준 곡선 데이터"
                    value={`${referenceCurve.length}개`}
                    strong={referenceCurve.length > 0 ? "yellow" : "red"}
                  />
                  <InfoRow label="Reference Profile" value={selectedProfile.label} />
                  <InfoRow label="profile_id" value={selectedProfileId} />
                  <InfoRow label="자동 저장" value="ON" strong="green" />
                  <InfoRow
                    label="TEST_MODE"
                    value={TEST_MODE ? "ON" : "OFF"}
                    strong={TEST_MODE ? "yellow" : "green"}
                  />
                  <InfoRow
                    label="분석 session"
                    value={querySessionId ? "history 선택 세션" : "최신 세션"}
                  />
                </div>
              </SectionCard>
            </section>

            {session && (
              <SectionCard
                title="실시간 패널 / 원본 데이터"
                description="분석 화면에서는 보조 확인용입니다. 필요할 때만 펼쳐서 실시간 그래프와 원본 데이터를 확인합니다."
                right={
                  <AppButton
                    onClick={() => setShowLivePanel((prev) => !prev)}
                    variant="secondary"
                    size="sm"
                  >
                    {showLivePanel ? "접기" : "펼치기"}
                  </AppButton>
                }
                className="mt-4"
                compact
              >
                {showLivePanel ? (
                  <PressureMonitorPanel machineId={machineId} sessionId={session.id} />
                ) : (
                  <p className="text-sm text-slate-400">
                    EO 판정에는 위의 요약, 기준곡선 비교, 센서별 판정만 먼저 확인하면 됩니다.
                    원본 데이터 확인이 필요하면 펼치기를 누르세요.
                  </p>
                )}
              </SectionCard>
            )}
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

function ResultCard({
  label,
  value,
  result,
}: {
  label: string;
  value: string;
  result?: string;
}) {
  const resultClass =
    result === "OK"
      ? "text-emerald-400"
      : result === "NG"
      ? "text-red-400"
      : "text-cyan-300";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black md:text-3xl ${resultClass}`}>
        {value}
      </p>
    </div>
  );
}

function InfoRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: "green" | "yellow" | "red";
}) {
  const valueClass =
    strong === "green"
      ? "font-bold text-emerald-300"
      : strong === "yellow"
      ? "font-bold text-yellow-300"
      : strong === "red"
      ? "font-bold text-red-300"
      : "text-slate-200";

  return (
    <div className="flex justify-between gap-4 border-b border-slate-800 pb-2">
      <span className="text-slate-400">{label}</span>
      <span className={`text-right ${valueClass}`}>{value}</span>
    </div>
  );
}

function PressureSvgChart({
  actualCurve,
  referenceCurves,
  selectedSensor,
}: {
  actualCurve: ActualPoint[];
  referenceCurves: ReferenceCurveSet;
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

  const minTime = -5000;
  const maxTime = 17000;
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
    // 기준곡선은 DB에 저장된 값 그대로 그립니다.
    // 실제 대표 센서(Sensor 2)와 거의 같을 때도 보이도록, 렌더링 순서에서 reference를 마지막에 그립니다.

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

  const sensor1ReferencePolyline = makeReferencePolyline(referenceCurves.sensor1);
  const sensor2ReferencePolyline = makeReferencePolyline(referenceCurves.sensor2);
  const sensor3ReferencePolyline = makeReferencePolyline(referenceCurves.sensor3);

  const xTicks = [
    -5000, -3000, -1000, 0, 1000, 3000, 5000, 7000, 9000,
    11000, 13000, 15000, 17000,
  ];

  const yTicks = [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];

  function lineStyle(sensorKey: SensorKey) {
    const active = selectedSensor === "all" || selectedSensor === sensorKey;

    return {
      strokeWidth: active ? 5 : 2,
      opacity: active ? 1 : 0.2,
    };
  }

  function referenceLineStyle(sensorKey: SensorKey) {
    const active = selectedSensor === "all" || selectedSensor === sensorKey;

    return {
      strokeWidth: active ? 4 : 2,
      opacity: active ? 0.95 : 0.15,
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
                {tick === 0 ? "start" : `${tick / 1000}s`}
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

        {sensor1ReferencePolyline && (
          <polyline
            points={sensor1ReferencePolyline}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={referenceLineStyle("sensor1").strokeWidth}
            strokeDasharray="8 7"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={referenceLineStyle("sensor1").opacity}
          />
        )}

        {sensor3ReferencePolyline && (
          <polyline
            points={sensor3ReferencePolyline}
            fill="none"
            stroke="#34d399"
            strokeWidth={referenceLineStyle("sensor3").strokeWidth}
            strokeDasharray="8 7"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={referenceLineStyle("sensor3").opacity}
          />
        )}

        {sensor2ReferencePolyline && (
          <polyline
            points={sensor2ReferencePolyline}
            fill="none"
            stroke="#facc15"
            strokeWidth={referenceLineStyle("sensor2").strokeWidth + 1}
            strokeDasharray="10 7"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={referenceLineStyle("sensor2").opacity}
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
          S2 reference
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
          <span className="inline-block h-1 w-8 rounded border-t-2 border-dashed border-cyan-300" />
          <span className="text-slate-300">S1 reference</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-block h-1 w-8 rounded border-t-2 border-dashed border-yellow-300" />
          <span className="text-slate-300">S2 reference</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-block h-1 w-8 rounded border-t-2 border-dashed border-emerald-300" />
          <span className="text-slate-300">S3 reference</span>
        </div>
      </div>
    </div>
  );
}