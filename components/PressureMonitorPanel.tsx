"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

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

type ExpandedChart = "bar" | "line" | null;

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
  const [expandedChart, setExpandedChart] = useState<ExpandedChart>(null);

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
        if (autoFollowLatestRef.current) {
          return newData.length - 1;
        }

        return Math.min(prevIndex, newData.length - 1);
      });
    }
  }

  useEffect(() => {
    setData([]);
    setIndex(0);
    setAutoFollowLatest(true);
    autoFollowLatestRef.current = true;
  }, [machineId, sessionId]);

  useEffect(() => {
    fetchData();

    const interval = setInterval(() => {
      fetchData();
    }, 1000);

    return () => clearInterval(interval);
  }, [machineId, sessionId]);

  const current = data[index];

  if (!sessionId) {
    return null;
  }

  return (
    <section className="mt-8 md:mt-10">
      <div className="mb-6">
        <h2 className="text-xl font-bold md:text-2xl">보압 상세 확인</h2>
        <p className="mt-1 text-slate-400">현재 측정 세션: {sessionId}</p>
      </div>

      {current ? (
        <>
          <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <SensorCard title="Sensor 1" value={current.sensor1} />
            <SensorCard title="Sensor 2" value={current.sensor2} />
            <SensorCard title="Sensor 3" value={current.sensor3} />
          </section>

          <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">시간 선택</h2>

              <button
                onClick={() => {
                  autoFollowLatestRef.current = true;
                  setAutoFollowLatest(true);
                  setIndex(Math.max(data.length - 1, 0));
                }}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${
                  autoFollowLatest
                    ? "bg-cyan-500 text-slate-950"
                    : "bg-slate-800 text-white hover:bg-slate-700"
                }`}
              >
                최신 보기
              </button>
            </div>

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

            <div className="mt-3 flex justify-between text-sm text-slate-400">
              <span>0ms</span>
              <span>
                {index + 1} / {data.length}
              </span>
              <span>{current.elapsed_ms}ms</span>
            </div>

            <p className="mt-4 text-slate-300">
              선택된 시간: {new Date(current.created_at).toLocaleTimeString()}
            </p>

            <p className="mt-2 text-sm text-slate-500">
              상태:{" "}
              {autoFollowLatest
                ? "최신 데이터 자동 추적 중"
                : "선택한 시간 고정 중"}
            </p>
          </section>

          <section
            className={
              expandedChart === "bar"
                ? "mb-8 grid grid-cols-1 gap-6"
                : expandedChart === "line"
                ? "mb-8 grid grid-cols-1 gap-6"
                : "mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2"
            }
          >
            {expandedChart !== "line" && (
              <ChartWrapper
                title="현재 압력 막대그래프"
                expanded={expandedChart === "bar"}
                onToggle={() =>
                  setExpandedChart(expandedChart === "bar" ? null : "bar")
                }
              >
                <BarChart current={current} large={expandedChart === "bar"} />
              </ChartWrapper>
            )}

            {expandedChart !== "bar" && (
              <ChartWrapper
                title="누적 꺾은선 그래프"
                expanded={expandedChart === "line"}
                onToggle={() =>
                  setExpandedChart(expandedChart === "line" ? null : "line")
                }
              >
                <LineChart
                  data={data}
                  index={index}
                  large={expandedChart === "line"}
                />
              </ChartWrapper>
            )}
          </section>

          <BumperPressureMap current={current} />

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-xl font-semibold">전체 데이터</h2>

            <div className="max-h-80 overflow-x-auto overflow-y-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="py-3">번호</th>
                    <th className="py-3">Elapsed</th>
                    <th className="py-3">Sensor 1</th>
                    <th className="py-3">Sensor 2</th>
                    <th className="py-3">Sensor 3</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d, i) => (
                    <tr
                      key={d.id}
                      onClick={() => {
                        autoFollowLatestRef.current = false;
                        setAutoFollowLatest(false);
                        setIndex(i);
                      }}
                      className={`cursor-pointer border-b border-slate-800 ${
                        i === index ? "bg-slate-800" : ""
                      }`}
                    >
                      <td className="py-3">{i + 1}</td>
                      <td className="py-3">{d.elapsed_ms}ms</td>
                      <td className="py-3">{d.sensor1}</td>
                      <td className="py-3">{d.sensor2}</td>
                      <td className="py-3">{d.sensor3}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
          측정 데이터가 들어오면 이곳에 보압 상세 화면이 표시됩니다.
        </div>
      )}
    </section>
  );
}

function ChartWrapper({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="relative rounded-2xl border border-slate-800 bg-slate-900 p-4 md:p-5">
      <button
        onClick={onToggle}
        className="absolute right-4 top-4 rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
      >
        {expanded ? "↙ 축소" : "🔍 확대"}
      </button>

      <h2 className="mb-4 pr-24 text-xl font-semibold">
        {title} {expanded ? "(확대)" : ""}
      </h2>

      {children}
    </section>
  );
}

function SensorCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 shadow-lg md:p-6">
      <p className="mb-1 text-xs text-slate-400 md:mb-2 md:text-base">{title}</p>
      <p className="text-2xl font-bold md:text-4xl">{value}</p>
      <p className="mt-1 text-[10px] text-slate-500 md:mt-2 md:text-sm">
        raw ADC
      </p>
    </div>
  );
}

function BarChart({
  current,
  large,
}: {
  current: SensorData;
  large: boolean;
}) {
  const maxValue = 4095;

  const bars = [
    { name: "Sensor 1", value: current.sensor1 },
    { name: "Sensor 2", value: current.sensor2 },
    { name: "Sensor 3", value: current.sensor3 },
  ];

  return (
    <div className={large ? "space-y-8" : "space-y-5"}>
      {bars.map((bar) => {
        const width = Math.min((bar.value / maxValue) * 100, 100);

        return (
          <div key={bar.name}>
            <div className="mb-2 flex justify-between">
              <span className="text-slate-300">{bar.name}</span>
              <span className="font-bold">{bar.value}</span>
            </div>

            <div
              className={`overflow-hidden rounded-full bg-slate-800 ${
                large ? "h-14" : "h-8"
              }`}
            >
              <div
                className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({
  data,
  index,
  large,
}: {
  data: SensorData[];
  index: number;
  large: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 800;
  const height = large ? 460 : 280;
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

  function makePoints(sensorKey: "sensor1" | "sensor2" | "sensor3") {
    return selectedData
      .map((d, i) => `${getX(i)},${getY(d[sensorKey])}`)
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
        className={`w-full rounded-xl border border-slate-800 bg-slate-950 ${
          large ? "h-[360px] md:h-[560px]" : "h-56 md:h-80"
        }`}
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

            <circle
              cx={hoverX}
              cy={getY(activeHover.sensor1)}
              r="5"
              fill="#22d3ee"
            />
            <circle
              cx={hoverX}
              cy={getY(activeHover.sensor2)}
              r="5"
              fill="#a78bfa"
            />
            <circle
              cx={hoverX}
              cy={getY(activeHover.sensor3)}
              r="5"
              fill="#34d399"
            />
          </>
        )}
      </svg>

      {activeHover && (
        <div className="mt-4 rounded-xl bg-slate-800 p-4 text-sm">
          <p className="mb-2 text-slate-300">
            커서 위치: {hoverIndex! + 1}번째 데이터 / {activeHover.elapsed_ms}
            ms
          </p>
          <div className="flex flex-wrap gap-4">
            <span className="text-cyan-400">
              ● Sensor 1: {activeHover.sensor1}
            </span>
            <span className="text-violet-400">
              ● Sensor 2: {activeHover.sensor2}
            </span>
            <span className="text-emerald-400">
              ● Sensor 3: {activeHover.sensor3}
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-4 text-sm">
        <span className="text-cyan-400">● Sensor 1</span>
        <span className="text-violet-400">● Sensor 2</span>
        <span className="text-emerald-400">● Sensor 3</span>
        <span className="text-yellow-400">─ 현재 슬라이더 위치</span>
      </div>
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
    return 24 + ratio * 32;
  }

  const sensors = [
    { name: "Sensor 1", value: current.sensor1, left: "15%", top: "56%" },
    { name: "Sensor 2", value: current.sensor2, left: "50%", top: "53%" },
    { name: "Sensor 3", value: current.sensor3, left: "85%", top: "56%" },
  ];

  return (
    <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-4 text-xl font-semibold">범퍼 압력 위치 표시</h2>

        <div className="relative mx-auto w-full max-w-xl rounded-2xl border border-slate-800 bg-black p-4">        <img
        src="/bumper.png"
        alt="car bumper"
        className="w-full h-auto object-contain"
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
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                }}
              >
                {sensor.value}
              </div>

              <div className="mt-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
                {sensor.name}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-300">
        <span className="text-blue-400">● 낮음</span>
        <span className="text-green-400">● 보통</span>
        <span className="text-yellow-400">● 높음</span>
        <span className="text-red-400">● 매우 높음</span>
      </div>
    </section>
  );
}