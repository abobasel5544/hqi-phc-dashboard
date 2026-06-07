"use client";

import seedIndicators from "@/lib/hqi_kpi_seed.json";
import { createClient } from "@supabase/supabase-js";
import { Activity, BarChart3, CheckCircle2, Download, Save, Send, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Indicator = { code: string; name: string; description?: string; denominatorDescription?: string; facilityType?: string; defaultTarget?: number };
type Entry = { id?: number; center: string; month: string; indicator_code: string; numerator: number | null; denominator: number | null; notes?: string; updated_by?: string };

const centers = ["الواحة", "الرغامة", "قويزة", "المطار القديم", "الروابي", "السليمانية", "شرق الخط"];
const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const indicators = seedIndicators as Indicator[];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function pct(n: number | null, d: number | null) { if (!n || !d || d === 0) return null; return (Number(n) / Number(d)) * 100; }
function status(v: number | null, target = 80) { if (v === null) return { label: "لم يكتمل", cls: "bg-slate-100 text-slate-600" }; if (v >= target) return { label: "محقق", cls: "bg-emerald-100 text-emerald-700" }; if (v >= target * 0.85) return { label: "قريب", cls: "bg-amber-100 text-amber-700" }; return { label: "متعثر", cls: "bg-rose-100 text-rose-700" }; }

export default function Page() {
  const [center, setCenter] = useState(centers[0]);
  const [month, setMonth] = useState("2026-06");
  const [updatedBy, setUpdatedBy] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"entry" | "dashboard">("entry");

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
  useEffect(() => { load(); }, []);

  const currentMap = useMemo(() => {
    const m = new Map<string, Entry>();
    entries.filter(e => e.center === center && e.month === month).forEach(e => m.set(e.indicator_code, e));
    return m;
  }, [entries, center, month]);

  function updateLocal(code: string, field: "numerator" | "denominator" | "notes", value: string) {
    setEntries(prev => {
      const copy = [...prev];
      const i = copy.findIndex(e => e.center === center && e.month === month && e.indicator_code === code);
      const val = field === "notes" ? value : (value === "" ? null : Number(value));
      if (i >= 0) copy[i] = { ...copy[i], [field]: val } as Entry;
      else copy.push({ center, month, indicator_code: code, numerator: field === "numerator" ? Number(value) : null, denominator: field === "denominator" ? Number(value) : null, notes: field === "notes" ? value : "", updated_by: updatedBy });
      return copy;
    });
  }

  async function saveAll() {
    setSaving(true); setMsg("");
    const rows = indicators.map(ind => {
      const e = currentMap.get(ind.code);
      return { center, month, indicator_code: ind.code, numerator: e?.numerator ?? null, denominator: e?.denominator ?? null, notes: e?.notes || "", updated_by: updatedBy || "غير محدد" };
    }).filter(r => r.numerator !== null || r.denominator !== null || r.notes);
    if (!rows.length) { setMsg("لم يتم إدخال أي بيانات للحفظ."); setSaving(false); return; }
    if (!supabase) {
      localStorage.setItem("hqi_entries", JSON.stringify(entries));
      setMsg("تم الحفظ على هذا الجهاز فقط. اربط Supabase ليظهر للجميع.");
      setSaving(false); return;
    }
    const { error } = await supabase.from("hqi_entries").upsert(rows, { onConflict: "center,month,indicator_code" });
    if (error) setMsg("خطأ في الحفظ: " + error.message); else { setMsg("تم حفظ بيانات المركز بنجاح ✅"); await load(); }
    setSaving(false);
  }

  const filtered = entries.filter(e => e.month === month);
  const summary = useMemo(() => {
    let completed = 0, achieved = 0, weak = 0, sum = 0, count = 0;
    filtered.forEach(e => { const ind = indicators.find(i => i.code === e.indicator_code); const v = pct(e.numerator, e.denominator); if (v !== null) { completed++; sum += v; count++; if (v >= (ind?.defaultTarget || 80)) achieved++; if (v < (ind?.defaultTarget || 80) * .85) weak++; } });
    return { completed, achieved, weak, avg: count ? sum / count : 0 };
  }, [filtered]);
  const chartData = centers.map(c => { const rows = entries.filter(e => e.center === c && e.month === month); const vals = rows.map(e => pct(e.numerator, e.denominator)).filter((x): x is number => x !== null); return { center: c, الإنجاز: vals.length ? Number((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)) : 0 }; });

  function exportCsv() {
    const header = ["center","month","indicator_code","indicator_name","numerator","denominator","percent","notes","updated_by"];
    const lines = entries.map(e => { const ind = indicators.find(i => i.code === e.indicator_code); const v = pct(e.numerator, e.denominator); return [e.center,e.month,e.indicator_code,ind?.name || "",e.numerator ?? "",e.denominator ?? "",v?.toFixed(2) ?? "",e.notes || "",e.updated_by || ""].map(x => `"${String(x).replaceAll('"','""')}"`).join(","); });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `hqi-${month}.csv`; a.click();
  }

  return <main className="min-h-screen bg-slate-50">
    <header className="bg-gradient-to-l from-emerald-900 via-teal-800 to-slate-900 text-white p-6 shadow-lg">
      <div className="mx-auto max-w-7xl flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div><p className="text-sm opacity-80">تجمع جدة الصحي الأول - مستشفى شرق جدة</p><h1 className="text-2xl md:text-3xl font-bold">لوحة إدخال مؤشرات الجودة للمراكز الصحية HQI 2026</h1><p className="mt-1 text-sm opacity-90">نسخة سريعة خاصة بمؤشرات المراكز الصحية فقط حسب ملف HQI</p></div>
        <div className="flex gap-2"><button onClick={()=>setTab("entry")} className={`rounded-xl px-4 py-2 ${tab==='entry'?'bg-white text-emerald-900':'bg-white/10'}`}>إدخال البيانات</button><button onClick={()=>setTab("dashboard")} className={`rounded-xl px-4 py-2 ${tab==='dashboard'?'bg-white text-emerald-900':'bg-white/10'}`}>المتابعة</button></div>
      </div>
    </header>
    <section className="mx-auto max-w-7xl p-4 md:p-6">
      {!supabase && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 flex gap-2"><AlertTriangle/> المشروع يعمل حالياً بدون Supabase؛ البيانات تحفظ على الجهاز فقط. اربطه بـ Supabase قبل إرسال الرابط للمراكز.</div>}
      <div className="grid gap-3 md:grid-cols-4 mb-5">
        <label className="rounded-2xl bg-white p-4 shadow-sm">المركز<select value={center} onChange={e=>setCenter(e.target.value)} className="mt-2 w-full rounded-xl border p-3">{centers.map(c=><option key={c}>{c}</option>)}</select></label>
        <label className="rounded-2xl bg-white p-4 shadow-sm">الشهر<select value={month} onChange={e=>setMonth(e.target.value)} className="mt-2 w-full rounded-xl border p-3">{months.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
        <label className="rounded-2xl bg-white p-4 shadow-sm">اسم المدخل<input value={updatedBy} onChange={e=>setUpdatedBy(e.target.value)} placeholder="اختياري" className="mt-2 w-full rounded-xl border p-3"/></label>
        <div className="rounded-2xl bg-white p-4 shadow-sm flex items-end gap-2"><button onClick={saveAll} disabled={saving} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-white hover:bg-emerald-800 flex items-center justify-center gap-2"><Save size={18}/>{saving?'جار الحفظ':'حفظ بيانات المركز'}</button></div>
      </div>
      {msg && <div className="mb-4 rounded-xl bg-white border p-3 text-sm">{msg}</div>}
      {tab === "entry" ? <div className="rounded-3xl bg-white shadow-sm overflow-hidden border">
        <div className="border-b p-4 flex items-center justify-between"><h2 className="font-bold text-lg flex gap-2"><Send/> نموذج إدخال مؤشرات المراكز الصحية - {center} - {month}</h2><button onClick={exportCsv} className="rounded-xl border px-3 py-2 flex gap-2"><Download size={18}/>تصدير CSV</button></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-3 text-right">المؤشر</th><th className="p-3">المستهدف</th><th className="p-3">البسط</th><th className="p-3">المقام</th><th className="p-3">النسبة</th><th className="p-3">الحالة</th><th className="p-3">ملاحظة</th></tr></thead><tbody>{indicators.map(ind=>{ const e=currentMap.get(ind.code); const v=pct(e?.numerator ?? null, e?.denominator ?? null); const st=status(v, ind.defaultTarget || 80); return <tr key={ind.code} className="border-t hover:bg-slate-50"><td className="p-3 min-w-[280px]"><b>{ind.code} - {ind.name}</b><p className="text-xs text-slate-500 line-clamp-1">{ind.description}</p>{ind.denominatorDescription && <p className="mt-1 text-[11px] text-slate-400 line-clamp-1">المقام: {ind.denominatorDescription}</p>}</td><td className="p-3 text-center">{ind.defaultTarget || 80}%</td><td className="p-3"><input type="number" value={e?.numerator ?? ""} onChange={ev=>updateLocal(ind.code,"numerator",ev.target.value)} className="w-28 rounded-lg border p-2 text-center"/></td><td className="p-3"><input type="number" value={e?.denominator ?? ""} onChange={ev=>updateLocal(ind.code,"denominator",ev.target.value)} className="w-28 rounded-lg border p-2 text-center"/></td><td className="p-3 text-center font-bold">{v===null?'—':v.toFixed(1)+'%'}</td><td className="p-3 text-center"><span className={`rounded-full px-3 py-1 text-xs ${st.cls}`}>{st.label}</span></td><td className="p-3"><input value={e?.notes || ""} onChange={ev=>updateLocal(ind.code,"notes",ev.target.value)} className="w-48 rounded-lg border p-2" placeholder="اختياري"/></td></tr>})}</tbody></table></div>
      </div> : <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4"><Card icon={<Activity/>} title="المدخلات المكتملة" value={summary.completed}/><Card icon={<CheckCircle2/>} title="المؤشرات المحققة" value={summary.achieved}/><Card icon={<AlertTriangle/>} title="المؤشرات المتعثرة" value={summary.weak}/><Card icon={<BarChart3/>} title="متوسط الإنجاز" value={summary.avg.toFixed(1)+"%"}/></div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border"><h2 className="font-bold mb-4">متوسط إنجاز المراكز - {month}</h2><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="center"/><YAxis/><Tooltip/><Bar dataKey="الإنجاز" /></BarChart></ResponsiveContainer></div></div>
      </div>}
    </section>
  </main>;
}
function Card({title,value,icon}:{title:string;value:any;icon:any}){return <div className="rounded-3xl bg-white p-5 shadow-sm border"><div className="text-emerald-700 mb-3">{icon}</div><p className="text-sm text-slate-500">{title}</p><p className="text-3xl font-bold mt-1">{value}</p></div>}
