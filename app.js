// app.js (ESM)
import {
  db, auth, provider,
  collection, getDocs, getDoc, doc, setDoc, addDoc, updateDoc, deleteDoc,
  signInWithPopup, signOut, onAuthStateChanged, getIdTokenResult,
  serverTimestamp
} from './firebase_config.js';

// ========== حالة التطبيق ==========
const state = {
  // محمّلة من Firestore
  terms: [],
  departments: [],
  members: [], // كل عضو بصيغة: {id, name, nationality, updatedAt, appointments[], activities[], publications[], courses[]}
  termIndex: new Map(), // termId -> order
  filters: { termId: "", deptId: "", branch: "", nat: "", rank: "", q: "" },
  user: null,
  claims: {}
};

// ========== أدوات مساعدة ==========
const el = (sel) => document.querySelector(sel);
const byId = (id) => document.getElementById(id);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("ar-SA") : "");
const alertErr = (e) => {
  console.error(e);
  alert("حدث خطأ: " + (e?.message || e));
};

function buildTermIndex() {
  state.termIndex.clear();
  // الترتيب مأخوذ من حقل order على المستند
  state.terms.sort((a,b)=> (a.order||0)-(b.order||0));
  state.terms.forEach((t, i) => state.termIndex.set(t.id, t.order ?? i));
}
const termLTE = (a, b) => state.termIndex.get(a) <= state.termIndex.get(b);
const termGTE = (a, b) => state.termIndex.get(a) >= state.termIndex.get(b);

// التعيين الساري وقت فصل معين
function appointmentAtTerm(member, termId) {
  if (!member.appointments || !member.appointments.length) return null;
  const list = member.appointments.filter((a) => {
    const startsOk = termLTE(a.termStart, termId);
    const endsOk = !a.termEnd || termGTE(a.termEnd, termId);
    return startsOk && endsOk;
  });
  if (!list.length) return null;
  list.sort((x, y) => state.termIndex.get(y.termStart) - state.termIndex.get(x.termStart));
  return list[0];
}
function memberMatchesFilters(m, termId, filters) {
  const ap = appointmentAtTerm(m, termId);
  if (filters.rank && (!ap || ap.rank !== filters.rank)) return false;
  if (filters.deptId && (!ap || ap.departmentId !== filters.deptId)) return false;
  if (filters.branch && (!ap || ap.branch !== filters.branch)) return false;
  if (filters.nat && m.nationality !== filters.nat) return false;
  if (filters.q && !m.name.includes(filters.q)) return false;
  return true;
}

// ========== تحميل البيانات من Firestore ==========
async function loadAll() {
  // terms
  const termsSnap = await getDocs(collection(db, 'terms'));
  state.terms = termsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  buildTermIndex();
  // departments
  const depsSnap = await getDocs(collection(db, 'departments'));
  state.departments = depsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  // members + subcollections
  const memSnap = await getDocs(collection(db, 'members'));
  const members = [];
  for (const docSnap of memSnap.docs) {
    const m = { id: docSnap.id, ...docSnap.data() };
    // subcollections
    m.appointments = await getSub(docSnap.ref, 'appointments');
    m.activities   = await getSub(docSnap.ref, 'activities');
    m.publications = await getSub(docSnap.ref, 'publications');
    m.courses      = await getSub(docSnap.ref, 'courses');
    members.push(m);
  }
  state.members = members;

  // اختر الافتراضي: آخر فصل بحسب order
  if (!state.filters.termId && state.terms.length) {
    const last = [...state.terms].sort((a,b)=>(a.order||0)-(b.order||0)).at(-1);
    state.filters.termId = last?.id || "";
  }
}

// جلب عناصر من Subcollection
async function getSub(parentRef, sub) {
  const snap = await getDocs(collection(parentRef, sub));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ========== ربط الواجهات ==========
function hydrateFilters() {
  // الفصول
  const termSel = byId("termSelect");
  termSel.innerHTML = state.terms.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
  termSel.value = state.filters.termId || "";
  termSel.onchange = ()=>{ state.filters.termId = termSel.value; renderAll(); };

  // الأقسام
  const deptSel = byId("deptSelect");
  deptSel.innerHTML = [`<option value="">الكل</option>`]
    .concat(state.departments.map(d=>`<option value="${d.id}">${d.name}</option>`)).join("");
  deptSel.onchange = ()=>{ state.filters.deptId = deptSel.value; renderAll(); };

  // الفروع
  const branches = Array.from(new Set(state.departments.map(d=>d.branch).filter(Boolean)));
  const branchSel = byId("branchSelect");
  branchSel.innerHTML = [`<option value="">الكل</option>`]
    .concat(branches.map(b=>`<option>${b}</option>`)).join("");
  branchSel.onchange = ()=>{ state.filters.branch = branchSel.value; renderAll(); };

  // الجنسية/الرتبة/بحث
  byId("natSelect").onchange = (e)=>{ state.filters.nat = e.target.value; renderAll(); };
  byId("rankSelect").onchange = (e)=>{ state.filters.rank = e.target.value; renderAll(); };
  byId("searchInput").oninput = (e)=>{ state.filters.q = e.target.value.trim(); renderAll(); };

  // أزرار عامة
  byId("printBtn").onclick = ()=> window.print();
  byId("exportBtn").onclick = exportJSON;
  byId("importFile").addEventListener("change", importJSON);

  // تبويبات
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      document.querySelectorAll(".tabpane").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      byId(btn.dataset.tab).classList.add("active");
    };
  });

  // تعبئة قوائم تبويب الإدارة
  const memOpts = state.members.sort((a,b)=>a.name.localeCompare(b.name,'ar')).map(m=>`<option value="${m.id}">${m.name}</option>`).join("");
  byId("memberSelectAppt").innerHTML = memOpts;
  byId("memberSelectAct").innerHTML = memOpts;
  byId("memberSelectPub").innerHTML = memOpts;
  byId("memberSelectCourse").innerHTML = memOpts;

  const termOpts = state.terms.map(t=>`<option value="${t.id}">${t.name}</option>`).join("");
  byId("termStartSel").innerHTML = termOpts;
  byId("termEndSel").innerHTML = `<option value="">—</option>${termOpts}`;
  byId("termSelAct").innerHTML = `<option value="">—</option>${termOpts}`;
  byId("termSelCourse").innerHTML = termOpts;

  const deptOpts = state.departments.map(d=>`<option value="${d.id}">${d.name}</option>`).join("");
  byId("deptSelAppt").innerHTML = deptOpts;

  // نماذج الإدارة
  byId("formTerm").onsubmit = onAddTerm;
  byId("formDept").onsubmit = onAddDept;
  byId("formMember").onsubmit = onAddMember;
  byId("formAppt").onsubmit = onAddAppointment;
  byId("formAct").onsubmit = onAddActivity;
  byId("formPub").onsubmit = onAddPublication;
  byId("formCourse").onsubmit = onAddCourse;

  // Auth أزرار
  byId("loginBtn").onclick = doLogin;
  byId("logoutBtn").onclick = doLogout;
}

// ========== عرض ==========
function renderAll() {
  renderAuthUI();
  renderUpdates();
  renderSummary();
  renderMembers();
  renderActivities();
  renderPublications();
  renderCourses();
}

function renderAuthUI() {
  const { user, claims } = state;
  const adminTabBtn = document.querySelector('.tab.adminOnly');
  const canAdmin = !!claims.admin;
  if (user) {
    byId("userInfo").textContent = `${user.displayName || user.email}`;
    byId("loginBtn").style.display = "none";
    byId("logoutBtn").style.display = "inline-block";
    adminTabBtn.style.display = canAdmin ? "inline-block" : "none";
  } else {
    byId("userInfo").textContent = "غير مسجّل";
    byId("loginBtn").style.display = "inline-block";
    byId("logoutBtn").style.display = "none";
    adminTabBtn.style.display = "none";
    // إن كنت داخل تبويب الإدارة وأُغلِقت الصلاحية فارجع لملخص
    if (document.querySelector('.tabpane#admin').classList.contains('active')) {
      document.querySelector('.tab[data-tab="summary"]').click();
    }
  }
}

function renderUpdates() {
  const ul = byId("updatesList");
  const items = [...state.members]
    .sort((a,b)=> new Date(b.updatedAt||0) - new Date(a.updatedAt||0))
    .slice(0, 9)
    .map(m => `<li><strong>${m.name}</strong><br><small>آخر تحديث: ${fmtDate(m.updatedAt)}</small></li>`);
  ul.innerHTML = items.join("") || `<li>لا توجد تحديثات مسجلة.</li>`;
}

function renderSummary() {
  const termId = state.filters.termId;
  const filtered = state.members.filter(m => memberMatchesFilters(m, termId, state.filters));
  const total = filtered.length;
  const saudis = filtered.filter(m=>m.nationality==="سعودي").length;
  const foreigners = filtered.filter(m=>m.nationality==="غير سعودي").length;

  const ranks = ["أستاذ","أستاذ مشارك","أستاذ مساعد","محاضر"].map(rk => ({
    rank: rk,
    count: filtered.filter(m=>{
      const ap = appointmentAtTerm(m, termId);
      return ap && ap.rank === rk;
    }).length
  }));

  const cards = [
    card("إجمالي الأعضاء", total),
    card("سعوديون", saudis),
    card("غير سعوديين", foreigners),
    ...ranks.map(x=>card(`عدد ${x.rank}`, x.count)),
  ];
  byId("summaryCards").innerHTML = cards.join("");
  function card(title, num){ return `<div class="card"><h3>${title}</h3><div class="big">${num}</div></div>`; }
}

function renderMembers() {
  const termId = state.filters.termId;
  const tbody = byId("membersBody");
  const rows = state.members
    .filter(m => memberMatchesFilters(m, termId, state.filters))
    .sort((a,b)=> a.name.localeCompare(b.name, 'ar'))
    .map(m=>{
      const ap = appointmentAtTerm(m, termId);
      const deptName = ap ? (state.departments.find(d=>d.id===ap.departmentId)?.name || "") : "";
      const branch = ap?.branch || "";
      const rank = ap?.rank || "—";
      return `<tr>
        <td>${m.name}</td>
        <td>${deptName}</td>
        <td>${branch}</td>
        <td>${m.nationality||""}</td>
        <td>${rank}</td>
      </tr>`;
    });
  tbody.innerHTML = rows.join("") || `<tr><td colspan="5">لا توجد نتائج مطابقة للفلاتر.</td></tr>`;
}

function renderActivities() {
  const termId = state.filters.termId;
  const rows = [];
  state.members.forEach(m=>{
    if (!memberMatchesFilters(m, termId, state.filters)) return;
    (m.activities||[]).forEach(a=>{
      if (a.termId && a.termId !== termId) return;
      rows.push(`<tr>
        <td>${m.name}</td>
        <td>${a.title||""}</td>
        <td>${a.type||""}</td>
        <td>${fmtDate(a.date)}</td>
        <td>${a.termId||""}</td>
      </tr>`);
    });
  });
  byId("activitiesBody").innerHTML = rows.join("") || `<tr><td colspan="5">لا توجد أنشطة للفصل المختار.</td></tr>`;
}

function renderPublications() {
  const termId = state.filters.termId;
  const rows = [];
  state.members.forEach(m=>{
    if (!memberMatchesFilters(m, termId, state.filters)) return;
    (m.publications||[]).forEach(p=>{
      rows.push(`<tr>
        <td>${m.name}</td>
        <td>${p.title||""}</td>
        <td>${p.type||""}</td>
        <td>${p.year||""}</td>
      </tr>`);
    });
  });
  byId("pubsBody").innerHTML = rows.join("") || `<tr><td colspan="4">لا توجد منشورات ضمن الفلاتر الحالية.</td></tr>`;
}

function renderCourses() {
  const termId = state.filters.termId;
  const rows = [];
  state.members.forEach(m=>{
    if (!memberMatchesFilters(m, termId, state.filters)) return;
    (m.courses||[]).forEach(c=>{
      if (c.termId && c.termId !== termId) return;
      rows.push(`<tr>
        <td>${m.name}</td>
        <td>${c.name||""}</td>
        <td>${c.code||""}</td>
        <td>${c.termId||""}</td>
      </tr>`);
    });
  });
  byId("coursesBody").innerHTML = rows.join("") || `<tr><td colspan="4">لا توجد مقررات في الفصل المختار.</td></tr>`;
}

// ========== Auth ==========
async function doLogin(){
  try {
    await signInWithPopup(auth, provider);
    // تحديث المطالبات مباشرةً
    const { claims } = await getClaims();
    if (!claims.admin) alert("تم تسجيل الدخول. لا تملك صلاحية admin (لن تتمكّن من التحرير).");
  } catch (e) { alertErr(e); }
}
async function doLogout(){ try { await signOut(auth); } catch(e){ alertErr(e); } }

async function getClaims(){
  const user = auth.currentUser;
  if (!user) return { user:null, claims:{} };
  const t = await getIdTokenResult(user, true);
  state.claims = t.claims || {};
  return { user, claims: state.claims };
}

// مستمع لحالة الدخول
onAuthStateChanged(auth, async (user)=>{
  state.user = user || null;
  await getClaims();
  renderAll();
});

// ========== نماذج الإدارة (كتابة Firestore) ==========
function mustBeAdmin(){
  if (!state.user || !state.claims.admin) {
    alert("هذه العملية تتطلب حسابًا بصلاحية admin.");
    return false;
  }
  return true;
}

async function onAddTerm(e){
  e.preventDefault();
  if (!mustBeAdmin()) return;
  const f = e.target;
  const id = f.id.value.trim();
  const payload = {
    name: f.name.value.trim(),
    start: f.start.value,
    end: f.end.value,
    order: Number(f.order.value)
  };
  try {
    await setDoc(doc(db, 'terms', id), payload);
    await reloadAndRefresh();
    f.reset();
    alert("تم حفظ الفصل.");
  } catch (e){ alertErr(e); }
}
async function onAddDept(e){
  e.preventDefault();
  if (!mustBeAdmin()) return;
  const f = e.target;
  const id = f.id.value.trim();
  const payload = { name: f.name.value.trim(), branch: f.branch.value.trim() };
  try {
    await setDoc(doc(db, 'departments', id), payload);
    await reloadAndRefresh();
    f.reset();
    alert("تم حفظ القسم.");
  } catch (e){ alertErr(e); }
}
async function onAddMember(e){
  e.preventDefault();
  if (!mustBeAdmin()) return;
  const f = e.target;
  const payload = {
    name: f.name.value.trim(),
    nationality: f.nationality.value,
    updatedAt: new Date().toISOString()
  };
  try {
    const ref = await addDoc(collection(db, 'members'), payload);
    await reloadAndRefresh();
    // إعادة تعبئة قوائم الأعضاء في تبويب الإدارة
    hydrateFilters();
    f.reset();
    alert("تم إضافة العضو. (ID: " + ref.id + ")");
  } catch (e){ alertErr(e); }
}

async function onAddAppointment(e){
  e.preventDefault();
  if (!mustBeAdmin()) return;
  const f = e.target;
  const memberId = f.memberId.value;
  const payload = {
    termStart: f.termStart.value,
    termEnd: f.termEnd.value || null,
    rank: f.rank.value,
    departmentId: f.departmentId.value,
    branch: f.branch.value.trim()
  };
  try {
    const mref = doc(db, 'members', memberId);
    await addDoc(collection(mref, 'appointments'), payload);
    await updateDoc(mref, { updatedAt: new Date().toISOString() });
    await reloadAndRefresh();
    alert("تم حفظ التعيين.");
  } catch (e){ alertErr(e); }
}

async function onAddActivity(e){
  e.preventDefault();
  if (!mustBeAdmin()) return;
  const f = e.target;
  const memberId = f.memberId.value;
  const payload = {
    title: f.title.value.trim(),
    type: f.type.value.trim(),
    date: f.date.value || null,
    termId: f.termId.value || null
  };
  try {
    const mref = doc(db, 'members', memberId);
    await addDoc(collection(mref, 'activities'), payload);
    await updateDoc(mref, { updatedAt: new Date().toISOString() });
    await reloadAndRefresh();
    alert("تم حفظ النشاط.");
  } catch (e){ alertErr(e); }
}

async function onAddPublication(e){
  e.preventDefault();
  if (!mustBeAdmin()) return;
  const f = e.target;
  const memberId = f.memberId.value;
  const payload = {
    title: f.title.value.trim(),
    type: f.type.value.trim(),
    year: Number(f.year.value)||null
  };
  try {
    const mref = doc(db, 'members', memberId);
    await addDoc(collection(mref, 'publications'), payload);
    await updateDoc(mref, { updatedAt: new Date().toISOString() });
    await reloadAndRefresh();
    alert("تم حفظ المنشور.");
  } catch (e){ alertErr(e); }
}

async function onAddCourse(e){
  e.preventDefault();
  if (!mustBeAdmin()) return;
  const f = e.target;
  const memberId = f.memberId.value;
  const payload = {
    code: f.code.value.trim(),
    name: f.name.value.trim(),
    termId: f.termId.value
  };
  try {
    const mref = doc(db, 'members', memberId);
    await addDoc(collection(mref, 'courses'), payload);
    await updateDoc(mref, { updatedAt: new Date().toISOString() });
    await reloadAndRefresh();
    alert("تم حفظ المقرر.");
  } catch (e){ alertErr(e); }
}

// ========== استيراد/تصدير JSON (من/إلى Firestore) ==========
async function exportJSON(){
  const dump = {
    exportedAt: new Date().toISOString(),
    terms: state.terms,
    departments: state.departments,
    members: state.members
  };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" }));
  a.download = `faculty-export-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
  a.click(); URL.revokeObjectURL(a.href);
}
async function importJSON(e){
  const file = e.target.files[0];
  if (!file) return;
  if (!mustBeAdmin()) { e.target.value=""; return; }
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    // كتابة جماعية مبسّطة
    // 1) terms
    for (const t of data.terms||[]) await setDoc(doc(db,'terms', t.id), { name:t.name, start:t.start, end:t.end, order:t.order||0 });
    // 2) departments
    for (const d of data.departments||[]) await setDoc(doc(db,'departments', d.id), { name:d.name, branch:d.branch||"" });
    // 3) members + subcollections
    for (const m of data.members||[]) {
      const mref = m.id ? doc(db,'members', m.id) : doc(collection(db,'members'));
      await setDoc(mref, { name:m.name, nationality:m.nationality, updatedAt: m.updatedAt || new Date().toISOString() });
      // sub
      for (const a of (m.appointments||[])) await addDoc(collection(mref,'appointments'), a);
      for (const a of (m.activities||[]))   await addDoc(collection(mref,'activities'), a);
      for (const p of (m.publications||[])) await addDoc(collection(mref,'publications'), p);
      for (const c of (m.courses||[]))      await addDoc(collection(mref,'courses'), c);
    }
    await reloadAndRefresh();
    alert("تم الاستيراد بنجاح.");
  } catch (err) {
    alertErr(err);
  } finally {
    e.target.value="";
  }
}

// ========== دورة الحياة ==========
async function reloadAndRefresh(){
  await loadAll();
  hydrateFilters();
  renderAll();
}

(async function boot(){
  try {
    await loadAll();
    hydrateFilters();
    renderAll();
  } catch (e){
    alertErr(e);
  }
})();
