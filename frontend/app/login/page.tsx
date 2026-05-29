"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { TrendingUp, Users, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/Button";
import { Input, Label } from "@/components/Input";

const FEATURES = [
  { icon: TrendingUp, text: "Crawl affiliate programs từ 3+ nguồn" },
  { icon: Users, text: "Quản lý profile & danh tính ảo" },
  { icon: Zap, text: "Tự động hoá đăng ký với browser agent" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (e: any) {
      setErr(e.message || "Đăng nhập thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex w-1/2 bg-gradient-brand flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute -bottom-16 -right-16 w-80 h-80 bg-white/5 rounded-full" />
        <div className="absolute top-1/3 right-8 w-48 h-48 bg-white/5 rounded-full" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-soft-md">
              <Image src="/logo.jpg" alt="MIC ACE" width={40} height={40} className="rounded-lg" priority />
            </div>
            <div>
              <div className="font-bold text-white text-lg leading-none">MIC ACE</div>
              <div className="text-white/50 text-xs tracking-widest uppercase mt-0.5">Affiliate Hub</div>
            </div>
          </div>

          <h2 className="text-4xl font-bold text-white leading-snug mb-4">
            Quản lý affiliate<br />thông minh hơn.
          </h2>
          <p className="text-white/70 text-base leading-relaxed mb-10">
            Crawl, quản lý và tự động hoá toàn bộ vòng đời<br />của affiliate program.
          </p>

          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-white" />
                </div>
                <span className="text-white/80 text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-white/40 text-xs">© 2026 MIC ACE · Affiliate Hub</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-canvas">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile logo */}
          <div className="flex lg:hidden flex-col items-center mb-8">
            <Image src="/logo.jpg" alt="MIC ACE" width={56} height={56} className="rounded-2xl shadow-soft-md mb-3" priority />
            <h1 className="text-xl font-bold text-ink">MIC ACE</h1>
            <p className="text-xs text-gray-500 mt-0.5 tracking-widest uppercase">Affiliate Hub</p>
          </div>

          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-ink">Đăng nhập</h1>
            <p className="text-gray-500 text-sm mt-1">Chào mừng trở lại 👋</p>
          </div>

          <form onSubmit={onSubmit} className="bg-white rounded-2xl p-7 shadow-soft-md border border-gray-100 space-y-5">
            <div>
              <Label>Tên đăng nhập</Label>
              <Input type="text" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin" autoFocus />
            </div>
            <div>
              <Label>Mật khẩu</Label>
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
            </div>
            {err && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                <span className="mt-0.5">⚠</span> {err}
              </div>
            )}
            <Button type="submit" loading={busy} className="w-full !py-2.5 !text-base" size="lg">
              Đăng nhập
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-500">
            Chưa có tài khoản?{" "}
            <Link href="/register" className="text-primary font-semibold hover:underline">
              Đăng ký ngay
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
