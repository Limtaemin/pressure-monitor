"use client";

import Link from "next/link";

const machines = [
  {
    id: "injection-01",
    name: "자동차 범퍼 사출기 #1",
    model: "Bumper Injection Molding Machine",
    status: "대기 중",
    image: "/pressure_1.webp",
  },
  {
    id: "injection-02",
    name: "도어 트림 사출기 #2",
    model: "Door Trim Injection Molding Machine",
    status: "대기 중",
    image: "/pressure_2.webp",
  },
  {
    id: "injection-03",
    name: "센터페시아 사출기 #3",
    model: "Center Fascia Injection Molding Machine",
    status: "대기 중",
    image: "/pressure_3.webp",
  },
  {
    id: "injection-04",
    name: "엔진 커버 사출기 #4",
    model: "Engine Cover Injection Molding Machine",
    status: "대기 중",
    image: "/pressure_4.webp",
  },
];

export default function MachineSelectPage() {

  return (
    <main className="min-h-screen bg-gray-950 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <header className="mb-10">
          <h1 className="mb-3 text-4xl font-bold">
            사출 성형기 모니터링 시스템
          </h1>
          <p className="text-gray-400">
            관찰하려는 사출 성형기를 선택하세요.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {machines.map((machine) => (
            <Link
              key={machine.id}
              href={`/machines/${machine.id}/login`}
              className="group overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 text-left transition hover:-translate-y-1 hover:border-blue-500 hover:bg-gray-800 hover:shadow-2xl"
            >
              <div className="h-56 w-full overflow-hidden bg-gray-800">
                <img
                  src={machine.image}
                  alt={machine.name}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              </div>

              <div className="p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold">{machine.name}</h2>
                    <p className="mt-1 text-gray-400">{machine.model}</p>
                  </div>

                  <span className="shrink-0 rounded-full bg-green-900 px-3 py-1 text-sm text-green-300">
                    {machine.status}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-gray-800 pt-4">
                  <p className="text-sm text-gray-500">
                    Machine ID: {machine.id}
                  </p>
                  <p className="text-sm font-bold text-blue-400">
                    접속하기 →
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}