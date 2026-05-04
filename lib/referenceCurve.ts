import { supabase } from "./supabase";

export type ReferencePoint = {
  time_ms: number;
  pressure: number;
};

export async function getReferenceCurve(
  machineId: string,
  profileId: string
): Promise<ReferencePoint[]> {
  const { data, error } = await supabase
    .from("reference_curves")
    .select("time_ms, pressure")
    .eq("machine_id", machineId)
    .eq("profile_id", profileId)
    .order("time_ms", { ascending: true });

  if (error) {
    console.error("reference curve load error:", error);
    return [];
  }

  return data || [];
}