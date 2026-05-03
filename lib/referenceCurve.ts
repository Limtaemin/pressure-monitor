import { supabase } from "@/lib/supabase";

export type ReferencePoint = {
  time_ms: number;
  pressure: number;
};

export async function getReferenceCurve(
  machineId: string
): Promise<ReferencePoint[]> {
  console.log("[getReferenceCurve] machineId:", machineId);

  const { data, error } = await supabase
    .from("reference_curves")
    .select("time_ms, pressure")
    .eq("machine_id", machineId)
    .order("time_ms", { ascending: true });

  if (error) {
    console.error("[getReferenceCurve] reference_curves fetch error:", error);
    return [];
  }

  console.log("[getReferenceCurve] rows:", data);

  if (!data || data.length === 0) {
    console.warn("[getReferenceCurve] empty reference curve:", machineId);
    return [];
  }

  return data.map((row) => ({
    time_ms: Number(row.time_ms),
    pressure: Number(row.pressure),
  }));
}