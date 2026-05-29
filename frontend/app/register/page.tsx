"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/Button";
import { Input, Label } from "@/components/Input";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await register(email, password);
      router.replace("/dashboard");
    } catch (e: any) {
      setErr(e.message || "Đăng ký thất bại");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-canvas">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo.jpg" alt="MIC ACE" width={56} height={56} className="rounded-2xl shadow-soft-md mb-3" priority />
          <h1 className="text-2xl font-bold text-ink">Tạo tài khoản</h1>
          <p className="text-gray-500 text-sm mt-1">Bắt đầu quản lý affiliate program</p>
        </div>

        <form onSubmit={onSubmit} className="bg-white rounded-2xl p-7 shadow-soft-md border border-gray-100 space-y-5">
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@example.com" autoFocus />
          </div>
          <div>
            <Label>Mật khẩu</Label>
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ít nhất 6 ký tự" />
          </div>

          <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2.5">
            <ShieldCheck size={14} className="text-cta mt-0.5 flex-shrink-0" />
            <span>Tài khoản được bảo mật bằng session cookie — không lưu JWT</span>
          </div>

          {err && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <span className="mt-0.5">⚠</span> {err}
            </div>
          )}
          <Button type="submit" loading={busy} variant="cta" className="w-full !py-2.5 !text-base" size="lg">
            Tạo tài khoản
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-500">
          Đã có tài khoản?{" "}
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
