/* =========================================================
   BINTANG FROZEN V26
   FINAL APP.JS
   ========================================================= */

const SUPABASE_URL =
  "https://psynkzbwusjhsigdvkkf.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_AFyEeOTyJxzhR0omzPaZ2A_oJSfrgGC";

let sb = null;
let currentSession = null;

const $ = id => document.getElementById(id);

function firstElement(ids) {
  for (const id of ids) {
    const el = $(id);
    if (el) return el;
  }
  return null;
}

function setText(ids, text) {
  const el = firstElement(ids);
  if (el) el.textContent = text;
}

function show(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

function hide(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function rupiah(value) {
  return "Rp " +
    Number(value || 0).toLocaleString("id-ID");
}

/* =========================================================
   SUPABASE
   ========================================================= */

function initSupabase() {
  if (sb) return true;

  if (!window.supabase) {
    setText(
      ["msg", "loginMsg"],
      "Library Supabase belum termuat. Refresh halaman."
    );
    return false;
  }

  sb = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  return true;
}

/* =========================================================
   LOGIN
   ========================================================= */

async function doLogin() {

  const emailEl =
    firstElement(["email"]);

  const passwordEl =
    firstElement(["password", "pass"]);

  const msgEl =
    firstElement(["msg", "loginMsg"]);

  const email =
    emailEl?.value.trim() || "";

  const password =
    passwordEl?.value || "";

  if (!email || !password) {

    if (msgEl) {
      msgEl.textContent =
        "Email dan password wajib diisi.";
    }

    return;
  }

  if (!initSupabase()) return;

  if (msgEl) {
    msgEl.textContent =
      "Menghubungkan ke server...";
  }

  try {

    const { data, error } =
      await sb.auth.signInWithPassword({
        email,
        password
      });

    if (error) {

      if (msgEl) {
        msgEl.textContent =
          "Login gagal: " + error.message;
      }

      return;
    }

    currentSession = data.session;

    hide("login");
    hide("setup");
    show("app");

    if (msgEl) {
      msgEl.textContent = "";
    }

    setText(
      ["user", "currentUser"],
      data.user?.email || email
    );

    await page("dash");

  } catch (error) {

    console.error(error);

    if (msgEl) {
      msgEl.textContent =
        "Server tidak merespons: " +
        error.message;
    }
  }
}

/* Alias agar tombol HTML lama tetap bekerja */
window.doLogin = doLogin;
window.login = doLogin;

/* =========================================================
   SESSION
   ========================================================= */

async function checkSession() {

  if (!initSupabase()) return;

  try {

    const { data, error } =
      await sb.auth.getSession();

    if (error) {
      console.error(error);
      return;
    }

    if (data.session) {

      currentSession =
        data.session;

      hide("login");
      hide("setup");
      show("app");

      setText(
        ["user", "currentUser"],
        data.session.user?.email || ""
      );

      await page("dash");

    } else {

      hide("app");
      show("login");

    }

  } catch (error) {

    console.error(error);

  }
}

/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

  if (sb) {
    await sb.auth.signOut();
  }

  currentSession = null;

  location.reload();
}

window.logout = logout;

/* =========================================================
   LUPA PASSWORD
   ========================================================= */

async function forgotPassword() {

  const email =
    $("email")?.value.trim() || "";

  if (!email) {
    alert("Masukkan email terlebih dahulu.");
    return;
  }

  if (!initSupabase()) return;

  try {

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

  } catch (error) {

    alert(error.message);

  }
}

window.forgotPassword = forgotPassword;
window.forgot = forgotPassword;

/* =========================================================
   KONFIGURASI MENU
   ========================================================= */

const MENU = {

  dash: {
    title: "Dashboard",
    tables: []
  },

  customers: {
    title: "Customer",
    table: "customers",
    containers: [
      "customersData",
      "customersBox"
    ]
  },

  products: {
    title: "Produk",
    table: "products",
    containers: [
      "productsData",
      "productsBox"
    ]
  },

  suppliers: {
    title: "Supplier",
    table: "suppliers",
    containers: [
      "suppliersData",
      "suppliersBox"
    ]
  },

  stock: {
    title: "Stok",
    table: "current_stock",
    containers: [
      "stockData",
      "stockBox"
    ],
    view: true
  },

  inbound: {
    title: "Barang Masuk",
    table: "inbound_transactions",
    containers: [
      "inboundData",
      "inboundBox"
    ]
  },

  outbound: {
    title: "Barang Keluar",
    table: "outbound_transactions",
    containers: [
      "outboundData",
      "outboundBox"
    ]
  },

  finance: {
    title: "Keuangan",
    table: "expenses",
    containers: [
      "financeData",
      "financeBox"
    ]
  },

  commissions: {
    title: "Komisi Marketing",
    table: "commissions",
    containers: [
      "commissionData",
      "commissionBox"
    ]
  },

  commission: {
    title: "Komisi Marketing",
    table: "commissions",
    containers: [
      "commissionData",
      "commissionBox"
    ]
  },

  audit: {
    title: "Audit Log",
    table: "audit_logs",
    containers: [
      "auditData",
      "auditBox"
    ]
  }
};

/* =========================================================
   CARI CONTAINER
   ========================================================= */

function getContainer(config) {

  for (const id of config.containers || []) {

    const el = $(id);

    if (el) return el;

  }

  return null;
}

/* =========================================================
   NAVIGASI
   ========================================================= */

async function page(name) {

  const allPages = [
    "dash",
    "dashboard",
    "customers",
    "products",
    "suppliers",
    "stock",
    "inbound",
    "outbound",
    "finance",
    "commissions",
    "commission",
    "audit"
  ];

  allPages.forEach(id => {

    const el = $(id);

    if (el) {
      el.classList.add("hidden");
    }

  });

  let section =
    $(name);

  if (!section && name === "dash") {
    section = $("dashboard");
  }

  if (section) {
    section.classList.remove("hidden");
  }

  if (name === "dash" ||
      name === "dashboard") {

    await loadDashboard();
    return;
  }

  const config =
    MENU[name];

  if (!config) return;

  await loadData(config);
}

window.page = page;

/* =========================================================
   DASHBOARD
   ========================================================= */

async function loadDashboard() {

  const stats =
    firstElement([
      "stats",
      "dashboardStats"
    ]);

  if (!stats) return;

  const items = [

    ["products", "Produk"],
    ["customers", "Customer"],
    ["suppliers", "Supplier"],
    ["inbound_transactions", "Barang Masuk"],
    ["outbound_transactions", "Barang Keluar"],
    ["expenses", "Pengeluaran"],
    ["commissions", "Komisi"]

  ];

  stats.innerHTML = `
    <div class="grid"
         style="
           display:grid;
           grid-template-columns:
           repeat(auto-fit,minmax(140px,1fr));
           gap:12px;
         ">
      ${items.map((item, i) => `
        <div style="
          background:white;
          border:1px solid #e5e7eb;
          border-radius:14px;
          padding:16px;
        ">
          <div style="
            color:#64748b;
            font-size:12px;
          ">
            ${item[1]}
          </div>

          <div
            id="stat_${i}"
            style="
              font-size:24px;
              font-weight:800;
              margin-top:6px;
            ">
            ...
          </div>
        </div>
      `).join("")}
    </div>
  `;

  for (let i = 0; i < items.length; i++) {

    const { count, error } =
      await sb
        .from(items[i][0])
        .select("*", {
          count: "exact",
          head: true
        });

    const el =
      $(`stat_${i}`);

    if (el) {
      el.textContent =
        error ? "—" : String(count || 0);
    }
  }
}

/* =========================================================
   LOAD DATA
   ========================================================= */

async function loadData(config) {

  const container =
    getContainer(config);

  if (!container) {
    console.warn(
      "Container tidak ditemukan:",
      config.title
    );
    return;
  }

  container.innerHTML = `
    <div style="
      padding:18px;
      background:white;
      border:1px solid #e5e7eb;
      border-radius:14px;
    ">
      Memuat ${escapeHtml(config.title)}...
    </div>
  `;

  try {

    const { data, error } =
      await sb
        .from(config.table)
        .select("*")
        .limit(200);

    if (error) {

      renderError(
        container,
        config,
        error
      );

      return;
    }

    renderData(
      container,
      config,
      data || []
    );

  } catch (error) {

    renderError(
      container,
      config,
      error
    );

  }
}

/* =========================================================
   ERROR DATABASE
   ========================================================= */

function renderError(
  container,
  config,
  error
) {

  container.innerHTML = `
    <div style="
      background:white;
      border:1px solid #fecaca;
      border-radius:14px;
      padding:18px;
    ">

      <h3 style="
        margin:0 0 8px;
        color:#991b1b;
      ">
        ${escapeHtml(config.title)}
      </h3>

      <p style="margin:0;color:#b91c1c;">
        Database belum dapat dibaca.
      </p>

      <details style="margin-top:10px;">
        <summary>Detail error</summary>

        <pre style="
          white-space:pre-wrap;
          font-size:12px;
          margin-top:8px;
        ">${escapeHtml(
          error?.message ||
          JSON.stringify(error)
        )}</pre>

      </details>

      <button
        style="margin-top:12px;"
        onclick="page('${config === MENU.stock ? "stock" : Object.keys(MENU).find(k => MENU[k] === config) || "dash"}')">
        Coba lagi
      </button>

    </div>
  `;
}

/* =========================================================
   RENDER DATA
   ========================================================= */

function renderData(
  container,
  config,
  rows
) {

  if (!rows.length) {

    container.innerHTML = `
      <div style="
        background:white;
        border:1px solid #e5e7eb;
        border-radius:14px;
        padding:18px;
      ">

        <h3 style="margin-top:0;">
          ${escapeHtml(config.title)}
        </h3>

        <p>
          Belum ada data.
        </p>

        ${
          config.view
          ? `
            <small style="color:#64748b;">
              Stok dihitung otomatis dari transaksi.
            </small>
          `
          : `
            <button
              onclick="openAddForm('${config.table}')">
              + Tambah ${escapeHtml(config.title)}
            </button>
          `
        }

      </div>
    `;

    return;
  }

  const columns =
    Object.keys(rows[0]);

  container.innerHTML = `

    <div style="
      background:white;
      border:1px solid #e5e7eb;
      border-radius:14px;
      padding:14px;
    ">

      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:10px;
        margin-bottom:12px;
      ">

        <h3 style="margin:0;">
          ${escapeHtml(config.title)}
        </h3>

        ${
          !config.view
          ? `
            <button
              onclick="openAddForm('${config.table}')">
              + Tambah
            </button>
          `
          : ""
        }

      </div>

      <div style="overflow:auto;">

        <table style="
          width:100%;
          border-collapse:collapse;
          font-size:13px;
        ">

          <thead>
            <tr>
              ${columns.map(c => `
                <th style="
                  text-align:left;
                  padding:10px;
                  border-bottom:2px solid #e5e7eb;
                  white-space:nowrap;
                ">
                  ${escapeHtml(c)}
                </th>
              `).join("")}

              ${
                !config.view
                ? `<th style="padding:10px;">Aksi</th>`
                : ""
              }

            </tr>
          </thead>

          <tbody>

            ${rows.map(row => `

              <tr>

                ${columns.map(c => {

                  let value =
                    row[c];

                  if (
                    typeof value ===
                    "number"
                  ) {

                    if (
                      c.includes("price") ||
                      c.includes("amount") ||
                      c.includes("commission")
                    ) {
                      value =
                        rupiah(value);
                    }
                  }

                  return `
                    <td style="
                      padding:9px;
                      border-bottom:1px solid #f1f5f9;
                      white-space:nowrap;
                    ">
                      ${escapeHtml(value)}
                    </td>
                  `;

                }).join("")}

                ${
                  !config.view
                  ? `
                    <td style="
                      padding:9px;
                      white-space:nowrap;
                    ">

                      ${
                        row.id
                        ? `
                          <button
                            onclick='editRow("${config.table}", ${JSON.stringify(row)})'>
                            Edit
                          </button>

                          <button
                            onclick='deleteRow("${config.table}", "${escapeHtml(row.id)}")'>
                            Hapus
                          </button>
                        `
                        : ""
                      }

                    </td>
                  `
                  : ""
                }

              </tr>

            `).join("")}

          </tbody>

        </table>

      </div>

    </div>
  `;
}

/* =========================================================
   FORM DATA
   ========================================================= */

const FIELD_MAP = {

  customers: [
    ["name", "Nama Customer", "text"],
    ["phone", "No. HP", "text"],
    ["address", "Alamat", "text"]
  ],

  products: [
    ["code", "Kode Produk", "text"],
    ["name", "Nama Produk", "text"],
    ["category", "Kategori", "text"],
    ["unit", "Satuan", "text"],
    ["purchase_price", "Harga Beli", "number"],
    ["selling_price", "Harga Jual", "number"],
    ["min_stock", "Minimum Stok", "number"]
  ],

  suppliers: [
    ["code", "Kode Supplier", "text"],
    ["name", "Nama Supplier", "text"],
    ["phone", "No. HP", "text"],
    ["address", "Alamat", "text"]
  ],

  expenses: [
    ["expense_no", "No. Pengeluaran", "text"],
    ["expense_date", "Tanggal", "date"],
    ["category", "Kategori", "text"],
    ["description", "Keterangan", "text"],
    ["amount", "Jumlah", "number"]
  ],

  commissions: [
    ["commission_no", "No. Komisi", "text"],
    ["commission_date", "Tanggal", "date"],
    ["total_kg", "Total KG", "number"],
    ["commission_per_kg", "Komisi/KG", "number"],
    ["total_commission", "Total Komisi", "number"],
    ["status", "Status", "text"]
  ],

  inbound_transactions: [
    ["transaction_no", "No. Transaksi", "text"],
    ["transaction_date", "Tanggal", "date"],
    ["status", "Status", "text"]
  ],

  outbound_transactions: [
    ["transaction_no", "No. Transaksi", "text"],
    ["transaction_date", "Tanggal", "date"],
    ["status", "Status", "text"]
  ]

};

function openAddForm(table) {

  const config =
    Object.values(MENU)
      .find(x => x.table === table);

  if (!config) return;

  const container =
    getContainer(config);

  if (!container) return;

  const fields =
    FIELD_MAP[table] || [];

  if (!fields.length) {

    alert(
      "Form untuk tabel ini belum dapat dibuat karena struktur kolomnya belum diketahui."
    );

    return;
  }

  const form =
    document.createElement("div");

  form.style.cssText = `
    background:#f8fafc;
    border:1px solid #cbd5e1;
    border-radius:14px;
    padding:16px;
    margin-bottom:14px;
  `;

  form.innerHTML = `

    <h3 style="margin-top:0;">
      Tambah ${escapeHtml(config.title)}
    </h3>

    <div style="
      display:grid;
      grid-template-columns:
      repeat(auto-fit,minmax(180px,1fr));
      gap:10px;
    ">

      ${fields.map(f => `

        <label style="
          display:flex;
          flex-direction:column;
          gap:5px;
        ">

          <span style="font-size:12px;">
            ${escapeHtml(f[1])}
          </span>

          <input
            id="bf_${table}_${f[0]}"
            type="${f[2]}"
            style="
              padding:9px;
              border:1px solid #cbd5e1;
              border-radius:8px;
              background:white;
            "
          >

        </label>

      `).join("")}

    </div>

    <div style="
      display:flex;
      gap:8px;
      margin-top:14px;
    ">

      <button
        onclick="saveNewRow('${table}')">
        Simpan
      </button>

      <button
        onclick="this.closest('div[style*=background]').remove()">
        Batal
      </button>

    </div>
  `;

  container.prepend(form);
}

window.openAddForm =
  openAddForm;

/* =========================================================
   SAVE
   ========================================================= */

async function saveNewRow(table) {

  const fields =
    FIELD_MAP[table] || [];

  const data = {};

  for (const f of fields) {

    const el =
      $(`bf_${table}_${f[0]}`);

    if (!el) continue;

    let value =
      el.value;

    if (f[2] === "number") {
      value =
        value === ""
        ? null
        : Number(value);
    }

    if (value !== "") {
      data[f[0]] = value;
    }
  }

  if (!Object.keys(data).length) {
    alert("Isi data terlebih dahulu.");
    return;
  }

  try {

    const { error } =
      await sb
        .from(table)
        .insert(data);

    if (error) {

      alert(
        "Gagal menyimpan:\n" +
        error.message
      );

      return;
    }

    alert("Data berhasil disimpan.");

    const config =
      Object.values(MENU)
        .find(x => x.table === table);

    if (config) {
      await loadData(config);
    }

  } catch (error) {

    alert(error.message);

  }
}

window.saveNewRow =
  saveNewRow;

/* =========================================================
   EDIT
   ========================================================= */

async function editRow(table, row) {

  if (!row?.id) {
    alert("Data ini tidak mempunyai ID.");
    return;
  }

  const fields =
    FIELD_MAP[table] || [];

  if (!fields.length) {
    alert("Form edit belum tersedia.");
    return;
  }

  const changes = {};

  for (const f of fields) {

    if (!(f[0] in row)) continue;

    const current =
      row[f[0]] ?? "";

    const value =
      prompt(
        f[1],
        current
      );

    if (value === null) return;

    changes[f[0]] =
      f[2] === "number"
      ? Number(value || 0)
      : value;
  }

  try {

    const { error } =
      await sb
        .from(table)
        .update(changes)
        .eq("id", row.id);

    if (error) {

      alert(
        "Gagal mengubah data:\n" +
        error.message
      );

      return;
    }

    alert("Data berhasil diubah.");

    const config =
      Object.values(MENU)
        .find(x => x.table === table);

    if (config) {
      await loadData(config);
    }

  } catch (error) {

    alert(error.message);

  }
}

window.editRow =
  editRow;

/* =========================================================
   DELETE
   ========================================================= */

async function deleteRow(table, id) {

  if (!confirm(
    "Yakin ingin menghapus data ini?"
  )) {
    return;
  }

  try {

    const { error } =
      await sb
        .from(table)
        .delete()
        .eq("id", id);

    if (error) {

      alert(
        "Gagal menghapus:\n" +
        error.message
      );

      return;
    }

    alert("Data berhasil dihapus.");

    const config =
      Object.values(MENU)
        .find(x => x.table === table);

    if (config) {
      await loadData(config);
    }

  } catch (error) {

    alert(error.message);

  }
}

window.deleteRow =
  deleteRow;

/* =========================================================
   CETAK
   ========================================================= */

function printReport() {
  window.print();
}

window.printReport =
  printReport;

window.pdf =
  printReport;

/* =========================================================
   START
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    initSupabase();

    await checkSession();

  }
);
