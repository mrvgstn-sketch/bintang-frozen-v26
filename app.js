const SUPABASE_URL="https://psynkzbwusjhsigdvkkf.supabase.co";
const SUPABASE_KEY="sb_publishable_AFyEeOTyJxzhR0omzPaZ2A_oJSfrgGC";

const sb=window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth:{
      persistSession:true,
      autoRefreshToken:true
    }
  }
);

const $=id=>document.getElementById(id);

const esc=x=>String(x??"").replace(
  /[&<>"']/g,
  m=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[m])
);

const rupiah=n=>"Rp "+Number(n||0).toLocaleString("id-ID");

async function login(){
  const email=$("email").value.trim();
  const password=$("pass").value;

  if(!email||!password){
    $("msg").textContent="Email dan password wajib diisi.";
    return;
  }

  $("msg").textContent="Memproses...";

  const {error}=await sb.auth.signInWithPassword({
    email,
    password
  });

  if(error){
    $("msg").textContent=error.message;
    return;
  }

  $("login").classList.add("hidden");
  $("app").classList.remove("hidden");

  await loadApp();
}

async function logout(){
  await sb.auth.signOut();
  location.reload();
}

async function forgotPassword(){

  const email=$("email").value.trim();

  if(!email){
    alert("Masukkan email terlebih dahulu.");
    return;
  }

  const {error}=await sb.auth.resetPasswordForEmail(
    email,
    {
      redirectTo:location.href
    }
  );

  if(error){
    alert(error.message);
    return;
  }

  alert(
    "Link reset password sudah dikirim ke "+
    email
  );
}

async function profile(){

  const {data:u,error:ue}=await sb.auth.getUser();

  if(ue)throw ue;

  const {data,error}=await sb
    .from("profiles")
    .select(
      "id,full_name,role,is_active,phone"
    )
    .eq("id",u.user.id)
    .single();

  if(error)throw error;

  return data;
}

async function count(t){

  const {
    count,
    error
  }=await sb
    .from(t)
    .select("id",{
      count:"exact",
      head:true
    });

  if(error)throw error;

  return count||0;
}

async function rows(t,order="name"){

  let q=sb.from(t).select("*");

  if(order){
    q=q.order(order);
  }

  const {
    data,
    error
  }=await q;

  if(error)throw error;

  return data||[];
}

function table(data,cols){

  if(!data.length){
    return '<div class="card muted">Belum ada data.</div>';
  }

  return `
    <div class="card wrap">
      <table class="table">
        <thead>
          <tr>
            ${
              cols.map(c=>
                "<th>"+esc(c.label)+"</th>"
              ).join("")
            }
          </tr>
        </thead>

        <tbody>
          ${
            data.map(r=>
              "<tr>"+
              cols.map(c=>
                "<td>"+
                esc(
                  typeof c.v==="function"
                  ?c.v(r)
                  :r[c.v]
                )+
                "</td>"
              ).join("")+
              "</tr>"
            ).join("")
          }
        </tbody>
      </table>
    </div>
  `;
}

async function loadDash(){

  const a=[
    ["products","Produk"],
    ["customers","Customer"],
    ["suppliers","Supplier"],
    ["inbound_transactions","Barang Masuk"],
    ["outbound_transactions","Barang Keluar"],
    ["expenses","Pengeluaran"],
    ["commissions","Komisi"]
  ];

  const x=await Promise.all(
    a.map(async z=>[
      z[1],
      await count(z[0])
    ])
  );

  $("stats").innerHTML=x.map(
    z=>`
      <div class="stat">
        <span>${esc(z[0])}</span>
        <b>${z[1]}</b>
      </div>
    `
  ).join("");
}

async function loadCustomers(){

  const d=await rows("customers");

  $("customersData").innerHTML=
    table(
      d,
      [
        {label:"Nama",v:"name"},
        {label:"Telepon",v:"phone"},
        {label:"Alamat",v:"address"},
        {label:"Status",v:"is_active"}
      ]
    );
}

async function loadProducts(){

  const d=await rows("products");

  $("productsData").innerHTML=
    table(
      d,
      [
        {label:"Nama",v:"name"},
        {label:"Satuan",v:"unit"},
        {
          label:"Harga Jual",
          v:r=>rupiah(r.selling_price)
        },
        {label:"Status",v:"is_active"}
      ]
    );
}

async function loadSuppliers(){

  const d=await rows("suppliers");

  $("suppliersData").innerHTML=
    table(
      d,
      [
        {label:"Nama",v:"name"},
        {label:"Telepon",v:"phone"},
        {label:"Alamat",v:"address"},
        {label:"Status",v:"is_active"}
      ]
    );
}

async function loadStock(){

  const d=await rows("current_stock");

  $("stockData").innerHTML=
    table(
      d,
      [
        {label:"Produk",v:"name"},
        {label:"Stok",v:"stock_qty"},
        {label:"Satuan",v:"unit"}
      ]
    );
}

async function loadInbound(){

  const {
    data,
    error
  }=await sb
    .from("inbound_transactions")
    .select(
      "transaction_no,transaction_date,status,suppliers(name)"
    )
    .order(
      "transaction_date",
      {ascending:false}
    )
    .limit(200);

  if(error)throw error;

  $("inboundData").innerHTML=
    table(
      data||[],
      [
        {label:"No",v:"transaction_no"},
        {label:"Tanggal",v:"transaction_date"},
        {
          label:"Supplier",
          v:r=>r.suppliers?.name||""
        },
        {label:"Status",v:"status"}
      ]
    );
}

async function loadOutbound(){

  const {
    data,
    error
  }=await sb
    .from("outbound_transactions")
    .select(
      "transaction_no,transaction_date,status,payment_status,customers(name)"
    )
    .order(
      "transaction_date",
      {ascending:false}
    )
    .limit(200);

  if(error)throw error;

  $("outboundData").innerHTML=
    table(
      data||[],
      [
        {label:"No",v:"transaction_no"},
        {label:"Tanggal",v:"transaction_date"},
        {
          label:"Customer",
          v:r=>r.customers?.name||""
        },
        {label:"Status",v:"status"},
        {label:"Pembayaran",v:"payment_status"}
      ]
    );
}

async function loadFinance(){

  const [
    p,
    e
  ]=await Promise.all([

    sb
      .from("payments")
      .select("*")
      .order(
        "payment_date",
        {ascending:false}
      )
      .limit(200),

    sb
      .from("expenses")
      .select("*")
      .order(
        "expense_date",
        {ascending:false}
      )
      .limit(200)

  ]);

  if(p.error)throw p.error;
  if(e.error)throw e.error;

  $("financeData").innerHTML=
    "<h3>Pembayaran</h3>"+
    table(
      p.data||[],
      [
        {label:"Tanggal",v:"payment_date"},
        {
          label:"Jumlah",
          v:r=>rupiah(r.amount)
        },
        {label:"Catatan",v:"notes"}
      ]
    )+

    "<h3>Pengeluaran</h3>"+

    table(
      e.data||[],
      [
        {label:"Tanggal",v:"expense_date"},
        {label:"Kategori",v:"category"},
        {
          label:"Jumlah",
          v:r=>rupiah(r.amount)
        },
        {
          label:"Keterangan",
          v:"description"
        }
      ]
    );
}

async function loadCommissions(){

  const {
    data,
    error
  }=await sb
    .from("commissions")
    .select("*")
    .order(
      "commission_date",
      {ascending:false}
    )
    .limit(200);

  if(error)throw error;

  $("commissionData").innerHTML=
    table(
      data||[],
      [
        {label:"No",v:"commission_no"},
        {label:"Tanggal",v:"commission_date"},
        {label:"Kg",v:"total_kg"},
        {
          label:"Komisi",
          v:r=>rupiah(r.total_commission)
        },
        {label:"Status",v:"status"}
      ]
    );
}

async function loadAudit(){

  const {
    data,
    error
  }=await sb
    .from("audit_logs")
    .select(
      "created_at,action,entity_type,entity_id"
    )
    .order(
      "created_at",
      {ascending:false}
    )
    .limit(200);

  if(error)throw error;

  $("auditData").innerHTML=
    table(
      data||[],
      [
        {label:"Waktu",v:"created_at"},
        {label:"Aksi",v:"action"},
        {label:"Data",v:"entity_type"},
        {label:"ID",v:"entity_id"}
      ]
    );
}

async function loadSection(id){

  try{

    if(id==="dash")
      await loadDash();

    if(id==="customers")
      await loadCustomers();

    if(id==="products")
      await loadProducts();

    if(id==="suppliers")
      await loadSuppliers();

    if(id==="stock")
      await loadStock();

    if(id==="inbound")
      await loadInbound();

    if(id==="outbound")
      await loadOutbound();

    if(id==="finance")
      await loadFinance();

    if(id==="commissions")
      await loadCommissions();

    if(id==="audit")
      await loadAudit();

  }catch(e){

    const el=
      $(id==="dash"
        ?"stats"
        :id+"Data"
      );

    if(el){

      el.innerHTML=`
        <div class="card">
          <b>Gagal memuat data</b>
          <p>${esc(e.message)}</p>
          <p class="muted">
            Periksa tabel Supabase dan RLS.
          </p>
        </div>
      `;

    }
  }
}

async function page(id){

  document
    .querySelectorAll("main>section")
    .forEach(
      x=>x.classList.add("hidden")
    );

  const s=$(id);

  if(!s)return;

  s.classList.remove("hidden");

  await loadSection(id);
}

async function loadApp(){

  try{

    const p=await profile();

    $("who").textContent=
      (p.full_name||"")+
      (p.role?" · "+p.role:"");

    await page("dash");

  }catch(e){

    $("stats").innerHTML=`
      <div class="card">
        <b>
          Login berhasil, tetapi profil/data
          belum dapat dibaca.
        </b>
        <p>${esc(e.message)}</p>
      </div>
    `;
  }
}

function pdf(){
  window.print();
}

async function checkSession(){

  const {data}=await sb.auth.getSession();

  if(data.session){

    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");

    await loadApp();
  }
}

window.login=login;
window.logout=logout;
window.forgotPassword=forgotPassword;
window.page=page;
window.pdf=pdf;

checkSession();
