const SUPABASE_URL="https://psynkzbwusjhsigdvkkf.supabase.co";
const SUPABASE_KEY="sb_publishable_AFyEeOTyJxzhR0omzPaZ2A_oJSfrgGC";

const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const $=id=>document.getElementById(id);

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

  await page("dash");
}

async function logout(){
  await sb.auth.signOut();
  location.reload();
}

async function forgotPassword(){
  const email=$("email").value.trim();

  if(!email){
    alert("Isi email terlebih dahulu.");
    return;
  }

  const {error}=await sb.auth.resetPasswordForEmail(email,{
    redirectTo:location.href
  });

  if(error){
    alert(error.message);
  }else{
    alert("Link reset password sudah dikirim ke email.");
  }
}

async function getCount(table){
  const {count,error}=await sb
    .from(table)
    .select("*",{count:"exact",head:true});

  if(error) throw error;

  return count||0;
}

async function loadDash(){

  const tables=[
    ["products","Produk"],
    ["customers","Customer"],
    ["inbound_transactions","Barang Masuk"],
    ["outbound_transactions","Barang Keluar"],
    ["expenses","Pengeluaran"],
    ["commissions","Komisi"]
  ];

  const results=[];

  for(const x of tables){
    try{
      results.push([
        x[1],
        await getCount(x[0])
      ]);
    }catch(e){
      results.push([
        x[1],
        "—"
      ]);
    }
  }

  $("stats").innerHTML=results.map(x=>`
    <div class="stat">
      <span>${x[0]}</span>
      <b>${x[1]}</b>
    </div>
  `).join("");
}

async function loadTable(tableName,target,columns){

  const {data,error}=await sb
    .from(tableName)
    .select("*")
    .limit(200);

  if(error){
    $(target).innerHTML=`
      <div class="card">
        <b>Gagal memuat data</b>
        <p>${error.message}</p>
      </div>`;
    return;
  }

  if(!data||!data.length){
    $(target).innerHTML=`
      <div class="card">
        Belum ada data.
      </div>`;
    return;
  }

  $(target).innerHTML=`
    <div class="card wrap">
      <table class="table">
        <thead>
          <tr>
            ${columns.map(x=>`<th>${x}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${data.map(r=>`
            <tr>
              ${columns.map(x=>`
                <td>${r[x]??""}</td>
              `).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function page(id){

  document.querySelectorAll("main>section")
    .forEach(x=>x.classList.add("hidden"));

  const section=$(id);

  if(!section)return;

  section.classList.remove("hidden");

  if(id==="dash"){
    await loadDash();
  }

  if(id==="customers"){
    await loadTable(
      "customers",
      "customersData",
      ["name","phone","address"]
    );
  }

  if(id==="products"){
    await loadTable(
      "products",
      "productsData",
      ["name","unit","selling_price"]
    );
  }

  if(id==="suppliers"){
    await loadTable(
      "suppliers",
      "suppliersData",
      ["name","phone","address"]
    );
  }

  if(id==="stock"){
    await loadTable(
      "current_stock",
      "stockData",
      ["name","stock_qty","unit"]
    );
  }

  if(id==="inbound"){
    await loadTable(
      "inbound_transactions",
      "inboundData",
      ["transaction_no","transaction_date","status"]
    );
  }

  if(id==="outbound"){
    await loadTable(
      "outbound_transactions",
      "outboundData",
      ["transaction_no","transaction_date","status"]
    );
  }

  if(id==="finance"){
    await loadTable(
      "expenses",
      "financeData",
      ["expense_no","expense_date","category","amount"]
    );
  }

  if(id==="commissions"){
    await loadTable(
      "commissions",
      "commissionData",
      ["commission_no","commission_date","total_kg","total_commission","status"]
    );
  }

  if(id==="audit"){
    await loadTable(
      "audit_logs",
      "auditData",
      ["created_at","action","entity_type"]
    );
  }
}

async function checkSession(){

  const {data}=await sb.auth.getSession();

  if(data.session){

    $("login").classList.add("hidden");
    $("app").classList.remove("hidden");

    await page("dash");
  }
}

window.login=login;
window.logout=logout;
window.forgotPassword=forgotPassword;
window.page=page;

checkSession();
