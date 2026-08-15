/*
   * BINTANG FROZEN - AUTH / PERMISSION / AUDIT / APPROVAL
  
   * Tidak mengganti UI Tally Sheet yang sudah ada.
   */
  (async function(){
    "use strict";

    const SUPABASE_URL = "https://jqcbwanqixdxfeqphckr.supabase.co";
    const SUPABASE_KEY = "sb_publishable_tQVjtPgSCCY_hj2hd4WjzQ_y0ag0cG7";
    const APP_URL = window.location.origin + window.location.pathname;

    try{
      const startupMsg=document.getElementById("bf-startup-message");
      if(startupMsg) startupMsg.textContent="Menyiapkan database...";
      await window.BFEnsureSupabase();
      if(startupMsg) startupMsg.textContent="Memeriksa sesi login...";
    }catch(err){
      console.error("[Bintang Frozen] Startup Supabase gagal:",err);
      const msg=document.getElementById("bf-startup-message");
      if(msg){
        msg.innerHTML='Database/login gagal dimuat.<br><button id="bf-startup-retry" style="margin-top:14px;border:0;border-radius:10px;padding:10px 14px;background:#ffcc00;color:#0d1b3e;font-weight:900">Coba Lagi</button>';
        msg.style.color="#fecaca";
        document.getElementById("bf-startup-spinner")?.remove();
        document.getElementById("bf-startup-retry")?.addEventListener("click",()=>location.reload());
      }
      return;
    }

    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.BFSupabase=sb;

    let currentUser = null;
    let profile = null;
    let permissions = {};
    let logoutInProgress = false;
    let auditQueue = Promise.resolve();

    // Refresh-safe auth state. Hanya satu bootstrap boleh berjalan pada satu waktu.
    let authBootPromise = null;
    let authGeneration = 0;
    let authReadyUserId = null;

    const DEFAULTS = {
      owner: window.BFPermissions.defaults("owner"),
      admin: window.BFPermissions.defaults("admin"),
      operator: window.BFPermissions.defaults("operator")
    };

    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));

    function has(p){ return profile?.role==="owner" || permissions[p] === true; }

    function withTimeout(promise,ms,label){
      return Promise.race([
        promise,
        new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+" timeout")),ms))
      ]);
    }

    async function loadProfile(user){
      const {data,error}=await sb.from("bf_profiles").select("*").eq("id",user.id).maybeSingle();
      if(error){ console.error(error); return null; }
      return data;
    }

    async function loadPermissions(role){
      if(role==="owner") return {...DEFAULTS.owner};
      const {data,error}=await sb.from("bf_role_permissions")
        .select("permission,allowed").eq("role",role);
      const out={...(DEFAULTS[role]||{})};
      if(!error && Array.isArray(data)) data.forEach(x=>out[x.permission]=!!x.allowed);
      if(role!=="owner") out.view_commission=false;
      return out;
    }

    function audit(action, entity_type="", entity_id="", before=null, after=null, metadata={}){
      if(!currentUser) return Promise.resolve();
      const payload={
        actor_id:currentUser.id, actor_email:currentUser.email||"",
        actor_role:profile?.role||"", action, entity_type, entity_id:String(entity_id||""),
        before_data:before, after_data:after, metadata
      };
      // Serialize inserts to avoid simultaneous writes from rapid tally edits.
      auditQueue=auditQueue.then(()=>sb.from("bf_audit_logs").insert(payload))
        .then(({error})=>{if(error) console.warn("Audit:",error.message)})
        .catch(e=>console.warn("Audit:",e));
      return auditQueue;
    }

    window.BFLogActivity = audit;
    window.BFCan = has;
    window.BFCurrentUser = () => ({user:currentUser, profile, permissions});

    function loginScreen(message=""){
      document.getElementById("bf-startup-screen")?.remove();
      if(document.getElementById("bf-auth-screen")) return;
      const box=document.createElement("div");
      box.id="bf-auth-screen";
      box.innerHTML=`
        <div style="position:fixed;inset:0;z-index:2147483647;background:#0d1b3e;
          display:flex;align-items:center;justify-content:center;padding:20px">
          <div style="width:min(420px,100%);background:#fff;border-radius:24px;padding:30px;
            text-align:center;box-shadow:0 25px 70px rgba(0,0,0,.35)">
            <div style="width:78px;height:78px;margin:0 auto 15px;border-radius:18px;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 8px 22px rgba(13,27,62,.14)">
              <img src="bintang-frozen-logo.png" alt="Bintang Frozen" style="width:100%;height:100%;object-fit:contain">
            </div>
            <h2 style="margin:0;color:#0d1b3e;font-size:22px">BINTANG FROZEN</h2>
            <div style="color:#667085;margin:6px 0 22px">TALLY SHEET PRO</div>
            ${message?`<div style="background:#fef2f2;color:#b91c1c;border-radius:10px;padding:10px;margin-bottom:14px;font-size:13px">${esc(message)}</div>`:""}
            <button id="bf-google-login" class="bf-auth-btn" style="width:100%;background:#0d1b3e;color:#fff;font-size:15px">
              🔐 Masuk dengan Google
            </button>
            <div style="margin-top:14px;font-size:11px;color:#98a2b3">
              Hanya akun yang diaktifkan Owner yang dapat menggunakan aplikasi.
            </div>
          </div>
        </div>`;
      document.body.appendChild(box);
      box.querySelector("#bf-google-login").onclick=async()=>{
        const b=box.querySelector("#bf-google-login");
        b.disabled=true;b.textContent="Menghubungkan Google...";
        const {error}=await sb.auth.signInWithOAuth({
          provider:"google",
          options:{redirectTo:APP_URL}
        });
        if(error){
          b.disabled=false;b.textContent="🔐 Masuk dengan Google";
          box.remove();
          loginScreen("Login Google gagal: "+error.message);
        }
      };
    }

    function bridgeLegacySession(){
      if(!currentUser || !profile) return;
      const owner=profile.role==="owner";
      const base={
        dashboard:true,
        masuk:has("view_in"),keluar:has("view_out"),
        note_pengeluaran:has("view_note")||has("view_finance"),
        note_setoran:has("view_note")||has("view_finance"),
        note_sembako:has("view_note")||has("view_finance"),
        komisi:has("view_commission"),
        histori:has("view_history")||has("request_history"),
        staff:has("view_employees"),pengaturan:has("view_settings"),
        hapusData:has("delete_data"),editKomisi:has("edit_finance"),lihatKeuangan:has("view_finance")
      };
      const permissionsLegacy=base;
      const legacy={
        type:owner?"owner":"staff", id:currentUser.id, nama:profile.display_name||currentUser.email||"User",
        role:owner?"Owner":(profile.role==="admin"?"Admin":"Operator"),
        tokoNama:"Bintang Frozen", loginAt:new Date().toISOString(), permissions:permissionsLegacy
      };
      localStorage.setItem("bf_current_session_v26",JSON.stringify(legacy));
    }

    function closeLogin(){
      document.getElementById("bf-auth-screen")?.remove();
      document.documentElement.removeAttribute("data-bf-auth-pending");
      const msg=document.getElementById("bf-startup-message");
      if(msg) msg.textContent="Menyinkronkan data terbaru...";
    }

    function showBlocking(message){
      document.documentElement.setAttribute("data-bf-auth-pending","1");
      loginScreen(message);
    }

    async function forceLogout(ev){
      if(logoutInProgress) return;
      logoutInProgress=true;
      ev?.preventDefault();
      ev?.stopPropagation();
      ev?.stopImmediatePropagation?.();

      try{
        await audit("logout","session",currentUser?.id||"");
      }catch(_){}

      // Tampilkan login segera setelah sesi dibuang; jangan menunggu reload.
      document.documentElement.setAttribute("data-bf-auth-pending","1");
      document.getElementById("bf-owner-panel")?.remove();

      const {error}=await sb.auth.signOut({scope:"local"});
      if(error){
        logoutInProgress=false;
        document.documentElement.removeAttribute("data-bf-auth-pending");
        alert("Logout gagal: "+error.message);
        return;
      }

      currentUser=null; profile=null; permissions={};
      localStorage.removeItem("bf_current_session_v26");
      try{history.replaceState({},document.title,APP_URL)}catch(_){}
      logoutInProgress=false;
      showBlocking();
      window.dispatchEvent(new CustomEvent("bf:auth-signed-out"));
    }

    // Tangkap tombol Logout/Keluar dari seluruh UI aplikasi.
    document.addEventListener("click",function(e){
      const el=e.target?.closest?.("button,a,[role='button']");
      if(!el) return;
      const text=(el.textContent||"").replace(/\s+/g," ").trim().toLowerCase();
      const aria=(el.getAttribute?.("aria-label")||"").toLowerCase();
      if(text==="logout" || text==="keluar" || text.includes("logout") || aria.includes("logout")){
        forceLogout(e);
      }
    },true);

    function modal(title,body,w=900){
      document.getElementById("bf-auth-modal")?.remove();
      const m=document.createElement("div");
      m.id="bf-auth-modal";
      m.innerHTML=`<div style="position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:15px">
        <div style="width:min(${w}px,96vw);max-height:88vh;overflow:auto;background:#fff;border-radius:18px">
          <div style="padding:14px 17px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
            <b style="color:#0d1b3e">${esc(title)}</b>
            <button id="bf-auth-close" class="bf-auth-btn" style="background:#eef2f7">✕</button>
          </div>
          <div style="padding:16px">${body}</div>
        </div></div>`;
      document.body.appendChild(m);
      m.querySelector("#bf-auth-close").onclick=()=>m.remove();
      return m;
    }

    async function openAudit(){
      if(!has("view_audit")) return;
      const {data,error}=await sb.from("bf_audit_logs").select("*").order("created_at",{ascending:false}).limit(300);
      if(error){alert(error.message);return}
      const rows=(data||[]).map(x=>`<tr>
        <td>${esc(new Date(x.created_at).toLocaleString("id-ID"))}</td>
        <td>${esc(x.actor_email)}</td><td>${esc(x.actor_role)}</td><td>${esc(x.action)}</td>
        <td>${esc(x.entity_type||"")}</td>
        <td><details><summary>Detail</summary><pre style="font-size:10px;white-space:pre-wrap">${esc(JSON.stringify({before:x.before_data,after:x.after_data,metadata:x.metadata},null,2))}</pre></details></td>
      </tr>`).join("");
      modal("Log Aktivitas Admin & Operator",`<div style="overflow:auto"><table style="width:100%;font-size:11px;border-collapse:collapse">
        <thead><tr><th>Waktu</th><th>Pengguna</th><th>Role</th><th>Aktivitas</th><th>Data</th><th></th></tr></thead>
        <tbody>${rows||"<tr><td colspan=6>Belum ada aktivitas.</td></tr>"}</tbody></table></div>`);
    }

    async function openRequests(){
      if(!has("approve_history")) return;
      const {data,error}=await sb.from("bf_change_requests").select("*").order("created_at",{ascending:false}).limit(200);
      if(error){alert(error.message);return}
      const rows=(data||[]).map(x=>`<div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin-bottom:10px">
        <b>${esc(x.request_code)}</b> • <b>${esc(x.status)}</b>
        <div style="font-size:12px;color:#667085;margin:5px 0">${esc(x.requester_email)} • ${esc(x.requester_role)} • ${esc(new Date(x.created_at).toLocaleString("id-ID"))}</div>
        <div style="font-size:12px"><b>${esc(x.entity_type)} #${esc(x.entity_id)}</b><br>Alasan: ${esc(x.reason)}</div>
        <pre style="white-space:pre-wrap;background:#f8fafc;padding:8px;border-radius:8px;font-size:10px">${esc(JSON.stringify({before:x.before_data,after:x.after_data},null,2))}</pre>
        ${x.status==="pending"?`<button data-approve="${x.id}" class="bf-auth-btn" style="background:#059669;color:#fff;margin-right:6px">Setujui</button>
        <button data-reject="${x.id}" class="bf-auth-btn" style="background:#dc2626;color:#fff">Tolak</button>`:""}
      </div>`).join("");
      const m=modal("Permintaan Izin Perubahan Histori",rows||"<div>Belum ada permintaan.</div>",760);
      m.querySelectorAll("[data-approve]").forEach(b=>b.onclick=()=>reviewRequest(b.dataset.approve,"approved"));
      m.querySelectorAll("[data-reject]").forEach(b=>b.onclick=()=>reviewRequest(b.dataset.reject,"rejected"));
    }

    async function reviewRequest(id,status){
      const note=prompt(status==="approved"?"Catatan persetujuan (opsional):":"Alasan penolakan:");
      if(status==="rejected" && note===null) return;
      const {data,error}=await sb.from("bf_change_requests").update({
        status,reviewed_by:currentUser.id,reviewed_by_email:currentUser.email,
        reviewed_at:new Date().toISOString(),reviewer_note:note||""
      }).eq("id",id).select().single();
      if(error){alert(error.message);return}
      await audit(status==="approved"?"approve_history_change":"reject_history_change","change_request",id,null,data,{});
      openRequests();
    }

    async function openUsers(){
      if(!has("manage_users")) return;
      const {data,error}=await sb.from("bf_profiles").select("id,email,display_name,role,active,created_at").order("created_at");
      if(error){alert(error.message);return}
      const rows=(data||[]).map(x=>`<tr>
        <td>${esc(x.email)}</td><td>${esc(x.display_name||"")}</td>
        <td><select data-role="${x.id}" ${x.role==="owner"?"disabled":""}>
          <option value="admin" ${x.role==="admin"?"selected":""}>Admin</option>
          <option value="operator" ${x.role==="operator"?"selected":""}>Operator</option>
        </select></td>
        <td><input type="checkbox" data-active="${x.id}" ${x.active?"checked":""} ${x.role==="owner"?"disabled":""}></td>
        <td><button data-save="${x.id}" class="bf-auth-btn" style="background:#0d1b3e;color:#fff" ${x.role==="owner"?"disabled":""}>Simpan</button></td>
      </tr>`).join("");
      const m=modal("Kelola Pengguna",`<div style="overflow:auto"><table style="width:100%;font-size:11px">
        <thead><tr><th>Email</th><th>Nama</th><th>Role</th><th>Aktif</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <div style="font-size:11px;color:#667085;margin-top:10px">Pengguna baru muncul setelah login Google pertama kali. Owner kemudian menetapkan role dan status aktif.</div>`,800);
      m.querySelectorAll("[data-save]").forEach(b=>b.onclick=async()=>{
        const id=b.dataset.save, role=m.querySelector(`[data-role="${id}"]`).value, active=m.querySelector(`[data-active="${id}"]`).checked;
        const before=(data||[]).find(x=>x.id===id);
        const {data:after,error}=await sb.from("bf_profiles").update({role,active,updated_at:new Date().toISOString()}).eq("id",id).select().single();
        if(error){alert(error.message);return}
        await audit("update_user_access","user",id,before,after,{});
        openUsers();
      });
    }

    async function openPermissions(){
      if(!has("manage_permissions")) return;
      const roles=["admin","operator"];
      let html="";
      for(const role of roles){
        const p=await loadPermissions(role);
        html+=`<div style="border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin-bottom:12px">
          <b>${role.toUpperCase()}</b>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:7px;margin-top:9px">
          ${Object.entries(p).map(([k,v])=>`<label style="font-size:11px"><input type="checkbox" data-p="${role}:${k}" ${v?"checked":""} ${k==="view_commission"?"disabled":""}> ${esc(k)}${k==="view_commission"?" (Owner only)":""}</label>`).join("")}
          </div></div>`;
      }
      const m=modal("Pengaturan Hak Akses",html+`<button id="bf-save-perm" class="bf-auth-btn" style="background:#0d1b3e;color:#fff">Simpan Hak Akses</button>`,820);
      m.querySelector("#bf-save-perm").onclick=async()=>{
        for(const role of roles){
          for(const c of m.querySelectorAll(`[data-p^="${role}:"]`)){
            const permission=c.dataset.p.split(":")[1];
            const {error}=await sb.from("bf_role_permissions").upsert(
              {role,permission,allowed:permission==="view_commission"?false:c.checked,updated_at:new Date().toISOString()},
              {onConflict:"role,permission"});
            if(error){alert(error.message);return}
          }
        }
        await audit("update_permissions","role_permissions",null,null,null,{roles});
        alert("Hak akses disimpan.");
        m.remove();
      };
    }

    function isHistoryRow(row){
      if(!row) return false;
      if(row.locked===true) return true;
      const status=String(row.status||"").toLowerCase();
      if(["selesai","completed","closed","terkunci","locked"].includes(status)) return true;
      const date=row.tanggal||row.date||"";
      if(date){
        const d=new Date(date), today=new Date();
        if(!Number.isNaN(d.getTime())) {
          d.setHours(0,0,0,0); today.setHours(0,0,0,0);
          return d<today;
        }
      }
      return false;
    }

    async function requestHistoryChange(entityType,entityId,beforeData,afterData,reason){
      if(!currentUser || profile?.role==="owner") return true;

      // Jika Owner sudah menyetujui permintaan sebelumnya untuk item ini,
      // gunakan izin tersebut satu kali lalu tandai sebagai terpakai.
      const approved=await sb.from("bf_change_requests")
        .select("id,status,reviewer_note")
        .eq("requester_id",currentUser.id)
        .eq("entity_type",entityType)
        .eq("entity_id",String(entityId))
        .eq("status","approved")
        .is("consumed_at",null)
        .order("reviewed_at",{ascending:false})
        .limit(1)
        .maybeSingle();

      if(approved.data){
        const consume=await sb.rpc("bf_consume_change_request",{p_request_id:approved.data.id});
        if(consume.error || consume.data!==true){
          alert("Izin histori tidak dapat digunakan. Silakan minta persetujuan Owner kembali.");
          return false;
        }
        await audit("use_approved_history_permission",entityType,entityId,beforeData,afterData,{request_id:approved.data.id});
        return true;
      }

      const pending=await sb.from("bf_change_requests")
        .select("id").eq("requester_id",currentUser.id)
        .eq("entity_type",entityType).eq("entity_id",String(entityId))
        .eq("status","pending").limit(1).maybeSingle();

      if(pending.data){
        alert("Permintaan perubahan untuk data ini masih menunggu persetujuan Owner.");
        return false;
      }

      const code="REQ-"+Date.now().toString(36).toUpperCase();
      const {data,error}=await sb.from("bf_change_requests").insert({
        request_code:code,requester_id:currentUser.id,requester_email:currentUser.email||"",
        requester_role:profile.role,entity_type:entityType,entity_id:String(entityId),
        before_data:beforeData,after_data:afterData,reason,status:"pending"
      }).select().single();
      if(error){alert("Permintaan izin gagal: "+error.message);return false}
      await audit("request_history_change",entityType,entityId,beforeData,afterData,{request_id:data.id,reason});
      alert("Data histori terkunci. Permintaan perubahan telah dikirim ke Owner.");
      return false;
    }

    window.BFIsHistoryRow=isHistoryRow;
    window.BFRequestHistoryChange=requestHistoryChange;

    function boot(){
      // Single-flight: event SIGNED_IN yang datang saat getSession() berjalan
      // harus menunggu bootstrap yang sama, bukan membuat bootstrap kedua.
      if(authBootPromise) return authBootPromise;
      const myGeneration=authGeneration;
      authBootPromise=(async()=>{
        const startupMsg=document.getElementById("bf-startup-message");
        try{
          if(startupMsg) startupMsg.textContent="Memeriksa sesi login...";
          const sessionResult=await withTimeout(sb.auth.getSession(),8000,"Pemeriksaan sesi");
          if(myGeneration!==authGeneration) return;
          const session=sessionResult?.data?.session||null;
          const error=sessionResult?.error||null;

          if(error){
            document.getElementById("bf-startup-screen")?.remove();
            showBlocking("Gagal memeriksa sesi login: "+error.message);
            return;
          }

          if(!session){
            currentUser=null;profile=null;permissions={};authReadyUserId=null;
            localStorage.removeItem("bf_current_session_v26");
            document.getElementById("bf-owner-panel")?.remove();
            document.getElementById("bf-startup-screen")?.remove();
            showBlocking();
            return;
          }

          if(startupMsg) startupMsg.textContent="Memeriksa akun pengguna...";
          const p=await withTimeout(loadProfile(session.user),8000,"Pemeriksaan profil");
          if(myGeneration!==authGeneration) return;
          if(!p || p.active!==true){
            authGeneration++;
            await sb.auth.signOut({scope:"local"}).catch(()=>{});
            localStorage.removeItem("bf_current_session_v26");
            document.getElementById("bf-startup-screen")?.remove();
            showBlocking("Akun belum diaktifkan Owner. Hubungi Owner untuk mendapatkan akses.");
            return;
          }

          const loadedPermissions=await withTimeout(loadPermissions(p.role),8000,"Pemeriksaan hak akses");
          if(myGeneration!==authGeneration) return;
          currentUser=session.user;
          profile=p;
          permissions=loadedPermissions;

          bridgeLegacySession();
          closeLogin();
          audit("login","session",currentUser.id,null,null,{}).catch(()=>{});

          // Emit hanya sekali untuk user aktif yang sama. TOKEN_REFRESHED tidak
          // boleh membangun ulang seluruh aplikasi/cloud sync.
          if(authReadyUserId!==currentUser.id){
            authReadyUserId=currentUser.id;
            window.dispatchEvent(new CustomEvent("bf:auth-ready",{
              detail:{user:currentUser,profile,permissions}
            }));
          }
        }catch(err){
          if(myGeneration!==authGeneration) return;
          console.error("[Bintang Frozen] Boot auth gagal:",err);
          document.getElementById("bf-startup-screen")?.remove();
          showBlocking("Startup login gagal: "+(err?.message||String(err)));
        }
      })().finally(()=>{ authBootPromise=null; });
      return authBootPromise;
    }

    sb.auth.onAuthStateChange((event,session)=>{
      if(event==="SIGNED_OUT" || !session){
        authGeneration++;
        authReadyUserId=null;
        window.dispatchEvent(new CustomEvent("bf:auth-signed-out"));
        currentUser=null;profile=null;permissions={};
        document.getElementById("bf-owner-panel")?.remove();
        if(!logoutInProgress) showBlocking();
        return;
      }

      // SIGNED_IN dapat muncul saat refresh ketika bootstrap awal masih berjalan.
      // Jalankan boot hanya bila user ini belum pernah dinyatakan siap.
      if(event==="SIGNED_IN" && authReadyUserId!==session.user?.id){
        const uid=session.user?.id;
        const run=()=>{ if(authReadyUserId!==uid) boot(); };
        if(authBootPromise) authBootPromise.finally(run);
        else run();
      }

      // TOKEN_REFRESHED sengaja tidak memanggil boot(). Session Supabase sudah
      // diperbarui internal; reload profil/UI di sini menimbulkan race condition.
    });

    // Guard tambahan untuk tombol fitur yang bisa dipetakan dengan ID/teks.
    document.addEventListener("click",function(e){
      if(!currentUser || !profile) return;
      const b=e.target?.closest?.("button");
      if(!b) return;
      const id=b.id||"", text=(b.textContent||"").trim().toLowerCase();
      const map=[
        [["bfTallyAddRow"],"add_row"],[["bfTallyAddCol"],"edit_data"],
        [["bfTallyCsv"],"export_csv"],[["bfTallyCombined"],"export_csv"],
        [["bfTallyCombinedPdf"],"export_pdf"],[["bfTallyJson"],"backup"],
        [["bfTallyPrint"],"print"]
      ];
      for(const [ids,perm] of map){
        if(ids.includes(id) && !has(perm)){
          e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();
          alert("Akses ditolak. Izin ini belum diberikan Owner.");
          audit("permission_denied","feature",id,null,null,{permission:perm});
          return;
        }
      }
      if(text && !["logout","keluar"].includes(text)){
        // Log aktivitas UI yang jelas tanpa mencatat isi password atau data sensitif.
        if(/tambah|simpan|hapus|edit|cetak|export|backup|restore|timbang/i.test(text)){
          audit("ui_action","button",id||text,null,null,{label:text.slice(0,100)});
        }
      }
    },true);

    // Public bridge for the integrated MENU. These functions remain inside the auth scope,
    // so expose only the four safe Owner actions needed by the menu.
    window.bfOpenUsers = openUsers;
    window.bfOpenPermissions = openPermissions;
    window.bfOpenAudit = openAudit;
    window.bfOpenRequests = openRequests;

    boot();
  })();
