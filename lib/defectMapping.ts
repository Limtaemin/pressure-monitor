import type { ReferenceProfile } from "./referenceProfiles";
import type { SensorJudgement } from "./eoAnalysis";

export type DefectResult = {
  causes: string[];
  defects: string[];
};

export function analyzeDefects(
  sensor: SensorJudgement,
  profile: ReferenceProfile
): DefectResult {
  const causes: string[] = [];
  const defects: string[] = [];

  // 1. 최대압력 부족
  if (sensor.maxPressure < profile.criteria.peakToleranceRatio * 1000) {
    causes.push("보압 피크 부족");
    defects.push("미충전 가능성");
  }

  // 2. 보압 평균 부족
  if (
    sensor.referenceHoldAvgPressure > 0 &&
    sensor.holdAvgPressure <
      sensor.referenceHoldAvgPressure * profile.criteria.minHoldAvgRatio
  ) {
    causes.push("보압 유지 부족");
    defects.push("수축 / 싱크마크 가능성");
  }

  // 3. 보압 면적 부족
  if (
    sensor.referenceHoldArea > 0 &&
    sensor.holdArea <
      sensor.referenceHoldArea * profile.criteria.minHoldAreaRatio
  ) {
    causes.push("보압 에너지 부족");
    defects.push("싱크마크 / 치수 부족");
  }

  // 4. 감소 기울기 과다
  if (
    sensor.referenceDecaySlope > 0 &&
    sensor.decaySlope >
      sensor.referenceDecaySlope * profile.criteria.maxDecaySlopeRatio
  ) {
    causes.push("압력 급감");
    defects.push("보압 부족 / 치수 불안정");
  }

  // 5. 곡선 유사도 부족
  if (sensor.similarity < profile.criteria.minSimilarity) {
    causes.push("보압 곡선 불안정");
    defects.push("공정 변동 / 품질 불균일");
  }

  // 6. 과보압 (Talc profile만)
  if (profile.criteria.overPackingEnabled) {
    if (sensor.maxPressure > sensor.referenceHoldAvgPressure * 1.1) {
      causes.push("과보압");
      defects.push("플래시 / 잔류응력");
    }
  }

  return {
    causes: [...new Set(causes)],
    defects: [...new Set(defects)],
  };
}