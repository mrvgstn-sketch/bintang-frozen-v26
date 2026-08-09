const SUPABASE_URL = "MASUKKAN_URL_SUPABASE";
const SUPABASE_KEY = "MASUKKAN_PUBLISHABLE_KEY";

const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  }
);

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("pass").value;

  const msg = document.getElementById("msg");

  if (!email || !password) {
    msg.textContent = "Email dan password wajib diisi.";
    return;
  }

  msg.textContent = "Memproses...";

  const { data, error } =
    await sb.auth.signInWithPassword({
      email: email,
      password: password
    });

  if (error) {
    msg.textContent = error.message;
    return;
  }

  msg.textContent = "Login berhasil.";

  document.getElementById("login").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

async function logout() {
  await sb.auth.signOut();
  location.reload();
}

async function forgotPassword() {
  const email = document.getElementById("email").value.trim();

  if (!email) {
    alert("Masukkan email terlebih dahulu.");
    return;
  }

  const { error } =
    await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href
    });

  if (error) {
    alert(error.message);
    return;
  }

  alert(
    "Link reset password sudah dikirim ke email " + email
  );
}

async function checkSession() {
  const { data } = await sb.auth.getSession();

  if (data.session) {
    document.getElementById("login").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  }
}

checkSession();
