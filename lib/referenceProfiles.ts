export type TargetProperty =
  | "stiffness"
  | "impact"
  | "dimensional_stability"
  | "appearance";

export type ReferenceProfile = {
  id: string;
  label: string;

  baseMaterial: "PP";
  epdmRatio: number;
  talcRatio: number;

  targetProperty: TargetProperty;
  targetPropertyLabel: string;

  criteria: {
    peakToleranceRatio: number;
    minHoldAvgRatio: number;
    minHoldAreaRatio: number;
    maxDecaySlopeRatio: number;
    minSimilarity: number;
    overPackingEnabled: boolean;
  };

  description: string;
};

export const REFERENCE_PROFILES: ReferenceProfile[] = [
  {
    id: "pp_dimensional_stability",
    label: "PP / 치수 안정성",
    baseMaterial: "PP",
    epdmRatio: 0,
    talcRatio: 0,
    targetProperty: "dimensional_stability",
    targetPropertyLabel: "치수 안정성",
    criteria: {
      peakToleranceRatio: 0.15,
      minHoldAvgRatio: 0.85,
      minHoldAreaRatio: 0.85,
      maxDecaySlopeRatio: 1.2,
      minSimilarity: 0.8,
      overPackingEnabled: false,
    },
    description:
      "PP는 수축 보상이 중요하므로 보압 유지와 압력 감소 기울기를 중심으로 판정합니다.",
  },
  {
    id: "pp_epdm_15_impact",
    label: "PP + EPDM 15% / 충격성",
    baseMaterial: "PP",
    epdmRatio: 15,
    talcRatio: 0,
    targetProperty: "impact",
    targetPropertyLabel: "충격성",
    criteria: {
      peakToleranceRatio: 0.12,
      minHoldAvgRatio: 0.88,
      minHoldAreaRatio: 0.88,
      maxDecaySlopeRatio: 1.15,
      minSimilarity: 0.85,
      overPackingEnabled: false,
    },
    description:
      "EPDM이 포함된 재료는 곡선 안정성과 반복성이 중요하므로 기준곡선 유사도를 중심으로 판정합니다.",
  },
  {
    id: "pp_epdm_15_talc_20_dimensional_stability",
    label: "PP + EPDM 15% + Talc 20% / 치수 안정성",
    baseMaterial: "PP",
    epdmRatio: 15,
    talcRatio: 20,
    targetProperty: "dimensional_stability",
    targetPropertyLabel: "치수 안정성",
    criteria: {
      peakToleranceRatio: 0.1,
      minHoldAvgRatio: 0.9,
      minHoldAreaRatio: 0.9,
      maxDecaySlopeRatio: 1.1,
      minSimilarity: 0.9,
      overPackingEnabled: true,
    },
    description:
      "Talc가 포함된 범퍼용 소재는 말단부 압력 전달과 치수 안정성이 중요하므로 보압 부족과 과보압을 함께 판정합니다.",
  },
];

export function getReferenceProfile(profileId: string): ReferenceProfile {
  return (
    REFERENCE_PROFILES.find((profile) => profile.id === profileId) ??
    REFERENCE_PROFILES[0]
  );
}