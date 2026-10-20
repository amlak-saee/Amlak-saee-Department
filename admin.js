
"use strict";

const { createClient } = window.supabase;

const db = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const BUCKET_NAME = "property-images";
const TUS_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/tus-js-client@4/dist/tus.min.js";

const RESUME_STORAGE_PREFIX = "amlak-saee-tus-resume:";

let tusLibraryPromise = null;
let editingPropertyId = null;
let isSavingProperty = false;
let filterOptionsCache = [];
let currentPropertyImages = [];
let allAdminProperties = [];

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function getErrorMessage(error) {
  if (!error) return "خطای نامشخص";
  return error.message || error.error_description || String(error);
}

function setMessage(id, message, isError = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "#c62828" : "#218838";
  element.style.whiteSpace = "pre-wrap";
}

function setAuthMessage(message, isError = false) {
  setMessage("authStatus", message, isError);
}

/* -----------------------------
   ورود و نمایش پنل
----------------------------- */

function showLogin() {
  const login = $("loginSection");
  const panel = $("adminPanel");

  if (login) {
    login.style.display = "block";
    login.hidden = false;
  }

  if (panel) {
    panel.style.display = "none";
    panel.hidden = true;
  }
}

function showAdmin() {
  const login = $("loginSection");
  const panel = $("adminPanel");

  if (login) {
    login.style.display = "none";
    login.hidden = true;
  }

  if (panel) {
    panel.style.display = "block";
    panel.hidden = false;
  }
}

async function getValidSession() {
  const { data, error } = await db.auth.getSession();

  if (error) throw error;

  if (!data?.session?.access_token) {
    throw new Error("ابتدا وارد حساب مدیر شو.");
  }

  return data.session;
}

async function checkAdmin() {
  try {
    const session = await getValidSession();

    const { data, error } = await db
      .from("admin_users")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      showLogin();

      setAuthMessage(
        "این حساب در فهرست مدیران سایت نیست. حساب مدیر را بررسی کن.",
        true
      );

      return false;
    }

    showAdmin();

    if ($("welcomeText")) {
      $("welcomeText").textContent =
        "خوش آمدی " + (session.user.email || "مدیر سایت");
    }

    setAuthMessage("ورود موفق بود.");

    await loadAdminData();

    return true;
  } catch (error) {
    console.error("checkAdmin:", error);

    showLogin();

    if (error.message !== "ابتدا وارد حساب مدیر شو.") {
      setAuthMessage(
        "بررسی ورود انجام نشد: " + getErrorMessage(error),
        true
      );
    }

    return false;
  }
}

async function login(event) {
  if (event) event.preventDefault();

  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  if (!email || !password) {
    setAuthMessage("ایمیل و رمز عبور را وارد کن.", true);
    return;
  }

  const button = $("loginForm")?.querySelector(
    'button[type="submit"]'
  );

  const originalText = button?.textContent;

  if (button) {
    button.disabled = true;
    button.textContent = "در حال ورود...";
  }

  setAuthMessage("در حال بررسی اطلاعات ورود...");

  try {
    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const success = await checkAdmin();

    if (!success) {
      await db.auth.signOut();
      showLogin();
    }
  } catch (error) {
    console.error("login:", error);
    showLogin();

    setAuthMessage(
      "ورود ناموفق بود: " + getErrorMessage(error),
      true
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || "ورود به پنل";
    }
  }
}

async function logout() {
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;

    showLogin();

    if ($("loginPassword")) {
      $("loginPassword").value = "";
    }

    setAuthMessage("از حساب خارج شدی.");
  } catch (error) {
    console.error("logout:", error);

    setMessage(
      "authStatus",
      "خطا در خروج: " + getErrorMessage(error),
      true
    );
  }
}

/* -----------------------------
   بارگذاری اطلاعات پنل
----------------------------- */

async function loadAdminData() {
  const tasks = [
    ["دسته‌بندی‌ها", loadCategories],
    ["محله‌ها", loadNeighborhoods],
    ["گزینه‌های تکمیلی", loadFilterOptions],
    ["فایل‌های ملکی", loadProperties],
    ["تنظیمات سایت", loadSiteSettings]
  ];

  const results = await Promise.allSettled(
    tasks.map(([, task]) => task())
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        "خطا در بارگذاری " + tasks[index][0],
        result.reason
      );
    }
  });
}

/* -----------------------------
   دسته‌بندی‌ها
----------------------------- */

async function loadCategories() {
  try {
    const { data, error } = await db
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const select = $("category");
    if (!select) return;

    const currentValue = select.value;

    select.innerHTML =
      '<option value="">انتخاب دسته‌بندی</option>';

    (data || [])
      .filter((category) => category.is_active !== false)
      .forEach((category) => {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.title;
        select.appendChild(option);
      });

    if (currentValue) {
      select.value = currentValue;
    }

    updateFrontageBox();
    renderFilterOptions(filterOptionsCache);
  } catch (error) {
    console.error("loadCategories:", error);

    setMessage(
      "propertyMessage",
      "خطا در دریافت دسته‌بندی‌ها: " + getErrorMessage(error),
      true
    );
  }
}

function updateFrontageBox() {
  const box = $("frontageBox");
  const select = $("category");

  if (!box || !select) return;

  const selectedText =
    select.options[select.selectedIndex]?.textContent || "";

  const isShop = selectedText.includes("مغازه");

  box.style.display = isShop ? "block" : "none";

  if (!isShop && $("frontageType")) {
    $("frontageType").value = "";
  }
}

/* -----------------------------
   محله‌ها
----------------------------- */

async function loadNeighborhoods() {
  try {
    const { data, error } = await db
      .from("neighborhoods")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;

    renderNeighborhoodList(data || []);
    renderNeighborhoodSelect(data || []);
  } catch (error) {
    console.error("loadNeighborhoods:", error);

    setMessage(
      "neighborhoodMessage",
      "خطا در دریافت محله‌ها: " + getErrorMessage(error),
      true
    );
  }
}

function renderNeighborhoodList(neighborhoods) {
  const container = $("adminNeighborhoods");
  if (!container) return;

  if (!neighborhoods.length) {
    container.innerHTML = "<p>هنوز محله‌ای ثبت نشده است.</p>";
    return;
  }

  container.innerHTML = neighborhoods.map((item) => {
    const active = item.is_active !== false;

    return `
      <div class="admin-item">
        <span>${escapeHtml(item.name)}</span>

        <span>
          <button
            type="button"
            data-action="toggle-neighborhood"
            data-id="${escapeHtml(item.id)}"
            data-active="${String(!active)}">
            ${active ? "غیرفعال‌کردن" : "فعال‌کردن"}
          </button>

          <button
            type="button"
            data-action="delete-neighborhood"
            data-id="${escapeHtml(item.id)}">
            حذف
          </button>
        </span>
      </div>
    `;
  }).join("");
}

function renderNeighborhoodSelect(neighborhoods) {
  const select = $("neighborhood");
  if (!select) return;

  const selectedValues = Array.from(select.selectedOptions)
    .map((option) => option.value);

  select.innerHTML = "";

  neighborhoods
    .filter((item) => item.is_active !== false)
    .forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      select.appendChild(option);
    });

  selectedValues.forEach((id) => {
    const option = Array.from(select.options).find(
      (item) => item.value === id
    );

    if (option) option.selected = true;
  });
}

async function addNeighborhood(event) {
  if (event) event.preventDefault();

  const input = $("neighborhoodName");
  const name = input?.value.trim();

  if (!name) {
    setMessage(
      "neighborhoodMessage",
      "نام محله را وارد کن.",
      true
    );
    return;
  }

  try {
    const { error } = await db
      .from("neighborhoods")
      .insert({ name, is_active: true });

    if (error) throw error;

    if (input) input.value = "";

    setMessage("neighborhoodMessage", "محله اضافه شد.");
    await loadNeighborhoods();
  } catch (error) {
    console.error("addNeighborhood:", error);

    setMessage(
      "neighborhoodMessage",
      "خطا در افزودن محله: " + getErrorMessage(error),
      true
    );
  }
}

async function toggleNeighborhood(id, isActive) {
  try {
    const { error } = await db
      .from("neighborhoods")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) throw error;

    setMessage("neighborhoodMessage", "وضعیت محله تغییر کرد.");
    await loadNeighborhoods();
  } catch (error) {
    console.error("toggleNeighborhood:", error);

    setMessage(
      "neighborhoodMessage",
      "خطا در تغییر وضعیت محله: " + getErrorMessage(error),
      true
    );
  }
}

async function deleteNeighborhood(id) {
  if (!confirm("این محله حذف شود؟")) return;

  try {
    const { error } = await db
      .from("neighborhoods")
      .delete()
      .eq("id", id);

    if (error) throw error;

    setMessage("neighborhoodMessage", "محله حذف شد.");
    await loadNeighborhoods();
  } catch (error) {
    console.error("deleteNeighborhood:", error);

    setMessage(
      "neighborhoodMessage",
      "خطا در حذف محله: " + getErrorMessage(error),
      true
    );
  }
}
/* -----------------------------
   گزینه‌های تکمیلی
----------------------------- */

async function loadFilterOptions() {
  try {
    const { data, error } = await db
      .from("filter_options")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    filterOptionsCache = data || [];
    renderFilterOptions(filterOptionsCache);
  } catch (error) {
    console.error("loadFilterOptions:", error);

    const container = $("propertyFilters");

    if (container) {
      container.textContent =
        "خطا در دریافت گزینه‌ها: " + getErrorMessage(error);
    }
  }
}

function renderFilterOptions(options, selectedIds = []) {
  const container = $("propertyFilters");
  if (!container) return;

  const activeOptions = (options || []).filter(
    (item) => item.is_active !== false
  );

  const categoryId = $("category")?.value;

  const relevantOptions = activeOptions.filter((item) => (
    !item.category_id ||
    !categoryId ||
    String(item.category_id) === String(categoryId)
  ));

  if (!relevantOptions.length) {
    container.innerHTML = "";
    return;
  }

  const selectedSet = new Set(selectedIds.map(String));

  container.innerHTML = `
    <div class="admin-filter-options">
      <label>گزینه‌های تکمیلی ملک</label>

      ${relevantOptions.map((item) => `
        <label class="admin-filter-option">
          <input
            type="checkbox"
            name="propertyFilter"
            value="${escapeHtml(item.id)}"
            ${selectedSet.has(String(item.id)) ? "checked" : ""}
          >
          ${escapeHtml(item.title || "")}
        </label>
      `).join("")}
    </div>
  `;
}

function getSelectedFilterIds() {
  return Array.from(
    document.querySelectorAll(
      '#propertyFilters input[name="propertyFilter"]:checked'
    )
  ).map((input) => input.value);
}

/* -----------------------------
   ابزارهای فرم
----------------------------- */

function getSelectedValues(id) {
  const select = $(id);
  if (!select) return [];

  return Array.from(select.selectedOptions)
    .map((option) => option.value)
    .filter(Boolean);
}

function getInputValue(id) {
  return $(id)?.value ?? "";
}

function setInputValue(id, value) {
  const element = $(id);
  if (element) element.value = value ?? "";
}

function getChecked(id) {
  return Boolean($(id)?.checked);
}

function setChecked(id, value) {
  const element = $(id);
  if (element) element.checked = Boolean(value);
}

function setSelectedValues(id, values) {
  const select = $(id);
  if (!select) return;

  const selectedSet = new Set((values || []).map(String));

  Array.from(select.options).forEach((option) => {
    option.selected = selectedSet.has(String(option.value));
  });
}

/* -----------------------------
   فیلد کد اختصاصی ملک
----------------------------- */

function ensurePropertyCodeField() {
  const form = $("propertyForm");
  if (!form || $("propertyCode")) return;

  const titleInput = $("title");
  const titleLabel = titleInput?.closest("label");

  const wrapper = document.createElement("div");
  wrapper.className = "admin-property-code-field";
  wrapper.style.marginBottom = "12px";

  wrapper.innerHTML = `
    <label for="propertyCode">
      کد اختصاصی ملک
      <input
        type="text"
        id="propertyCode"
        name="property_code"
        inputmode="text"
        autocomplete="off"
        maxlength="50"
        placeholder="مثلاً 107 یا 707"
      >
    </label>
    <small>
      این کد برای جست‌وجوی فایل در پنل مدیریت و نمایش در جزئیات آگهی است.
    </small>
  `;

  if (titleLabel?.parentElement) {
    titleLabel.parentElement.insertBefore(wrapper, titleLabel);
  } else if (titleInput?.parentElement) {
    titleInput.parentElement.insertBefore(wrapper, titleInput);
  } else {
    form.prepend(wrapper);
  }
}

function getPropertyPayload() {
  const title = getInputValue("title").trim();
  const categoryId = getInputValue("category");
  const propertyCode = getInputValue("propertyCode").trim();

  if (!title) throw new Error("عنوان ملک را وارد کن.");
  if (!categoryId) throw new Error("دسته‌بندی ملک را انتخاب کن.");

  const numericValue = (id) => {
    const value = getInputValue(id).trim();

    if (value === "") return null;

    const number = Number(value);

    if (!Number.isFinite(number)) {
      throw new Error("یکی از مقادیر عددی نامعتبر است.");
    }

    return number;
  };

  return {
    title,
    property_code: propertyCode || null,
    description: getInputValue("description").trim(),
    category_id: categoryId,
    price: numericValue("price"),
    deposit: numericValue("deposit"),
    monthly_rent: numericValue("monthlyRent"),
    area: numericValue("area"),
    bedrooms: numericValue("bedrooms"),
    floor: numericValue("floor"),
    location_text: getInputValue("location").trim() || null,
    address: getInputValue("address").trim() || null,
    parking: getChecked("parking"),
    elevator: getChecked("elevator"),
    storage: getChecked("storage"),
    terrace: getChecked("terrace"),
    frontage_type: getInputValue("frontageType") || null
  };
}
/* -----------------------------
   تصاویر قبلی
----------------------------- */

function ensureExistingImagesContainer() {
  let container = $("existingPropertyImages");

  if (container) return container;

  const form = $("propertyForm");
  if (!form) return null;

  container = document.createElement("div");
  container.id = "existingPropertyImages";
  container.className = "admin-existing-images";

  const fileInput = $("propertyImages");

  if (fileInput?.parentElement) {
    fileInput.parentElement.insertAdjacentElement("afterend", container);
  } else {
    form.appendChild(container);
  }

  return container;
}

function getStoragePathFromPublicUrl(url) {
  try {
    const parsed = new URL(url);
    const marker =
      "/storage/v1/object/public/" + BUCKET_NAME + "/";
    const index = parsed.pathname.indexOf(marker);

    if (index === -1) return null;

    return decodeURIComponent(
      parsed.pathname.slice(index + marker.length)
    );
  } catch {
    return null;
  }
}

async function loadExistingPropertyImages(propertyId) {
  const container = ensureExistingImagesContainer();
  if (!container) return;

  container.innerHTML = "<p>در حال دریافت تصاویر قبلی...</p>";

  try {
    const { data, error } = await db
      .from("property_images")
      .select("*")
      .eq("property_id", propertyId)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    currentPropertyImages = data || [];

    if (!currentPropertyImages.length) {
      container.innerHTML = "<p>تصویر قبلی ثبت نشده است.</p>";
      return;
    }

    container.innerHTML = currentPropertyImages.map((image) => `
      <div class="admin-item">
        <a
          href="${escapeHtml(image.image_url)}"
          target="_blank"
          rel="noopener noreferrer">
          مشاهده تصویر
        </a>

        <button
          type="button"
          data-action="delete-property-image"
          data-id="${escapeHtml(image.id)}">
          حذف تصویر
        </button>
      </div>
    `).join("");
  } catch (error) {
    console.error("loadExistingPropertyImages:", error);
    container.textContent =
      "خطا در دریافت تصاویر: " + getErrorMessage(error);
  }
}

async function deleteExistingPropertyImage(imageId) {
  if (!confirm("این تصویر حذف شود؟")) return;

  const image = currentPropertyImages.find(
    (item) => String(item.id) === String(imageId)
  );

  if (!image) return;

  try {
    const { error: rowError } = await db
      .from("property_images")
      .delete()
      .eq("id", imageId);

    if (rowError) throw rowError;

    const path = getStoragePathFromPublicUrl(image.image_url);

    if (path) {
      const { error: storageError } = await db.storage
        .from(BUCKET_NAME)
        .remove([path]);

      if (storageError) {
        console.error("Storage image deletion:", storageError);
      }
    }

    await loadExistingPropertyImages(image.property_id);
    setMessage("propertyMessage", "تصویر حذف شد.");
  } catch (error) {
    console.error("deleteExistingPropertyImage:", error);

    setMessage(
      "propertyMessage",
      "خطا در حذف تصویر: " + getErrorMessage(error),
      true
    );
  }
}

/* -----------------------------
   کتابخانه TUS
----------------------------- */

function loadTusLibrary() {
  if (window.tus?.Upload) {
    return Promise.resolve(window.tus);
  }

  if (tusLibraryPromise) return tusLibraryPromise;

  tusLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TUS_SCRIPT_URL;
    script.async = true;

    script.onload = () => {
      if (window.tus?.Upload) {
        resolve(window.tus);
      } else {
        tusLibraryPromise = null;
        reject(new Error("کتابخانه آپلود بارگذاری نشد."));
      }
    };

    script.onerror = () => {
      tusLibraryPromise = null;
      reject(
        new Error("کتابخانه آپلود دریافت نشد. اینترنت را بررسی کن.")
      );
    };

    document.head.appendChild(script);
  });

  return tusLibraryPromise;
}

function getProjectRef() {
  const url = new URL(window.SUPABASE_URL);
  const parts = url.hostname.split(".");

  if (
    parts.length >= 3 &&
    parts[parts.length - 2] === "supabase" &&
    parts[parts.length - 1] === "co"
  ) {
    return parts[0];
  }

  throw new Error("آدرس پروژه Supabase قابل شناسایی نیست.");
}

function makeUniqueFileName(file) {
  const randomPart =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) +
        Math.random().toString(36).slice(2);

  const originalName = file.name || "";
  const dotIndex = originalName.lastIndexOf(".");
  let extension = "bin";

  if (dotIndex >= 0 && dotIndex < originalName.length - 1) {
    extension = originalName
      .slice(dotIndex + 1)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin";
  }

  return randomPart + "." + extension;
}

/* -----------------------------
   مسیر آپلود
----------------------------- */

function getResumablePathKey(propertyId, file) {
  const identity = [
    propertyId,
    file.name,
    file.size,
    file.lastModified || 0,
    file.type || ""
  ].map((part) => String(part)).join("|");

  return RESUME_STORAGE_PREFIX + identity;
}

function getOrCreateResumableFilePath(propertyId, file) {
  const key = getResumablePathKey(propertyId, file);

  try {
    const savedPath = localStorage.getItem(key);

    if (savedPath) return savedPath;

    const newPath =
      `${propertyId}/${makeUniqueFileName(file)}`;

    localStorage.setItem(key, newPath);

    return newPath;
  } catch (error) {
    console.error("Resume path storage:", error);

    throw new Error(
      "ذخیره مسیر آپلود در مرورگر ممکن نشد. فضای ذخیره‌سازی مرورگر را بررسی کن."
    );
  }
}

function clearResumableFilePath(propertyId, file) {
  try {
    localStorage.removeItem(
      getResumablePathKey(propertyId, file)
    );
  } catch (error) {
    console.error("Resume path cleanup:", error);
  }
}

/* -----------------------------
   آپلود تصاویر
   روش فعلی حفظ شده است
----------------------------- */

async function uploadFileWithTus(file, filePath, session, onProgress) {
  try {
    const MAX_IMAGE_SIZE = 950 * 1024;

    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(
        "حجم عکس بیشتر از ۹۵۰ کیلوبایت است. لطفاً عکس کم‌حجم‌تری انتخاب کن."
      );
    }

    if (typeof onProgress === "function") {
      onProgress(0);
    }

    const { data, error } = await db.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: "31536000",
        contentType: file.type || "application/octet-stream",
        upsert: true
      });

    if (error) {
      throw new Error(error.message || "آپلود عکس ناموفق بود.");
    }

    if (typeof onProgress === "function") {
      onProgress(100);
    }

    return data;
  } catch (error) {
    throw new Error(
      `آپلود عکس «${file.name}» ناموفق بود: ${getErrorMessage(error)}`
    );
  }
}

function getSelectedFiles() {
  return Array.from($("propertyImages")?.files || []);
}

async function uploadNewPropertyImages(propertyId) {
  const files = getSelectedFiles();

  if (!files.length) {
    return { uploaded: 0, failed: 0 };
  }

  const { data: existing, error: existingError } = await db
    .from("property_images")
    .select("sort_order")
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (existingError) throw existingError;

  let sortOrder = existing?.length
    ? Number(existing[0].sort_order) || 0
    : 0;

  const session = await getValidSession();
  let uploaded = 0;
  const errors = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];

    let filePath;

    try {
      filePath = getOrCreateResumableFilePath(propertyId, file);

      setMessage(
        "propertyMessage",
        `در حال آپلود تصویر ${index + 1} از ${files.length}: ${file.name}`
      );

      await uploadFileWithTus(
        file,
        filePath,
        session,
        (percent) => {
          setMessage(
            "propertyMessage",
            `تصویر ${index + 1} از ${files.length}: ${percent}%`
          );
        }
      );

      const { data: urlData } = db.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      const imageUrl = urlData?.publicUrl;

      if (!imageUrl) {
        errors.push(
          `${file.name}: نشانی تصویر ساخته نشد. مسیر: ${filePath}`
        );
        continue;
      }

      const { error: insertError } = await db
        .from("property_images")
        .insert({
          property_id: propertyId,
          image_url: imageUrl,
          sort_order: ++sortOrder
        });

      if (insertError) {
        errors.push(
          `${file.name}: تصویر آپلود شد، اما ثبت در دیتابیس انجام نشد. ` +
          `مسیر: ${filePath}. خطا: ${getErrorMessage(insertError)}`
        );

        console.error("Image database insert failed:", insertError);
        continue;
      }

      uploaded++;
      clearResumableFilePath(propertyId, file);
    } catch (error) {
      errors.push(`${file.name}: ${getErrorMessage(error)}`);
      console.error("Image upload failed:", error);
    }
  }

  if (errors.length) {
    throw new Error(
      `تعداد تصاویر ثبت‌شده: ${uploaded}\n${errors.join("\n")}`
    );
  }

  return { uploaded, failed: 0 };
}

/* -----------------------------
   ثبت و ویرایش ملک
----------------------------- */

async function saveProperty(event) {
  if (event) event.preventDefault();
  if (isSavingProperty) return;

  isSavingProperty = true;

  const button = $("submitPropertyButton");
  const originalText = button?.textContent;

  if (button) {
    button.disabled = true;
    button.textContent = "در حال ذخیره...";
  }

  try {
    const payload = getPropertyPayload();
    const neighborhoodIds = getSelectedValues("neighborhood");
    const filterIds = getSelectedFilterIds();

    let propertyId = editingPropertyId;

    if (propertyId) {
      const { error } = await db
        .from("properties")
        .update(payload)
        .eq("id", propertyId);

      if (error) throw error;
    } else {
      const { data, error } = await db
        .from("properties")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;

      propertyId = data.id;
    }

    const { error: deleteNeighborhoodsError } = await db
      .from("property_neighborhoods")
      .delete()
      .eq("property_id", propertyId);

    if (deleteNeighborhoodsError) {
      throw deleteNeighborhoodsError;
    }

    if (neighborhoodIds.length) {
      const rows = neighborhoodIds.map((neighborhoodId) => ({
        property_id: propertyId,
        neighborhood_id: neighborhoodId
      }));

      const { error } = await db
        .from("property_neighborhoods")
        .insert(rows);

      if (error) throw error;
    }

    const { error: deleteFiltersError } = await db
      .from("property_filters")
      .delete()
      .eq("property_id", propertyId);

    if (deleteFiltersError) throw deleteFiltersError;

    if (filterIds.length) {
      const rows = filterIds.map((filterId) => ({
        property_id: propertyId,
        filter_option_id: filterId
      }));

      const { error } = await db
        .from("property_filters")
        .insert(rows);

      if (error) throw error;
    }

    const uploadResult =
      await uploadNewPropertyImages(propertyId);

    resetPropertyForm();

    setMessage(
      "propertyMessage",
      `ملک ذخیره شد. تعداد تصاویر جدید: ${uploadResult.uploaded}.`
    );

    await loadProperties();
  } catch (error) {
    console.error("saveProperty:", error);

    let message = getErrorMessage(error);

    if (
      message.toLowerCase().includes("property_code") &&
      (
        message.toLowerCase().includes("duplicate") ||
        message.toLowerCase().includes("unique")
      )
    ) {
      message = "این کد ملک قبلاً استفاده شده است. کد دیگری وارد کن.";
    }

    setMessage(
      "propertyMessage",
      "خطا در ذخیره ملک: " + message,
      true
    );
  } finally {
    isSavingProperty = false;

    if (button) {
      button.disabled = false;
      button.textContent = originalText || "ثبت فایل ملک";
    }
  }
}

function resetPropertyForm() {
  $("propertyForm")?.reset();

  editingPropertyId = null;
  currentPropertyImages = [];

  if ($("submitPropertyButton")) {
    $("submitPropertyButton").textContent = "ثبت فایل ملک";
  }

  const container = ensureExistingImagesContainer();

  if (container) container.innerHTML = "";

  renderFilterOptions(filterOptionsCache);

  const cancelButton = $("cancelEditButton");

  if (cancelButton) {
    cancelButton.style.display = "none";
  }

  updateFrontageBox();
  setMessage("propertyMessage", "");
}

function ensureCancelEditButton() {
  const form = $("propertyForm");

  if (!form || $("cancelEditButton")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "cancelEditButton";
  button.className = "category-btn";
  button.textContent = "لغو ویرایش";
  button.style.display = "none";

  button.addEventListener("click", resetPropertyForm);
  form.appendChild(button);
}

/* -----------------------------
   جست‌وجوی فایل‌ها
----------------------------- */

function ensurePropertySearch() {
  const container = $("adminProperties");
  if (!container || $("adminPropertySearch")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "adminPropertySearchWrapper";
  wrapper.style.margin = "12px 0";

  wrapper.innerHTML = `
    <label for="adminPropertySearch">
      جست‌وجو در فایل‌های ملکی
    </label>
    <input
      type="search"
      id="adminPropertySearch"
      placeholder="کد، عنوان، توضیحات، آدرس یا محله..."
      autocomplete="off"
      style="width:100%;box-sizing:border-box;margin-top:6px;"
    >
    <p id="adminPropertySearchCount" aria-live="polite"></p>
  `;

  container.parentElement?.insertBefore(wrapper, container);

  $("adminPropertySearch")?.addEventListener("input", () => {
    renderAdminProperties();
  });
}

function getPropertySearchText(property) {
  const neighborhoodNames = (property.neighborhoods || [])
    .map((item) => item.name || "")
    .join(" ");

  return [
    property.property_code,
    property.title,
    property.description,
    property.address,
    property.location_text,
    property.categories?.title,
    neighborhoodNames
  ].join(" ").toLocaleLowerCase("fa");
}

function renderAdminProperties() {
  const container = $("adminProperties");
  if (!container) return;

  const query = ($("adminPropertySearch")?.value || "")
    .trim()
    .toLocaleLowerCase("fa");

  const filtered = allAdminProperties.filter((property) => {
    if (!query) return true;

    return getPropertySearchText(property).includes(query);
  });

  const count = $("adminPropertySearchCount");

  if (count) {
    count.textContent =
      `نمایش ${filtered.length} از ${allAdminProperties.length} فایل`;
  }

  if (!filtered.length) {
    container.innerHTML = query
      ? "<p>فایلی با این مشخصات پیدا نشد.</p>"
      : "<p>هنوز ملکی ثبت نشده است.</p>";
    return;
  }

  container.innerHTML = filtered.map((property) => {
    const active = property.is_active !== false;

    return `
      <div class="admin-item">
        <div>
          <strong>${escapeHtml(property.title)}</strong>
          <div>${escapeHtml(property.categories?.title || "")}</div>
          <div>${active ? "فعال" : "غیرفعال"}</div>
          ${property.property_code
            ? `<div>کد: ${escapeHtml(property.property_code)}</div>`
            : ""}
          ${property.location_text
            ? `<div>${escapeHtml(property.location_text)}</div>`
            : ""}
        </div>

        <div>
          <button
            type="button"
            data-action="edit-property"
            data-id="${escapeHtml(property.id)}">
            ویرایش
          </button>

          <button
            type="button"
            data-action="toggle-property"
            data-id="${escapeHtml(property.id)}"
            data-active="${String(!active)}">
            ${active ? "غیرفعال‌کردن" : "فعال‌کردن"}
          </button>

          <button
            type="button"
            data-action="delete-property"
            data-id="${escapeHtml(property.id)}">
            حذف
          </button>
        </div>
      </div>
    `;
  }).join("");
}

async function loadProperties() {
  const container = $("adminProperties");
  if (!container) return;

  ensurePropertySearch();
  container.textContent = "در حال دریافت فایل‌ها...";

  try {
    const { data, error } = await db
      .from("properties")
      .select("*, categories(title)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const properties = data || [];

    const ids = properties.map((property) => property.id);
    const neighborhoodMap = new Map();

    if (ids.length) {
      const { data: links, error: linksError } = await db
        .from("property_neighborhoods")
        .select("property_id, neighborhoods(name)")
        .in("property_id", ids);

      if (linksError) throw linksError;

      (links || []).forEach((link) => {
        if (!neighborhoodMap.has(link.property_id)) {
          neighborhoodMap.set(link.property_id, []);
        }

        if (link.neighborhoods?.name) {
          neighborhoodMap.get(link.property_id).push(
            link.neighborhoods
          );
        }
      });
    }

    allAdminProperties = properties.map((property) => ({
      ...property,
      neighborhoods: neighborhoodMap.get(property.id) || []
    }));

    renderAdminProperties();
  } catch (error) {
    console.error("loadProperties:", error);

    container.textContent =
      "خطا در دریافت فایل‌ها: " + getErrorMessage(error);
  }
}
/* -----------------------------
   ویرایش ملک
----------------------------- */

async function editProperty(id) {
  try {
    setMessage("propertyMessage", "در حال دریافت اطلاعات ملک...");

    const { data: property, error } = await db
      .from("properties")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    editingPropertyId = id;

    ensurePropertyCodeField();

    setInputValue("propertyCode", property.property_code);
    setInputValue("title", property.title);
    setInputValue("description", property.description);
    setInputValue("category", property.category_id);
    setInputValue("price", property.price);
    setInputValue("deposit", property.deposit);
    setInputValue("monthlyRent", property.monthly_rent);
    setInputValue("area", property.area);
    setInputValue("bedrooms", property.bedrooms);
    setInputValue("floor", property.floor);
    setInputValue("location", property.location_text);
    setInputValue("address", property.address);
    setInputValue("frontageType", property.frontage_type);

    setChecked("parking", property.parking);
    setChecked("elevator", property.elevator);
    setChecked("storage", property.storage);
    setChecked("terrace", property.terrace);

    updateFrontageBox();

    const {
      data: neighborhoodRows,
      error: neighborhoodError
    } = await db
      .from("property_neighborhoods")
      .select("neighborhood_id")
      .eq("property_id", id);

    if (neighborhoodError) throw neighborhoodError;

    setSelectedValues(
      "neighborhood",
      (neighborhoodRows || []).map((item) => item.neighborhood_id)
    );

    const { data: filterRows, error: filterError } = await db
      .from("property_filters")
      .select("filter_option_id")
      .eq("property_id", id);

    if (filterError) throw filterError;

    renderFilterOptions(
      filterOptionsCache,
      (filterRows || []).map((item) => item.filter_option_id)
    );

    ensureCancelEditButton();

    if ($("cancelEditButton")) {
      $("cancelEditButton").style.display = "block";
    }

    if ($("submitPropertyButton")) {
      $("submitPropertyButton").textContent = "ذخیره تغییرات";
    }

    await loadExistingPropertyImages(id);

    setMessage("propertyMessage", "اطلاعات ملک آماده ویرایش است.");

    $("propertyForm")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    console.error("editProperty:", error);

    setMessage(
      "propertyMessage",
      "خطا در دریافت اطلاعات ملک: " + getErrorMessage(error),
      true
    );
  }
}

/* -----------------------------
   فعال و غیرفعال‌کردن ملک
----------------------------- */

async function toggleProperty(id, isActive) {
  try {
    const { error } = await db
      .from("properties")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) throw error;

    await loadProperties();
  } catch (error) {
    console.error("toggleProperty:", error);

    alert("خطا در تغییر وضعیت ملک: " + getErrorMessage(error));
  }
}

/* -----------------------------
   حذف ملک و تصاویر آن
----------------------------- */

async function deleteProperty(id) {
  if (!confirm("این ملک حذف شود؟ این کار قابل بازگشت نیست.")) {
    return;
  }

  try {
    const { data: images, error: imagesError } = await db
      .from("property_images")
      .select("image_url")
      .eq("property_id", id);

    if (imagesError) throw imagesError;

    const paths = (images || [])
      .map((image) => getStoragePathFromPublicUrl(image.image_url))
      .filter(Boolean);

    if (paths.length) {
      const { error: storageError } = await db.storage
        .from(BUCKET_NAME)
        .remove(paths);

      if (storageError) {
        console.error("Storage cleanup:", storageError);
      }
    }

    for (const table of [
      "property_images",
      "property_neighborhoods",
      "property_filters"
    ]) {
      const { error } = await db
        .from(table)
        .delete()
        .eq("property_id", id);

      if (error) throw error;
    }

    const { error } = await db
      .from("properties")
      .delete()
      .eq("id", id);

    if (error) throw error;

    setMessage("propertyMessage", "ملک حذف شد.");
    await loadProperties();
  } catch (error) {
    console.error("deleteProperty:", error);

    alert("خطا در حذف ملک: " + getErrorMessage(error));
  }
}

/* -----------------------------
   تنظیمات سایت
----------------------------- */

const SITE_SETTING_FIELDS = [
  ["site_name", "settingSiteName"],
  ["site_name_en", "settingSiteNameEn"],
  ["footer_slogan", "settingFooterSlogan"],
  ["about", "settingAboutText"],
  ["phone1", "settingPhone1"],
  ["phone2", "settingPhone2"],
  ["phone3", "settingPhone3"],
  ["instagram", "settingInstagram"],
  ["whatsapp", "settingWhatsapp"],
  ["hero", "settingHero"],
  ["logo", "settingLogo"]
];

async function loadSiteSettings() {
  try {
    const { data, error } = await db
      .from("site_settings")
      .select("*");

    if (error) throw error;

    const settings = {};

    (data || []).forEach((item) => {
      settings[item.key] = item.value;
    });

    SITE_SETTING_FIELDS.forEach(([key, id]) => {
      setInputValue(id, settings[key] || "");
    });
  } catch (error) {
    console.error("loadSiteSettings:", error);

    setMessage(
      "settingsMessage",
      "خطا در دریافت تنظیمات: " + getErrorMessage(error),
      true
    );
  }
}

async function saveSiteSettings(event) {
  if (event) event.preventDefault();

  try {
    setMessage("settingsMessage", "در حال ذخیره تنظیمات...");

    for (const [key, id] of SITE_SETTING_FIELDS) {
      const value = getInputValue(id).trim();

      const { error } = await db
        .from("site_settings")
        .upsert({ key, value }, { onConflict: "key" });

      if (error) throw error;
    }

    setMessage("settingsMessage", "تنظیمات ذخیره شد.");
  } catch (error) {
    console.error("saveSiteSettings:", error);

    setMessage(
      "settingsMessage",
      "خطا در ذخیره تنظیمات: " + getErrorMessage(error),
      true
    );
  }
}

/* -----------------------------
   اتصال رویدادها
----------------------------- */

function setupAdminEvents() {
  ensureCancelEditButton();
  ensurePropertyCodeField();
  ensurePropertySearch();

  $("loginForm")?.addEventListener("submit", login);
  $("logoutButton")?.addEventListener("click", logout);
  $("propertyForm")?.addEventListener("submit", saveProperty);

  $("category")?.addEventListener("change", () => {
    updateFrontageBox();
    renderFilterOptions(filterOptionsCache);
  });

  $("neighborhoodForm")?.addEventListener("submit", addNeighborhood);
  $("settingsForm")?.addEventListener("submit", saveSiteSettings);

  $("adminNeighborhoods")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;

    if (button.dataset.action === "toggle-neighborhood") {
      toggleNeighborhood(id, button.dataset.active === "true");
    }

    if (button.dataset.action === "delete-neighborhood") {
      deleteNeighborhood(id);
    }
  });

  $("adminProperties")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;

    if (button.dataset.action === "edit-property") {
      editProperty(id);
    }

    if (button.dataset.action === "toggle-property") {
      toggleProperty(id, button.dataset.active === "true");
    }

    if (button.dataset.action === "delete-property") {
      deleteProperty(id);
    }
  });

  ensureExistingImagesContainer()?.addEventListener("click", (event) => {
    const button = event.target.closest(
      'button[data-action="delete-property-image"]'
    );

    if (button) {
      deleteExistingPropertyImage(button.dataset.id);
    }
  });
}

/* -----------------------------
   شروع صفحه
----------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
  showLogin();
  setAuthMessage("در حال بررسی وضعیت ورود...");

  if (
    !window.SUPABASE_URL ||
    !window.SUPABASE_ANON_KEY ||
    !window.supabase
  ) {
    setAuthMessage(
      "تنظیمات Supabase بارگذاری نشده است. فایل supabase-config.js را بررسی کن.",
      true
    );
    return;
  }

  setupAdminEvents();

  try {
    await checkAdmin();
  } catch (error) {
    console.error("راه‌اندازی پنل:", error);

    showLogin();

    setAuthMessage(
      "خطا در راه‌اندازی پنل: " + getErrorMessage(error),
      true
    );
  }
});
