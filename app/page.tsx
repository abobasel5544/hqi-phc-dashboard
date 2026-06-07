"use client";

import seedIndicators from "@/lib/hqi_kpi_seed.json";
import { createClient } from "@supabase/supabase-js";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Download, FileSpreadsheet, Lock, LogOut, Save, Send, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as XLSX from "xlsx";

type Indicator = { code: string; name: string; description?: string; denominatorDescription?: string; facilityType?: string; defaultTarget?: number };
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
type CenterUser = { username: string; password?: string; center: string; role?: "center" | "admin" | "quality" };

const centers = ["الواحة", "الرغامة", "قويزة", "المطار القديم", "الروابي", "السليمانية", "شرق الخط"];
const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const indicators = seedIndicators as Indicator[];
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function pct(n: number | null, d: number | null) {
  if (n === null || n === undefined || d === null || d === undefined || Number(d) === 0) return null;
  return (Number(n) / Number(d)) * 100;
}
function status(v: number | null, target = 80) {
  if (v === null) return { label: "لم يكتمل", cls: "bg-slate-100 text-slate-600" };
  if (v >= target) return { label: "محقق", cls: "bg-emerald-100 text-emerald-700" };
  if (v >= target * 0.85) return { label: "قريب", cls: "bg-amber-100 text-amber-700" };
  return { label: "متعثر", cls: "bg-rose-100 text-rose-700" };
}
function safeNumber(v: number | null | undefined) {
  return v === null || v === undefined ? "" : Number(v);
}

export default function Page() {
  const [center, setCenter] = useState(centers[0]);
  const [month, setMonth] = useState("2026-06");
  const [updatedBy, setUpdatedBy] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"entry" | "dashboard" | "report">("entry");
  const [user, setUser] = useState<CenterUser | null>(null);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const isAdmin = user?.role === "admin" || user?.role === "quality";

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
    const savedUser = localStorage.getItem("hqi_user");
    if (savedUser) {
      const parsed = JSON.parse(savedUser) as CenterUser;
      setUser(parsed);
      if (parsed.role === "center") setCenter(parsed.center);
      setUpdatedBy(parsed.username);
    }
    load();
  }, []);

  async function login() {
    setMsg("");
    if (!loginUsername || !loginPassword) {
      setMsg("فضلاً أدخل اسم المستخدم وكلمة المرور.");
      return;
    }
    if (!supabase) {
      setMsg("لا يمكن تسجيل الدخول بدون Supabase.");
      return;
    }
    const { data, error } = await supabase
      .from("center_users")
      .select("username, center, role")
      .eq("username", loginUsername.trim())
      .eq("password", loginPassword.trim())
      .maybeSingle();
    if (error) {
      setMsg("خطأ في تسجيل الدخول: " + error.message);
      return;
    }
    if (!data) {
      setMsg("اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }
    const logged = data as CenterUser;
    setUser(logged);
    localStorage.setItem("hqi_user", JSON.stringify(logged));
    setUpdatedBy(logged.username);
    if (logged.role === "center") setCenter(logged.center);
    setMsg("تم تسجيل الدخول بنجاح ✅");
  }

  function logout() {
    localStorage.removeItem("hqi_user");
    setUser(null);
    setLoginUsername("");
    setLoginPassword("");
    setMsg("");
  }

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
      if (i >= 0) copy[i] = { ...copy[i], [field]: val, updated_by: updatedBy || user?.username || "غير محدد" } as Entry;
      else copy.push({ center, month, indicator_code: code, numerator: field === "numerator" ? Number(value) : null, denominator: field === "denominator" ? Number(value) : null, notes: field === "notes" ? value : "", updated_by: updatedBy || user?.username || "غير محدد" });
      return copy;
    });
  }

  async function saveAll() {
    setSaving(true); setMsg("");
    const rows = indicators.map(ind => {
      const e = currentMap.get(ind.code);
      return { center, month, indicator_code: ind.code, numerator: e?.numerator ?? null, denominator: e?.denominator ?? null, notes: e?.notes || "", updated_by: updatedBy || user?.username || "غير محدد" };
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

  const visibleEntries = isAdmin ? entries : entries.filter(e => e.center === user?.center);
  const filtered = visibleEntries.filter(e => e.month === month);
  const summary = useMemo(() => {
    let completed = 0, achieved = 0, weak = 0, sum = 0, count = 0;
    filtered.forEach(e => { const ind = indicators.find(i => i.code === e.indicator_code); const v = pct(e.numerator, e.denominator); if (v !== null) { completed++; sum += v; count++; if (v >= (ind?.defaultTarget || 80)) achieved++; if (v < (ind?.defaultTarget || 80) * .85) weak++; } });
    return { completed, achieved, weak, avg: count ? sum / count : 0 };
  }, [filtered]);
  const chartData = centers.map(c => { const rows = entries.filter(e => e.center === c && e.month === month); const vals = rows.map(e => pct(e.numerator, e.denominator)).filter((x): x is number => x !== null); return { center: c, الإنجاز: vals.length ? Number((vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1)) : 0 }; });

  const reportRows = useMemo(() => {
    return indicators.map(ind => {
      const row: Record<string, string | number> = {
        "كود المؤشر": ind.code,
        "اسم المؤشر": ind.name,
        "وصف المؤشر": ind.description || "",
        "وصف المقام": ind.denominatorDescription || "",
        "المستهدف": `${ind.defaultTarget || 80}%`,
      };
      let totalNumerator = 0;
      let totalDenominator = 0;
      centers.forEach(c => {
        const e = entries.find(x => x.center === c && x.month === month && x.indicator_code === ind.code);
        const v = pct(e?.numerator ?? null, e?.denominator ?? null);
        row[`${c} - البسط`] = safeNumber(e?.numerator);
        row[`${c} - المقام`] = safeNumber(e?.denominator);
        row[`${c} - النسبة`] = v === null ? "" : Number(v.toFixed(2));
        row[`${c} - الحالة`] = status(v, ind.defaultTarget || 80).label;
        row[`${c} - الملاحظات`] = e?.notes || "";
        row[`${c} - مدخل البيانات`] = e?.updated_by || "";
        if (e?.numerator) totalNumerator += Number(e.numerator);
        if (e?.denominator) totalDenominator += Number(e.denominator);
      });
      const totalPct = totalDenominator ? (totalNumerator / totalDenominator) * 100 : null;
      row["إجمالي البسط"] = totalNumerator || "";
      row["إجمالي المقام"] = totalDenominator || "";
      row["النسبة الإجمالية"] = totalPct === null ? "" : Number(totalPct.toFixed(2));
      row["الحالة الإجمالية"] = status(totalPct, ind.defaultTarget || 80).label;
      return row;
    });
  }, [entries, month]);

  function exportCsv() {
    const header = ["center","month","indicator_code","indicator_name","numerator","denominator","percent","notes","updated_by"];
    const lines = visibleEntries.map(e => { const ind = indicators.find(i => i.code === e.indicator_code); const v = pct(e.numerator, e.denominator); return [e.center,e.month,e.indicator_code,ind?.name || "",e.numerator ?? "",e.denominator ?? "",v?.toFixed(2) ?? "",e.notes || "",e.updated_by || ""].map(x => `"${String(x).replaceAll('"','""')}"`).join(","); });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `hqi-${month}.csv`; a.click();
  }

  function exportExcel() {
    const rawRows = entries.filter(e => e.month === month).map(e => {
      const ind = indicators.find(i => i.code === e.indicator_code);
      const v = pct(e.numerator, e.denominator);
      return {
        "المركز": e.center,
        "الشهر": e.month,
        "كود المؤشر": e.indicator_code,
        "اسم المؤشر": ind?.name || "",
        "البسط": safeNumber(e.numerator),
        "المقام": safeNumber(e.denominator),
        "النسبة": v === null ? "" : Number(v.toFixed(2)),
        "الحالة": status(v, ind?.defaultTarget || 80).label,
        "الملاحظات": e.notes || "",
        "مدخل البيانات": e.updated_by || "",
      };
    });
    const wb = XLSX.utils.book_new();
    const reportWs = XLSX.utils.json_to_sheet(reportRows);
    const rawWs = XLSX.utils.json_to_sheet(rawRows);
    XLSX.utils.book_append_sheet(wb, reportWs, "التقرير المجمع");
    XLSX.utils.book_append_sheet(wb, rawWs, "البيانات الخام");
    XLSX.writeFile(wb, `HQI-PHC-${month}.xlsx`);
  }

  if (!user) {
    return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
      <section className="w-full max-w-md rounded-3xl bg-white shadow-lg border overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-900 via-teal-800 to-slate-900 text-white p-6">
          <p className="text-sm opacity-80">تجمع جدة الصحي الأول - مستشفى شرق جدة</p>
          <h1 className="text-2xl font-bold mt-1">دخول مؤشرات الجودة HQI</h1>
          <p className="text-sm opacity-90 mt-1">كل مركز يدخل باسم المستخدم الخاص به.</p>
        </div>
        <div className="p-6 space-y-4">
          <label className="block text-sm font-semibold">اسم المستخدم<input value={loginUsername} onChange={e=>setLoginUsername(e.target.value)} className="mt-2 w-full rounded-xl border p-3 text-left" dir="ltr" placeholder="مثال: alwahah" /></label>
          <label className="block text-sm font-semibold">كلمة المرور<input type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} onKeyDown={e=>{ if(e.key === "Enter") login(); }} className="mt-2 w-full rounded-xl border p-3 text-left" dir="ltr" /></label>
          <button onClick={login} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-white hover:bg-emerald-800 flex items-center justify-center gap-2"><Lock size={18}/> دخول</button>
          {msg && <div className="rounded-xl border p-3 text-sm">{msg}</div>}
        </div>
      </section>
    </main>;
  }

  return <main className="min-h-screen bg-slate-50" dir="rtl">
    <header className="bg-gradient-to-l from-emerald-900 via-teal-800 to-slate-900 text-white p-6 shadow-lg">
      <div className="mx-auto max-w-7xl flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div><p className="text-sm opacity-80">تجمع جدة الصحي الأول - مستشفى شرق جدة</p><h1 className="text-2xl md:text-3xl font-bold">لوحة إدخال مؤشرات الجودة للمراكز الصحية HQI 2026</h1><p className="mt-1 text-sm opacity-90">المستخدم: {user.username} — {isAdmin ? "صلاحية عامة" : user.center}</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={()=>setTab("entry")} className={`rounded-xl px-4 py-2 ${tab==='entry'?'bg-white text-emerald-900':'bg-white/10'}`}>إدخال البيانات</button><button onClick={()=>setTab("dashboard")} className={`rounded-xl px-4 py-2 ${tab==='dashboard'?'bg-white text-emerald-900':'bg-white/10'}`}>المتابعة</button>{isAdmin && <button onClick={()=>setTab("report")} className={`rounded-xl px-4 py-2 ${tab==='report'?'bg-white text-emerald-900':'bg-white/10'}`}>التقرير المجمع</button>}<button onClick={logout} className="rounded-xl px-4 py-2 bg-white/10 flex items-center gap-2"><LogOut size={16}/> خروج</button></div>
      </div>
    </header>
    <section className="mx-auto max-w-7xl p-4 md:p-6">
      {!supabase && <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800 flex gap-2"><AlertTriangle/> المشروع يعمل حالياً بدون Supabase؛ البيانات تحفظ على الجهاز فقط. اربطه بـ Supabase قبل إرسال الرابط للمراكز.</div>}
      <div className="grid gap-3 md:grid-cols-4 mb-5">
        <label className="rounded-2xl bg-white p-4 shadow-sm">المركز<select value={center} disabled={!isAdmin} onChange={e=>setCenter(e.target.value)} className="mt-2 w-full rounded-xl border p-3 disabled:bg-slate-100">{(isAdmin ? centers : [user.center]).map(c=><option key={c}>{c}</option>)}</select></label>
        <label className="rounded-2xl bg-white p-4 shadow-sm">الشهر<select value={month} onChange={e=>setMonth(e.target.value)} className="mt-2 w-full rounded-xl border p-3">{months.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
        <label className="rounded-2xl bg-white p-4 shadow-sm">اسم المدخل<input value={updatedBy} onChange={e=>setUpdatedBy(e.target.value)} placeholder="اختياري" className="mt-2 w-full rounded-xl border p-3"/></label>
        <div className="rounded-2xl bg-white p-4 shadow-sm flex items-end gap-2"><button onClick={saveAll} disabled={saving || tab === "report"} className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-white hover:bg-emerald-800 disabled:bg-slate-300 flex items-center justify-center gap-2"><Save size={18}/>{saving?'جار الحفظ':'حفظ بيانات المركز'}</button></div>
      </div>
      {msg && <div className="mb-4 rounded-xl bg-white border p-3 text-sm">{msg}</div>}
      {tab === "entry" ? <div className="rounded-3xl bg-white shadow-sm overflow-hidden border">
        <div className="border-b p-4 flex items-center justify-between"><h2 className="font-bold text-lg flex gap-2"><Send/> نموذج إدخال مؤشرات المراكز الصحية - {center} - {month}</h2><button onClick={exportCsv} className="rounded-xl border px-3 py-2 flex gap-2"><Download size={18}/>تصدير CSV</button></div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-3 text-right">المؤشر</th><th className="p-3">المستهدف</th><th className="p-3">البسط</th><th className="p-3">المقام</th><th className="p-3">النسبة</th><th className="p-3">الحالة</th><th className="p-3">ملاحظة</th></tr></thead><tbody>{indicators.map(ind=>{ const e=currentMap.get(ind.code); const v=pct(e?.numerator ?? null, e?.denominator ?? null); const st=status(v, ind.defaultTarget || 80); return <tr key={ind.code} className="border-t hover:bg-slate-50"><td className="p-3 min-w-[280px]"><b>{ind.code} - {ind.name}</b><p className="text-xs text-slate-500 line-clamp-1">{ind.description}</p>{ind.denominatorDescription && <p className="mt-1 text-[11px] text-slate-400 line-clamp-1">المقام: {ind.denominatorDescription}</p>}</td><td className="p-3 text-center">{ind.defaultTarget || 80}%</td><td className="p-3"><input type="number" value={e?.numerator ?? ""} onChange={ev=>updateLocal(ind.code,"numerator",ev.target.value)} className="w-28 rounded-lg border p-2 text-center"/></td><td className="p-3"><input type="number" value={e?.denominator ?? ""} onChange={ev=>updateLocal(ind.code,"denominator",ev.target.value)} className="w-28 rounded-lg border p-2 text-center"/></td><td className="p-3 text-center font-bold">{v===null?'—':v.toFixed(1)+'%'}</td><td className="p-3 text-center"><span className={`rounded-full px-3 py-1 text-xs ${st.cls}`}>{st.label}</span></td><td className="p-3"><input value={e?.notes || ""} onChange={ev=>updateLocal(ind.code,"notes",ev.target.value)} className="w-48 rounded-lg border p-2" placeholder="اختياري"/></td></tr>})}</tbody></table></div>
      </div> : tab === "dashboard" ? <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4"><Card icon={<Activity/>} title="المدخلات المكتملة" value={summary.completed}/><Card icon={<CheckCircle2/>} title="المؤشرات المحققة" value={summary.achieved}/><Card icon={<AlertTriangle/>} title="المؤشرات المتعثرة" value={summary.weak}/><Card icon={<BarChart3/>} title="متوسط الإنجاز" value={summary.avg.toFixed(1)+"%"}/></div>
        <div className="rounded-3xl bg-white p-5 shadow-sm border"><h2 className="font-bold mb-4">متوسط إنجاز المراكز - {month}</h2><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="center"/><YAxis/><Tooltip/><Bar dataKey="الإنجاز" /></BarChart></ResponsiveContainer></div></div>
      </div> : <div className="rounded-3xl bg-white shadow-sm overflow-hidden border">
        <div className="border-b p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><h2 className="font-bold text-lg flex gap-2"><Users/> التقرير المجمع لكل المراكز - {month}</h2><button onClick={exportExcel} className="rounded-xl bg-emerald-700 text-white px-4 py-2 flex gap-2 items-center justify-center"><FileSpreadsheet size={18}/>تصدير Excel مجمع</button></div>
        <div className="p-4 text-sm text-slate-600">يعرض التقرير كل الأعمدة لكل مركز: البسط، المقام، النسبة، الحالة، الملاحظات، واسم مدخل البيانات، مع إجمالي البسط والمقام والنسبة الإجمالية لكل مؤشر.</div>
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-3 text-right min-w-[230px]">المؤشر</th><th className="p-3">المستهدف</th>{centers.map(c=><th key={c} className="p-3 min-w-[260px]">{c}<div className="text-[10px] font-normal text-slate-500">البسط | المقام | النسبة | الحالة | الملاحظات</div></th>)}<th className="p-3 min-w-[180px]">الإجمالي</th></tr></thead><tbody>{indicators.map(ind=>{ let totalN=0,totalD=0; return <tr key={ind.code} className="border-t hover:bg-slate-50"><td className="p-3 align-top"><b>{ind.code} - {ind.name}</b></td><td className="p-3 text-center align-top">{ind.defaultTarget || 80}%</td>{centers.map(c=>{ const e=entries.find(x=>x.center===c && x.month===month && x.indicator_code===ind.code); const v=pct(e?.numerator ?? null, e?.denominator ?? null); if(e?.numerator) totalN+=Number(e.numerator); if(e?.denominator) totalD+=Number(e.denominator); return <td key={c} className="p-3 align-top"><div className="grid grid-cols-4 gap-1 text-center"><span>{e?.numerator ?? "—"}</span><span>{e?.denominator ?? "—"}</span><span>{v===null?"—":v.toFixed(1)+"%"}</span><span>{status(v, ind.defaultTarget || 80).label}</span></div><div className="mt-1 text-slate-500">{e?.notes || ""}</div></td>})}<td className="p-3 text-center align-top font-bold">{totalN || "—"} / {totalD || "—"}<br/>{totalD ? ((totalN/totalD)*100).toFixed(1)+"%" : "—"}</td></tr>})}</tbody></table></div>
      </div>}
    </section>
  </main>;
}
function Card({title,value,icon}:{title:string;value:any;icon:any}){return <div className="rounded-3xl bg-white p-5 shadow-sm border"><div className="text-emerald-700 mb-3">{icon}</div><p className="text-sm text-slate-500">{title}</p><p className="text-3xl font-bold mt-1">{value}</p></div>}
