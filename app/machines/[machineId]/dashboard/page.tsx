"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardNav from "@/components/DashboardNav";
import PressureMonitorPanel from "@/components/PressureMonitorPanel";
import AppButton from "@/components/AppButton";
import SectionCard from "@/components/SectionCard";

const TEST_MODE = false;

type SessionId = string | number;

type SensorData = {
  id: number;
  machine_id: string | null;
  session_id: SessionId | null;
  sensor1: number;
  sensor2: number;
  sensor3: number;
  elapsed_ms: number | null;
  created_at: string;
};

export default function DashboardPage() {
  const params = useParams();
  const machineId = String(params.machineId);

  const [data, setData] = useState<SensorData[]>([]);
  const [index, setIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<SessionId | null>(
    null
  );

  async function fetchData(sessionId?: SessionId | null) {
    let query = supabase
      .from("sensor_data")
      .select("*")
      .eq("machine_id", machineId)
      .order("elapsed_ms", { ascending: true })
      .limit(500);

    if (sessionId) {
      query = query.eq("session_id", sessionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("sensor_data 불러오기 실패:", error);
      return;
    }

    setData(data ?? []);

    if (data && data.length > 0) {
      setIndex(data.length - 1);
    }
  }

  async function fetchControl() {
    const { data, error } = await supabase
      .from("recording_control")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("recording_control 불러오기 실패:", error);
      return;
    }

    const recording = data?.is_recording ?? false;
    const sessionId = data?.session_id ?? null;

    setIsRecording(recording);
    setCurrentSessionId(sessionId);

    if (sessionId) {
      await fetchData(sessionId);
    }
  }

  async function startRecording() {
    const { data: sessionData, error: sessionError } = await supabase
      .from("measurement_sessions")
      .insert({
        machine_id: machineId,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sessionError) {
      console.error("session 생성 실패:", sessionError);
      return;
    }

    const sessionId = sessionData.id;

    // 이 값이 true로 바뀌는 순간
    // 1) 압력센서 ESP32가 데이터 저장을 시작하고
    // 2) 리니어모터 ESP32가 Supabase를 감시하다가 자동으로 공정을 시작합니다.
    const { error } = await supabase
      .from("recording_control")
      .update({
        is_recording: true,
        start_time: new Date().toISOString(),
        duration_sec: 20,
        session_id: sessionId,
      })
      .eq("id", 1);

    if (error) {
      console.error("recording_control 업데이트 실패:", error);
      return;
    }

    setData([]);
    setIndex(0);
    setIsRecording(true);
    setCurrentSessionId(sessionId);
  }

  async function stopRecording() {
    // session_id는 지우지 않습니다.
    // 그래야 측정 정지 후에도 방금 측정한 그래프가 화면에 남습니다.
    const { error: stopError } = await supabase
      .from("recording_control")
      .update({
        is_recording: false,
      })
      .eq("id", 1);

    if (stopError) {
      console.error("측정 정지 실패:", stopError);
      return;
    }

    setIsRecording(false);

    if (!currentSessionId) return;

    const { data, error } = await supabase
      .from("sensor_data")
      .select("sensor1, sensor2, sensor3, elapsed_ms")
      .eq("machine_id", machineId)
      .eq("session_id", currentSessionId)
      .order("elapsed_ms", { ascending: true });

    if (error) {
      console.error("세션 데이터 불러오기 실패:", error);
      return;
    }

    if (!data || data.length < 5) return;

    const pressures = data.map(
      (d) => (Number(d.sensor1) + Number(d.sensor2) + Number(d.sensor3)) / 3
    );

    const avg =
      pressures.reduce((sum, value) => sum + value, 0) / pressures.length;

    const max = Math.max(...pressures);

    const final =
      pressures.slice(-5).reduce((sum, value) => sum + value, 0) / 5;

    const drop = max - final;

    let result = "OK";

    if (max < 120) {
      result = "NG";
    } else if (final < 50) {
      result = "NG";
    } else if (drop > 700) {
      result = "NG";
    }

    await supabase
      .from("measurement_sessions")
      .update({
        ended_at: new Date().toISOString(),
        result,
        avg_pressure: avg,
        max_pressure: max,
        final_pressure: final,
        pressure_drop: drop,
      })
      .eq("id", currentSessionId);
  }

  async function generateTestData() {
    if (!TEST_MODE) return;

    if (!currentSessionId) {
      alert("먼저 측정 시작을 눌러서 session을 생성하세요.");
      return;
    }

    const rows = Array.from({ length: 21 }, (_, i) => {
      const elapsedMs = i * 1000;
      let pressure = 0;

      if (elapsedMs <= 5000) {
        pressure = 70 + elapsedMs * 0.08;
      } else if (elapsedMs <= 14000) {
        pressure = 470 + Math.sin(elapsedMs / 1400) * 25;
      } else {
        pressure = Math.max(180, 470 - (elapsedMs - 14000) * 0.035);
      }

      const rounded = Math.round(pressure);

      return {
        machine_id: machineId,
        session_id: currentSessionId,
        sensor1: rounded + Math.round(Math.random() * 30 - 15),
        sensor2: rounded + Math.round(Math.random() * 30 - 15),
        sensor3: rounded + Math.round(Math.random() * 30 - 15),
        elapsed_ms: elapsedMs,
      };
    });

    const { error } = await supabase.from("sensor_data").insert(rows);

    if (error) {
      console.error("테스트 데이터 생성 실패:", error);
      return;
    }

    await fetchData(currentSessionId);
    alert("테스트 데이터 20초 생성 완료");
  }

  useEffect(() => {
    fetchControl();

    const timer = setInterval(() => {
      fetchControl();
    }, 500);

    return () => clearInterval(timer);
  }, [machineId]);

  const current = data[index] || data[data.length - 1];

  return (
    <main className="min-h-screen bg-[#050817] px-4 py-4 text-white md:px-6 md:py-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-col gap-2 md:mb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold text-cyan-300">실시간 측정</p>
            <h1 className="mt-1 text-2xl font-black md:text-4xl">
              Pressure Sensor Monitor
            </h1>
            <p className="mt-2 text-sm text-slate-400 md:text-base">
              현재 사출기:{" "}
              <span className="font-bold text-slate-200">{machineId}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs md:justify-end">
            <StatusBadge active={isRecording}>
              {isRecording ? "측정 중" : "대기 중"}
            </StatusBadge>

            {currentSessionId && (
              <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 font-bold text-blue-200">
                session {currentSessionId}
              </span>
            )}

            {TEST_MODE && (
              <span className="rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-2 font-bold text-yellow-300">
                TEST_MODE ON
              </span>
            )}
          </div>
        </div>

        <DashboardNav machineId={machineId} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
          <SectionCard
            title="측정 제어"
            description="세션 생성, 측정 정지, 테스트 데이터 생성을 이곳에서 처리합니다."
            compact
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <AppButton onClick={startRecording} variant="primary" size="md">
                측정 시작
              </AppButton>

              <AppButton onClick={stopRecording} variant="danger" size="md">
                측정 정지
              </AppButton>

              {TEST_MODE && (
                <AppButton
                  onClick={generateTestData}
                  variant="warning"
                  size="md"
                >
                  테스트 데이터
                </AppButton>
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="현재 데이터 요약"
            description="가장 최근에 들어온 센서 값입니다."
            compact
          >
            {current ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <SummaryItem label="Sensor 1" value={current.sensor1} />
                <SummaryItem label="Sensor 2" value={current.sensor2} />
                <SummaryItem label="Sensor 3" value={current.sensor3} />
                <SummaryItem
                  label="Elapsed"
                  value={`${current.elapsed_ms ?? 0}ms`}
                />
                <SummaryItem label="Data Count" value={data.length} />
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                아직 데이터가 없습니다. 측정 시작 후 ESP32 또는 테스트 데이터
                생성 버튼으로 데이터를 넣으세요.
              </p>
            )}
          </SectionCard>
        </div>

        {currentSessionId && (
          <PressureMonitorPanel
            machineId={machineId}
            sessionId={currentSessionId}
          />
        )}
      </div>
    </main>
  );
}

function StatusBadge({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-full px-3 py-2 font-bold ${
        active
          ? "bg-cyan-400 text-slate-950"
          : "border border-slate-700 bg-slate-900 text-slate-300"
      }`}
    >
      ● {children}
    </span>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-white">{value}</p>
    </div>
  );
}