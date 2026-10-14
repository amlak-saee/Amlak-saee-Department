const { createClient } = supabase;

const db = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const BUCKET_NAME = "property-images";
const TUS_SCRIPT_URL =
  "https://cdn.jsdelivr.net/npm/tus-js-client@4/dist/tus.min.js";

let tusLibraryPromise = null;
let editingPropertyId = null;
let propertyImagesToDelete = [];
let isSavingProperty = false;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[char];
  });
}

function setMessage(id, message, isError = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "#c62828" : "#218838";
}

function getErrorMessage(error) {
  if (!error) return "خطای نامشخص";
  return error.message || error.error_description || String(error);
}

function getProjectRef() {
  const url = new URL(window.SUPABASE_URL);
  const hostParts = url.hostname.split(".");

  if (
    hostParts.length >= 3 &&
    hostParts[hostParts.length - 2] === "supabase" &&
    hostParts[hostParts.length - 1] === "co"
  ) {
    return hostParts[0];
  }

  throw new Error(
    "آدرس پروژه Supabase قابل شناسایی نیست. تنظیمات supabase-config.js را بررسی کن."
  );
}

function loadTusLibrary() {
  if (window.tus && window.tus.Upload) {
    return Promise.resolve(window.tus);
  }

  if (tusLibraryPromise) {
    return tusLibraryPromise;
  }

  tusLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TUS_SCRIPT_URL;
    script.async = true;

    script.onload = () => {
      if (window.tus && window.tus.Upload) {
        resolve(window.tus);
      } else {
        tusLibraryPromise = null;
        reject(new Error("کتابخانه آپلود فایل بارگذاری نشد."));
      }
    };

    script.onerror = () => {
      tusLibraryPromise = null;
      reject(
        new Error(
          "بارگذاری کتابخانه آپلود ناموفق بود. اتصال اینترنت را بررسی کن."
        )
      );
    };

    document.head.appendChild(script);
  });

  return tusLibraryPromise;
}

async function getValidSession() {
  const { data, error } = await db.auth.getSession();

  if (error) throw error;

  const session = data?.session;

  if (!session?.access_token) {
    throw new Error("نشست ورود منقضی شده است. دوباره وارد پنل شو.");
  }

  return session;
}

async function checkAdmin() {
  try {
    const session = await getValidSession();

    const { data, error } = await db
      .from("admin_users")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      showLogin();
      setMessage(
        "loginMessage",
        "این حساب اجازه مدیریت سایت را ندارد.",
        true
      );
      return false;
    }

    showAdmin();
    await loadAdminData();
    return true;
  } catch (error) {
    console.error("checkAdmin:", error);
    showLogin();
    return false;
  }
}

function showLogin() {
  if ($("loginSection")) $("loginSection").style.display = "";
  if ($("adminSection")) $("adminSection").style.display = "none";
}

function showAdmin() {
  if ($("loginSection")) $("loginSection").style.display = "none";
  if ($("adminSection")) $("adminSection").style.display = "";
}

async function login() {
  const email = $("loginEmail")?.value.trim();
  const password = $("loginPassword")?.value;

  if (!email || !password) {
    setMessage("loginMessage", "ایمیل و رمز عبور را وارد کن.", true);
    return;
  }

  setMessage("loginMessage", "در حال ورود...");

  try {
    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const success = await checkAdmin();

    if (success) {
      setMessage("loginMessage", "");
    }
  } catch (error) {
    console.error("login:", error);
    setMessage(
      "loginMessage",
      "ورود ناموفق بود: " + getErrorMessage(error),
      true
    );
  }
}

async function logout() {
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error("logout:", error);
  }

  showLogin();
}

async function loadAdminData() {
  await Promise.allSettled([
    loadCategories(),
    loadNeighborhoods(),
    loadFilterOptions(),
    loadProperties(),
    loadSiteSettings()
  ]);
}

async function loadCategories() {
  try {
    const { data, error } = await db
      .from("categories")
      .select("*")
      .order("id");

    if (error) throw error;

    const select = $("category");
    if (!select) return;

    const currentValue = select.value;

    select.innerHTML = '<option value="">انتخاب دسته‌بندی</option>';

    (data || []).forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      select.appendChild(option);
    });

    if (currentValue) select.value = currentValue;
  } catch (error) {
    console.error("loadCategories:", error);
    setMessage(
      "propertyMessage",
      "خطا در دریافت دسته‌بندی‌ها: " + getErrorMessage(error),
      true
    );
  }
}

async function loadNeighborhoods() {
  try {
    const { data, error } = await db
      .from("neighborhoods")
      .select("*")
      .order("name");

    if (error) throw error;

    renderNeighborhoods(data || []);
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

function renderNeighborhoods(neighborhoods) {
  const container = $("neighborhoodList");
  if (!container) return;

  if (!neighborhoods.length) {
    container.innerHTML = "<p>هنوز محله‌ای ثبت نشده است.</p>";
    return;
  }

  container.innerHTML = neighborhoods
    .map(
      (neighborhood) => `
        <div class="admin-item">
          <span>${escapeHtml(neighborhood.name)}</span>
          <span>
            <button type="button"
              onclick="toggleNeighborhood('${neighborhood.id}', ${!neighborhood.is_active})">
              ${neighborhood.is_active ? "غیرفعال‌کردن" : "فعال‌کردن"}
            </button>
            <button type="button"
              onclick="deleteNeighborhood('${neighborhood.id}')">
              حذف
            </button>
          </span>
        </div>
      `
    )
    .join("");
}

function renderNeighborhoodSelect(neighborhoods) {
  const select = $("neighborhoods");
  if (!select) return;

  const selected = Array.from(select.selectedOptions).map(
    (option) => option.value
  );

  select.innerHTML = "";

  neighborhoods
    .filter((neighborhood) => neighborhood.is_active)
    .forEach((neighborhood) => {
      const option = document.createElement("option");
      option.value = neighborhood.id;
      option.textContent = neighborhood.name;
      select.appendChild(option);
    });

  selected.forEach((id) => {
    const option = Array.from(select.options).find(
      (item) => item.value === id
    );
    if (option) option.selected = true;
  });
}

async function addNeighborhood() {
  const input = $("newNeighborhood");
  const name = input?.value.trim();

  if (!name) {
    setMessage("neighborhoodMessage", "نام محله را وارد کن.", true);
    return;
  }

  try {
    const { error } = await db.from("neighborhoods").insert({
      name,
      is_active: true
    });

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

async function loadFilterOptions() {
  try {
    const { data, error } = await db
      .from("filter_options")
      .select("*")
      .order("sort_order");

    if (error) throw error;

    renderFilterOptions(data || []);
  } catch (error) {
    console.error("loadFilterOptions:", error);
    setMessage(
      "filterMessage",
      "خطا در دریافت گزینه‌ها: " + getErrorMessage(error),
      true
    );
  }
}

function renderFilterOptions(options) {
  const container = $("filterOptionsList");
  if (!container) return;

  if (!options.length) {
    container.innerHTML = "<p>هنوز گزینه‌ای ثبت نشده است.</p>";
    return;
  }

  container.innerHTML = options
    .map(
      (option) => `
        <div class="admin-item">
          <span>${escapeHtml(option.label || option.value)}</span>
          <span>
            <button type="button"
              onclick="toggleFilterOption('${option.id}', ${!option.is_active})">
              ${option.is_active ? "غیرفعال‌کردن" : "فعال‌کردن"}
            </button>
            <button type="button"
              onclick="deleteFilterOption('${option.id}')">
              حذف
            </button>
          </span>
        </div>
      `
    )
    .join("");
}

async function addFilterOption() {
  const label = $("newFilterLabel")?.value.trim();
  const value = $("newFilterValue")?.value.trim();
  const categoryId = $("newFilterCategory")?.value || null;
  const parentId = $("newFilterParent")?.value || null;

  if (!label || !value) {
    setMessage("filterMessage", "عنوان و مقدار گزینه را وارد کن.", true);
    return;
  }

  try {
    const { error } = await db.from("filter_options").insert({
      label,
      value,
      category_id: categoryId,
      parent_id: parentId,
      is_active: true
    });

    if (error) throw error;

    if ($("newFilterLabel")) $("newFilterLabel").value = "";
    if ($("newFilterValue")) $("newFilterValue").value = "";

    setMessage("filterMessage", "گزینه اضافه شد.");
    await loadFilterOptions();
  } catch (error) {
    console.error("addFilterOption:", error);
    setMessage(
      "filterMessage",
      "خطا در افزودن گزینه: " + getErrorMessage(error),
      true
    );
  }
}

async function toggleFilterOption(id, isActive) {
  try {
    const { error } = await db
      .from("filter_options")
      .update({ is_active: isActive })
      .eq("id", id);

    if (error) throw error;

    await loadFilterOptions();
  } catch (error) {
    console.error("toggleFilterOption:", error);
    setMessage(
      "filterMessage",
      "خطا در تغییر وضعیت: " + getErrorMessage(error),
      true
    );
  }
}

async function deleteFilterOption(id) {
  if (!confirm("این گزینه حذف شود؟")) return;

  try {
    const { error } = await db
      .from("filter_options")
      .delete()
      .eq("id", id);

    if (error) throw error;

    await loadFilterOptions();
  } catch (error) {
    console.error("deleteFilterOption:", error);
    setMessage(
      "filterMessage",
      "خطا در حذف گزینه: " + getErrorMessage(error),
      true
    );
  }
}

function getSelectedValues(selectId) {
  const select = $(selectId);
  if (!select) return [];

  return Array.from(select.selectedOptions)
    .map((option) => option.value)
    .filter(Boolean);
}

function getChecked(id) {
  return Boolean($(id)?.checked);
}

function getInputValue(id) {
  return $(id)?.value ?? "";
}

function setInputValue(id, value) {
  const element = $(id);
  if (element) element.value = value ?? "";
}

function setChecked(id, value) {
  const element = $(id);
  if (element) element.checked = Boolean(value);
}

function setSelectedValues(id, values) {
  const select = $(id);
  if (!select) return;

  const set = new Set((values || []).map(String));

  Array.from(select.options).forEach((option) => {
    option.selected = set.has(String(option.value));
  });
}

function resetPropertyForm() {
  const form = $("propertyForm");

  if (form) form.reset();

  editingPropertyId = null;
  propertyImagesToDelete = [];

  if ($("propertyId")) $("propertyId").value = "";

  const submitButton = $("propertySubmit");
  if (submitButton) submitButton.textContent = "ثبت ملک";

  const cancelButton = $("cancelEditButton");
  if (cancelButton) cancelButton.style.display = "none";

  const existingImages = $("existingPropertyImages");
  if (existingImages) existingImages.innerHTML = "";

  setMessage("propertyMessage", "");
}

function ensureCancelEditButton() {
  const form = $("propertyForm");
  if (!form || $("cancelEditButton")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "cancelEditButton";
  button.textContent = "لغو ویرایش";
  button.style.display = "none";
  button.addEventListener("click", resetPropertyForm);

  form.appendChild(button);
}

async function loadExistingPropertyImages(propertyId) {
  const container = $("existingPropertyImages");
  if (!container) return;

  container.innerHTML = "<p>در حال دریافت تصاویر قبلی...</p>";

  try {
    const { data, error } = await db
      .from("property_images")
      .select("*")
      .eq("property_id", propertyId)
      .order("sort_order");

    if (error) throw error;

    if (!data?.length) {
      container.innerHTML = "<p>تصویر قبلی ثبت نشده است.</p>";
      return;
    }

    container.innerHTML = data
      .map(
        (image) => `
          <div class="admin-item">
            <a href="${escapeHtml(image.image_url)}"
               target="_blank" rel="noopener noreferrer">
              مشاهده تصویر
            </a>
            <button type="button"
              onclick="deleteExistingPropertyImage('${image.id}', '${propertyId}', '${escapeHtml(image.image_url)}')">
              حذف تصویر
            </button>
          </div>
        `
      )
      .join("");
  } catch (error) {
    console.error("loadExistingPropertyImages:", error);
    container.innerHTML =
      "<p>خطا در دریافت تصاویر: " +
      escapeHtml(getErrorMessage(error)) +
      "</p>";
  }
}

function getStoragePathFromPublicUrl(url) {
  try {
    const parsed = new URL(url);
    const marker = "/storage/v1/object/public/" + BUCKET_NAME + "/";
    const index = parsed.pathname.indexOf(marker);

    if (index === -1) return null;

    return decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

async function deleteExistingPropertyImage(imageId, propertyId, imageUrl) {
  if (!confirm("این تصویر حذف شود؟")) return;

  try {
    const { error: rowError } = await db
      .from("property_images")
      .delete()
      .eq("id", imageId);

    if (rowError) throw rowError;

    const path = getStoragePathFromPublicUrl(imageUrl);

    if (path) {
      const { error: storageError } = await db.storage
        .from(BUCKET_NAME)
        .remove([path]);

      if (storageError) {
        console.error("Storage delete failed:", storageError);
      }
    }

    await loadExistingPropertyImages(propertyId);
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

function getSelectedFiles() {
  return Array.from($("propertyImages")?.files || []);
}

function getFileExtension(file) {
  const name = file.name || "";
  const dotIndex = name.lastIndexOf(".");

  if (dotIndex >= 0 && dotIndex < name.length - 1) {
    return name.slice(dotIndex + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  const mime = (file.type || "").toLowerCase();

  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/heic") return "heic";
  if (mime === "image/heif") return "heif";

  return "bin";
}

function makeUniqueFileName(file) {
  const randomPart =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);

  return randomPart + "." + getFileExtension(file);
}

function uploadFileWithTus(file, filePath, session, progressCallback) {
  return new Promise(async (resolve, reject) => {
    try {
      const tus = await loadTusLibrary();
      const projectRef = getProjectRef();

      const endpoint =
        `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;

      const upload = new tus.Upload(file, {
        endpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000, 30000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: window.SUPABASE_ANON_KEY,
          "x-upsert": "false"
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: BUCKET_NAME,
          objectName: filePath,
          contentType: file.type || "application/octet-stream",
          cacheControl: "31536000"
        },
        onError(error) {
          reject(
            new Error(
              `آپلود «${file.name}» ناموفق بود: ${getErrorMessage(error)}`
            )
          );
        },
        onProgress(bytesUploaded, bytesTotal) {
          if (typeof progressCallback === "function") {
            const percent =
              bytesTotal > 0
                ? Math.round((bytesUploaded / bytesTotal) * 100)
                : 0;

            progressCallback(percent);
          }
        },
        onSuccess() {
          resolve();
        }
      });

      upload.start();
    } catch (error) {
      reject(error);
    }
  });
}

async function uploadNewPropertyImages(propertyId) {
  const files = getSelectedFiles();

  if (!files.length) return { uploaded: 0, failed: 0 };

  let currentSortOrder = 0;

  const { data: existingImages, error: existingError } = await db
    .from("property_images")
    .select("sort_order")
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (existingError) throw existingError;

  if (existingImages?.length) {
    currentSortOrder = Number(existingImages[0].sort_order) || 0;
  }

  const session = await getValidSession();

  let uploaded = 0;
  let failed = 0;
  const errors = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const filePath = `${propertyId}/${makeUniqueFileName(file)}`;

    try {
      setMessage(
        "propertyMessage",
        `در حال آپلود تصویر ${index + 1} از ${files.length}: ${file.name}`
      );

      await uploadFileWithTus(file, filePath, session, (percent) => {
        setMessage(
          "propertyMessage",
          `آپلود تصویر ${index + 1} از ${files.length}: ${percent}%`
        );
      });

      const { data: publicUrlData } = db.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      const imageUrl = publicUrlData?.publicUrl;

      if (!imageUrl) {
        failed++;
        errors.push(
          `${file.name}: آپلود انجام شد اما نشانی عمومی تصویر دریافت نشد. مسیر فایل: ${filePath}`
        );
        continue;
      }

      const { error: insertError } = await db
        .from("property_images")
        .insert({
          property_id: propertyId,
          image_url: imageUrl,
          sort_order: ++currentSortOrder
        });

      if (insertError) {
        failed++;
        errors.push(
          `${file.name}: فایل در Storage آپلود شد، اما ثبت تصویر در دیتابیس ناموفق بود. مسیر فایل: ${filePath}. خطا: ${getErrorMessage(insertError)}`
        );
        console.error("Image row insert failed:", {
          filePath,
          error: insertError
        });
        continue;
      }

      uploaded++;
    } catch (error) {
      failed++;
      errors.push(`${file.name}: ${getErrorMessage(error)}`);
      console.error("Image upload failed:", {
        fileName: file.name,
        filePath,
        error
      });
    }
  }

  if (failed) {
    throw new Error(
      `آپلود ${uploaded} تصویر موفق و ${failed} تصویر ناموفق بود.\n` +
        errors.join("\n")
    );
  }

  return { uploaded, failed };
}

function getPropertyPayload() {
  const title = getInputValue("title").trim();
  const categoryId = getInputValue("category");
  const description = getInputValue("description").trim();

  if (!title) throw new Error("عنوان ملک را وارد کن.");
  if (!categoryId) throw new Error("دسته‌بندی ملک را انتخاب کن.");

  const priceText = getInputValue("price").trim();
  const depositText = getInputValue("deposit").trim();
  const monthlyRentText = getInputValue("monthlyRent").trim();
  const areaText = getInputValue("area").trim();
  const bedroomsText = getInputValue("bedrooms").trim();
  const floorText = getInputValue("floor").trim();

  return {
    title,
    description,
    category_id: categoryId,
    price: priceText === "" ? null : Number(priceText),
    deposit: depositText === "" ? null : Number(depositText),
    monthly_rent: monthlyRentText === "" ? null : Number(monthlyRentText),
    area: areaText === "" ? null : Number(areaText),
    bedrooms: bedroomsText === "" ? null : Number(bedroomsText),
    floor: floorText === "" ? null : Number(floorText),
    location: getInputValue("location").trim() || null,
    address: getInputValue("address").trim() || null,
    parking: getChecked("parking"),
    elevator: getChecked("elevator"),
    storage: getChecked("storage"),
    terrace: getChecked("terrace"),
    frontage_type: getInputValue("frontageType") || null
  };
}

async function saveProperty(event) {
  if (event) event.preventDefault();

  if (isSavingProperty) return;

  isSavingProperty = true;

  const submitButton = $("propertySubmit");
  const originalButtonText = submitButton?.textContent;

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "در حال ذخیره...";
  }

  try {
    const payload = getPropertyPayload();
    const neighborhoodIds = getSelectedValues("neighborhoods");
    const filterIds = getSelectedValues("propertyFilters");

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

    const { error: neighborhoodDeleteError } = await db
      .from("property_neighborhoods")
      .delete()
      .eq("property_id", propertyId);

    if (neighborhoodDeleteError) throw neighborhoodDeleteError;

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

    const { error: filterDeleteError } = await db
      .from("property_filters")
      .delete()
      .eq("property_id", propertyId);

    if (filterDeleteError) throw filterDeleteError;

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

    if (propertyImagesToDelete.length) {
      const { error } = await db
        .from("property_images")
        .delete()
        .in("id", propertyImagesToDelete);

      if (error) throw error;

      propertyImagesToDelete = [];
    }

    const uploadResult = await uploadNewPropertyImages(propertyId);

    resetPropertyForm();

    setMessage(
      "propertyMessage",
      `ملک با موفقیت ذخیره شد. تعداد تصاویر جدید: ${uploadResult.uploaded}.`
    );

    await loadProperties();
  } catch (error) {
    console.error("saveProperty:", error);

    setMessage(
      "propertyMessage",
      "خطا در ذخیره ملک: " + getErrorMessage(error),
      true
    );
  } finally {
    isSavingProperty = false;

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText || "ثبت ملک";
    }
  }
}

async function loadProperties() {
  const container = $("propertiesList");
  if (!container) return;

  container.innerHTML = "<p>در حال دریافت فایل‌های ملک...</p>";

  try {
    const { data, error } = await db
      .from("properties")
      .select("*, categories(name)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!data?.length) {
      container.innerHTML = "<p>هنوز ملکی ثبت نشده است.</p>";
      return;
    }

    container.innerHTML = data
      .map((property) => {
        const active = property.is_active !== false;

        return `
          <div class="admin-item">
            <div>
              <strong>${escapeHtml(property.title)}</strong>
              <div>${escapeHtml(property.categories?.name || "")}</div>
              <div>${active ? "فعال" : "غیرفعال"}</div>
            </div>
            <div>
              <button type="button"
                onclick="editProperty('${property.id}')">
                ویرایش
              </button>
              <button type="button"
                onclick="toggleProperty('${property.id}', ${!active})">
                ${active ? "غیرفعال‌کردن" : "فعال‌کردن"}
              </button>
              <button type="button"
                onclick="deleteProperty('${property.id}')">
                حذف
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (error) {
    console.error("loadProperties:", error);
    container.innerHTML =
      "<p>خطا در دریافت فایل‌ها: " +
      escapeHtml(getErrorMessage(error)) +
      "</p>";
  }
}

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
    propertyImagesToDelete = [];

    setInputValue("propertyId", id);
    setInputValue("title", property.title);
    setInputValue("description", property.description);
    setInputValue("category", property.category_id);
    setInputValue("price", property.price);
    setInputValue("deposit", property.deposit);
    setInputValue("monthlyRent", property.monthly_rent);
    setInputValue("area", property.area);
    setInputValue("bedrooms", property.bedrooms);
    setInputValue("floor", property.floor);
    setInputValue("location", property.location);
    setInputValue("address", property.address);
    setInputValue("frontageType", property.frontage_type);

    setChecked("parking", property.parking);
    setChecked("elevator", property.elevator);
    setChecked("storage", property.storage);
    setChecked("terrace", property.terrace);

    const { data: neighborhoods, error: neighborhoodError } = await db
      .from("property_neighborhoods")
      .select("neighborhood_id")
      .eq("property_id", id);

    if (neighborhoodError) throw neighborhoodError;

    setSelectedValues(
      "neighborhoods",
      (neighborhoods || []).map((item) => item.neighborhood_id)
    );

    const { data: filters, error: filtersError } = await db
      .from("property_filters")
      .select("filter_option_id")
      .eq("property_id", id);

    if (filtersError) throw filtersError;

    setSelectedValues(
      "propertyFilters",
      (filters || []).map((item) => item.filter_option_id)
    );

    ensureCancelEditButton();

    const cancelButton = $("cancelEditButton");
    if (cancelButton) cancelButton.style.display = "";

    const submitButton = $("propertySubmit");
    if (submitButton) submitButton.textContent = "ذخیره تغییرات";

    await loadExistingPropertyImages(id);

    setMessage("propertyMessage", "اطلاعات ملک برای ویرایش آماده است.");

    $("propertyForm")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    console.error("editProperty:", error);
    setMessage(
      "propertyMessage",
      "خطا در دریافت ملک: " + getErrorMessage(error),
      true
    );
  }
}

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

async function deleteProperty(id) {
  if (
    !confirm(
      "این ملک و ارتباط‌های مربوط به آن حذف شوند؟ این کار قابل بازگشت نیست."
    )
  ) {
    return;
  }

  try {
    const { data: images, error: imagesError } = await db
      .from("property_images")
      .select("id, image_url")
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
        console.error("Storage cleanup failed:", storageError);
      }
    }

    const relatedTables = [
      "property_images",
      "property_neighborhoods",
      "property_filters"
    ];

    for (const table of relatedTables) {
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

    setInputValue("siteName", settings.site_name || "");
    setInputValue("sitePhone", settings.phone || "");
    setInputValue("siteWhatsapp", settings.whatsapp || "");
    setInputValue("siteInstagram", settings.instagram || "");
    setInputValue("siteAbout", settings.about || "");
    setInputValue("siteLogo", settings.logo_url || "");
    setInputValue("siteHeaderImage", settings.header_image_url || "");
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

  const settings = [
    { key: "site_name", value: getInputValue("siteName").trim() },
    { key: "phone", value: getInputValue("sitePhone").trim() },
    { key: "whatsapp", value: getInputValue("siteWhatsapp").trim() },
    { key: "instagram", value: getInputValue("siteInstagram").trim() },
    { key: "about", value: getInputValue("siteAbout").trim() },
    { key: "logo_url", value: getInputValue("siteLogo").trim() },
    {
      key: "header_image_url",
      value: getInputValue("siteHeaderImage").trim()
    }
  ];

  try {
    setMessage("settingsMessage", "در حال ذخیره تنظیمات...");

    for (const setting of settings) {
      const { error } = await db
        .from("site_settings")
        .upsert(setting, { onConflict: "key" });

      if (error) throw error;
    }

    setMessage("settingsMessage", "تنظیمات با موفقیت ذخیره شد.");
  } catch (error) {
    console.error("saveSiteSettings:", error);
    setMessage(
      "settingsMessage",
      "خطا در ذخیره تنظیمات: " + getErrorMessage(error),
      true
    );
  }
}

function setupAdminEvents() {
  ensureCancelEditButton();

  $("loginForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    login();
  });

  $("loginButton")?.addEventListener("click", (event) => {
    event.preventDefault();
    login();
  });

  $("logoutButton")?.addEventListener("click", logout);

  $("propertyForm")?.addEventListener("submit", saveProperty);

  $("neighborhoodForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    addNeighborhood();
  });

  $("addNeighborhoodButton")?.addEventListener("click", addNeighborhood);

  $("filterOptionForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    addFilterOption();
  });

  $("addFilterOptionButton")?.addEventListener("click", addFilterOption);

  $("settingsForm")?.addEventListener("submit", saveSiteSettings);

  $("saveSettingsButton")?.addEventListener("click", saveSiteSettings);
}

document.addEventListener("DOMContentLoaded", async () => {
  setupAdminEvents();

  if (
    !window.SUPABASE_URL ||
    !window.SUPABASE_ANON_KEY ||
    !window.supabase
  ) {
    showLogin();
    setMessage(
      "loginMessage",
      "تنظیمات Supabase پیدا نشد. فایل supabase-config.js را بررسی کن.",
      true
    );
    return;
  }

  await checkAdmin();
});
