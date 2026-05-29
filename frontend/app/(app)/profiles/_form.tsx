"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, X, Plus, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Input, Label, Textarea, Select } from "@/components/Input";
import { Button } from "@/components/Button";
import type { Profile } from "@/lib/api";
import { useToast } from "@/lib/toast";

const COUNTRIES = [
  { code: "VN", label: "🇻🇳 Việt Nam" },
  { code: "US", label: "🇺🇸 United States" },
  { code: "GB", label: "🇬🇧 United Kingdom" },
  { code: "AU", label: "🇦🇺 Australia" },
  { code: "CA", label: "🇨🇦 Canada" },
  { code: "SG", label: "🇸🇬 Singapore" },
  { code: "DE", label: "🇩🇪 Germany" },
  { code: "FR", label: "🇫🇷 France" },
  { code: "JP", label: "🇯🇵 Japan" },
  { code: "KR", label: "🇰🇷 South Korea" },
  { code: "TH", label: "🇹🇭 Thailand" },
  { code: "MY", label: "🇲🇾 Malaysia" },
  { code: "PH", label: "🇵🇭 Philippines" },
  { code: "ID", label: "🇮🇩 Indonesia" },
  { code: "IN", label: "🇮🇳 India" },
  { code: "BR", label: "🇧🇷 Brazil" },
  { code: "MX", label: "🇲🇽 Mexico" },
  { code: "NL", label: "🇳🇱 Netherlands" },
  { code: "IT", label: "🇮🇹 Italy" },
  { code: "ES", label: "🇪🇸 Spain" },
  { code: "PL", label: "🇵🇱 Poland" },
  { code: "UA", label: "🇺🇦 Ukraine" },
  { code: "HK", label: "🇭🇰 Hong Kong" },
  { code: "TW", label: "🇹🇼 Taiwan" },
  { code: "ZA", label: "🇿🇦 South Africa" },
  { code: "RU", label: "🇷🇺 Russia" },
  { code: "TR", label: "🇹🇷 Turkey" },
];

type FormData = Partial<Profile> & { id: string };

export function ProfileForm({ title, initial, onSubmit, lockId }: { title: string; initial: FormData; onSubmit: (d: FormData) => Promise<void>; lockId?: boolean }) {
  const router = useRouter();
  const { push } = useToast();
  const [data, setData] = useState<FormData>(() => ({
    tags: [], niche: [],
    ...initial,
  }));
  const [nicheInput, setNicheInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const update = (k: keyof FormData, v: any) => setData((d) => ({ ...d, [k]: v }));
  const updatePayment = (k: string, v: any) => setData((d) => ({ ...d, payment: { ...(d.payment || {}), [k]: v } }));
  const updateBank = (k: string, v: any) => setData((d) => {
    const bank = { ...((d.payment as any)?.bank || {}), [k]: v };
    return { ...d, payment: { ...(d.payment || {}), bank } };
  });

  const addNiche = () => {
    const t = nicheInput.trim();
    if (!t) return;
    if (!(data.niche || []).includes(t)) update("niche", [...(data.niche || []), t]);
    setNicheInput("");
  };
  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!(data.tags || []).includes(t)) update("tags", [...(data.tags || []), t]);
    setTagInput("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(data); }
    catch (err: any) { push({ type: "error", message: err.message || "Lưu thất bại" }); }
    finally { setBusy(false); }
  };

  const bank = ((data.payment as any)?.bank) || {};

  return (
    <div>
      <button type="button" onClick={() => router.push("/library?tab=profile")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4">
        <ArrowLeft size={16} /> Quay lại thư viện
      </button>
      <PageHeader title={title} />

      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <h3 className="font-semibold text-ink mb-4">Thông tin cơ bản</h3>
            <div className="space-y-3">
              <div>
                <Label>ID <span className="text-gray-400 font-normal">(a-z, 0-9, _, -)</span></Label>
                <Input required pattern="[a-z0-9_-]+" minLength={2} value={data.id} onChange={(e) => update("id", e.target.value)} disabled={lockId} />
              </div>
              <div>
                <Label>Họ</Label>
                <Input value={(data as any).ho || ""} onChange={(e) => update("ho" as any, e.target.value)} placeholder="Nguyễn" />
              </div>
              <div>
                <Label>Tên</Label>
                <Input value={(data as any).ten || ""} onChange={(e) => update("ten" as any, e.target.value)} placeholder="Văn A" />
              </div>
              <div>
                <Label>Mật khẩu</Label>
                <div className="relative">
                  <Input type={showPwd ? "text" : "password"} value={data.password || ""} onChange={(e) => update("password", e.target.value)} placeholder="Mật khẩu dùng để đăng ký" autoComplete="new-password" className="pr-10" />
                  <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Quốc gia</Label>
                <Select value={data.country || ""} onChange={(e) => update("country", e.target.value)}>
                  <option value="">-- Chọn quốc gia --</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Website</Label>
                <Input value={data.website || ""} onChange={(e) => update("website", e.target.value)} />
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="font-semibold text-ink mb-4">Niche & Thanh toán</h3>
            <div className="space-y-3">
              <div>
                <Label>Niche</Label>
                <div className="flex gap-2">
                  <Input value={nicheInput} onChange={(e) => setNicheInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNiche(); } }} placeholder="Thêm niche và Enter" />
                  <Button type="button" variant="secondary" onClick={addNiche}><Plus size={14} /></Button>
                </div>
                {(data.niche || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(data.niche || []).map((n) => (
                      <span key={n} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary-50 text-primary text-xs">
                        {n}
                        <button type="button" onClick={() => update("niche", (data.niche || []).filter((x) => x !== n))} title="Xoá"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label>PayPal</Label>
                <Input value={(data.payment as any)?.paypal || ""} onChange={(e) => updatePayment("paypal", e.target.value)} placeholder="email@paypal.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bank — Tên</Label>
                  <Input value={bank.name || ""} onChange={(e) => updateBank("name", e.target.value)} placeholder="VCB" />
                </div>
                <div>
                  <Label>Bank — Số TK</Label>
                  <Input value={bank.number || ""} onChange={(e) => updateBank("number", e.target.value)} placeholder="..." />
                </div>
              </div>
              <div>
                <Label>Ghi chú</Label>
                <Textarea value={data.notes || ""} onChange={(e) => update("notes", e.target.value)} />
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <h3 className="font-semibold text-ink mb-2">Nhãn (tags)</h3>
          <p className="text-xs text-gray-500 mb-3">Dùng để phân nhóm / lọc nhanh (vd: <code>warmup</code>, <code>main</code>, <code>burner</code>).</p>
          <div className="flex gap-2">
            <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="Thêm tag và Enter" />
            <Button type="button" variant="secondary" onClick={addTag}><Plus size={14} /></Button>
          </div>
          {(data.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {(data.tags || []).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs">
                  {t}
                  <button type="button" onClick={() => update("tags", (data.tags || []).filter((x) => x !== t))} title="Xoá"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </Card>

        <div className="flex justify-end gap-3 sticky bottom-0 bg-white/90 backdrop-blur py-3 -mx-4 px-4 border-t border-gray-100">
          <Button type="button" variant="secondary" onClick={() => router.push("/library?tab=profile")}>Huỷ</Button>
          <Button type="submit" loading={busy}>Lưu profile</Button>
        </div>
      </form>
    </div>
  );
}
