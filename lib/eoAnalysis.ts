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

  // true면 전체 OK/NG 판정에 반영, false면 참고 채널로만 표시
  affectsOverallResult: boolean;
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

// 20초 측정 기준
// 현재 108번 실제 데이터 패턴 기준:
// 0~9초: 대기/무압
// 10~14초: 대표 압력 상승 및 유지
// 15~19초: 압력 해제/종료
const MEASUREMENT_END_MS = 20000;
const HOLD_START_MS = 10000;
const HOLD_END_MS = 14500;
const DECAY_START_MS = 14500;
const DECAY_END_MS = 19000;

// 현재 센서 배치 기준:
// Sensor 2 = 대표 보압 판정 센서
// Sensor 1, 3 = 압력 분포 확인용 보조 센서
export const SENSOR_LIMITS: Record<SensorKey, SensorLimit> = {
  sensor1: {
    // 보조 채널: 전체 NG에 반영하지 않음
    minMaxPressure: 0,
    minFinalPressure: 0,
    maxPressureDrop: 99999,
    minSimilarity: 0,

    minHoldAvgRatio: 0,
    minHoldAreaRatio: 0,
    maxDecaySlopeRatio: 99999,

    affectsOverallResult: false,
  },
  sensor2: {
    // 대표 보압 센서: 실제 108번 데이터 기준 느슨한 시연용 판정
    minMaxPressure: 800,
    minFinalPressure: 50,
    maxPressureDrop: 1600,
    minSimilarity: 0.55,

    minHoldAvgRatio: 0.5,
    minHoldAreaRatio: 0.5,
    maxDecaySlopeRatio: 5.0,

    affectsOverallResult: true,
  },
  sensor3: {
    // 보조 채널: 전체 NG에 반영하지 않음
    minMaxPressure: 0,
    minFinalPressure: 0,
    maxPressureDrop: 99999,
    minSimilarity: 0,

    minHoldAvgRatio: 0,
    minHoldAreaRatio: 0,
    maxDecaySlopeRatio: 99999,

    affectsOverallResult: false,
  },
};

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
    if (point.elapsed_ms < 0 || point.elapsed_ms > MEASUREMENT_END_MS) continue;

    const actual = point[sensorKey];
    const ref = interpolateReferencePressure(referenceCurve, point.elapsed_ms);

    if (ref === null) continue;

    totalError += Math.abs(actual - ref);
    count += 1;

    if (ref > maxRef) maxRef = ref;
  }

  // 기준곡선이 없거나 기준값이 전부 0이면 유사도 때문에 NG를 만들지 않는다.
  if (count === 0 || maxRef === 0) return 1;

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
    minSimilarity:
      sensorKey === "sensor2"
        ? profile?.criteria.minSimilarity ?? baseLimit.minSimilarity
        : baseLimit.minSimilarity,
    minHoldAvgRatio:
      sensorKey === "sensor2"
        ? profile?.criteria.minHoldAvgRatio ?? baseLimit.minHoldAvgRatio
        : baseLimit.minHoldAvgRatio,
    minHoldAreaRatio:
      sensorKey === "sensor2"
        ? profile?.criteria.minHoldAreaRatio ?? baseLimit.minHoldAreaRatio
        : baseLimit.minHoldAreaRatio,
    maxDecaySlopeRatio:
      sensorKey === "sensor2"
        ? profile?.criteria.maxDecaySlopeRatio ?? baseLimit.maxDecaySlopeRatio
        : baseLimit.maxDecaySlopeRatio,
  };

  const reasons: string[] = [];

  const validData = data
    .filter((point) => point.elapsed_ms >= 0 && point.elapsed_ms <= MEASUREMENT_END_MS)
    .sort((a, b) => a.elapsed_ms - b.elapsed_ms);

  const values = validData.map((point) => point[sensorKey]);

  const maxPressure = values.length > 0 ? Math.max(...values) : 0;
  const finalPressure = values.length > 0 ? values[values.length - 1] : 0;
  const pressureDrop = maxPressure - finalPressure;

  if (baseLimit.affectsOverallResult) {
    if (maxPressure < limit.minMaxPressure) {
      reasons.push(
        `대표 보압 센서 최대 압력 부족: ${maxPressure.toFixed(
          1
        )} < 기준 ${limit.minMaxPressure}`
      );
    }

    if (finalPressure < limit.minFinalPressure) {
      reasons.push(
        `대표 보압 센서 최종 압력 부족: ${finalPressure.toFixed(
          1
        )} < 기준 ${limit.minFinalPressure}`
      );
    }

    if (pressureDrop > limit.maxPressureDrop) {
      reasons.push(
        `대표 보압 센서 압력 감소 과다: ${pressureDrop.toFixed(
          1
        )} > 기준 ${limit.maxPressureDrop}`
      );
    }
  }

  const similarity = calculateSimilarity(validData, referenceCurve, sensorKey);

  if (baseLimit.affectsOverallResult && similarity < limit.minSimilarity) {
    reasons.push(
      `대표 보압 기준곡선과 유사도 부족: ${(similarity * 100).toFixed(
        1
      )}% < 기준 ${(limit.minSimilarity * 100).toFixed(0)}%`
    );
  }

  const holdData = validData.filter(
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
    baseLimit.affectsOverallResult &&
    referenceHoldAvgPressure > 0 &&
    holdAvgPressure < referenceHoldAvgPressure * limit.minHoldAvgRatio
  ) {
    reasons.push(
      `대표 보압 구간 평균 압력 부족: ${holdAvgPressure.toFixed(
        1
      )} < 기준 ${(referenceHoldAvgPressure * limit.minHoldAvgRatio).toFixed(1)}`
    );
  }

  if (
    baseLimit.affectsOverallResult &&
    referenceHoldArea > 0 &&
    holdArea < referenceHoldArea * limit.minHoldAreaRatio
  ) {
    reasons.push(
      `대표 보압 구간 압력-시간 면적 부족: ${holdArea.toFixed(
        1
      )} < 기준 ${(referenceHoldArea * limit.minHoldAreaRatio).toFixed(1)}`
    );
  }

  const decayData = validData.filter(
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
    baseLimit.affectsOverallResult &&
    referenceDecaySlope > 0 &&
    decaySlope > referenceDecaySlope * limit.maxDecaySlopeRatio
  ) {
    reasons.push(
      `대표 보압 감소 기울기 과다: ${decaySlope.toFixed(
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

  // 전체 판정은 현재 실제 센서 구조상 대표 센서 S2만 반영한다.
  // S1/S3는 압력 분포 확인용 참고 채널이다.
  const result = sensor2.result;

  return {
    result,
    sensorJudgement: {
      sensor1,
      sensor2,
      sensor3,
    },
  };
}
