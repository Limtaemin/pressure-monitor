"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

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
    <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-8">
        <h1 className="mb-2 text-3xl font-bold">관리자 로그인</h1>
        <p className="mb-6 text-gray-400">
          선택된 사출기: <span className="text-blue-400">{machineId}</span>
        </p>

        <div className="space-y-4">
          <input
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            placeholder="관리자 ID"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 outline-none focus:border-blue-500"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 outline-none focus:border-blue-500"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          {!isLoggedIn ? (
            <button
              type="button"
              onClick={handleLogin}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold transition hover:bg-blue-500"
            >
              로그인
            </button>
          ) : (
            <Link
              href={`/machines/${machineId}/dashboard`}
              className="block w-full rounded-xl bg-cyan-500 py-3 text-center font-bold text-slate-950 transition hover:bg-cyan-400"
            >
              대시보드로 이동
            </Link>
          )}

          <Link
            href="/"
            className="block w-full rounded-xl bg-gray-800 py-3 text-center text-gray-300 transition hover:bg-gray-700"
          >
            사출기 선택으로 돌아가기
          </Link>
        </div>
      </section>
    </main>
  );
}