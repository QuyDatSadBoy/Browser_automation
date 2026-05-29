"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users, Mail, Globe, FileText, Plus, Search, X, Edit, Trash2, Copy,
  Upload, KeyRound, ShieldCheck, ShieldAlert, RefreshCcw, Smartphone,
  Wallet, AlertTriangle, CheckCircle2, Zap,
} from "lucide-react";
import * as api from "@/lib/api";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { Input, Label, Textarea } from "@/components/Input";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { SmsSelect } from "@/components/SmsSelect";
import { useToast } from "@/lib/toast";

type TabKey = "profile" | "email" | "proxy" | "sms" | "instruction";

const TABS: { key: TabKey; label: string; icon: any; description: string }[] = [
  { key: "profile", label: "Profile", icon: Users, description: "Danh tính ảo (họ tên, niche, payment...)" },
  { key: "email", label: "Email", icon: Mail, description: "Email + app password + 2FA + recovery" },
  { key: "proxy", label: "Proxy", icon: Globe, description: "IP residential / datacenter dùng cho từng phiên" },
  { key: "sms", label: "SMS OTP", icon: Smartphone, description: "Provider nhận OTP điện thoại (SMSPool, 5sim...)" },
  { key: "instruction", label: "Hướng dẫn", icon: FileText, description: "System prompt cho agent đăng ký" },
];

export default function LibraryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get("tab") as TabKey) || "profile";
  const [tab, setTab] = useState<TabKey>(initial);

  const setActive = (k: TabKey) => {
    setTab(k);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", k);
    router.replace(url.pathname + "?" + url.searchParams.toString());
  };

  return (
    <div>
      <PageHeader
        title="Thư viện dữ liệu agent"
        description="Quản lý 4 nguồn dữ liệu độc lập. Khi tạo chiến dịch đăng ký, có thể chọn nhiều mục từ mỗi nguồn để combine."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
        {TABS.map(({ key, label, icon: Icon, description }) => {
          const active = key === tab;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={`text-left p-3 rounded-xl border transition ${active ? "border-primary-300 bg-primary-50/40 shadow-soft" : "border-gray-200 bg-white hover:border-primary-200"}`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${active ? "bg-primary text-white" : "bg-gray-100 text-gray-500"}`}><Icon size={16} /></span>
                <span className={`font-semibold ${active ? "text-primary" : "text-ink"}`}>{label}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1 leading-snug">{description}</p>
            </button>
          );
        })}
      </div>

      {tab === "profile" && <ProfilesTab />}
      {tab === "email" && <EmailsTab />}
      {tab === "proxy" && <ProxiesTab />}
      {tab === "sms" && <SmsTab />}
      {tab === "instruction" && <InstructionsTab />}
    </div>
  );
}

/* ---------------- PROFILE TAB ---------------- */

function ProfilesTab() {
  const qc = useQueryClient();
  const { push } = useToast();
  const q = useQuery({ queryKey: ["profiles"], queryFn: api.listProfiles });
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [tag, setTag] = useState("");
  const del = useMutation({
    mutationFn: (id: string) => api.deleteProfile(id),
    onSuccess: () => { push({ type: "success", message: "Đã xoá profile" }); qc.invalidateQueries({ queryKey: ["profiles"] }); },
  });
  const dup = useMutation({
    mutationFn: (id: string) => api.duplicateProfile(id),
    onSuccess: (r) => { push({ type: "success", message: `Đã nhân bản → ${r.id}` }); qc.invalidateQueries({ queryKey: ["profiles"] }); },
  });

  const countries = useMemo(() => Array.from(new Set((q.data || []).map((p) => p.country).filter(Boolean))).sort(), [q.data]);
  const tags = useMemo(() => Array.from(new Set((q.data || []).flatMap((p) => p.tags || []))).sort(), [q.data]);

  const filtered = useMemo(() => {
    const items = q.data || [];
    const kw = search.trim().toLowerCase();
    return items.filter((p) => {
      if (kw) {
        const hay = `${p.id} ${p.full_name} ${p.country} ${(p.niche || []).join(" ")} ${(p.tags || []).join(" ")} ${p.notes}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (country && p.country !== country) return false;
      if (tag && !(p.tags || []).includes(tag)) return false;
      return true;
    });
  }, [q.data, search, country, tag]);

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên, email, niche, ghi chú…" className="pl-9" />
          </div>
          <select aria-label="Quốc gia" className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Tất cả quốc gia</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Nhãn" className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Mọi nhãn</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Link href="/profiles/new"><Button><Plus size={16} /> Tạo profile</Button></Link>
        </div>
        <div className="text-xs text-gray-500 mt-3">Hiển thị <b>{filtered.length}</b> / {q.data?.length || 0}</div>
      </Card>

      {!q.data || q.data.length === 0 ? (
        <Card><EmptyState icon={Users} title="Chưa có profile" description="Tạo profile đầu tiên để chuẩn bị auto-register." action={<Link href="/profiles/new"><Button>Tạo ngay</Button></Link>} /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={Search} title="Không khớp bộ lọc" /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <Card key={p.id} className="hover:border-primary-300 transition">
              <div className="flex items-start gap-3 mb-2">
                <div className="w-11 h-11 rounded-full bg-gradient-brand text-white font-semibold flex items-center justify-center text-base">
                  {(p.full_name || p.id)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink truncate">{p.full_name || p.id}</div>
                  <div className="text-xs text-gray-400 font-mono">{p.id}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {p.country && <Badge variant="info">{p.country}</Badge>}
                {(p.niche || []).slice(0, 3).map((n) => <Badge key={n} variant="info">{n}</Badge>)}
                {(p.tags || []).slice(0, 3).map((t) => (
                  <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px]">#{t}</span>
                ))}
              </div>
              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <Link href={`/profiles/${p.id}`} className="flex-1"><Button size="sm" variant="secondary" className="w-full"><Edit size={14} /> Sửa</Button></Link>
                <Button size="sm" variant="secondary" onClick={() => dup.mutate(p.id)} loading={dup.isPending && dup.variables === p.id}><Copy size={14} /></Button>
                <Button size="sm" variant="secondary" onClick={() => { if (confirm(`Xoá "${p.id}"?`)) del.mutate(p.id); }} className="text-red-600 hover:bg-red-50"><Trash2 size={14} /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- EMAIL TAB ---------------- */

const emptyEmail = (): Partial<api.EmailItem> => ({
  address: "", label: "", password: "", app_password: "",
  recovery_email: "", totp_secret: "", phone: "", otp_link: "",
  status: "active", tags: [], notes: "",
});

function EmailsTab() {
  const qc = useQueryClient();
  const { push } = useToast();
  const q = useQuery({ queryKey: ["emails"], queryFn: api.listEmails });
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [authFilter, setAuthFilter] = useState<"any" | "app_pwd" | "totp" | "missing">("any");
  const [testFilter, setTestFilter] = useState<"any" | "ok" | "fail" | "untested">("any");
  const [tag, setTag] = useState("");
  const [editing, setEditing] = useState<Partial<api.EmailItem> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const providers = useMemo(() => Array.from(new Set((q.data || []).map((e) => e.provider).filter(Boolean))).sort(), [q.data]);
  const tags = useMemo(() => Array.from(new Set((q.data || []).flatMap((e) => e.tags || []))).sort(), [q.data]);

  const filtered = useMemo(() => {
    const items = q.data || [];
    const kw = search.trim().toLowerCase();
    return items.filter((e) => {
      if (kw) {
        const hay = `${e.address} ${e.label} ${e.recovery_email} ${e.phone} ${e.notes} ${(e.tags || []).join(" ")}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (provider && e.provider !== provider) return false;
      if (status && e.status !== status) return false;
      if (tag && !(e.tags || []).includes(tag)) return false;
      if (authFilter === "app_pwd" && !e.has_app_password) return false;
      if (authFilter === "totp" && !e.has_totp) return false;
      if (authFilter === "missing" && (e.has_app_password || e.has_totp)) return false;
      if (testFilter === "ok" && e.last_test_result !== "ok") return false;
      if (testFilter === "fail" && e.last_test_result !== "fail") return false;
      if (testFilter === "untested" && e.last_test_result) return false;
      return true;
    });
  }, [q.data, search, provider, status, tag, authFilter, testFilter]);

  const save = useMutation({
    mutationFn: async (data: Partial<api.EmailItem>) => {
      if (data.id) return api.updateEmail(data.id, data);
      return api.createEmail(data);
    },
    onSuccess: () => { push({ type: "success", message: "Đã lưu email" }); qc.invalidateQueries({ queryKey: ["emails"] }); setEditing(null); },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteEmail(id),
    onSuccess: () => { push({ type: "success", message: "Đã xoá email" }); qc.invalidateQueries({ queryKey: ["emails"] }); },
  });
  const bulk = useMutation({
    mutationFn: (raw: string) => api.bulkImportEmails(raw),
    onSuccess: (r) => {
      push({ type: "success", message: `Đã import ${r.created} email${r.skipped.length ? `, bỏ qua ${r.skipped.length}` : ""}` });
      qc.invalidateQueries({ queryKey: ["emails"] });
      setImportOpen(false); setImportText("");
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });
  const test = useMutation({
    mutationFn: (id: string) => api.testEmail(id),
    onSuccess: (r, id) => {
      if (r.ok) push({ type: "success", message: `IMAP login OK · ${r.inbox_count} mail trong INBOX (${r.elapsed_ms}ms)` });
      else push({ type: "error", message: `IMAP fail: ${r.error}` });
      qc.invalidateQueries({ queryKey: ["emails"] });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm địa chỉ, recovery, ghi chú…" className="pl-9" />
          </div>
          <select aria-label="Provider" className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">Mọi provider</option>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="Auth" className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={authFilter} onChange={(e) => setAuthFilter(e.target.value as any)}>
            <option value="any">Mọi trạng thái auth</option>
            <option value="app_pwd">Có App Password</option>
            <option value="totp">Có TOTP (2FA)</option>
            <option value="missing">Chưa cấu hình</option>
          </select>
          <select aria-label="Test IMAP" className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={testFilter} onChange={(e) => setTestFilter(e.target.value as any)}>
            <option value="any">Mọi trạng thái test</option>
            <option value="ok">Test IMAP OK</option>
            <option value="fail">Test IMAP fail</option>
            <option value="untested">Chưa test</option>
          </select>
          <select aria-label="Trạng thái" className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Mọi trạng thái</option>
            <option value="active">Active</option>
            <option value="banned">Banned</option>
            <option value="archived">Archived</option>
          </select>
          <select aria-label="Nhãn" className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Mọi nhãn</option>
            {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
          <Button variant="secondary" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</Button>
          <Button onClick={() => setEditing(emptyEmail())}><Plus size={16} /> Thêm email</Button>
        </div>
        <div className="text-xs text-gray-500 mt-3">Hiển thị <b>{filtered.length}</b> / {q.data?.length || 0}</div>
      </Card>

      {!q.data || q.data.length === 0 ? (
        <Card><EmptyState icon={Mail} title="Chưa có email" description="Thêm hoặc import danh sách email để dùng cho phase đăng ký." action={<Button onClick={() => setEditing(emptyEmail())}>Thêm email</Button>} /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={Search} title="Không khớp bộ lọc" /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5">Địa chỉ</th>
                  <th className="text-left px-4 py-2.5">Provider</th>
                  <th className="text-left px-4 py-2.5">Auth</th>
                  <th className="text-left px-4 py-2.5">IMAP test</th>
                  <th className="text-left px-4 py-2.5">Recovery</th>
                  <th className="text-left px-4 py-2.5">Trạng thái</th>
                  <th className="text-left px-4 py-2.5">Nhãn</th>
                  <th className="text-right px-4 py-2.5">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink">{e.address}</div>
                      {e.label && <div className="text-[11px] text-gray-500">{e.label}</div>}
                    </td>
                    <td className="px-4 py-2.5"><Badge variant="neutral">{e.provider || "—"}</Badge></td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {e.has_app_password && <Badge variant="success"><KeyRound size={10} /> APP</Badge>}
                        {e.has_totp && <Badge variant="info"><ShieldCheck size={10} /> 2FA</Badge>}
                        {!e.has_app_password && !e.has_totp && <Badge variant="warning"><ShieldAlert size={10} /> Trống</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {e.last_test_result === "ok" ? (
                        <span title={e.last_tested_at}><Badge variant="success"><ShieldCheck size={10} /> OK</Badge></span>
                      ) : e.last_test_result === "fail" ? (
                        <span title={e.last_test_error || e.last_tested_at}><Badge variant="error"><ShieldAlert size={10} /> Fail</Badge></span>
                      ) : (
                        <Badge variant="neutral">Chưa test</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{e.recovery_email || "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={e.status === "active" ? "success" : e.status === "banned" ? "error" : "neutral"}>{e.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {(e.tags || []).map((t) => <span key={t} className="text-[11px] text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded-full">#{t}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button size="sm" variant="secondary" onClick={() => test.mutate(e.id)} loading={test.isPending && test.variables === e.id} title="Test IMAP login"><RefreshCcw size={13} /></Button>
                      <Button size="sm" variant="secondary" className="ml-1" onClick={async () => {
                        const full = await api.getEmail(e.id); setEditing(full);
                      }}><Edit size={13} /></Button>
                      <Button size="sm" variant="secondary" className="ml-1 text-red-600 hover:bg-red-50" onClick={() => { if (confirm(`Xoá ${e.address}?`)) del.mutate(e.id); }}><Trash2 size={13} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Sửa email · ${editing.address}` : "Thêm email mới"} size="lg">
        {editing && <EmailForm value={editing} onChange={setEditing} onSave={(d) => save.mutate(d)} saving={save.isPending} />}
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import email hàng loạt" size="lg">
        <p className="text-xs text-gray-500 mb-2">
          Mỗi dòng 1 email theo thứ tự (cách nhau bằng <code>tab</code> hoặc <code>,</code>):
        </p>
        <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-2 mb-3">address[\tpassword][\trecovery][\ttotp_secret][\tphone][\totp_link]</pre>
        <Textarea rows={12} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="user@gmail.com&#9;pass&#9;recovery@x.com&#9;ABCD EFGH IJKL MNOP" />
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="secondary" onClick={() => setImportOpen(false)}>Huỷ</Button>
          <Button loading={bulk.isPending} onClick={() => bulk.mutate(importText)} disabled={!importText.trim()}>Import</Button>
        </div>
      </Modal>
    </div>
  );
}

function EmailForm({ value, onChange, onSave, saving }: { value: Partial<api.EmailItem>; onChange: (v: Partial<api.EmailItem>) => void; onSave: (v: Partial<api.EmailItem>) => void; saving: boolean }) {
  const set = (k: keyof api.EmailItem, v: any) => onChange({ ...value, [k]: v });
  const [tagText, setTagText] = useState("");
  const addTag = () => {
    const t = tagText.trim(); if (!t) return;
    const cur = value.tags || [];
    if (!cur.includes(t)) set("tags", [...cur, t]);
    setTagText("");
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(value); }} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Địa chỉ</Label>
          <Input type="email" required value={value.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="user@gmail.com" />
        </div>
        <div>
          <Label>Nhãn</Label>
          <Input value={value.label || ""} onChange={(e) => set("label", e.target.value)} placeholder="Gmail chính" />
        </div>
        <div>
          <Label>Mật khẩu thường</Label>
          <Input value={value.password || ""} onChange={(e) => set("password", e.target.value)} placeholder="Mật khẩu đăng nhập web" />
        </div>
        <div>
          <Label>App Password (Gmail IMAP)</Label>
          <Input value={value.app_password || ""} onChange={(e) => set("app_password", e.target.value)} placeholder="16 ký tự không dấu cách" />
        </div>
        <div>
          <Label>Recovery email</Label>
          <Input type="email" value={value.recovery_email || ""} onChange={(e) => set("recovery_email", e.target.value)} />
        </div>
        <div>
          <Label>Số điện thoại</Label>
          <Input value={value.phone || ""} onChange={(e) => set("phone", e.target.value)} placeholder="+84..." />
        </div>
        <div>
          <Label>TOTP secret (mã 2FA)</Label>
          <Input value={value.totp_secret || ""} onChange={(e) => set("totp_secret", e.target.value)} placeholder="Base32, không dấu cách" />
        </div>
        <div>
          <Label>OTP link / app</Label>
          <Input value={value.otp_link || ""} onChange={(e) => set("otp_link", e.target.value)} placeholder="https://..." />
        </div>
        <div>
          <Label>Trạng thái</Label>
          <select aria-label="Status" className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={value.status || "active"} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Active</option>
            <option value="banned">Banned</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <Label>Provider (auto detect)</Label>
          <Input value={value.provider || ""} onChange={(e) => set("provider", e.target.value)} placeholder="gmail / outlook…" />
        </div>
      </div>
      <div>
        <Label>Nhãn (tags)</Label>
        <div className="flex gap-2">
          <Input value={tagText} onChange={(e) => setTagText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="warmup, main… (Enter để thêm)" />
          <Button type="button" variant="secondary" onClick={addTag}><Plus size={14} /></Button>
        </div>
        {(value.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {(value.tags || []).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                #{t}
                <button type="button" onClick={() => set("tags", (value.tags || []).filter((x) => x !== t))} aria-label="Xoá tag"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <Label>Ghi chú</Label>
        <Textarea rows={3} value={value.notes || ""} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button type="submit" loading={saving}>Lưu</Button>
      </div>
    </form>
  );
}

/* ---------------- PROXY TAB ---------------- */

const emptyProxy = (): Partial<api.ProxyItem> => ({
  label: "", host: "", port: 0, type: "http",
  username: "", password: "", country: "", provider: "",
  status: "active", tags: [], notes: "",
});

function ProxiesTab() {
  const qc = useQueryClient();
  const { push } = useToast();
  const q = useQuery({ queryKey: ["proxies"], queryFn: api.listProxies });
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [testFilter, setTestFilter] = useState<"any" | "ok" | "fail" | "untested">("any");
  const [editing, setEditing] = useState<Partial<api.ProxyItem> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  const countries = useMemo(() => Array.from(new Set((q.data || []).map((p) => p.country).filter(Boolean))).sort(), [q.data]);

  const filtered = useMemo(() => {
    const items = q.data || [];
    const kw = search.trim().toLowerCase();
    return items.filter((p) => {
      if (kw) {
        const hay = `${p.host} ${p.port} ${p.label} ${p.username} ${p.country} ${p.provider} ${p.notes}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (country && p.country !== country) return false;
      if (type && p.type !== type) return false;
      if (status && p.status !== status) return false;
      if (testFilter === "ok" && p.last_test_result !== "ok") return false;
      if (testFilter === "fail" && !p.last_test_result?.startsWith("fail")) return false;
      if (testFilter === "untested" && p.last_test_result) return false;
      return true;
    });
  }, [q.data, search, country, type, status, testFilter]);

  const save = useMutation({
    mutationFn: async (data: Partial<api.ProxyItem>) => {
      if (data.id) return api.updateProxy(data.id, data);
      return api.createProxy(data);
    },
    onSuccess: () => { push({ type: "success", message: "Đã lưu proxy" }); qc.invalidateQueries({ queryKey: ["proxies"] }); setEditing(null); },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteProxy(id),
    onSuccess: () => { push({ type: "success", message: "Đã xoá proxy" }); qc.invalidateQueries({ queryKey: ["proxies"] }); },
  });
  const test = useMutation({
    mutationFn: (id: string) => api.testProxy(id),
    onSuccess: (r, id) => {
      push({ type: r.ok ? "success" : "error", message: r.ok ? `OK · IP ${r.ip} · ${r.elapsed_ms}ms` : `Fail: ${r.error}` });
      qc.invalidateQueries({ queryKey: ["proxies"] });
    },
  });
  const bulk = useMutation({
    mutationFn: (raw: string) => api.bulkImportProxies(raw),
    onSuccess: (r) => {
      push({ type: "success", message: `Đã import ${r.created} proxy${r.skipped.length ? `, bỏ qua ${r.skipped.length}` : ""}` });
      qc.invalidateQueries({ queryKey: ["proxies"] });
      setImportOpen(false); setImportText("");
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm host, label, username, country…" className="pl-9" />
          </div>
          <select aria-label="Quốc gia" className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Mọi quốc gia</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Type" className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Mọi type</option>
            <option value="http">http</option>
            <option value="https">https</option>
            <option value="socks5">socks5</option>
          </select>
          <select aria-label="Test" className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={testFilter} onChange={(e) => setTestFilter(e.target.value as any)}>
            <option value="any">Mọi kết quả test</option>
            <option value="ok">Đã OK</option>
            <option value="fail">Test fail</option>
            <option value="untested">Chưa test</option>
          </select>
          <select aria-label="Trạng thái" className="h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Mọi trạng thái</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <Button variant="secondary" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</Button>
          <Button onClick={() => setEditing(emptyProxy())}><Plus size={16} /> Thêm proxy</Button>
        </div>
        <div className="text-xs text-gray-500 mt-3">Hiển thị <b>{filtered.length}</b> / {q.data?.length || 0}</div>
      </Card>

      {!q.data || q.data.length === 0 ? (
        <Card><EmptyState icon={Globe} title="Chưa có proxy" description="Thêm proxy hoặc paste danh sách theo format ip:port:user:pass." action={<Button onClick={() => setImportOpen(true)}>Import nhanh</Button>} /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={Search} title="Không khớp bộ lọc" /></Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5">Endpoint</th>
                  <th className="text-left px-4 py-2.5">Quốc gia</th>
                  <th className="text-left px-4 py-2.5">Type</th>
                  <th className="text-left px-4 py-2.5">Auth</th>
                  <th className="text-left px-4 py-2.5">Test gần nhất</th>
                  <th className="text-left px-4 py-2.5">Trạng thái</th>
                  <th className="text-right px-4 py-2.5">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink font-mono">{p.host}:{p.port}</div>
                      {p.label && <div className="text-[11px] text-gray-500">{p.label}</div>}
                    </td>
                    <td className="px-4 py-2.5">{p.country ? <Badge variant="info">{p.country}</Badge> : "—"}</td>
                    <td className="px-4 py-2.5"><Badge variant="neutral">{p.type}</Badge></td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-mono">{p.username || "—"}</div>
                      <div className="text-gray-400">{p.has_password ? "•••••••" : "không pass"}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {p.last_test_result === "ok" ? (
                        <div>
                          <Badge variant="success">OK · {p.last_test_ip}</Badge>
                          <div className="text-gray-400 mt-0.5">{p.last_tested_at ? new Date(p.last_tested_at).toLocaleString("vi-VN") : ""}</div>
                        </div>
                      ) : p.last_test_result?.startsWith("fail") ? (
                        <div>
                          <Badge variant="error">{p.last_test_result}</Badge>
                          <div className="text-gray-400 mt-0.5">{p.last_tested_at ? new Date(p.last_tested_at).toLocaleString("vi-VN") : ""}</div>
                        </div>
                      ) : (
                        <Badge variant="neutral">chưa test</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={p.status === "active" ? "success" : "neutral"}>{p.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <Button size="sm" variant="secondary" onClick={() => test.mutate(p.id)} loading={test.isPending && test.variables === p.id} title="Test kết nối"><RefreshCcw size={13} /></Button>
                      <Button size="sm" variant="secondary" className="ml-1" onClick={async () => { const full = await api.getProxy(p.id); setEditing(full); }}><Edit size={13} /></Button>
                      <Button size="sm" variant="secondary" className="ml-1 text-red-600 hover:bg-red-50" onClick={() => { if (confirm(`Xoá ${p.host}:${p.port}?`)) del.mutate(p.id); }}><Trash2 size={13} /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Sửa proxy · ${editing.host}:${editing.port}` : "Thêm proxy"} size="lg">
        {editing && <ProxyForm value={editing} onChange={setEditing} onSave={(d) => save.mutate(d)} saving={save.isPending} />}
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import proxy hàng loạt" size="lg">
        <p className="text-xs text-gray-500 mb-2">
          Mỗi dòng 1 proxy theo format <code>ip:port:user:pass</code>, có thể thêm <code>tab</code> + mã quốc gia (vd <code>VN</code>):
        </p>
        <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-2 mb-3">14.225.65.146:30245:PVN90740:iNgZ3r2Y	VN</pre>
        <Textarea rows={12} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="14.225.65.146:30245:PVN90740:iNgZ3r2Y	VN" />
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="secondary" onClick={() => setImportOpen(false)}>Huỷ</Button>
          <Button loading={bulk.isPending} onClick={() => bulk.mutate(importText)} disabled={!importText.trim()}>Import</Button>
        </div>
      </Modal>
    </div>
  );
}

function ProxyForm({ value, onChange, onSave, saving }: { value: Partial<api.ProxyItem>; onChange: (v: Partial<api.ProxyItem>) => void; onSave: (v: Partial<api.ProxyItem>) => void; saving: boolean }) {
  const set = (k: keyof api.ProxyItem, v: any) => onChange({ ...value, [k]: v });
  const [tagText, setTagText] = useState("");
  const addTag = () => {
    const t = tagText.trim(); if (!t) return;
    const cur = value.tags || [];
    if (!cur.includes(t)) set("tags", [...cur, t]);
    setTagText("");
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(value); }} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Label</Label>
          <Input value={value.label || ""} onChange={(e) => set("label", e.target.value)} placeholder="Tên gợi nhớ" />
        </div>
        <div>
          <Label>Type</Label>
          <select aria-label="Type" className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={value.type || "http"} onChange={(e) => set("type", e.target.value)}>
            <option value="http">http</option>
            <option value="https">https</option>
            <option value="socks5">socks5</option>
          </select>
        </div>
        <div>
          <Label>Host</Label>
          <Input required value={value.host || ""} onChange={(e) => set("host", e.target.value)} placeholder="14.225.65.146" />
        </div>
        <div>
          <Label>Port</Label>
          <Input required type="number" value={value.port || ""} onChange={(e) => set("port", Number(e.target.value))} placeholder="30245" />
        </div>
        <div>
          <Label>Username</Label>
          <Input value={value.username || ""} onChange={(e) => set("username", e.target.value)} />
        </div>
        <div>
          <Label>Password</Label>
          <Input value={value.password || ""} onChange={(e) => set("password", e.target.value)} />
        </div>
        <div>
          <Label>Quốc gia</Label>
          <Input value={value.country || ""} onChange={(e) => set("country", e.target.value.toUpperCase())} placeholder="VN, US…" />
        </div>
        <div>
          <Label>Nhà cung cấp</Label>
          <Input value={value.provider || ""} onChange={(e) => set("provider", e.target.value)} placeholder="ProxyVN…" />
        </div>
        <div>
          <Label>Trạng thái</Label>
          <select aria-label="Status" className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white" value={value.status || "active"} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
      <div>
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input value={tagText} onChange={(e) => setTagText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="residential, datacenter… (Enter)" />
          <Button type="button" variant="secondary" onClick={addTag}><Plus size={14} /></Button>
        </div>
        {(value.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {(value.tags || []).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
                #{t}
                <button type="button" onClick={() => set("tags", (value.tags || []).filter((x) => x !== t))} aria-label="Xoá tag"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <Label>Ghi chú</Label>
        <Textarea rows={3} value={value.notes || ""} onChange={(e) => set("notes", e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button type="submit" loading={saving}>Lưu</Button>
      </div>
    </form>
  );
}

/* ---------------- INSTRUCTION TAB ---------------- */

function InstructionsTab() {
  const qc = useQueryClient();
  const router = useRouter();
  const { push } = useToast();
  const q = useQuery({ queryKey: ["instructions"], queryFn: api.listInstructions });
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const filtered = useMemo(() => {
    const items = q.data || [];
    const kw = search.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((i) => i.name.toLowerCase().includes(kw));
  }, [q.data, search]);

  const create = useMutation({
    mutationFn: () => api.createInstruction(newName, ""),
    onSuccess: () => { push({ type: "success", message: "Đã tạo." }); qc.invalidateQueries({ queryKey: ["instructions"] }); setCreating(false); router.push(`/instructions/${encodeURIComponent(newName)}`); },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });
  const del = useMutation({
    mutationFn: (name: string) => api.deleteInstruction(name),
    onSuccess: () => { push({ type: "success", message: "Đã xoá." }); qc.invalidateQueries({ queryKey: ["instructions"] }); },
  });

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm hướng dẫn…" className="pl-9" />
          </div>
          <Button onClick={() => setCreating(true)}><Plus size={16} /> Tạo mới</Button>
        </div>
      </Card>

      {creating && (
        <Card className="!p-4 mb-4">
          <div className="flex gap-2">
            <Input autoFocus placeholder="vd: goaffpro-signup.txt" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newName) create.mutate(); }} />
            <Button loading={create.isPending} onClick={() => newName && create.mutate()}>Tạo</Button>
            <Button variant="secondary" onClick={() => { setCreating(false); setNewName(""); }}>Huỷ</Button>
          </div>
        </Card>
      )}

      {!q.data || q.data.length === 0 ? (
        <Card><EmptyState icon={FileText} title="Chưa có hướng dẫn" /></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={Search} title="Không khớp" /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((i) => (
            <Card key={i.name} className="hover:border-amber-300 transition">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><FileText size={20} /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink truncate">{i.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{i.size} bytes · {new Date(i.updated_at).toLocaleString("vi-VN")}</div>
                </div>
              </div>
              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <Link href={`/instructions/${encodeURIComponent(i.name)}`} className="flex-1"><Button size="sm" variant="secondary" className="w-full"><Edit size={14} /> Mở</Button></Link>
                <Button size="sm" variant="secondary" onClick={() => { if (confirm(`Xoá "${i.name}"?`)) del.mutate(i.name); }} className="text-red-600 hover:bg-red-50"><Trash2 size={14} /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- SMS OTP TAB ---------------- */

type SmsProfileForm = {
  id?: string;
  name: string;
  country_id: string;
  service_id: string;
  operator: string;
  notes: string;
  status: string;
};

const EMPTY_FORM: SmsProfileForm = {
  name: "",
  country_id: "",
  service_id: "",
  operator: "any",
  notes: "",
  status: "active",
};

function SmsTab() {
  const qc = useQueryClient();
  const { push } = useToast();
  const statusQ = useQuery({ queryKey: ["sms-status"], queryFn: api.getSmsStatus });
  const profilesQ = useQuery({ queryKey: ["sms-profiles"], queryFn: api.listSmsProfiles });
  const countriesQ = useQuery({ queryKey: ["sms-countries"], queryFn: api.listSmsCountries, staleTime: 5 * 60_000 });
  const servicesQ = useQuery({ queryKey: ["sms-services"], queryFn: api.listSmsServices, staleTime: 5 * 60_000 });

  const refreshStatus = useMutation({
    mutationFn: () => api.getSmsStatus(),
    onSuccess: (r) => {
      qc.setQueryData(["sms-status"], r);
      if (r.ok) push({ type: "success", message: `SMSPool OK · Số dư ${r.balance} ${r.currency}` });
      else push({ type: "error", message: `SMS provider lỗi: ${r.error || "không rõ"}` });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const [modal, setModal] = useState<SmsProfileForm | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async (f: SmsProfileForm) => {
      if (!f.name.trim()) throw new Error("Cần đặt tên cho profile");
      if (!f.country_id) throw new Error("Cần chọn quốc gia");
      if (!f.service_id) throw new Error("Cần chọn service");
      const payload = { name: f.name.trim(), country_id: f.country_id, service_id: f.service_id, operator: f.operator || "any", notes: f.notes, status: f.status };
      return f.id ? api.updateSmsProfile(f.id, payload) : api.createSmsProfile(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sms-profiles"] });
      setModal(null);
      push({ type: "success", message: "Đã lưu SMS profile" });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteSmsProfile(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sms-profiles"] });
      push({ type: "success", message: "Đã xoá profile" });
    },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const testOne = async (id: string) => {
    setTestingId(id);
    try {
      const r = await api.testSmsProfile(id);
      if (r.ok) push({ type: "success", message: `OK · Stock ${r.stock ?? "?"} số${r.country_name ? ` · ${r.country_name}` : ""}${r.service_name ? ` · ${r.service_name}` : ""}` });
      else push({ type: "error", message: r.error || "Test thất bại" });
      qc.invalidateQueries({ queryKey: ["sms-profiles"] });
    } catch (e: any) {
      push({ type: "error", message: e?.message || "Test thất bại" });
    } finally {
      setTestingId(null);
    }
  };

  const s = statusQ.data;
  const balanceNum = parseFloat(s?.balance || "0");
  const lowBalance = !!(s?.ok) && balanceNum < 1;
  const profiles = profilesQ.data || [];

  return (
    <div className="space-y-4">
      {/* Status banner (gọn) */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg bg-info-50 text-info flex items-center justify-center"><Smartphone size={20} /></span>
            <div>
              <div className="font-semibold text-ink">SMS Provider: <span className="text-info">{s?.provider || "—"}</span></div>
              <div className="text-xs text-gray-500 mt-0.5">
                Cấu hình API key trong <code>backend/.env</code> ·{" "}
                {s?.docs_url && <a href={s.docs_url} target="_blank" rel="noreferrer" className="text-info underline">Lấy API key →</a>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {s?.ok && (
              <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${lowBalance ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                <Wallet size={14} className="inline mr-1" /> {s.balance} {s.currency}
              </div>
            )}
            <Button variant="secondary" loading={refreshStatus.isPending || statusQ.isFetching} onClick={() => refreshStatus.mutate()}>
              <RefreshCcw size={14} /> Refresh
            </Button>
          </div>
        </div>

        {s && !s.enabled && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>Chưa cấu hình <code>SMS_OTP_API_KEY</code> — site yêu cầu phone OTP sẽ FAIL.</div>
          </div>
        )}
        {s && s.enabled && !s.ok && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div><div className="font-semibold">Test FAIL</div><div className="text-xs mt-1 font-mono break-all">{s.error || "Unknown error"}</div></div>
          </div>
        )}
      </Card>

      {/* Profiles list */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-semibold text-ink flex items-center gap-2">
              <Smartphone size={16} /> SMS Profiles
              <Badge variant="info">{profiles.length}</Badge>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Mỗi profile = 1 combo <b>Quốc gia + Service</b>. Tái dùng nhiều site, share chung 1 API key bên trên.
            </div>
          </div>
          <Button onClick={() => setModal({ ...EMPTY_FORM })} disabled={!s?.enabled}>
            <Plus size={14} /> Thêm profile
          </Button>
        </div>

        {profilesQ.isLoading ? (
          <div className="text-sm text-gray-500">Đang tải...</div>
        ) : profiles.length === 0 ? (
          <EmptyState
            icon={<Smartphone size={32} />}
            title="Chưa có SMS profile nào"
            description="Tạo profile để chọn nhanh khi đăng ký nhiều site (vd: VN-Shopee, US-Discord)"
            action={<Button onClick={() => setModal({ ...EMPTY_FORM })} disabled={!s?.enabled}><Plus size={14} /> Thêm profile đầu tiên</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {profiles.map((p) => {
              const stale = !p.last_tested_at;
              const okTest = p.last_test_result === "ok";
              return (
                <div key={p.id} className="p-3 rounded-lg border border-gray-200 bg-white hover:border-info-200 transition flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink truncate">{p.name}</div>
                      <div className="text-xs text-gray-600 mt-0.5 truncate">
                        <span className="font-medium">{p.country_name || `#${p.country_id}`}</span>
                        {" · "}
                        <span className="font-medium">{p.service_name || `#${p.service_id}`}</span>
                        {p.operator && p.operator !== "any" && <> · op: <code>{p.operator}</code></>}
                      </div>
                      {p.notes && <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">{p.notes}</div>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setModal({ id: p.id, name: p.name, country_id: p.country_id, service_id: p.service_id, operator: p.operator || "any", notes: p.notes || "", status: p.status || "active" })} className="p-1.5 text-gray-400 hover:text-info" title="Sửa"><Edit size={14} /></button>
                      <button onClick={() => { if (confirm(`Xoá profile "${p.name}"?`)) del.mutate(p.id); }} className="p-1.5 text-gray-400 hover:text-red-500" title="Xoá"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {/* status row */}
                  <div className="mt-2 text-[11px] min-h-[16px]">
                    {stale ? (
                      <span className="text-gray-400">Chưa test</span>
                    ) : okTest ? (
                      <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={12} /> OK · {p.last_tested_at?.slice(0, 16).replace("T", " ")}</span>
                    ) : (
                      <span className="text-red-600 inline-flex items-start gap-1 line-clamp-2" title={p.last_test_error}><AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span className="line-clamp-2">Fail · {p.last_test_error}</span></span>
                    )}
                  </div>
                  {/* footer: always bottom-right */}
                  <div className="mt-auto pt-2 flex justify-end">
                    <Button size="sm" variant="secondary" loading={testingId === p.id} onClick={() => testOne(p.id)}>
                      <Zap size={12} /> Test ngay
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {modal && (
        <SmsProfileModal
          form={modal}
          setForm={setModal}
          countries={countriesQ.data || []}
          services={servicesQ.data || []}
          countriesLoading={countriesQ.isLoading}
          servicesLoading={servicesQ.isLoading}
          onClose={() => setModal(null)}
          onSave={() => save.mutate(modal)}
          saving={save.isPending}
        />
      )}
    </div>
  );
}

function SmsProfileModal({
  form, setForm, countries, services, countriesLoading, servicesLoading, onClose, onSave, saving,
}: {
  form: SmsProfileForm;
  setForm: (f: SmsProfileForm | null) => void;
  countries: api.SmsOption[];
  services: api.SmsOption[];
  countriesLoading: boolean;
  servicesLoading: boolean;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const countryName = countries.find((c) => c.id === form.country_id)?.name || "";
  const serviceName = services.find((c) => c.id === form.service_id)?.name || "";

  // Auto-suggest tên khi cả 2 đã chọn và name trống
  useEffect(() => {
    if (!form.name.trim() && countryName && serviceName) {
      setForm({ ...form, name: `${countryName} · ${serviceName}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryName, serviceName]);

  // Pre-flight stock check (debounce 400ms)
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; stock: number; error?: string } | null>(null);
  useEffect(() => {
    setCheck(null);
    if (!form.country_id || !form.service_id) return;
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const r = await api.checkSmsCombo({ country_id: form.country_id, service_id: form.service_id });
        setCheck({ ok: r.ok, stock: r.stock, error: r.error });
      } catch (e: any) {
        setCheck({ ok: false, stock: 0, error: e?.message || "Check thất bại" });
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.country_id, form.service_id]);

  const canSave = !!form.name.trim() && !!form.country_id && !!form.service_id;

  return (
    <Modal open onClose={onClose} title={form.id ? "Sửa SMS profile" : "Thêm SMS profile"}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Quốc gia <span className="text-red-500">*</span></Label>
            <SmsSelect
              placeholder="Chọn quốc gia..."
              options={countries}
              value={form.country_id}
              onChange={(v) => setForm({ ...form, country_id: v })}
              loading={countriesLoading}
            />
          </div>
          <div>
            <Label>Service / Site <span className="text-red-500">*</span></Label>
            <SmsSelect
              placeholder="Chọn service..."
              options={services}
              value={form.service_id}
              onChange={(v) => setForm({ ...form, service_id: v })}
              loading={servicesLoading}
            />
          </div>
        </div>

        {/* Pre-flight stock check */}
        {form.country_id && form.service_id && (
          <div className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${
            checking ? "bg-gray-50 border-gray-200 text-gray-600" :
            check?.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
            check ? "bg-amber-50 border-amber-200 text-amber-800" :
            "bg-gray-50 border-gray-200 text-gray-500"
          }`}>
            {checking ? (
              <><RefreshCcw size={14} className="mt-0.5 animate-spin" /> <span>Đang kiểm tra stock SMSPool...</span></>
            ) : check?.ok ? (
              <><CheckCircle2 size={14} className="mt-0.5" />
                <div>
                  <div><b>{check.stock.toLocaleString()} số sẵn sàng</b> cho combo này — sẵn sàng dùng.</div>
                  <div className="text-[11px] mt-0.5 opacity-80">{countryName} · {serviceName}</div>
                </div>
              </>
            ) : check ? (
              <><AlertTriangle size={14} className="mt-0.5" />
                <div>
                  <div><b>Hết số / combo không hợp lệ.</b> Chọn quốc gia hoặc service khác.</div>
                  <div className="text-[11px] mt-0.5 opacity-80">{check.error || "Không có dữ liệu"}</div>
                </div>
              </>
            ) : null}
          </div>
        )}

        <div>
          <Label>Tên profile <span className="text-red-500">*</span></Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Tự gợi ý khi chọn country + service"
          />
          <div className="text-[11px] text-gray-500 mt-1">Dùng để chọn nhanh trong Đăng ký tự động — VD: <code>VN Shopee</code>, <code>US Discord</code>.</div>
        </div>

        <div>
          <Label>Operator (tuỳ chọn)</Label>
          <select
            aria-label="Operator"
            value={form.operator}
            onChange={(e) => setForm({ ...form, operator: e.target.value })}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:border-info focus:outline-none"
          >
            <option value="any">any — pool tự chọn rẻ nhất (khuyến nghị)</option>
            <option value="virtual">virtual — số ảo VoIP</option>
            <option value="physical">physical — SIM thật</option>
          </select>
        </div>

        <div>
          <Label>Ghi chú</Label>
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="VD: dùng cho Shopee VN auto-signup"
            rows={2}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose}>Huỷ</Button>
          <Button onClick={onSave} loading={saving} disabled={!canSave}>
            {form.id ? "Lưu thay đổi" : "Tạo profile"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
