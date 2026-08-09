/* =========================================================
   BINTANG FROZEN V26
   APP.JS - LOGIN + DASHBOARD + DATA
   ========================================================= */

const SUPABASE_URL = "https://psynkzbwusjhsigdvkkf.supabase.co";
const SUPABASE_KEY = "sb_publishable_AFyEeOTyJxzhR0omzPaZ2A_oJSfrgGC";

const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = id => document.getElementById(id);

/* =========================================================
   LOGIN
   ========================================================= */

async function login() {
  const email = $("email")?.value.trim();
  const password = $("pass")?.value || "";
  const msg = $("msg");

  if (!email || !password) {
    if (msg) msg.textContent = "Email dan password wajib diisi.";
    return;
  }

  if (msg) msg.textContent = "Memproses...";

  try {
    const { data, error } =
      await sb.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      if (msg) msg.textContent = error.message;
      return;
    }

    if (msg) msg.textContent = "";

    if ($("login")) $("login").classList.add("hidden");
    if ($("app")) $("app").classList.remove("hidden");

    await page("dash");

  } catch (err) {
    console.error(err);
    if (msg) msg.textContent =
      "Terjadi kesalahan koneksi.";
  }
}

/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {
  await sb.auth.signOut();

  if ($("app")) $("app").classList.add("hidden");
  if ($("login")) $("login").classList.remove("hidden");

  if ($("email")) $("email").value = "";
  if ($("pass")) $("pass").value = "";
}

/* =========================================================
   CEK LOGIN SAAT HALAMAN DIBUKA
   ========================================================= */

async function checkLogin() {
  try {
    const { data } = await sb.auth.getSession();

    if (data?.session) {
      if ($("login")) $("login").classList.add("hidden");
      if ($("app")) $("app").classList.remove("hidden");

      await page("dash");
    } else {
      if ($("login")) $("login").classList.remove("hidden");
      if ($("app")) $("app").classList.add("hidden");
    }
  } catch (err) {
    console.error(err);
  }
}

/* =========================================================
   NAVIGASI
   ========================================================= */

async function page(name) {

  const sections = [
    "dash",
    "customers",
    "products",
    "suppliers",
    "stock",
    "inbound",
    "outbound",
    "finance",
    "commissions",
    "audit"
  ];

  sections.forEach(id => {
    const el = $(id);
    if (el) el.classList.add("hidden");
  });

  const target = $(name);

  if (target) {
    target.classList.remove("hidden");
  }

  if (name === "dash") {
    await loadDashboard();
  }

  if (name === "customers") {
    await loadTable(
      "customers",
      "customersData",
      "Customer"
    );
  }

  if (name === "products") {
    await loadTable(
      "products",
      "productsData",
      "Produk"
    );
  }

  if (name === "suppliers") {
    await loadTable(
      "suppliers",
      "suppliersData",
      "Supplier"
    );
  }

  if (name === "stock") {
    await loadTable(
      "stock",
      "stockData",
      "Stok"
    );
  }

  if (name === "inbound") {
    await loadTable(
      "inbound",
      "inboundData",
      "Barang Masuk"
    );
  }

  if (name === "outbound") {
    await loadTable(
      "outbound",
      "outboundData",
      "Barang Keluar"
    );
  }

  if (name === "finance") {
    await loadTable(
      "finance",
      "financeData",
      "Keuangan"
    );
  }

  if (name === "commissions") {
    await loadTable(
      "commissions",
      "commissionData",
      "Komisi Marketing"
    );
  }

  if (name === "audit") {
    await loadTable(
      "audit_logs",
      "auditData",
      "Audit Log"
    );
  }
}

/* =========================================================
   DASHBOARD
   ========================================================= */

async function loadDashboard() {

  const container = $("dashData");

  if (!container) return;

  container.innerHTML = `
    <div style="
      background:white;
      padding:20px;
      border-radius:16px;
      border:1px solid #ddd;
    ">
      <h3>Dashboard Bintang Frozen</h3>

      <p>Selamat datang di Bintang Frozen V26.</p>

      <div style="
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
        gap:12px;
        margin-top:20px;
      ">

        <button onclick="page('customers')">
          Customer
        </button>

        <button onclick="page('products')">
          Produk
        </button>

        <button onclick="page('suppliers')">
          Supplier
        </button>

        <button onclick="page('stock')">
          Stok
        </button>

        <button onclick="page('inbound')">
          Barang Masuk
        </button>

        <button onclick="page('outbound')">
          Barang Keluar
        </button>

        <button onclick="page('finance')">
          Keuangan
        </button>

      </div>
    </div>
  `;
}

/* =========================================================
   PEMUAT DATA
   ========================================================= */

async function loadTable(tableName, elementId, title) {

  const el = $(elementId);

  if (!el) return;

  el.innerHTML = `
    <div style="
      padding:20px;
      background:white;
      border-radius:16px;
      border:1px solid #ddd;
    ">
      <h3>${title}</h3>
      <p>Memuat data...</p>
    </div>
  `;

  try {

    const { data, error } = await sb
      .from(tableName)
      .select("*")
      .limit(100);

    if (error) {

      console.error(
        "Supabase error:",
        tableName,
        error
      );

      el.innerHTML = `
        <div style="
          padding:20px;
          background:white;
          border-radius:16px;
          border:1px solid #ddd;
        ">

          <h3>${title}</h3>

          <p>
            Database belum dapat dibaca.
          </p>

          <small>
            Tabel: ${tableName}<br>
            ${escapeHtml(error.message)}
          </small>

        </div>
      `;

      return;
    }

    if (!data || data.length === 0) {

      el.innerHTML = `
        <div style="
          padding:20px;
          background:white;
          border-radius:16px;
          border:1px solid #ddd;
        ">

          <h3>${title}</h3>

          <p>Belum ada data.</p>

          <button
            onclick="addLocalData('${tableName}','${elementId}','${title}')"
          >
            + Tambah Data
          </button>

        </div>
      `;

      return;
    }

    renderTable(el, data, title);

  } catch (err) {

    console.error(err);

    el.innerHTML = `
      <div style="
        padding:20px;
        background:white;
        border-radius:16px;
      ">
        <h3>${title}</h3>
        <p>Gagal memuat data.</p>
        <small>${escapeHtml(err.message)}</small>
      </div>
    `;
  }
}

/* =========================================================
   TAMPILKAN TABEL
   ========================================================= */

function renderTable(container, rows, title) {

  const keys = Object.keys(rows[0] || {});

  let html = `
    <div style="
      background:white;
      border-radius:16px;
      padding:15px;
      overflow:auto;
    ">

    <h3>${title}</h3>

    <table style="
      width:100%;
      border-collapse:collapse;
      margin-top:15px;
    ">

      <thead>
        <tr>
  `;

  keys.forEach(key => {
    html += `
      <th style="
        text-align:left;
        padding:10px;
        border-bottom:2px solid #ddd;
      ">
        ${escapeHtml(key)}
      </th>
    `;
  });

  html += `
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach(row => {

    html += `<tr>`;

    keys.forEach(key => {

      let value = row[key];

      if (value === null || value === undefined) {
        value = "";
      }

      html += `
        <td style="
          padding:10px;
          border-bottom:1px solid #eee;
        ">
          ${escapeHtml(String(value))}
        </td>
      `;
    });

    html += `</tr>`;
  });

  html += `
      </tbody>
    </table>

    </div>
  `;

  container.innerHTML = html;
}

/* =========================================================
   TAMBAH DATA SEDERHANA
   ========================================================= */

function addLocalData(table, element, title) {

  const nama = prompt(
    "Masukkan nama/data:"
  );

  if (!nama) return;

  const key =
    "bf_local_" + table;

  let data = [];

  try {
    data = JSON.parse(
      localStorage.getItem(key) || "[]"
    );
  } catch {}

  data.push({
    nama: nama,
    waktu: new Date().toISOString()
  });

  localStorage.setItem(
    key,
    JSON.stringify(data)
  );

  alert("Data tersimpan di browser.");

  loadTable(
    table,
    element,
    title
  );
}

/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHtml(value) {

  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   LUPA PASSWORD
   ========================================================= */

async function forgotPassword() {

  const email =
    $("email")?.value.trim();

  if (!email) {
    alert(
      "Masukkan email terlebih dahulu."
    );
    return;
  }

  const { error } =
    await sb.auth.resetPasswordForEmail(
      email,
      {
        redirectTo:
          window.location.origin +
          window.location.pathname
      }
    );

  if (error) {
    alert(error.message);
    return;
  }

  alert(
    "Link reset password sudah dikirim ke email."
  );
}

/* =========================================================
   MULAI APLIKASI
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    checkLogin();
  }
);
