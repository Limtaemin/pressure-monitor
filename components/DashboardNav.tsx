"use client";

import { usePathname } from "next/navigation";
import AppButton from "@/components/AppButton";

type Props = {
  machineId: string;
};

export default function DashboardNav({ machineId }: Props) {
  const pathname = usePathname();

  const dashboardPath = `/machines/${machineId}/dashboard`;
  const analysisPath = `/machines/${machineId}/dashboard/analysis`;
  const historyPath = `/machines/${machineId}/dashboard/history`;

  const items = [
    {
      label: "사출기 선택",
      href: "/",
      active: pathname === "/",
    },
    {
      label: "실시간 측정",
      href: dashboardPath,
      active: pathname === dashboardPath,
    },
    {
      label: "EO 분석",
      href: analysisPath,
      active: pathname.startsWith(analysisPath),
    },
    {
      label: "측정 이력",
      href: historyPath,
      active: pathname.startsWith(historyPath),
    },
  ];

  return (
    <nav className="sticky top-0 z-30 -mx-4 mb-5 border-b border-slate-800 bg-[#050817]/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:mb-6 md:border-b-0 md:bg-transparent md:px-0 md:py-0">
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-3">
        {items.map((item) => (
          <AppButton
            key={item.href}
            href={item.href}
            variant={item.active ? "primary" : "secondary"}
            size="sm"
            className="min-h-11 md:min-h-12"
          >
            {item.label}
          </AppButton>
        ))}
      </div>
    </nav>
  );
}