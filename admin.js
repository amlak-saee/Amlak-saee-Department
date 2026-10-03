const { createClient } = supabase;

const db = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const authStatus = document.getElementById("authStatus");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const adminPanel = document.getElementById("adminPanel");
const propertyForm = document.getElementById("propertyForm");
const categorySelect = document.getElementById("category");
const adminProperties = document.getElementById("adminProperties");

let currentUser = null;

async function checkAdmin() {
  const { data } = await db.auth.getSession();

  if (!data.session) {
    showLoggedOut();
    return;
  }

  currentUser = data.session.user;

  const { data: admin, error } = await db
    .from("admin_users")
    .select("user_id, display_name")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error || !admin) {
    authStatus.textContent = "این حساب دسترسی مدیر ندارد.";
    await db.auth.signOut();
    showLoggedOut();
    return;
  }

  showLoggedIn(admin.display_name || "مدیر سایت");
  await loadCategories();
  await loadProperties();
}

function showLoggedOut() {
  authStatus.textContent = "برای ورود به پنل مدیریت، وارد حساب مدیر شوید.";
  loginButton.style.display = "inline-block";
  logoutButton.style.display = "none";
  adminPanel.style.display = "none";
}

function showLoggedIn(name) {
  authStatus.textContent = `خوش آمدید، ${name}`;
  loginButton.style.display = "none";
  logoutButton.style.display = "inline-block";
  adminPanel.style.display = "block";
}

loginButton.addEventListener("click", async () => {
  const email = prompt("ایمیل مدیر را وارد کنید:");
  if (!email) return;

  const password = prompt("رمز عبور را وارد کنید:");
  if (!password) return;

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert("ورود ناموفق بود: " + error.message);
    return;
  }

  await checkAdmin();
});

logoutButton.addEventListener("click", async () => {
  await db.auth.signOut();
  showLoggedOut();
});

async function loadCategories() {
  const { data, error } = await db
    .from("categories")
    .select("id, title")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    console.error(error);
    return;
  }

  categorySelect.innerHTML = `
    <option value="">انتخاب دسته‌بندی</option>
    ${(data || []).map(category => `
      <option value="${category.id}">
        ${escapeHtml(category.title)}
      </option>
    `).join("")}
  `;
}

propertyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = document.getElementById("title").value.trim();
  const description = document.getElementById("description").value.trim();
  const categoryId = categorySelect.value;
  const price = document.getElementById("price").value;
  const monthlyRent = document.getElementById("monthlyRent").value;
  const deposit = document.getElementById("deposit").value;
  const area = document.getElementById("area").value;
  const bedrooms = document.getElementById("bedrooms").value;
  const location = document.getElementById("location").value.trim();
  const address = document.getElementById("address").value.trim();

  if (!title || !categoryId) {
    alert("عنوان و دسته‌بندی الزامی هستند.");
    return;
  }

  const property = {
    title,
    description: description || null,
    category_id: categoryId,
    price: price ? Number(price) : null,
    monthly_rent: monthlyRent ? Number(monthlyRent) : null,
    deposit: deposit ? Number(deposit) : null,
    area: area ? Number(area) : null,
    bedrooms: bedrooms ? Number(bedrooms) : null,
    location_text: location || null,
    address: address || null,
    parking: document.getElementById("parking").checked,
    elevator: document.getElementById("elevator").checked,
    storage: document.getElementById("storage").checked,
    terrace: document.getElementById("terrace").checked,
    is_active: true
  };

  const { error } = await db
    .from("properties")
    .insert(property);

  if (error) {
    alert("ثبت ملک انجام نشد: " + error.message);
    console.error(error);
    return;
  }

  alert("ملک با موفقیت ثبت شد.");

  propertyForm.reset();

  await loadProperties();
});

async function loadProperties() {
  const { data, error } = await db
    .from("properties")
    .select(`
      id,
      title,
      price,
      area,
      is_active,
      created_at,
      categories(title)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    adminProperties.innerHTML = "خطا در دریافت فایل‌ها.";
    console.error(error);
    return;
  }

  if (!data || !data.length) {
    adminProperties.innerHTML = `
      <p>هنوز ملکی ثبت نشده است.</p>
    `;
    return;
  }

  adminProperties.innerHTML = data.map(property => `
    <div class="property-card" style="margin-top:15px;">
      <div class="property-content">

        <h3>${escapeHtml(property.title)}</h3>

        <div class="property-meta">
          <span>
            ${escapeHtml(property.categories?.title || "")}
          </span>

          ${
            property.area
              ? `<span>${property.area} متر</span>`
              : ""
          }

          ${
            property.price
              ? `<span>${Number(property.price).toLocaleString("fa-IR")} تومان</span>`
              : ""
          }
        </div>

        <div style="margin-top:15px;">
          <button
            class="category-btn"
            onclick="toggleProperty('${property.id}', ${property.is_active})">
            ${property.is_active ? "غیرفعال کردن" : "فعال کردن"}
          </button>

          <button
            class="category-btn"
            onclick="deleteProperty('${property.id}')">
            حذف
          </button>
        </div>

      </div>
    </div>
  `).join("");
}

async function toggleProperty(id, currentStatus) {
  const { error } = await db
    .from("properties")
    .update({
      is_active: !currentStatus
    })
    .eq("id", id);

  if (error) {
    alert("تغییر وضعیت انجام نشد.");
    console.error(error);
    return;
  }

  await loadProperties();
}

async function deleteProperty(id) {
  const confirmed = confirm(
    "آیا مطمئن هستید که این ملک حذف شود؟"
  );

  if (!confirmed) return;

  const { error } = await db
    .from("properties")
    .delete()
    .eq("id", id);

  if (error) {
    alert("حذف ملک انجام نشد.");
    console.error(error);
    return;
  }

  await loadProperties();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

checkAdmin();
