const { createClient } = supabase;

const db = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const authStatus = document.getElementById("authStatus");
const loginForm = document.getElementById("loginForm");
const loginSection = document.getElementById("loginSection");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");

const logoutButton = document.getElementById("logoutButton");
const adminPanel = document.getElementById("adminPanel");
const welcomeText = document.getElementById("welcomeText");

const propertyForm = document.getElementById("propertyForm");
const categorySelect = document.getElementById("category");
const neighborhoodSelect = document.getElementById("neighborhood");
const propertyFilters = document.getElementById("propertyFilters");
const frontageBox = document.getElementById("frontageBox");
const frontageType = document.getElementById("frontageType");

const propertyImages = document.getElementById("propertyImages");
const submitPropertyButton =
  document.getElementById("submitPropertyButton");

const propertyMessage =
  document.getElementById("propertyMessage");

const adminProperties =
  document.getElementById("adminProperties");

const settingsForm =
  document.getElementById("settingsForm");

const settingsMessage =
  document.getElementById("settingsMessage");

/* مدیریت محله‌ها */

const neighborhoodForm =
  document.getElementById("neighborhoodForm");

const neighborhoodName =
  document.getElementById("neighborhoodName");

const neighborhoodMessage =
  document.getElementById("neighborhoodMessage");

const adminNeighborhoods =
  document.getElementById("adminNeighborhoods");


let currentUser = null;
let categories = [];
let neighborhoods = [];
let filters = [];


/* =========================
   LOGIN
========================= */

loginForm.addEventListener("submit", async (event) => {

  event.preventDefault();

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {

    authStatus.textContent =
      "ایمیل و رمز عبور را وارد کنید.";

    return;
  }

  authStatus.textContent =
    "در حال ورود...";

  const { error } =
    await db.auth.signInWithPassword({
      email,
      password
    });

  if (error) {

    console.error(error);

    authStatus.textContent =
      "ورود ناموفق بود. ایمیل یا رمز عبور را بررسی کنید.";

    return;
  }

  loginPassword.value = "";

  await checkAdmin();

});


/* =========================
   CHECK ADMIN
========================= */

async function checkAdmin() {

  const { data, error } =
    await db.auth.getSession();

  if (error || !data.session) {

    showLoggedOut();

    return;
  }

  currentUser = data.session.user;

  const {
    data: admin,
    error: adminError
  } = await db
    .from("admin_users")
    .select("user_id, display_name")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (adminError || !admin) {

    authStatus.textContent =
      "این حساب دسترسی مدیر ندارد.";

    await db.auth.signOut();

    showLoggedOut();

    return;
  }

  showLoggedIn(
    admin.display_name || "مدیر سایت"
  );

  await Promise.all([
    loadCategories(),
    loadNeighborhoods(),
    loadAdminNeighborhoods(),
    loadProperties(),
    loadSettings()
  ]);

}


/* =========================
   LOGIN UI
========================= */

function showLoggedOut() {

  loginSection.style.display = "block";

  adminPanel.style.display = "none";

  authStatus.textContent =
    "برای ورود به پنل مدیریت، اطلاعات مدیر را وارد کنید.";

}


/* =========================
   LOGGED IN UI
========================= */

function showLoggedIn(name) {

  loginSection.style.display = "none";

  adminPanel.style.display = "block";

  welcomeText.textContent =
    `خوش آمدید، ${name}`;

}


/* =========================
   LOGOUT
========================= */

logoutButton.addEventListener(
  "click",
  async () => {

    await db.auth.signOut();

    currentUser = null;

    showLoggedOut();

  }
);


/* =========================
   CATEGORIES
========================= */

async function loadCategories() {

  const {
    data,
    error
  } = await db
    .from("categories")
    .select("id, title, slug")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {

    console.error(error);

    categorySelect.innerHTML =
      `<option value="">خطا در دریافت دسته‌بندی</option>`;

    return;
  }

  categories = data || [];

  categorySelect.innerHTML = `
    <option value="">
      انتخاب دسته‌بندی
    </option>

    ${categories.map(category => `
      <option value="${category.id}">
        ${escapeHtml(category.title)}
      </option>
    `).join("")}
  `;

}


/* =========================
   CATEGORY CHANGE
========================= */

categorySelect.addEventListener(
  "change",
  async () => {

    const categoryId =
      categorySelect.value;

    propertyFilters.innerHTML = "";

    frontageBox.style.display = "none";

    frontageType.value = "";

    if (!categoryId) {
      return;
    }

    const category =
      categories.find(
        item => item.id === categoryId
      );

    if (
      category &&
      category.slug === "shop"
    ) {

      frontageBox.style.display =
        "block";

    }

    await loadFilters(categoryId);

  }
);


/* =========================
   NEIGHBORHOODS
========================= */

async function loadNeighborhoods() {

  const {
    data,
    error
  } = await db
    .from("neighborhoods")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  if (error) {

    console.error(error);

    neighborhoodSelect.innerHTML =
      `<option value="">خطا در دریافت محله‌ها</option>`;

    return;
  }

  neighborhoods = data || [];

  neighborhoodSelect.innerHTML =
    neighborhoods.length
      ? neighborhoods.map(item => `
          <option value="${item.id}">
            ${escapeHtml(item.name)}
          </option>
        `).join("")
      : `
        <option value="">
          هنوز محله‌ای ثبت نشده است
        </option>
      `;

}


/* =========================
   ADD NEIGHBORHOOD
========================= */

if (neighborhoodForm) {

  neighborhoodForm.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      if (!currentUser) {

        neighborhoodMessage.textContent =
          "ابتدا وارد حساب مدیر شوید.";

        return;
      }

      const name =
        neighborhoodName.value.trim();

      if (!name) {

        neighborhoodMessage.textContent =
          "نام محله را وارد کنید.";

        return;
      }

      neighborhoodMessage.textContent =
        "در حال افزودن محله...";

      const {
        error
      } = await db
        .from("neighborhoods")
        .insert({
          name: name,
          sort_order: 0,
          is_active: true
        });

      if (error) {

        console.error(error);

        if (error.code === "23505") {

          neighborhoodMessage.textContent =
            "این محله قبلاً ثبت شده است.";

        } else {

          neighborhoodMessage.textContent =
            "افزودن محله انجام نشد: " +
            (error.message || "خطای نامشخص");

        }

        return;
      }

      neighborhoodName.value = "";

      neighborhoodMessage.textContent =
        "محله با موفقیت اضافه شد.";

      await loadNeighborhoods();

      await loadAdminNeighborhoods();

    }
  );

}


/* =========================
   LOAD ADMIN NEIGHBORHOODS
========================= */

async function loadAdminNeighborhoods() {

  if (!adminNeighborhoods) {
    return;
  }

  const {
    data,
    error
  } = await db
    .from("neighborhoods")
    .select("id, name, is_active")
    .order("sort_order")
    .order("name");

  if (error) {

    console.error(error);

    adminNeighborhoods.innerHTML =
      "<p>خطا در دریافت محله‌ها.</p>";

    return;
  }

  if (!data || !data.length) {

    adminNeighborhoods.innerHTML =
      "<p>هنوز محله‌ای ثبت نشده است.</p>";

    return;
  }

  adminNeighborhoods.innerHTML =
    data.map(item => `

      <div
        class="property-card"
        style="margin-top:15px;">

        <div class="property-content">

          <h3>
            ${escapeHtml(item.name)}
          </h3>

          <div class="property-meta">

            <span>
              ${
                item.is_active
                  ? "فعال"
                  : "غیرفعال"
              }
            </span>

          </div>

          <div
            style="margin-top:15px;">

            <button
              type="button"
              class="category-btn"
              onclick="
                toggleNeighborhood(
                  '${item.id}',
                  ${item.is_active}
                )
              ">

              ${
                item.is_active
                  ? "غیرفعال کردن"
                  : "فعال کردن"
              }

            </button>

            <button
              type="button"
              class="category-btn"
              onclick="
                deleteNeighborhood(
                  '${item.id}'
                )
              ">

              حذف

            </button>

          </div>

        </div>

      </div>

    `).join("");

}


/* =========================
   TOGGLE NEIGHBORHOOD
========================= */

async function toggleNeighborhood(
  id,
  currentStatus
) {

  const {
    error
  } = await db
    .from("neighborhoods")
    .update({
      is_active: !currentStatus
    })
    .eq("id", id);

  if (error) {

    console.error(error);

    alert(
      "تغییر وضعیت محله انجام نشد."
    );

    return;
  }

  await loadNeighborhoods();

  await loadAdminNeighborhoods();

}


/* =========================
   DELETE NEIGHBORHOOD
========================= */

async function deleteNeighborhood(id) {

  const confirmed =
    confirm(
      "آیا مطمئن هستید که این محله حذف شود؟"
    );

  if (!confirmed) {
    return;
  }

  const {
    error
  } = await db
    .from("neighborhoods")
    .delete()
    .eq("id", id);

  if (error) {

    console.error(error);

    alert(
      "حذف محله انجام نشد."
    );

    return;
  }

  await loadNeighborhoods();

  await loadAdminNeighborhoods();

}


/* =========================
   FILTERS
========================= */

async function loadFilters(categoryId) {

  const {
    data,
    error
  } = await db
    .from("filter_options")
    .select("*")
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("sort_order");

  if (error) {

    console.error(error);

    return;
  }

  filters = data || [];

  renderPropertyFilters();

}


/* =========================
   RENDER FILTERS
========================= */

function renderPropertyFilters() {

  if (!filters.length) {

    propertyFilters.innerHTML = "";

    return;
  }

  const parents =
    filters.filter(
      item => !item.parent_id
    );

  const children =
    filters.filter(
      item => item.parent_id
    );

  propertyFilters.innerHTML = `
    <label>
      فیلتر فایل
    </label>

    <div class="admin-filter-list">

      ${parents.map(parent => {

        const childItems =
          children.filter(
            child =>
              child.parent_id === parent.id
          );

        if (!childItems.length) {

          return `
            <label>
              <input
                type="checkbox"
                class="property-filter"
                value="${parent.id}">
              ${escapeHtml(parent.title)}
            </label>
          `;

        }

        return `
          <div class="filter-parent">

            <strong>
              ${escapeHtml(parent.title)}
            </strong>

            <div>

              ${childItems.map(child => `
                <label>
                  <input
                    type="checkbox"
                    class="property-filter"
                    value="${child.id}">
                  ${escapeHtml(child.title)}
                </label>
              `).join("")}

            </div>

          </div>
        `;

      }).join("")}

    </div>
  `;

}


/* =========================
   ADD PROPERTY
========================= */

propertyForm.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    if (!currentUser) {

      alert(
        "ابتدا وارد حساب مدیر شوید."
      );

      return;
    }

    const title =
      document
        .getElementById("title")
        .value
        .trim();

    const description =
      document
        .getElementById("description")
        .value
        .trim();

    const categoryId =
      categorySelect.value;

    if (!title || !categoryId) {

      alert(
        "عنوان و دسته‌بندی الزامی هستند."
      );

      return;
    }

    const selectedNeighborhoods =
      Array.from(
        neighborhoodSelect.selectedOptions
      )
      .map(option => option.value)
      .filter(Boolean);

    if (!selectedNeighborhoods.length) {

      alert(
        "حداقل یک محله انتخاب کنید."
      );

      return;
    }

    const selectedFilterIds =
      Array.from(
        document.querySelectorAll(
          ".property-filter:checked"
        )
      )
      .map(input => input.value);

    const price =
      document.getElementById("price").value;

    const monthlyRent =
      document.getElementById("monthlyRent").value;

    const deposit =
      document.getElementById("deposit").value;

    const area =
      document.getElementById("area").value;

    const bedrooms =
      document.getElementById("bedrooms").value;

    /* طبقه */
    const floor =
      document.getElementById("floor").value;

    const location =
      document.getElementById("location")
        .value
        .trim();

    const address =
      document.getElementById("address")
        .value
        .trim();

    const property = {

      title,

      description:
        description || null,

      category_id:
        categoryId,

      price:
        price
          ? Number(price)
          : null,

      monthly_rent:
        monthlyRent
          ? Number(monthlyRent)
          : null,

      deposit:
        deposit
          ? Number(deposit)
          : null,

      area:
        area
          ? Number(area)
          : null,

      bedrooms:
        bedrooms
          ? Number(bedrooms)
          : null,

      /* ذخیره طبقه در دیتابیس */
      floor:
        floor
          ? Number(floor)
          : null,

      parking:
        document.getElementById("parking").checked,

      elevator:
        document.getElementById("elevator").checked,

      storage:
        document.getElementById("storage").checked,

      terrace:
        document.getElementById("terrace").checked,

      frontage_type:
        frontageType.value || null,

      address:
        address || null,

      location_text:
        location || null,

      is_active: true

    };

    submitPropertyButton.disabled =
      true;

    submitPropertyButton.textContent =
      "در حال ثبت...";

    propertyMessage.textContent =
      "";

    try {

      const {
        data: insertedProperty,
        error: propertyError
      } = await db
        .from("properties")
        .insert(property)
        .select("id")
        .single();

      if (propertyError) {
        throw propertyError;
      }

      const propertyId =
        insertedProperty.id;

      const neighborhoodRows =
        selectedNeighborhoods.map(
          neighborhoodId => ({
            property_id:
              propertyId,

            neighborhood_id:
              neighborhoodId
          })
        );

      const {
        error: neighborhoodError
      } = await db
        .from("property_neighborhoods")
        .insert(neighborhoodRows);

      if (neighborhoodError) {
        throw neighborhoodError;
      }

      if (selectedFilterIds.length) {

        const filterRows =
          selectedFilterIds.map(
            filterId => ({
              property_id:
                propertyId,

              filter_option_id:
                filterId
            })
          );

        const {
          error: filterError
        } = await db
          .from("property_filters")
          .insert(filterRows);

        if (filterError) {
          throw filterError;
        }

      }

      const files =
        Array.from(
          propertyImages.files || []
        );

      for (
        let index = 0;
        index < files.length;
        index++
      ) {

        const file =
          files[index];

        const extension =
          file.name
            .split(".")
            .pop()
            .toLowerCase();

        const filePath =
          `${propertyId}/${crypto.randomUUID()}.${extension}`;

        const {
          error: uploadError
        } = await db
          .storage
          .from("property-images")
          .upload(
            filePath,
            file,
            {
              cacheControl: "31536000",
              upsert: false
            }
          );

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: publicUrlData
        } =
          db
            .storage
            .from("property-images")
            .getPublicUrl(filePath);

        const imageUrl =
          publicUrlData.publicUrl;

        const {
          error: imageError
        } = await db
          .from("property_images")
          .insert({

            property_id:
              propertyId,

            image_url:
              imageUrl,

            sort_order:
              index

          });

        if (imageError) {
          throw imageError;
        }

      }

      propertyMessage.textContent =
        "فایل ملک با موفقیت ثبت شد.";

      propertyMessage.style.color =
        "green";

      propertyForm.reset();

      propertyFilters.innerHTML =
        "";

      frontageBox.style.display =
        "none";

      await loadProperties();

    } catch (error) {

      console.error(error);

      propertyMessage.textContent =
        "ثبت فایل انجام نشد: " +
        (error.message ||
          "خطای نامشخص");

      propertyMessage.style.color =
        "crimson";

    } finally {

      submitPropertyButton.disabled =
        false;

      submitPropertyButton.textContent =
        "ثبت فایل ملک";

    }

  }
);


/* =========================
   LOAD PROPERTIES
========================= */

async function loadProperties() {

  const {
    data,
    error
  } = await db
    .from("properties")
    .select(`
      id,
      title,
      price,
      monthly_rent,
      deposit,
      area,
      is_active,
      created_at,
      categories(title)
    `)
    .order(
      "created_at",
      {
        ascending: false
      }
    );

  if (error) {

    console.error(error);

    adminProperties.innerHTML =
      "خطا در دریافت فایل‌ها.";

    return;
  }

  if (!data || !data.length) {

    adminProperties.innerHTML =
      `<p>هنوز ملکی ثبت نشده است.`;

    return;
  }

  adminProperties.innerHTML =
    data.map(property => `

      <div
        class="property-card"
        style="margin-top:15px;">

        <div class="property-content">

          <h3>
            ${escapeHtml(
              property.title
            )}
          </h3>

          <div class="property-meta">

            <span>
              ${escapeHtml(
                property.categories?.title || ""
              )}
            </span>

            ${
              property.area
                ? `<span>
                    ${property.area} متر
                   </span>`
                : ""
            }

            ${
              property.price
                ? `<span>
                    ${Number(
                      property.price
                    ).toLocaleString(
                      "fa-IR"
                    )}
                    تومان
                   </span>`
                : ""
            }

          </div>

          <div
            style="margin-top:15px;">

            <button
              class="category-btn"
              onclick="
                toggleProperty(
                  '${property.id}',
                  ${property.is_active}
                )
              ">

              ${
                property.is_active
                  ? "غیرفعال کردن"
                  : "فعال کردن"
              }

            </button>

            <button
              class="category-btn"
              onclick="
                deleteProperty(
                  '${property.id}'
                )
              ">

              حذف

            </button>

          </div>

        </div>

      </div>

    `).join("");

}


/* =========================
   TOGGLE PROPERTY
========================= */

async function toggleProperty(
  id,
  currentStatus
) {

  const {
    error
  } = await db
    .from("properties")
    .update({
      is_active:
        !currentStatus
    })
    .eq("id", id);

  if (error) {

    alert(
      "تغییر وضعیت انجام نشد."
    );

    console.error(error);

    return;
  }

  await loadProperties();

}


/* =========================
   DELETE PROPERTY
========================= */

async function deleteProperty(id) {

  const confirmed =
    confirm(
      "آیا مطمئن هستید که این ملک حذف شود؟"
    );

  if (!confirmed) {
    return;
  }

  const {
    error
  } = await db
    .from("properties")
    .delete()
    .eq("id", id);

  if (error) {

    alert(
      "حذف ملک انجام نشد."
    );

    console.error(error);

    return;
  }

  await loadProperties();

}


/* =========================
   SITE SETTINGS
========================= */

async function loadSettings() {

  const {
    data,
    error
  } = await db
    .from("site_settings")
    .select(
      "setting_key, setting_value"
    );

  if (error) {

    console.error(error);

    return;
  }

  const settings = {};

  (data || []).forEach(item => {

    settings[
      item.setting_key
    ] =
      item.setting_value || "";

  });

  document.getElementById(
    "settingSiteName"
  ).value =
    settings.site_name || "";

  document.getElementById(
    "settingSiteNameEn"
  ).value =
    settings.site_name_en || "";

  document.getElementById(
    "settingFooterSlogan"
  ).value =
    settings.footer_slogan || "";

  document.getElementById(
    "settingAboutText"
  ).value =
    settings.about_text || "";

  document.getElementById(
    "settingPhone1"
  ).value =
    settings.contact_phone_1 || "";

  document.getElementById(
    "settingPhone2"
  ).value =
    settings.contact_phone_2 || "";

  document.getElementById(
    "settingPhone3"
  ).value =
    settings.contact_phone_3 || "";

  document.getElementById(
    "settingInstagram"
  ).value =
    settings.instagram_url || "";

  document.getElementById(
    "settingWhatsapp"
  ).value =
    settings.whatsapp_url || "";

  document.getElementById(
    "settingHero"
  ).value =
    settings.hero_image_url || "";

  document.getElementById(
    "settingLogo"
  ).value =
    settings.logo_url || "";

}


/* =========================
   SAVE SETTINGS
========================= */

settingsForm.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    const settings = {

      site_name:
        document.getElementById(
          "settingSiteName"
        ).value.trim(),

      site_name_en:
        document.getElementById(
          "settingSiteNameEn"
        ).value.trim(),

      footer_slogan:
        document.getElementById(
          "settingFooterSlogan"
        ).value.trim(),

      about_text:
        document.getElementById(
          "settingAboutText"
        ).value.trim(),

      contact_phone_1:
        document.getElementById(
          "settingPhone1"
        ).value.trim(),

      contact_phone_2:
        document.getElementById(
          "settingPhone2"
        ).value.trim(),

      contact_phone_3:
        document.getElementById(
          "settingPhone3"
        ).value.trim(),

      instagram_url:
        document.getElementById(
          "settingInstagram"
        ).value.trim(),

      whatsapp_url:
        document.getElementById(
          "settingWhatsapp"
        ).value.trim(),

      hero_image_url:
        document.getElementById(
          "settingHero"
        ).value.trim(),

      logo_url:
        document.getElementById(
          "settingLogo"
        ).value.trim()

    };

    settingsMessage.textContent =
      "در حال ذخیره...";

    try {

      for (
        const [key, value]
        of Object.entries(settings)
      ) {

        const {
          error
        } = await db
          .from("site_settings")
          .upsert(
            {
              setting_key: key,
              setting_value: value
            },
            {
              onConflict:
                "setting_key"
            }
          );

        if (error) {
          throw error;
        }

      }

      settingsMessage.textContent =
        "تنظیمات با موفقیت ذخیره شد.";

      settingsMessage.style.color =
        "green";

    } catch (error) {

      console.error(error);

      settingsMessage.textContent =
        "ذخیره تنظیمات انجام نشد: " +
        (error.message ||
          "خطای نامشخص");

      settingsMessage.style.color =
        "crimson";

    }

  }
);


/* =========================
   ESCAPE HTML
========================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =========================
   START
========================= */

checkAdmin();
