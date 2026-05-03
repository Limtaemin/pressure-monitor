"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import PressureMonitorPanel from "@/components/PressureMonitorPanel";

const TEST_MODE = true;

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
  const machineId = params.machineId as string;

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
      query = query.eq("session_id", String(sessionId));
    }

    const { data, error } = await query;

    if (error) {
      console.error(error);
      return;
    }

    setData(data || []);

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
      console.error(error);
      return;
    }

    setIsRecording(data?.is_recording ?? false);
    setCurrentSessionId(data?.session_id ?? null);

    if (data?.session_id) {
      await fetchData(data.session_id);
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

    const { error } = await supabase
      .from("recording_control")
      .update({
        is_recording: true,
        start_time: new Date().toISOString(),
        duration_sec: 40,
        session_id: sessionId,
      })
      .eq("id", 1);

    if (error) {
      console.error(error);
      return;
    }

    setData([]);
    setIndex(0);
    setIsRecording(true);
    setCurrentSessionId(sessionId);
  }

  async function stopRecording() {
    const { error: stopError } = await supabase
      .from("recording_control")
      .update({ is_recording: false })
      .eq("id", 1);

    if (stopError) {
      console.error(stopError);
      return;
    }

    setIsRecording(false);

    if (!currentSessionId) return;

    const { data } = await supabase
      .from("sensor_data")
      .select("sensor1, sensor2, sensor3, elapsed_ms")
      .eq("machine_id", machineId)
      .eq("session_id", currentSessionId)
      .order("elapsed_ms", { ascending: true });

    if (!data || data.length < 5) return;

    const pressures = data.map(
      (d) => (Number(d.sensor1) + Number(d.sensor2) + Number(d.sensor3)) / 3
    );

    const avg = pressures.reduce((sum, v) => sum + v, 0) / pressures.length;
    const max = Math.max(...pressures);
    const final = pressures.slice(-5).reduce((s, v) => s + v, 0) / 5;
    const drop = max - final;

    let result = "OK";

    if (max < 200) result = "NG";
    else if (final < 150) result = "NG";
    else if (drop > 120) result = "NG";

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

    const rows = Array.from({ length: 40 }, (_, i) => {
      const t = i / 39;
      const base = 80 + 620 * Math.sin(Math.min(t * Math.PI, Math.PI));
      const hold = i > 15 ? 560 - (i - 15) * 5 : base;
      const pressure = Math.max(80, Math.round(i > 15 ? hold : base));

      return {
        machine_id: machineId,
        session_id: currentSessionId,
        sensor1: pressure + Math.round(Math.random() * 20 - 10),
        sensor2: pressure + Math.round(Math.random() * 20 - 10),
        sensor3: pressure + Math.round(Math.random() * 20 - 10),
        elapsed_ms: i * 1000,
      };
    });

    const { error } = await supabase.from("sensor_data").insert(rows);

    if (error) {
      console.error("테스트 데이터 생성 실패:", error);
      return;
    }

    await fetchData(currentSessionId);
    alert("테스트 데이터 40개 생성 완료");
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
    <main className="min-h-screen bg-slate-950 px-4 py-4 text-white md:p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold md:text-3xl">Pressure Sensor Monitor</h1>
          <p className="text-slate-400 mt-2">
            FlexiForce 3채널 압력 데이터 시각화
          </p>
          <p className="text-slate-500 mt-1">현재 사출기: {machineId}</p>

          <nav className="mt-6 flex gap-2 overflow-x-auto pb-2 whitespace-nowrap">
            <Link
                href="/"
                className="rounded-xl bg-slate-800 px-4 py-3 text-sm font-semibold transition hover:bg-slate-700 md:px-5 md:text-base"
            >
                사출기 선택
            </Link>

            <Link
                href={`/machines/${machineId}/dashboard`}
                className="rounded-xl bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-500 transition"
            >
                실시간 측정
            </Link>

            <Link
                href={`/machines/${machineId}/dashboard/analysis`}
                className="rounded-xl bg-gray-800 px-5 py-3 font-semibold hover:bg-gray-700 transition"
            >
                EO 판정
            </Link>

            <Link
                href={`/machines/${machineId}/dashboard/history`}
                className="rounded-xl bg-gray-800 px-5 py-3 font-semibold hover:bg-gray-700 transition"
            >
                과거 기록
            </Link>
            </nav>
        </header>

        <section className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-8">
          <h2 className="text-xl font-semibold mb-4">측정 제어</h2>

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={startRecording}
              className="px-5 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-xl font-bold"
            >
              측정 시작
            </button>

            <button
              onClick={stopRecording}
              className="px-5 py-3 bg-red-500 hover:bg-red-400 rounded-xl font-bold"
            >
              측정 정지
            </button>

            {TEST_MODE && (
              <button
                onClick={generateTestData}
                className="px-5 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-xl font-bold"
              >
                테스트 데이터 생성
              </button>
            )}

            <span
              className={`px-4 py-2 rounded-xl text-sm font-bold ${
                isRecording
                  ? "bg-green-500/20 text-green-400"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {isRecording ? "● 측정 중" : "● 대기 중"}
            </span>

            {currentSessionId && (
              <span className="text-slate-400 text-sm">
                session: {currentSessionId}
              </span>
            )}

            {TEST_MODE && (
              <span className="text-yellow-400 text-sm font-semibold">
                TEST_MODE ON
              </span>
            )}
          </div>
        </section>

        {current ? (
          <section className="bg-slate-900 rounded-2xl p-5 border border-slate-800 mb-8">
            <h2 className="text-xl font-semibold mb-4">현재 데이터 요약</h2>
            <p>Sensor 1: {current.sensor1}</p>
            <p>Sensor 2: {current.sensor2}</p>
            <p>Sensor 3: {current.sensor3}</p>
            <p>elapsed_ms: {current.elapsed_ms}</p>
            <p>session_id: {current.session_id}</p>
          </section>
        ) : (
          <section className="bg-slate-900 rounded-2xl p-8 border border-slate-800 text-slate-400 mb-8">
            아직 데이터가 없습니다. 측정 시작 후 ESP32 또는 테스트 데이터 생성 버튼으로 데이터를 넣으세요.
          </section>
        )}

        {isRecording && currentSessionId && (
          <PressureMonitorPanel
            machineId={machineId}
            sessionId={String(currentSessionId)}
          />
        )}
      </div>
    </main>
  );
}