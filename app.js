const SUPABASE_URL = "https://psynkzbwusjhsigdvkkf.supabase.co";
const SUPABASE_KEY = "sb_publishable_AFyEeOTyJxzhR0omzPaZ2A_oJSfrgGC";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

async function login(){
  const email = $("email").value.trim();
  const password = $("pass").value;

  if(!email || !password){
    $("msg").textContent = "Email dan password wajib diisi.";
    return;
  }

  $("msg").textContent = "Memproses...";

  const {error} = await sb.auth.signInWithPassword({
    email,
    password
  });

  if(error){
    $("msg").textContent = error.message;
    return;
  }

  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");

  await page("dash");
}

async function logout(){
  await sb.auth.signOut();
  location.reload();
}

async function forgotPassword(){
  const email = $("email").value.trim();

  if(!email){
    alert("Isi email terlebih dahulu.");
    return;
  }

  const {error} = await sb.auth.resetPasswordForEmail(email,{
    redirectTo: location.href
  });

  if(error){
    alert(error.message);
  }else{
    alert("Link reset password sudah dikirim ke email.");
  }
}

/* =========================
   CRUD UMUM
========================= */

const configs = {

  customers:{
    title:"Customer",
    target:"customersData",
    table:"customers",
    fields:[
      ["name","Nama Customer","text"],
      ["phone","No. HP","text"],
      ["address","Alamat","text"]
    ]
  },

  products:{
    title:"Produk",
    target:"productsData",
    table:"products",
    fields:[
      ["name","Nama Produk","text"],
      ["unit","Satuan","text"],
      ["selling_price","Harga Jual","number"]
    ]
  },

  suppliers:{
    title:"Supplier",
    target:"suppliersData",
    table:"suppliers",
    fields:[
      ["name","Nama Supplier","text"],
      ["phone","No. HP","text"],
      ["address","Alamat","text"]
    ]
  },

  inbound:{
    title:"Barang Masuk",
    target:"inboundData",
    table:"inbound_transactions",
    fields:[
      ["transaction_no","No. Transaksi","text"],
      ["transaction_date","Tanggal","date"],
      ["status","Status","text"]
    ]
  },

  outbound:{
    title:"Barang Keluar",
    target:"outboundData",
    table:"outbound_transactions",
    fields:[
      ["transaction_no","No. Transaksi","text"],
      ["transaction_date","Tanggal","date"],
      ["status","Status","text"]
    ]
  },

  finance:{
    title:"Pengeluaran",
    target:"financeData",
    table:"expenses",
    fields:[
      ["expense_no","No. Pengeluaran","text"],
      ["expense_date","Tanggal","date"],
      ["category","Kategori","text"],
      ["amount","Jumlah","number"]
    ]
  },

  commissions:{
    title:"Komisi Marketing",
    target:"commissionData",
    table:"commissions",
    fields:[
      ["commission_no","No. Komisi","text"],
      ["commission_date","Tanggal","date"],
      ["total_kg","Total KG","number"],
      ["total_commission","Total Komisi","number"],
      ["status","Status","text"]
    ]
  }
};

function esc(v){
  return String(v ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function rupiah(v){
  const n = Number(v || 0);
  return n.toLocaleString("id-ID");
}

async function loadCRUD(key){

  const c = configs[key];
  if(!c) return;

  const box = $(c.target);

  box.innerHTML = `
    <div class="card">

      <button onclick="showForm('${key}')">
        + Tambah ${c.title}
      </button>

      <div id="${key}Form" style="margin-top:15px"></div>

    </div>

    <div id="${key}Table"></div>
  `;

  await refreshCRUD(key);
}

async function refreshCRUD(key){

  const c = configs[key];

  const {data,error} = await sb
    .from(c.table)
    .select("*")
    .order("id",{ascending:false})
    .limit(200);

  const box = $(key+"Table");

  if(error){
    box.innerHTML = `
      <div class="card">
        <b>Gagal memuat data</b>
        <p>${esc(error.message)}</p>
      </div>`;
    return;
  }

  if(!data || !data.length){
    box.innerHTML = `
      <div class="card">
        Belum ada data.
      </div>`;
    return;
  }

  box.innerHTML = `
    <div class="card wrap">
      <table class="table">
        <thead>
          <tr>
            ${c.fields.map(f=>`<th>${f[1]}</th>`).join("")}
            <th>Aksi</th>
          </tr>
        </thead>

        <tbody>
          ${data.map(row=>`
            <tr>
              ${c.fields.map(f=>`
                <td>
                  ${
                    f[0].includes("price") ||
                    f[0].includes("amount") ||
                    f[0].includes("commission")
                    ? rupiah(row[f[0]])
                    : esc(row[f[0]])
                  }
                </td>
              `).join("")}

              <td>
                <button onclick='editRow(${JSON.stringify(key)},${JSON.stringify(row)})'>
                  Edit
                </button>

                <button onclick='deleteRow("${key}","${row.id}")'>
                  Hapus
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function showForm(key,row=null){

  const c = configs[key];
  const box = $(key+"Form");

  box.innerHTML = `
    <div class="card">

      <h3>${row ? "Edit" : "Tambah"} ${c.title}</h3>

      ${c.fields.map(f=>`
        <label>${f[1]}</label>

        <input
          id="${key}_${f[0]}"
          type="${f[2]}"
          value="${esc(row ? row[f[0]] : "")}"
          placeholder="${f[1]}"
        >
      `).join("")}

      <button onclick="saveRow('${key}',${row ? row.id : "null"})">
        Simpan
      </button>

      <button onclick="cancelForm('${key}')">
        Batal
      </button>

    </div>
  `;
}

function editRow(key,row){
  showForm(key,row);
  window.scrollTo({top:0,behavior:"smooth"});
}

function cancelForm(key){
  $(key+"Form").innerHTML = "";
}

async function saveRow(key,id){

  const c = configs[key];
  const obj = {};

  for(const f of c.fields){

    let value = $(`${key}_${f[0]}`).value;

    if(f[2] === "number"){
      value = Number(value || 0);
    }

    obj[f[0]] = value;
  }

  let result;

  if(id){

    result = await sb
      .from(c.table)
      .update(obj)
      .eq("id",id);

  }else{

    result = await sb
      .from(c.table)
      .insert(obj);

  }

  if(result.error){

    alert("Gagal menyimpan:\n"+result.error.message);
    return;

  }

  alert("Data berhasil disimpan.");

  cancelForm(key);

  await refreshCRUD(key);
}

async function deleteRow(key,id){

  if(!confirm("Yakin ingin menghapus data ini?")){
    return;
  }

  const c = configs[key];

  const {error} = await sb
    .from(c.table)
    .delete()
    .eq("id",id);

  if(error){

    alert("Gagal menghapus:\n"+error.message);
    return;

  }

  alert("Data berhasil dihapus.");

  await refreshCRUD(key);
}

/* =========================
   DASHBOARD
========================= */

async function getCount(table){

  const {count,error} = await sb
    .from(table)
    .select("*",{count:"exact",head:true});

  if(error) return 0;

  return count || 0;
}

async function loadDash(){

  const tables = [
    ["products","Produk"],
    ["customers","Customer"],
    ["inbound_transactions","Barang Masuk"],
    ["outbound_transactions","Barang Keluar"],
    ["expenses","Pengeluaran"],
    ["commissions","Komisi"]
  ];

  const results=[];

  for(const x of tables){

    results.push([
      x[1],
      await getCount(x[0])
    ]);

  }

  $("stats").innerHTML = results.map(x=>`
    <div class="stat">
      <span>${x[0]}</span>
      <b>${x[1]}</b>
    </div>
  `).join("");
}

/* =========================
   STOK
========================= */

async function loadStock(){

  const {data,error} = await sb
    .from("current_stock")
    .select("*")
    .limit(200);

  const box = $("stockData");

  if(error){

    box.innerHTML = `
      <div class="card">
        <b>Gagal memuat stok</b>
        <p>${esc(error.message)}</p>
      </div>
    `;

    return;
  }

  if(!data || !data.length){

    box.innerHTML = `
      <div class="card">
        Belum ada data stok.
      </div>
    `;

    return;
  }

  box.innerHTML = `
    <div class="card wrap">
      <table class="table">

        <thead>
          <tr>
            <th>Produk</th>
            <th>Stok</th>
            <th>Satuan</th>
          </tr>
        </thead>

        <tbody>

          ${data.map(r=>`
            <tr>
              <td>${esc(r.name)}</td>
              <td>${esc(r.stock_qty)}</td>
              <td>${esc(r.unit)}</td>
            </tr>
          `).join("")}

        </tbody>

      </table>
    </div>
  `;
}

/* =========================
   AUDIT
========================= */

async function loadAudit(){

  const {data,error} = await sb
    .from("audit_logs")
    .select("*")
    .order("id",{ascending:false})
    .limit(200);

  const box = $("auditData");

  if(error){

    box.innerHTML = `
      <div class="card">
        ${esc(error.message)}
      </div>
    `;

    return;
  }

  if(!data || !data.length){

    box.innerHTML = `
      <div class="card">
        Belum ada log.
      </div>
    `;

    return;
  }

  box.innerHTML = `
    <div class="card wrap">

      <table class="table">

        <thead>
          <tr>
            <th>Waktu</th>
            <th>Aksi</th>
            <th>Jenis</th>
          </tr>
        </thead>

        <tbody>

          ${data.map(r=>`
            <tr>
              <td>${esc(r.created_at)}</td>
              <td>${esc(r.action)}</td>
              <td>${esc(r.entity_type)}</td>
            </tr>
          `).join("")}

        </tbody>

      </table>

    </div>
  `;
}

/* =========================
   NAVIGASI
========================= */

async function page(id){

  document
    .querySelectorAll("main>section")
    .forEach(x=>x.classList.add("hidden"));

  const section=$(id);

  if(!section)return;

  section.classList.remove("hidden");

  if(id==="dash"){
    await loadDash();
    return;
  }

  if(id==="customers"){
    await loadCRUD("customers");
    return;
  }

  if(id==="products"){
    await loadCRUD("products");
    return;
  }

  if(id==="suppliers"){
    await loadCRUD("suppliers");
    return;
  }

  if(id==="stock"){
    await loadStock();
    return;
  }

  if(id==="inbound"){
    await loadCRUD("inbound");
    return;
  }

  if(id==="outbound"){
    await loadCRUD("outbound");
    return;
  }

  if(id==="finance"){
    await loadCRUD("finance");
    return;
  }

  if(id==="commissions"){
    await loadCRUD("commissions");
    return;
  }

  if(id==="audit"){
    await loadAudit();
    return;
  }
}

/* =========================
   EXPORT / CETAK
========================= */

function pdf(){

  window.print();

}

/* =========================
   SESSION
