// PATH: app/machines/[machineId]/login/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import AppButton from "@/components/AppButton";
import SectionCard from "@/components/SectionCard";

export default function LoginPage() {
  const params = useParams();
  const machineId = params.machineId as string;

  const [adminId, setAdminId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleLogin = () => {
    if (adminId === "admin" && password === "1234") {
      setError("");
      setIsLoggedIn(true);
    } else {
      setIsLoggedIn(false);
      setError("관리자 ID 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050817] px-4 py-6 text-white md:p-6">
      <div className="w-full max-w-md">
        <SectionCard
          title="관리자 로그인"
          description={`선택된 사출기: ${machineId}`}
        >
          <div className="space-y-4">
            <input
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              placeholder="관리자 ID"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
            />

            {error && <p className="text-sm font-bold text-red-400">{error}</p>}

            {!isLoggedIn ? (
              <AppButton
                type="button"
                onClick={handleLogin}
                variant="primary"
                size="md"
                className="w-full"
              >
                로그인
              </AppButton>
            ) : (
              <AppButton
                href={`/machines/${machineId}/dashboard`}
                variant="primary"
                size="md"
                className="w-full"
              >
                대시보드로 이동
              </AppButton>
            )}

            <AppButton href="/" variant="secondary" size="md" className="w-full">
              사출기 선택으로 돌아가기
            </AppButton>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}