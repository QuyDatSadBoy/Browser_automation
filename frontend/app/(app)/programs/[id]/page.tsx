"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Gauge, Loader2, Trash2, Smartphone, Save, RotateCcw, AlertCircle, Sparkles } from "lucide-react";
import * as api from "@/lib/api";
import type { TrafficDetails } from "@/lib/api";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { SmsSelect } from "@/components/SmsSelect";
import { ProgramTrafficDetail } from "@/components/ProgramTrafficDetail";
import { useToast } from "@/lib/toast";

export default function ProgramDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const programId = Number(id);
  const router = useRouter();
  const { push } = useToast();
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["program", programId], queryFn: () => api.getProgram(programId) });
  const del = useMutation({
    mutationFn: () => api.deleteProgram(programId),
    onSuccess: () => { push({ type: "success", message: "Đã xoá." }); qc.invalidateQueries({ queryKey: ["programs"] }); router.push("/programs"); },
  });
  const scan = useMutation({
    mutationFn: () => api.scanProgramTraffic(programId),
    onSuccess: (res) => {
      push({
        type: res.found ? "success" : "info",
        title: q.data?.name,
        href: `/programs?focus=${programId}`,
        message: res.found
          ? `Đã quét: ${new Intl.NumberFormat("vi-VN").format(res.monthly_visits)} visits (${res.period_month})`
          : "SimilarWeb không có dữ liệu cho domain này",
      });
      qc.invalidateQueries({ queryKey: ["program", programId] });
      qc.invalidateQueries({ queryKey: ["programs"] });
    },
    onError: (e: any) => push({ type: "error", title: q.data?.name, href: `/programs?focus=${programId}`, message: e?.message || "Quét traffic thất bại" }),
  });

  if (q.isLoading) return <div className="text-gray-500">Đang tải...</div>;
  if (q.error || !q.data) return <div className="text-red-500">Không tìm thấy program.</div>;

  const p = q.data;
  let tags: string[] = [];
  try { tags = JSON.parse(p.tags_json || "[]"); } catch {}
  let restrictions: string[] = [];
  try { restrictions = JSON.parse(p.restrictions_json || "[]"); } catch {}
  let payoutMethods: string[] = [];
  try { payoutMethods = JSON.parse(p.payout_methods_json || "[]"); } catch {}
  let agents: { prompt?: string; keywords?: string[]; use_cases?: string[] } | null = null;
  try { agents = p.agents_json ? JSON.parse(p.agents_json) : null; } catch {}
  let trafficDetails: TrafficDetails | null = null;
  try { trafficDetails = p.traffic_details_json ? JSON.parse(p.traffic_details_json) as TrafficDetails : null; } catch {}
  const hasTraffic = !!(trafficDetails && (trafficDetails.global?.length || trafficDetails.country?.length));
  const domain = (() => {
    const u = p.url || p.signup_url || p.source_url;
    if (!u) return null;
    try { return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, ""); } catch { return null; }
  })();

  return (
    <div>
      <Link href="/programs" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary mb-4">
        <ArrowLeft size={16} /> Quay lại
      </Link>

      <Card className="mb-4">
        <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            {p.logo_url && (
              <img
                src={p.logo_url}
                alt=""
                className="w-14 h-14 rounded-lg object-contain bg-gray-50 border border-gray-100 flex-shrink-0"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-2xl font-bold text-ink break-words">{p.name}</h1>
                <Badge variant="primary">{p.source}</Badge>
                {p.directory_status && (
                  <Badge variant={/(verified|active|auto)/i.test(p.directory_status) ? "success" : "neutral"}>
                    {p.directory_status}
                  </Badge>
                )}
                {p.directory_network && <Badge variant="neutral">{p.directory_network}</Badge>}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {p.category && <Badge variant="neutral">{p.category}</Badge>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => scan.mutate()} disabled={scan.isPending}>
              {scan.isPending ? <Loader2 size={14} className="animate-spin" /> : <Gauge size={14} />}
              {scan.isPending ? "Đang quét…" : hasTraffic ? "Quét lại traffic" : "Quét traffic"}
            </Button>
            {p.signup_url && (
              <a href={p.signup_url} target="_blank" rel="noreferrer">
                <Button variant="cta">
                  Mở signup <ExternalLink size={14} />
                </Button>
              </a>
            )}
            <Button variant="danger" onClick={() => { if (confirm("Xoá program này?")) del.mutate(); }}>
              <Trash2 size={14} /> Xoá
            </Button>
          </div>
        </div>

        {(p.short_description || p.description) && (
          <p className="text-sm text-gray-600 mb-4 whitespace-pre-line">{p.short_description || p.description}</p>
        )}
        {p.short_description && p.description && p.short_description !== p.description && (
          <details className="mb-4 text-sm">
            <summary className="cursor-pointer text-primary hover:underline">Xem mô tả đầy đủ</summary>
            <p className="text-gray-600 mt-2 whitespace-pre-line">{p.description}</p>
          </details>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <Field label="Commission" value={p.commission} />
          <Field label="Loại" value={p.commission_type} />
          <Field label="Kỳ commission" value={p.commission_duration} />
          <Field label="Payout" value={p.payout} />
          <Field label="Payout min" value={p.payout_min ? `${p.payout_min}${p.payout_currency ? " " + p.payout_currency : ""}` : null} />
          <Field label="Chu kỳ payout" value={p.payout_frequency} />
          <Field label="Đơn vị payout" value={p.payout_currency} />
          <Field label="Cookie" value={p.cookie_duration} />
          <Field label="Traffic (nguồn)" value={p.directory_traffic} />
          <Field label="Độ phổ biến (nguồn)" value={p.directory_popularity} />
          <Field label="Trạng thái (nguồn)" value={p.directory_status} />
          <Field label="Network" value={p.directory_network} />
          <Field label="Duyệt đơn" value={p.directory_approval} />
          <Field label="Thời gian duyệt" value={p.directory_approval_time} />
          <Field label="Attribution" value={p.directory_attribution} />
          <Field label="Tracking" value={p.directory_tracking} />
          <Field label="Last verified" value={p.directory_last_verified_at} />
          <Field label="Tuổi chương trình" value={p.directory_program_age} />
          <Field
            label="Đăng ký mở"
            value={p.registrations_open === 1 ? "Có" : p.registrations_open === 0 ? "Đã đóng" : null}
          />
          <Field label="Traffic / tháng (SimilarWeb)" value={p.traffic_score ? new Intl.NumberFormat("vi-VN").format(p.traffic_score) : null} />
          <Field label="Kỳ traffic" value={p.traffic_period_month} />
          <Field label="URL" value={p.url} link />
          <Field label="Signup URL" value={p.signup_url} link />
          <Field label="External ID" value={p.external_id} mono />
          <Field label="Crawled" value={new Date(p.crawled_at + "Z").toLocaleString("vi-VN")} />
        </div>

        {p.commission_conditions && (
          <div className="mt-4 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Điều kiện commission</div>
            <div className="text-sm text-gray-700 whitespace-pre-line">{p.commission_conditions}</div>
          </div>
        )}

        {payoutMethods.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Phương thức payout</div>
            <div className="flex flex-wrap gap-1.5">
              {payoutMethods.map((m) => <Badge key={m} variant="info">{m}</Badge>)}
            </div>
          </div>
        )}

        {restrictions.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-100 p-3">
            <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-amber-700">
              <AlertCircle size={14} /> Hạn chế / quy định
            </div>
            <ul className="list-disc pl-5 text-sm text-amber-900 space-y-1">
              {restrictions.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}

        {agents && (agents.prompt || (agents.keywords?.length || 0) > 0 || (agents.use_cases?.length || 0) > 0) && (
          <div className="mt-4 rounded-lg bg-primary-50 border border-primary/20 p-3">
            <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-primary">
              <Sparkles size={14} /> AI Agent recommendation
            </div>
            {agents.prompt && (
              <p className="text-sm text-gray-700 whitespace-pre-line mb-2">{agents.prompt}</p>
            )}
            {(agents.keywords?.length || 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {agents.keywords!.map((k) => <Badge key={k} variant="primary" className="!text-[10px]">{k}</Badge>)}
              </div>
            )}
            {(agents.use_cases?.length || 0) > 0 && (
              <ul className="list-disc pl-5 text-sm text-gray-700 space-y-0.5">
                {agents.use_cases!.map((u, i) => <li key={i}>{u}</li>)}
              </ul>
            )}
          </div>
        )}

        {tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map((t) => <Badge key={t} variant="info">#{t}</Badge>)}
          </div>
        )}
      </Card>

      <SmsPresetCard program={p} onSaved={() => qc.invalidateQueries({ queryKey: ["program", programId] })} />

      {hasTraffic && trafficDetails ? (
        <div className="mb-4">
          <ProgramTrafficDetail details={trafficDetails} scannedAt={p.traffic_scanned_at} domain={domain} />
        </div>
      ) : (
        <Card className="mb-4">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Gauge size={32} className="mb-3 text-gray-300" />
            <h3 className="text-sm font-semibold text-ink">Chưa có dữ liệu traffic chi tiết</h3>
            <p className="mt-1 max-w-md text-xs text-gray-500">
              Bấm <span className="font-medium text-gray-700">Quét traffic</span> để lấy dữ liệu SimilarWeb (4 tháng gần nhất, theo quốc gia, nguồn traffic, social).
            </p>
            <Button variant="secondary" className="mt-4" onClick={() => scan.mutate()} disabled={scan.isPending}>
              {scan.isPending ? <Loader2 size={14} className="animate-spin" /> : <Gauge size={14} />}
              {scan.isPending ? "Đang quét…" : "Quét traffic ngay"}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold text-ink mb-2">Raw JSON</h3>
        <pre className="text-xs bg-canvas border border-gray-200 rounded-lg p-3 overflow-auto max-h-80 text-gray-700">
          {p.raw_json ? JSON.stringify(JSON.parse(p.raw_json), null, 2) : "—"}
        </pre>
      </Card>
    </div>
  );
}

function Field({ label, value, link, mono }: { label: string; value: string | null | undefined; link?: boolean; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</div>
      {!value ? <div className="text-sm text-gray-300">—</div> :
        link ? <a href={value} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline break-all">{value}</a> :
        <div className={`text-sm text-ink ${mono ? "font-mono text-xs" : ""}`}>{value}</div>}
    </div>
  );
}

/* ---------------- SMS preset card ---------------- */

function SmsPresetCard({ program, onSaved }: { program: api.Program; onSaved: () => void }) {
  const { push } = useToast();
  const [country, setCountry] = useState(program.sms_country_id || "");
  const [service, setService] = useState(program.sms_service_id || "");
  const [profileId, setProfileId] = useState(program.sms_profile_id || "");

  const countriesQ = useQuery({ queryKey: ["sms-countries"], queryFn: api.listSmsCountries, staleTime: 30 * 60_000 });
  const servicesQ = useQuery({ queryKey: ["sms-services"], queryFn: api.listSmsServices, staleTime: 30 * 60_000 });
  const statusQ = useQuery({ queryKey: ["sms-status"], queryFn: api.getSmsStatus });
  const profilesQ = useQuery({ queryKey: ["sms-profiles"], queryFn: api.listSmsProfiles });

  const save = useMutation({
    mutationFn: () => api.updateProgramSmsPreset(program.id, {
      sms_country_id: country.trim(),
      sms_service_id: service.trim(),
      sms_profile_id: profileId.trim(),
    }),
    onSuccess: () => { push({ type: "success", message: "Đã lưu cấu hình SMS cho program." }); onSaved(); },
    onError: (e: Error) => push({ type: "error", message: e.message }),
  });

  const resetDefaults = () => { setCountry(""); setService(""); setProfileId(""); };

  const countryName = useMemo(
    () => (country && countriesQ.data?.find((x) => x.id === country)?.name) || "",
    [country, countriesQ.data],
  );
  const serviceName = useMemo(
    () => (service && servicesQ.data?.find((x) => x.id === service)?.name) || "",
    [service, servicesQ.data],
  );

  const dirty =
    (country || "") !== (program.sms_country_id || "") ||
    (service || "") !== (program.sms_service_id || "") ||
    (profileId || "") !== (program.sms_profile_id || "");
  const provider = statusQ.data?.provider || "smspool";

  if (provider !== "smspool") {
    return (
      <Card className="mb-4">
        <div className="text-sm text-gray-500">
          SMS provider hiện tại là <b>{provider}</b> — chỉ <b>SMSPool</b> hỗ trợ override per-program.
          Đổi <code>SMS_OTP_PROVIDER</code> sang <code>smspool</code> trong <code>backend/.env</code> để dùng tính năng này.
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-lg bg-info-50 text-info flex items-center justify-center"><Smartphone size={18} /></span>
          <div>
            <div className="font-semibold text-ink">Cấu hình SMS OTP riêng cho program này</div>
            <div className="text-xs text-gray-500">
              Chỉ ảnh hưởng khi program này yêu cầu OTP qua điện thoại. Để trống = dùng mặc định từ <Link href="/library?tab=sms" className="text-info underline">Thư viện → SMS OTP</Link>.
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Chọn từ SMS Profile (ưu tiên)</label>
        <select
          aria-label="SMS profile"
          title="Chọn SMS profile"
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
          className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:border-info focus:outline-none"
        >
          <option value="">— Không dùng profile (chọn country/service thủ công bên dưới)</option>
          {(profilesQ.data || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.country_name || `#${p.country_id}`} · {p.service_name || `#${p.service_id}`}
            </option>
          ))}
        </select>
        <div className="text-[11px] text-gray-500 mt-1">
          Nếu đã chọn profile, country/service bên dưới sẽ bị bỏ qua khi chạy job.{" "}
          <Link href="/library?tab=sms" className="text-info underline">Quản lý profiles</Link>
        </div>
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${profileId ? "opacity-50 pointer-events-none" : ""}`}>
        <SmsSelect
          label="Quốc gia số điện thoại"
          placeholder={statusQ.data?.default_country_name ? `Mặc định: ${statusQ.data.default_country_name} (#${statusQ.data.default_country})` : "Chọn quốc gia..."}
          options={countriesQ.data || []}
          value={country}
          onChange={setCountry}
          loading={countriesQ.isLoading}
          hint={countryName ? `Đã chọn: ${countryName} (ID #${country})` : "Để trống = kế thừa mặc định"}
        />
        <SmsSelect
          label="Loại dịch vụ (site mục tiêu)"
          placeholder={statusQ.data?.default_product_name ? `Mặc định: ${statusQ.data.default_product_name} (#${statusQ.data.default_product})` : "Chọn service..."}
          options={servicesQ.data || []}
          value={service}
          onChange={setService}
          loading={servicesQ.isLoading}
          hint={serviceName ? `Đã chọn: ${serviceName} (ID #${service})` : 'Chọn "Any" (ID 1) nếu không chắc — dùng được cho mọi site'}
        />
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          {dirty ? <span className="text-amber-600">● Có thay đổi chưa lưu</span> : <span className="text-emerald-600">✓ Đã đồng bộ</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={resetDefaults} disabled={!country && !service}>
            <RotateCcw size={14} /> Dùng mặc định
          </Button>
          <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
            <Save size={14} /> Lưu
          </Button>
        </div>
      </div>
    </Card>
  );
}


