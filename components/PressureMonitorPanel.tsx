"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppButton from "@/components/AppButton";
import SectionCard from "@/components/SectionCard";

type SensorData = {
  id: number;
  machine_id: string;
  session_id: string | number | null;
  sensor1: number;
  sensor2: number;
  sensor3: number;
  elapsed_ms: number;
  created_at: string;
};

export default function PressureMonitorPanel({
  machineId,
  sessionId,
}: {
  machineId: string;
  sessionId: string | number | null;
}) {
  const [data, setData] = useState<SensorData[]>([]);
  const [index, setIndex] = useState(0);
  const [autoFollowLatest, setAutoFollowLatest] = useState(true);
  const [isRecordingNow, setIsRecordingNow] = useState(false);
  const [showRawTable, setShowRawTable] = useState(false);

  const autoFollowLatestRef = useRef(true);

  async function fetchData() {
    if (!machineId || !sessionId) return;

    const { data: rows, error } = await supabase
      .from("sensor_data")
      .select("*")
      .eq("machine_id", machineId)
      .eq("session_id", sessionId)
      .order("elapsed_ms", { ascending: true })
      .limit(500);

    if (error) {
      console.error("sensor_data 불러오기 실패:", error.message);
      return;
    }

    const newData = rows || [];
    setData(newData);

    if (newData.length > 0) {
      setIndex((prevIndex) => {
        if (autoFollowLatestRef.current) return newData.length - 1;
        return Math.min(prevIndex, newData.length - 1);
      });
    }

    const { data: controlData, error: controlError } = await supabase
      .from("recording_control")
      .select("is_recording, session_id")
      .eq("id", 1)
      .single();

    if (controlError) {
      console.error("recording_control 불러오기 실패:", controlError.message);
      setIsRecordingNow(false);
      return;
    }

    const sameSession =
      String(controlData?.session_id ?? "") === String(sessionId ?? "");

    setIsRecordingNow(Boolean(controlData?.is_recording && sameSession));
  }

  useEffect(() => {
    setData([]);
    setIndex(0);
    setAutoFollowLatest(true);
    autoFollowLatestRef.current = true;
    setShowRawTable(false);
  }, [machineId, sessionId]);

  useEffect(() => {
    fetchData();

    const interval = setInterval(() => {
      fetchData();
    }, 500);

    return () => clearInterval(interval);
  }, [machineId, sessionId]);

  if (!sessionId) return null;

  const current = data[index];
  const latest = data[data.length - 1];
  const dataStatus = getDataStatus(latest, isRecordingNow);

  return (
    <section className="mt-4 space-y-4 md:mt-5">
      <CompactStatusBar
        data={data}
        latest={latest}
        dataStatus={dataStatus}
        sessionId={sessionId}
      />

      {current ? (
        <>
          <SectionCard
            title="보압 흐름 그래프"
            description="센서별 압력이 시간에 따라 어떻게 변했는지 확인합니다."
            right={
              <AppButton
                onClick={() => {
                  autoFollowLatestRef.current = true;
                  setAutoFollowLatest(true);
                  setIndex(Math.max(data.length - 1, 0));
                }}
                variant={autoFollowLatest ? "primary" : "secondary"}
                size="sm"
              >
                최신 보기
              </AppButton>
            }
            compact
          >
            <LineChart data={data} index={index} />

            <div className="mt-4">
              <input
                type="range"
                min="0"
                max={Math.max(data.length - 1, 0)}
                value={Math.min(index, Math.max(data.length - 1, 0))}
                onChange={(e) => {
                  autoFollowLatestRef.current = false;
                  setAutoFollowLatest(false);
                  setIndex(Number(e.target.value));
                }}
                className="w-full"
              />

              <div className="mt-2 grid grid-cols-3 text-xs text-slate-400">
                <span>0초</span>
                <span className="text-center">
                  {index + 1} / {data.length}
                </span>
                <span className="text-right">
                  {(current.elapsed_ms / 1000).toFixed(1)}초
                </span>
              </div>
            </div>
          </SectionCard>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
            <SectionCard title="현재 센서 압력" compact>
              <div className="grid grid-cols-3 gap-2">
                <SensorMiniCard title="S1" value={current.sensor1} />
                <SensorMiniCard title="S2" value={current.sensor2} />
                <SensorMiniCard title="S3" value={current.sensor3} />
              </div>

              <div className="mt-3 text-xs text-slate-400">
                선택 시간:{" "}
                <span className="font-bold text-slate-200">
                  {(current.elapsed_ms / 1000).toFixed(1)}초
                </span>
                {" · "}
                저장 시각:{" "}
                <span className="font-bold text-slate-200">
                  {new Date(current.created_at).toLocaleTimeString()}
                </span>
              </div>
            </SectionCard>

            <BumperPressureMap current={current} />
          </section>

          <SectionCard
            title="원본 데이터"
            description="디버깅이 필요할 때만 펼쳐서 확인합니다."
            right={
              <AppButton
                onClick={() => setShowRawTable((prev) => !prev)}
                variant="secondary"
                size="sm"
              >
                {showRawTable ? "접기" : "전체 데이터 보기"}
              </AppButton>
            }
            compact
          >
            {showRawTable ? (
              <RawDataTable
                data={data}
                index={index}
                onSelect={(i) => {
                  autoFollowLatestRef.current = false;
                  setAutoFollowLatest(false);
                  setIndex(i);
                }}
              />
            ) : (
              <p className="text-sm text-slate-400">
                현재 {data.length}개의 데이터가 저장되어 있습니다.
              </p>
            )}
          </SectionCard>
        </>
      ) : (
        <SectionCard compact>
          <p className="text-sm text-slate-400">
            측정 데이터가 들어오면 보압 흐름 그래프가 표시됩니다.
          </p>
        </SectionCard>
      )}
    </section>
  );
}

function CompactStatusBar({
  data,
  latest,
  dataStatus,
  sessionId,
}: {
  data: SensorData[];
  latest?: SensorData;
  dataStatus: ReturnType<typeof getDataStatus>;
  sessionId: string | number | null;
}) {
  const statusClass =
    dataStatus.color === "green"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : dataStatus.color === "yellow"
      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-300"
      : dataStatus.color === "blue"
      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
      : "border-red-500/30 bg-red-500/10 text-red-300";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-2 text-xs font-black ${statusClass}`}>
            {dataStatus.label}
          </span>

          <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
            Session {sessionId}
          </span>

          {latest && (
            <span className="rounded-full border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300">
              측정 구간 {(latest.elapsed_ms / 1000).toFixed(1)}초
            </span>
          )}
        </div>

        <div className="text-xs text-slate-400">
          {data.length}개 저장
          {latest && (
            <>
              {" · "}마지막 값 S1 {latest.sensor1} / S2 {latest.sensor2} / S3{" "}
              {latest.sensor3}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LineChart({
  data,
  index,
}: {
  data: SensorData[];
  index: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 900;
  const height = 360;
  const padding = 45;
  const maxValue = 1500;

  const selectedData = data.slice(0, index + 1);
  const activeHover = hoverIndex !== null ? data[hoverIndex] : null;

  function getX(i: number) {
    if (data.length <= 1) return padding;
    return padding + (i / (data.length - 1)) * (width - padding * 2);
  }

  function getY(value: number) {
    return height - padding - (value / maxValue) * (height - padding * 2);
  }

  function smoothData(values: number[], windowSize = 3) {
  return values.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    const subset = values.slice(start, i + 1);
    return subset.reduce((sum, v) => sum + v, 0) / subset.length;
  });
}

function makePoints(sensorKey: "sensor1" | "sensor2" | "sensor3") {
const rawValues = selectedData.map((d) => d[sensorKey]);

const smoothed = smoothData(rawValues, 3); // 👈 여기 숫자 조절 가능

return smoothed
    .map((v, i) => `${getX(i)},${getY(v)}`)
    .join(" ");
}

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const ratio = mouseX / rect.width;

    const estimatedIndex = Math.round(ratio * (data.length - 1));
    const clampedIndex = Math.max(0, Math.min(index, estimatedIndex));

    setHoverIndex(clampedIndex);
  }

  const markerX = getX(index);
  const hoverX = hoverIndex !== null ? getX(hoverIndex) : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        className="h-[280px] w-full rounded-xl border border-slate-800 bg-slate-950 md:h-[420px]"
      >
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#475569"
          strokeWidth="2"
        />
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="#475569"
          strokeWidth="2"
        />

        <line
          x1={markerX}
          y1={padding}
          x2={markerX}
          y2={height - padding}
          stroke="#facc15"
          strokeWidth="2"
          strokeDasharray="5 5"
        />

        <polyline
          points={makePoints("sensor1")}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="3"
        />
        <polyline
          points={makePoints("sensor2")}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="3"
        />
        <polyline
          points={makePoints("sensor3")}
          fill="none"
          stroke="#34d399"
          strokeWidth="3"
        />

        {hoverX !== null && activeHover && (
          <>
            <line
              x1={hoverX}
              y1={padding}
              x2={hoverX}
              y2={height - padding}
              stroke="#ffffff"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <circle cx={hoverX} cy={getY(activeHover.sensor1)} r="5" fill="#22d3ee" />
            <circle cx={hoverX} cy={getY(activeHover.sensor2)} r="5" fill="#a78bfa" />
            <circle cx={hoverX} cy={getY(activeHover.sensor3)} r="5" fill="#34d399" />
          </>
        )}
      </svg>

      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <span className="text-cyan-400">● Sensor 1</span>
        <span className="text-violet-400">● Sensor 2</span>
        <span className="text-emerald-400">● Sensor 3</span>
        <span className="text-yellow-400">─ 선택 위치</span>
      </div>

      {activeHover && (
        <div className="mt-3 rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
          {activeHover.elapsed_ms}ms · S1 {activeHover.sensor1} / S2{" "}
          {activeHover.sensor2} / S3 {activeHover.sensor3}
        </div>
      )}
    </div>
  );
}

function SensorMiniCard({ title, value }: { title: string; value: number }) {
  const level =
    value < 50 ? "낮음" : value < 200 ? "보통" : value < 500 ? "높음" : "매우 높음";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <p className="text-xs text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{level}</p>
    </div>
  );
}

function BumperPressureMap({ current }: { current: SensorData }) {
  const maxValue = 4095;

  function getDotStyle(value: number) {
    const ratio = Math.min(value / maxValue, 1);

    if (ratio < 0.25) return "bg-blue-500 shadow-blue-500/60";
    if (ratio < 0.5) return "bg-green-500 shadow-green-500/60";
    if (ratio < 0.75) return "bg-yellow-400 shadow-yellow-400/60";
    return "bg-red-500 shadow-red-500/60";
  }

  function getDotSize(value: number) {
    const ratio = Math.min(value / maxValue, 1);
    return 22 + ratio * 34;
  }

  const sensors = [
    { name: "S1", value: current.sensor1, left: "24%", top: "68%" },
    { name: "S2", value: current.sensor2, left: "50%", top: "72%" },
    { name: "S3", value: current.sensor3, left: "76%", top: "68%" },
  ];

  return (
    <SectionCard title="범퍼 압력 위치" compact>
      <div className="relative mx-auto h-[180px] w-full max-w-xl overflow-hidden rounded-2xl border border-slate-800 bg-black md:h-[260px]">
        <img
          src="/bumper.png"
          alt="car bumper"
          className="absolute left-1/2 top-[44%] w-[108%] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain"
        />

        {sensors.map((sensor) => {
          const size = getDotSize(sensor.value);

          return (
            <div
              key={sensor.name}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: sensor.left, top: sensor.top }}
              title={`${sensor.name}: ${sensor.value}`}
            >
              <div
                className={`flex items-center justify-center rounded-full border-2 border-white/90 text-xs font-bold text-white shadow-2xl transition-all duration-300 ${getDotStyle(
                  sensor.value
                )}`}
                style={{ width: `${size}px`, height: `${size}px` }}
              >
                {sensor.value}
              </div>

              <div className="mt-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
                {sensor.name}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300">
        <span className="text-blue-400">● 낮음</span>
        <span className="text-green-400">● 보통</span>
        <span className="text-yellow-400">● 높음</span>
        <span className="text-red-400">● 매우 높음</span>
      </div>
    </SectionCard>
  );
}

function RawDataTable({
  data,
  index,
  onSelect,
}: {
  data: SensorData[];
  index: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="max-h-64 overflow-x-auto overflow-y-auto md:max-h-80">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-slate-400">
            <th className="py-3 pr-3">번호</th>
            <th className="py-3 pr-3">시간</th>
            <th className="py-3 pr-3">S1</th>
            <th className="py-3 pr-3">S2</th>
            <th className="py-3 pr-3">S3</th>
          </tr>
        </thead>

        <tbody>
          {data.map((d, i) => (
            <tr
              key={d.id}
              onClick={() => onSelect(i)}
              className={`cursor-pointer border-b border-slate-800 ${
                i === index ? "bg-slate-800" : ""
              }`}
            >
              <td className="py-3 pr-3">{i + 1}</td>
              <td className="py-3 pr-3">
                {(d.elapsed_ms / 1000).toFixed(1)}초
              </td>
              <td className="py-3 pr-3">{d.sensor1}</td>
              <td className="py-3 pr-3">{d.sensor2}</td>
              <td className="py-3 pr-3">{d.sensor3}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getDataStatus(latest: SensorData | undefined, isRecordingNow: boolean) {
  if (!latest) {
    return {
      label: isRecordingNow ? "데이터 대기 중" : "측정 종료됨",
      color: isRecordingNow ? "yellow" : "blue",
      message: isRecordingNow
        ? "측정은 켜져 있지만 아직 저장된 센서 데이터가 없습니다."
        : "현재 세션에 저장된 센서 데이터가 없습니다.",
      secondsAgo: null,
    };
  }

  const lastTime = new Date(latest.created_at).getTime();
  const secondsAgo = Math.max(0, (Date.now() - lastTime) / 1000);

  if (!isRecordingNow) {
    return {
      label: "측정 종료됨",
      color: "blue",
      message: "측정이 종료된 세션입니다.",
      secondsAgo,
    };
  }

  if (secondsAgo <= 4) {
    return {
      label: "수신 정상",
      color: "green",
      message: `${secondsAgo.toFixed(1)}초 전에 마지막 데이터 수신`,
      secondsAgo,
    };
  }

  if (secondsAgo <= 12) {
    return {
      label: "수신 지연",
      color: "yellow",
      message: `${secondsAgo.toFixed(1)}초 동안 새 데이터가 없습니다.`,
      secondsAgo,
    };
  }

  return {
    label: "끊김 의심",
    color: "red",
    message: `${secondsAgo.toFixed(1)}초 이상 새 데이터가 없습니다.`,
    secondsAgo,
  };
}