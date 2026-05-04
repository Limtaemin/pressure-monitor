import type { ReferenceProfile } from "@/lib/referenceProfiles";

export type SensorKey = "sensor1" | "sensor2" | "sensor3";

export type SensorDataPoint = {
  elapsed_ms: number;
  sensor1: number;
  sensor2: number;
  sensor3: number;
};

export type ReferencePoint = {
  time_ms: number;
  pressure: number;
};

export type SensorLimit = {
  minMaxPressure: number;
  minFinalPressure: number;
  maxPressureDrop: number;
  minSimilarity: number;

  minHoldAvgRatio: number;
  minHoldAreaRatio: number;
  maxDecaySlopeRatio: number;
};

export type SensorJudgement = {
  sensorKey: SensorKey;
  result: "OK" | "NG";

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

  reasons: string[];
};

export const SENSOR_LIMITS: Record<SensorKey, SensorLimit> = {
  sensor1: {
    minMaxPressure: 500,
    minFinalPressure: 250,
    maxPressureDrop: 450,
    minSimilarity: 0.8,

    minHoldAvgRatio: 0.85,
    minHoldAreaRatio: 0.85,
    maxDecaySlopeRatio: 1.2,
  },
  sensor2: {
    minMaxPressure: 450,
    minFinalPressure: 220,
    maxPressureDrop: 420,
    minSimilarity: 0.8,

    minHoldAvgRatio: 0.85,
    minHoldAreaRatio: 0.85,
    maxDecaySlopeRatio: 1.2,
  },
  sensor3: {
    minMaxPressure: 400,
    minFinalPressure: 200,
    maxPressureDrop: 400,
    minSimilarity: 0.8,

    minHoldAvgRatio: 0.85,
    minHoldAreaRatio: 0.85,
    maxDecaySlopeRatio: 1.2,
  },
};

const HOLD_START_MS = 5000;
const HOLD_END_MS = 28000;
const DECAY_START_MS = 28000;
const DECAY_END_MS = 40000;

function interpolateReferencePressure(
  referenceCurve: ReferencePoint[],
  targetTimeMs: number
): number | null {
  if (referenceCurve.length === 0) return null;

  const sorted = [...referenceCurve].sort((a, b) => a.time_ms - b.time_ms);

  if (targetTimeMs <= sorted[0].time_ms) return sorted[0].pressure;

  if (targetTimeMs >= sorted[sorted.length - 1].time_ms) {
    return sorted[sorted.length - 1].pressure;
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];

    if (targetTimeMs >= p1.time_ms && targetTimeMs <= p2.time_ms) {
      const ratio =
        (targetTimeMs - p1.time_ms) / (p2.time_ms - p1.time_ms);

      return p1.pressure + ratio * (p2.pressure - p1.pressure);
    }
  }

  return null;
}

function calculateSimilarity(
  data: SensorDataPoint[],
  referenceCurve: ReferencePoint[],
  sensorKey: SensorKey
): number {
  let totalError = 0;
  let count = 0;
  let maxRef = 0;

  for (const point of data) {
    const actual = point[sensorKey];
    const ref = interpolateReferencePressure(referenceCurve, point.elapsed_ms);

    if (ref === null) continue;

    totalError += Math.abs(actual - ref);
    count += 1;

    if (ref > maxRef) maxRef = ref;
  }

  if (count === 0 || maxRef === 0) return 0;

  const avgError = totalError / count;
  const similarity = 1 - avgError / maxRef;

  return Math.max(0, Math.min(1, similarity));
}

function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateArea(points: { time: number; pressure: number }[]): number {
  if (points.length < 2) return 0;

  let area = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const dtSec = (p2.time - p1.time) / 1000;
    const avgPressure = (p1.pressure + p2.pressure) / 2;

    area += avgPressure * dtSec;
  }

  return area;
}

function calculateDecaySlope(points: { time: number; pressure: number }[]) {
  if (points.length < 2) return 0;

  const first = points[0];
  const last = points[points.length - 1];

  const dtSec = (last.time - first.time) / 1000;
  if (dtSec <= 0) return 0;

  return (first.pressure - last.pressure) / dtSec;
}

function analyzeSingleSensor(
  data: SensorDataPoint[],
  referenceCurve: ReferencePoint[],
  sensorKey: SensorKey,
  profile?: ReferenceProfile
): SensorJudgement {
    const baseLimit = SENSOR_LIMITS[sensorKey];

    const limit = {
        ...baseLimit,
        minSimilarity: profile?.criteria.minSimilarity ?? baseLimit.minSimilarity,
        minHoldAvgRatio:
        profile?.criteria.minHoldAvgRatio ?? baseLimit.minHoldAvgRatio,
        minHoldAreaRatio:
        profile?.criteria.minHoldAreaRatio ?? baseLimit.minHoldAreaRatio,
        maxDecaySlopeRatio:
        profile?.criteria.maxDecaySlopeRatio ?? baseLimit.maxDecaySlopeRatio,
    };
  const reasons: string[] = [];

  const values = data.map((point) => point[sensorKey]);

  const maxPressure = values.length > 0 ? Math.max(...values) : 0;
  const finalPressure = values.length > 0 ? values[values.length - 1] : 0;
  const pressureDrop = maxPressure - finalPressure;

  if (maxPressure < limit.minMaxPressure) {
    reasons.push(
      `최대 압력 부족: ${maxPressure.toFixed(1)} < 기준 ${limit.minMaxPressure}`
    );
  }

  if (finalPressure < limit.minFinalPressure) {
    reasons.push(
      `최종 보압 부족: ${finalPressure.toFixed(1)} < 기준 ${limit.minFinalPressure}`
    );
  }

  if (pressureDrop > limit.maxPressureDrop) {
    reasons.push(
      `압력 감소 과다: ${pressureDrop.toFixed(1)} > 기준 ${limit.maxPressureDrop}`
    );
  }

  const similarity = calculateSimilarity(data, referenceCurve, sensorKey);

  if (similarity < limit.minSimilarity) {
    reasons.push(
      `기준곡선과 유사도 부족: ${(similarity * 100).toFixed(1)}% < 기준 ${(
        limit.minSimilarity * 100
      ).toFixed(0)}%`
    );
  }

  const holdData = data.filter(
    (point) => point.elapsed_ms >= HOLD_START_MS && point.elapsed_ms <= HOLD_END_MS
  );

  const actualHoldPoints = holdData.map((point) => ({
    time: point.elapsed_ms,
    pressure: point[sensorKey],
  }));

  const referenceHoldPoints = holdData
    .map((point) => {
      const ref = interpolateReferencePressure(referenceCurve, point.elapsed_ms);

      if (ref === null) return null;

      return {
        time: point.elapsed_ms,
        pressure: ref,
      };
    })
    .filter((point): point is { time: number; pressure: number } => point !== null);

  const holdAvgPressure = calculateAverage(
    actualHoldPoints.map((point) => point.pressure)
  );

  const referenceHoldAvgPressure = calculateAverage(
    referenceHoldPoints.map((point) => point.pressure)
  );

  const holdArea = calculateArea(actualHoldPoints);
  const referenceHoldArea = calculateArea(referenceHoldPoints);

  if (
    referenceHoldAvgPressure > 0 &&
    holdAvgPressure < referenceHoldAvgPressure * limit.minHoldAvgRatio
  ) {
    reasons.push(
      `보압 구간 평균 압력 부족: ${holdAvgPressure.toFixed(
        1
      )} < 기준 ${(referenceHoldAvgPressure * limit.minHoldAvgRatio).toFixed(1)}`
    );
  }

  if (
    referenceHoldArea > 0 &&
    holdArea < referenceHoldArea * limit.minHoldAreaRatio
  ) {
    reasons.push(
      `보압 구간 압력-시간 면적 부족: ${holdArea.toFixed(
        1
      )} < 기준 ${(referenceHoldArea * limit.minHoldAreaRatio).toFixed(1)}`
    );
  }

  const decayData = data.filter(
    (point) =>
      point.elapsed_ms >= DECAY_START_MS && point.elapsed_ms <= DECAY_END_MS
  );

  const actualDecayPoints = decayData.map((point) => ({
    time: point.elapsed_ms,
    pressure: point[sensorKey],
  }));

  const referenceDecayPoints = decayData
    .map((point) => {
      const ref = interpolateReferencePressure(referenceCurve, point.elapsed_ms);

      if (ref === null) return null;

      return {
        time: point.elapsed_ms,
        pressure: ref,
      };
    })
    .filter((point): point is { time: number; pressure: number } => point !== null);

  const decaySlope = calculateDecaySlope(actualDecayPoints);
  const referenceDecaySlope = calculateDecaySlope(referenceDecayPoints);

  if (
    referenceDecaySlope > 0 &&
    decaySlope > referenceDecaySlope * limit.maxDecaySlopeRatio
  ) {
    reasons.push(
      `압력 감소 기울기 과다: ${decaySlope.toFixed(
        2
      )} > 기준 ${(referenceDecaySlope * limit.maxDecaySlopeRatio).toFixed(2)}`
    );
  }

  return {
    sensorKey,
    result: reasons.length === 0 ? "OK" : "NG",

    maxPressure,
    finalPressure,
    pressureDrop,
    similarity,

    holdAvgPressure,
    referenceHoldAvgPressure,
    holdArea,
    referenceHoldArea,
    decaySlope,
    referenceDecaySlope,

    reasons,
  };
}

export function analyzeEOQuality(
  data: SensorDataPoint[],
  referenceCurve: ReferencePoint[],
  profile?: ReferenceProfile
) {
  const sensor1 = analyzeSingleSensor(data, referenceCurve, "sensor1", profile);
  const sensor2 = analyzeSingleSensor(data, referenceCurve, "sensor2", profile);
  const sensor3 = analyzeSingleSensor(data, referenceCurve, "sensor3", profile);

  const result =
    sensor1.result === "OK" &&
    sensor2.result === "OK" &&
    sensor3.result === "OK"
      ? "OK"
      : "NG";

  return {
    result,
    sensorJudgement: {
      sensor1,
      sensor2,
      sensor3,
    },
  };
}