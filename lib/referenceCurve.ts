import { supabase } from "@/lib/supabase";

export type SensorKey = "sensor1" | "sensor2" | "sensor3";

export type ReferencePoint = {
  time_ms: number;
  pressure: number;
};

export type ReferenceCurveSet = Record<SensorKey, ReferencePoint[]>;

function emptyReferenceCurves(): ReferenceCurveSet {
  return {
    sensor1: [],
    sensor2: [],
    sensor3: [],
  };
}

async function queryReferenceCurve(
  machineId: string,
  profileId: string,
  sensorKey: SensorKey
): Promise<ReferencePoint[]> {
  const { data, error } = await supabase
    .from("reference_curves")
    .select("time_ms, pressure")
    .eq("machine_id", machineId)
    .eq("profile_id", profileId)
    .eq("sensor_key", sensorKey)
    .gte("time_ms", -5000)
    .lte("time_ms", 17000)
    .order("time_ms", { ascending: true });

  if (error) {
    console.error("[queryReferenceCurve] 기준 곡선 불러오기 실패:", {
      machineId,
      profileId,
      sensorKey,
      error,
    });
    return [];
  }

  return (data ?? []).map((row) => ({
    time_ms: Number(row.time_ms),
    pressure: Number(row.pressure),
  }));
}

export async function getReferenceCurves(
  machineId: string,
  profileId: string
): Promise<ReferenceCurveSet> {
  const sensorKeys: SensorKey[] = ["sensor1", "sensor2", "sensor3"];

  const result = emptyReferenceCurves();

  for (const sensorKey of sensorKeys) {
    let curve = await queryReferenceCurve(machineId, profileId, sensorKey);

    if (curve.length === 0 && profileId !== "default") {
      curve = await queryReferenceCurve(machineId, "default", sensorKey);
    }

    result[sensorKey] = curve;
  }

  return result;
}

// 기존 eoAnalysis 호환용: 대표 판정 센서인 Sensor 2 기준곡선만 반환
export async function getReferenceCurve(
  machineId: string,
  profileId: string
): Promise<ReferencePoint[]> {
  const curves = await getReferenceCurves(machineId, profileId);
  return curves.sensor2;
}
