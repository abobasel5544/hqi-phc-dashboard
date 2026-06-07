"use client";

import seedIndicators from "@/lib/hqi_kpi_seed.json";
import { createClient } from "@supabase/supabase-js";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  LogOut,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Indicator = {
  code: string;
  name: string;
  description?: string;
  denominatorDescription?: string;
  facilityType?: string;
  status?: string;
  defaultTarget?: number;
};

type Entry = {
  id?: number;
  created_at?: string;
  center: string;
  month: string;
  indicator_code: string;
  numerator: number | null;
  denominator: number | null;
  notes?: string;
  updated_by?: string;
};

type User = {
  username: string;
  center: string;
  role: "admin" | "center" | string;
};

type AggregateRow = {
  code: string;
  indicator: string;
  target: number;
  totalNumerator: number;
  totalDenominator: number;
  percentage: number | null;
  statusLabel: string;
  statusClass: string;
  enteredCentersCount: number;
  missingCenters: string[];
};

const centers = ["الواحة", "الرغامة", "قويزة", "المطار القديم", "الروابي", "السليمانية", "شرق الخط"];
const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const monthLabels: Record<string, string> = {
  "2026-01": "يناير 2026",
  "2026-02": "فبراير 2026",
  "2026-03": "مارس 2026",
  "2026-04": "أبريل 2026",
  "2026-05": "مايو 2026",
  "2026-06": "يونيو 2026",
  "2026-07": "يوليو 2026",
  "2026-08": "أغسطس 2026",
  "2026-09": "سبتمبر 2026",
  "2026-10": "أكتوبر 2026",
  "2026-11": "نوفمبر 2026",
  "2026-12": "ديسمبر 2026",
};
const indicators = seedIndicators as Indicator[];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function pct(n: number | null | undefined, d: number | null | undefined) {
  if (n === null || n === undefined || d === null || d === undefined || Number(d) === 0) return null;
  return (Number(n) / Number(d)) * 100;
}

function status(v: number | null, target = 100) {
  if (v === null) return { label: "لم يكتمل", cls: "bg-slate-100 text-slate-600" };
  if (v >= target) return { label: "محقق", cls: "bg-emerald-100 text-emerald-700" };
  if (v >= target * 0.85) return { label: "قريب", cls: "bg-amber-100 text-amber-700" };
  return { label: "متعثر", cls: "bg-rose-100 text-rose-700" };
}

function fmt(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(digits);
}

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMsg, setLoginMsg] = useState("");

  const [center, setCenter] = useState(centers[0]);
  const [month, setMonth] = useState("2026-06");
  const [updatedBy, setUpdatedBy] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"entry" | "dashboard" | "aggregate">("entry");

  useEffect(() => {
    const saved = localStorage.getItem("hqi_user");
    if (saved) {
      const parsed = JSON.parse(saved) as User;
      setUser(parsed);
      if (parsed.role !== "admin") setCenter(parsed.center);
    }
  }, []);

  async function login() {
    setLoginMsg("");
    if (!loginUsername || !loginPassword) {
      setLoginMsg("أدخل اسم المستخدم وكلمة المرور.");
      return;
    }
    if (!supabase) {
      setLoginMsg("لم يتم ربط Supabase. تأكد من ملف .env.local ومتغيرات Vercel.");
      return;
    }
    const { data, error } = await supabase
      .from("center_users")
      .select("username, center, role")
      .eq("username", loginUsername.trim())
      .eq("password", loginPassword.trim())
      .maybeSingle();

    if (error) {
      setLoginMsg("تعذر تسجيل الدخول: " + error.message);
      return;
    }
    if (!data) {
      setLoginMsg("بيانات الدخول غير صحيحة.");
      return;
    }
    const loggedUser = data as User;
    setUser(loggedUser);
    localStorage.setItem("hqi_user", JSON.stringify(loggedUser));
    setUpdatedBy(loggedUser.username);
    if (loggedUser.role !== "admin") {
      setCenter(loggedUser.center);
      setTab("entry");
    }
    await load();
  }

  function logout() {
    localStorage.removeItem("hqi_user");
    setUser(null);
    setLoginUsername("");
    setLoginPassword("");
    setTab("entry");
  }

  async function load() {
    setMsg("");
    if (!supabase) {
      const local = localStorage.getItem("hqi_entries");
      setEntries(local ? JSON.parse(local) : []);
      return;
    }
    const { data, error } = await supabase.from("hqi_entries").select("*").order("created_at", { ascending: false });
    if (error) setMsg("تعذر تحميل البيانات: " + error.message);
    else setEntries((data || []) as Entry[]);
  }

  useEffect(() => {
    load();
  }, []);

  const allowedCenter = user?.role === "admin" ? center : user?.center || center;

  const currentMap = useMemo(() => {
    const m = new Map<string, Entry>();
    entries.filter((e) => e.center === allowedCenter && e.month === month).forEach((e) => m.set(e.indicator_code, e));
    return m;
  }, [entries, allowedCenter, month]);

  function updateLocal(code: string, field: "numerator" | "denominator" | "notes", value: string) {
    setEntries((prev) => {
      const copy = [...prev];
      const i = copy.findIndex((e) => e.center === allowedCenter && e.month === month && e.indicator_code === code);
      const val = field === "notes" ? value : value === "" ? null : Number(value);
      if (i >= 0) copy[i] = { ...copy[i], [field]: val, updated_by: updatedBy || user?.username || "غير محدد" } as Entry;
      else {
        copy.push({
          center: allowedCenter,
          month,
          indicator_code: code,
          numerator: field === "numerator" ? Number(value) : null,
          denominator: field === "denominator" ? Number(value) : null,
          notes: field === "notes" ? value : "",
          updated_by: updatedBy || user?.username || "غير محدد",
        });
      }
      return copy;
    });
  }

  async function saveAll() {
    if (!user) return;
    setSaving(true);
    setMsg("");
    const rows = indicators
      .map((ind) => {
        const e = currentMap.get(ind.code);
        return {
          center: allowedCenter,
          month,
          indicator_code: ind.code,
          numerator: e?.numerator ?? null,
          denominator: e?.denominator ?? null,
          notes: e?.notes || "",
          updated_by: updatedBy || user.username || "غير محدد",
        };
      })
      .filter((r) => r.numerator !== null || r.denominator !== null || r.notes);

    if (!rows.length) {
      setMsg("لم يتم إدخال أي بيانات للحفظ.");
      setSaving(false);
      return;
    }

    if (!supabase) {
      localStorage.setItem("hqi_entries", JSON.stringify(entries));
      setMsg("تم الحفظ على هذا الجهاز فقط. اربط Supabase ليظهر للجميع.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("hqi_entries").upsert(rows, { onConflict: "center,month,indicator_code" });
    if (error) setMsg("خطأ في الحفظ: " + error.message);
    else {
      setMsg("تم حفظ بيانات المركز بنجاح ✅");
      await load();
    }
    setSaving(false);
  }

  const filtered = entries.filter((e) => e.month === month);

  const aggregateRows = useMemo<AggregateRow[]>(() => {
    return indicators.map((ind) => {
      const rows = filtered.filter((e) => e.indicator_code === ind.code);
      const totalNumerator = rows.reduce((sum, r) => sum + Number(r.numerator || 0), 0);
      const totalDenominator = rows.reduce((sum, r) => sum + Number(r.denominator || 0), 0);
      const percentage = pct(totalNumerator, totalDenominator);
      const st = status(percentage, ind.defaultTarget || 100);
      const enteredCenters = new Set(rows.filter((r) => r.numerator !== null || r.denominator !== null).map((r) => r.center));
      const missingCenters = centers.filter((c) => !enteredCenters.has(c));
      return {
        code: ind.code,
        indicator: ind.name,
        target: ind.defaultTarget || 100,
        totalNumerator,
        totalDenominator,
        percentage,
        statusLabel: st.label,
        statusClass: st.cls,
        enteredCentersCount: enteredCenters.size,
        missingCenters,
      };
    });
  }, [filtered]);

  const centerCompletion = useMemo(() => {
    return centers.map((c) => {
      const rows = filtered.filter((e) => e.center === c && (e.numerator !== null || e.denominator !== null));
      const completedCodes = new Set(rows.map((r) => r.indicator_code));
      return { center: c, completed: completedCodes.size, total: indicators.length, percentage: (completedCodes.size / indicators.length) * 100 };
    });
  }, [filtered]);

  const summary = useMemo(() => {
    const completed = aggregateRows.filter((r) => r.totalDenominator > 0).length;
    const achieved = aggregateRows.filter((r) => r.percentage !== null && r.percentage >= r.target).length;
    const weak = aggregateRows.filter((r) => r.percentage !== null && r.percentage < r.target * 0.85).length;
    const valid = aggregateRows.filter((r) => r.percentage !== null);
    const avg = valid.length ? valid.reduce((s, r) => s + Number(r.percentage), 0) / valid.length : 0;
    return { completed, achieved, weak, avg };
  }, [aggregateRows]);

  const chartData = centers.map((c) => {
    const rows = entries.filter((e) => e.center === c && e.month === month);
    const vals = rows.map((e) => pct(e.numerator, e.denominator)).filter((x): x is number => x !== null);
    return { center: c, الإنجاز: vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0 };
  });

  async function exportAggregateExcel() {
    const XLSX = await import("xlsx");
    const summarySheet = aggregateRows.map((r) => ({
      "كود المؤشر": r.code,
      "اسم المؤشر": r.indicator,
      "وصف المؤشر": indicators.find((i) => i.code === r.code)?.description || "",
      "المقام": indicators.find((i) => i.code === r.code)?.denominatorDescription || "",
      "مجموع البسط لجميع المراكز": r.totalNumerator,
      "مجموع المقام لجميع المراكز": r.totalDenominator,
      "النسبة النهائية": r.percentage === null ? "" : Number(r.percentage.toFixed(2)),
      "المستهدف": r.target,
      "الحالة": r.statusLabel,
      "عدد المراكز المدخلة": r.enteredCentersCount,
      "المراكز غير المدخلة": r.missingCenters.join("، "),
    }));

    const detailsSheet = filtered.map((e) => {
      const ind = indicators.find((i) => i.code === e.indicator_code);
      const v = pct(e.numerator, e.denominator);
      return {
        "الشهر": e.month,
        "المركز": e.center,
        "كود المؤشر": e.indicator_code,
        "اسم المؤشر": ind?.name || "",
        "وصف المؤشر": ind?.description || "",
        "المقام المرجعي": ind?.denominatorDescription || "",
        "البسط": e.numerator ?? "",
        "المقام": e.denominator ?? "",
        "النسبة": v === null ? "" : Number(v.toFixed(2)),
        "الملاحظة": e.notes || "",
        "مدخل البيانات": e.updated_by || "",
        "تاريخ الإدخال": e.created_at || "",
      };
    });

    const missingSheet = centerCompletion.flatMap((c) => {
      const completed = new Set(filtered.filter((e) => e.center === c.center && (e.numerator !== null || e.denominator !== null)).map((e) => e.indicator_code));
      return indicators
        .filter((ind) => !completed.has(ind.code))
        .map((ind) => ({ "الشهر": month, "المركز": c.center, "كود المؤشر غير المدخل": ind.code, "اسم المؤشر": ind.name }));
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), "HQI Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailsSheet), "HQI Details");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(missingSheet), "Missing Data");
    XLSX.writeFile(wb, `HQI_PHC_Aggregate_${month}.xlsx`);
  }

  function exportCsv() {
    const header = ["center", "month", "indicator_code", "indicator_name", "numerator", "denominator", "percent", "notes", "updated_by"];
    const lines = entries
      .filter((e) => user?.role === "admin" || e.center === user?.center)
      .map((e) => {
        const ind = indicators.find((i) => i.code === e.indicator_code);
        const v = pct(e.numerator, e.denominator);
        return [e.center, e.month, e.indicator_code, ind?.name || "", e.numerator ?? "", e.denominator ?? "", v?.toFixed(2) ?? "", e.notes || "", e.updated_by || ""]
          .map((x) => `"${String(x).replaceAll('"', '""')}"`)
          .join(",");
      });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hqi-${month}.csv`;
    a.click();
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-xl border">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
              <Lock size={30} />
            </div>
            <p className="text-sm text-slate-500">تجمع جدة الصحي الأول - مستشفى شرق جدة</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">دخول مؤشرات الجودة HQI</h1>
            <p className="mt-2 text-sm text-slate-500">كل مركز يدخل بحسابه الخاص، والإدارة تدخل بحساب admin لعرض التقرير المجمع.</p>
          </div>
          <label className="mb-3 block text-sm font-semibold text-slate-700">اسم المستخدم</label>
          <input value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} className="mb-4 w-full rounded-xl border p-3" placeholder="مثال: wahah" />
          <label className="mb-3 block text-sm font-semibold text-slate-700">كلمة المرور</label>
          <input value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} type="password" className="mb-4 w-full rounded-xl border p-3" placeholder="••••••" />
          {loginMsg && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{loginMsg}</div>}
          <button onClick={login} className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white hover:bg-emerald-800">دخول</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50" dir="rtl">
      <header className="bg-gradient-to-l from-emerald-900 via-teal-800 to-slate-900 text-white p-6 shadow-lg">
        <div className="mx-auto max-w-7xl flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm opacity-80">تجمع جدة الصحي الأول - مستشفى شرق جدة</p>
            <h1 className="text-2xl md:text-3xl font-bold">لوحة مؤشرات الجودة للمراكز الصحية HQI 2026</h1>
            <p className="mt-1 text-sm opacity-90">{user.role === "admin" ? "حساب الإدارة - عرض جميع المراكز والتقرير المجمع" : `حساب مركز ${user.center}`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setTab("entry")} className={`rounded-xl px-4 py-2 ${tab === "entry" ? "bg-white text-emerald-900" : "bg-white/10"}`}>إدخال البيانات</button>
            <button onClick={() => setTab("dashboard")} className={`rounded-xl px-4 py-2 ${tab === "dashboard" ? "bg-white text-emerald-900" : "bg-white/10"}`}>المتابعة</button>
            {user.role === "admin" && <button onClick={() => setTab("aggregate")} className={`rounded-xl px-4 py-2 ${tab === "aggregate" ? "bg-white text-emerald-900" : "bg-white/10"}`}>التقرير المجمع</button>}
            <button onClick={logout} className="rounded-xl bg-white/10 px-4 py-2 flex items-center gap-2"><LogOut size={17} /> خروج</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl p-4 md:p-6">
        {!supabase && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 flex gap-2"><AlertTriangle /> المشروع يعمل حالياً بدون Supabase؛ البيانات تحفظ على الجهاز فقط.</div>}
        <div className="grid gap-3 md:grid-cols-4 mb-5">
          <label className="rounded-2xl bg-white p-4 shadow-sm">
            المركز
            {user.role === "admin" ? (
              <select value={center} onChange={(e) => setCenter(e.target.value)} className="mt-2 w-full rounded-xl border p-3">{centers.map((c) => <option key={c}>{c}</option>)}</select>
            ) : (
              <div className="mt-2 rounded-xl border bg-slate-50 p-3 font-bold text-slate-700">{user.center}</div>
            )}
          </label>
          <label className="rounded-2xl bg-white p-4 shadow-sm">الشهر<select value={month} onChange={(e) => setMonth(e.target.value)} className="mt-2 w-full rounded-xl border p-3">{months.map((m) => <option key={m} value={m}>{monthLabels[m]}</option>)}</select></label>
          <label className="rounded-2xl bg-white p-4 shadow-sm">اسم المدخل<input value={updatedBy} onChange={(e) => setUpdatedBy(e.target.value)} placeholder={user.username} className="mt-2 w-full rounded-xl border p-3" /></label>
          <div className="rounded-2xl bg-white p-4 shadow-sm flex items-end gap-2"><button onClick={saveAll} disabled={saving || tab === "aggregate"} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-white hover:bg-emerald-800 flex items-center justify-center gap-2 disabled:opacity-50"><Save size={18} />{saving ? "جار الحفظ" : "حفظ بيانات المركز"}</button></div>
        </div>
        {msg && <div className="mb-4 rounded-xl bg-white border p-3 text-sm">{msg}</div>}

        {tab === "entry" && (
          <div className="rounded-3xl bg-white shadow-sm overflow-hidden border">
            <div className="border-b p-4 flex items-center justify-between">
              <h2 className="font-bold text-lg flex gap-2"><Send /> نموذج إدخال مؤشرات المراكز الصحية - {allowedCenter} - {monthLabels[month]}</h2>
              <button onClick={exportCsv} className="rounded-xl border px-3 py-2 flex gap-2"><Download size={18} />تصدير CSV</button>
            </div>
            <EntryTable indicators={indicators} currentMap={currentMap} updateLocal={updateLocal} />
          </div>
        )}

        {tab === "dashboard" && (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <Card icon={<Activity />} title="المؤشرات المدخلة" value={summary.completed} />
              <Card icon={<CheckCircle2 />} title="المؤشرات المحققة" value={summary.achieved} />
              <Card icon={<AlertTriangle />} title="المؤشرات المتعثرة" value={summary.weak} />
              <Card icon={<BarChart3 />} title="متوسط الإنجاز" value={summary.avg.toFixed(1) + "%"} />
            </div>
            <div className="rounded-3xl bg-white p-5 shadow-sm border"><h2 className="font-bold mb-4">متوسط إنجاز المراكز - {monthLabels[month]}</h2><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="center" /><YAxis /><Tooltip /><Bar dataKey="الإنجاز" /></BarChart></ResponsiveContainer></div></div>
          </div>
        )}

        {tab === "aggregate" && user.role === "admin" && (
          <div className="space-y-5">
            <div className="rounded-3xl bg-white p-5 shadow-sm border flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="text-emerald-700" /> التقرير المجمع لجميع المراكز - {monthLabels[month]}</h2>
                <p className="mt-1 text-sm text-slate-500">يتم جمع البسط لجميع المراكز وجمع المقام لجميع المراكز، ثم حساب النسبة النهائية لكل مؤشر.</p>
              </div>
              <button onClick={exportAggregateExcel} className="rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white flex items-center gap-2 hover:bg-emerald-800"><FileSpreadsheet size={18} /> تصدير Excel مجمع</button>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Card icon={<Activity />} title="مؤشرات لها بيانات" value={summary.completed} />
              <Card icon={<CheckCircle2 />} title="محققة على مستوى جميع المراكز" value={summary.achieved} />
              <Card icon={<AlertTriangle />} title="متعثر على مستوى جميع المراكز" value={summary.weak} />
              <Card icon={<BarChart3 />} title="متوسط النتائج النهائية" value={summary.avg.toFixed(1) + "%"} />
            </div>
            <div className="rounded-3xl bg-white shadow-sm overflow-hidden border">
              <div className="border-b p-4"><h3 className="font-bold">HQI Summary - تجميع كل المراكز في نتيجة واحدة لكل مؤشر</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100"><tr><th className="p-3 text-right">المؤشر</th><th className="p-3">مجموع البسط</th><th className="p-3">مجموع المقام</th><th className="p-3">النسبة النهائية</th><th className="p-3">المستهدف</th><th className="p-3">الحالة</th><th className="p-3">عدد المراكز المدخلة</th><th className="p-3 text-right">المراكز غير المدخلة</th></tr></thead>
                  <tbody>{aggregateRows.map((r) => <tr key={r.code} className="border-t hover:bg-slate-50"><td className="p-3 min-w-[280px]"><b>{r.code} - {r.indicator}</b></td><td className="p-3 text-center font-bold">{r.totalNumerator}</td><td className="p-3 text-center font-bold">{r.totalDenominator}</td><td className="p-3 text-center font-bold">{fmt(r.percentage, 2)}%</td><td className="p-3 text-center">{r.target}%</td><td className="p-3 text-center"><span className={`rounded-full px-3 py-1 text-xs ${r.statusClass}`}>{r.statusLabel}</span></td><td className="p-3 text-center">{r.enteredCentersCount} / {centers.length}</td><td className="p-3 text-right text-xs text-slate-500">{r.missingCenters.length ? r.missingCenters.join("، ") : "مكتمل"}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function EntryTable({ indicators, currentMap, updateLocal }: { indicators: Indicator[]; currentMap: Map<string, Entry>; updateLocal: (code: string, field: "numerator" | "denominator" | "notes", value: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1250px] text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-3 text-center w-[110px]">كود المؤشر</th>
            <th className="p-3 text-right w-[250px]">اسم المؤشر</th>
            <th className="p-3 text-right min-w-[520px]">وصف المؤشر / المقام</th>
            <th className="p-3 text-center w-[100px]">المستهدف</th>
            <th className="p-3 text-center w-[130px]">البسط</th>
            <th className="p-3 text-center w-[130px]">المقام</th>
            <th className="p-3 text-center w-[95px]">النسبة</th>
            <th className="p-3 text-center w-[105px]">الحالة</th>
            <th className="p-3 text-center w-[190px]">ملاحظة</th>
          </tr>
        </thead>
        <tbody>{indicators.map((ind) => {
          const e = currentMap.get(ind.code);
          const v = pct(e?.numerator ?? null, e?.denominator ?? null);
          const st = status(v, ind.defaultTarget || 100);
          return (
            <tr key={ind.code} className="border-t align-top hover:bg-slate-50">
              <td className="p-3 text-center font-bold text-slate-900">{ind.code}</td>
              <td className="p-3 text-right">
                <div className="font-bold text-slate-900 whitespace-normal break-words">{ind.name}</div>
                {ind.status && <div className="mt-1 text-[11px] text-slate-400">{ind.status}</div>}
              </td>
              <td className="p-3 text-right leading-7">
                <div className="whitespace-pre-wrap break-words text-sm text-slate-700">{ind.description}</div>
                {ind.denominatorDescription && (
                  <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs leading-6 text-slate-600 whitespace-pre-wrap break-words">
                    <span className="font-bold text-slate-800">المقام: </span>{ind.denominatorDescription}
                  </div>
                )}
              </td>
              <td className="p-3 text-center font-semibold">{ind.defaultTarget || 100}%</td>
              <td className="p-3"><input type="number" value={e?.numerator ?? ""} onChange={(ev) => updateLocal(ind.code, "numerator", ev.target.value)} className="w-28 rounded-lg border p-2 text-center" /></td>
              <td className="p-3"><input type="number" value={e?.denominator ?? ""} onChange={(ev) => updateLocal(ind.code, "denominator", ev.target.value)} className="w-28 rounded-lg border p-2 text-center" /></td>
              <td className="p-3 text-center font-bold">{v === null ? "—" : v.toFixed(1) + "%"}</td>
              <td className="p-3 text-center"><span className={`rounded-full px-3 py-1 text-xs ${st.cls}`}>{st.label}</span></td>
              <td className="p-3"><input value={e?.notes || ""} onChange={(ev) => updateLocal(ind.code, "notes", ev.target.value)} className="w-48 rounded-lg border p-2" placeholder="اختياري" /></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function Card({ title, value, icon }: { title: string; value: any; icon: any }) {
  return <div className="rounded-3xl bg-white p-5 shadow-sm border"><div className="text-emerald-700 mb-3">{icon}</div><p className="text-sm text-slate-500">{title}</p><p className="text-3xl font-bold mt-1">{value}</p></div>;
}
