"use strict";

const { createClient } = window.supabase;

const db = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

let categories = [];
let neighborhoods = [];
let filters = [];
let properties = [];

let selectedCategory = null;
let selectedFilters = new Set();
let selectedNeighborhoods = new Set();

let neighborhoodSearch = "";
let currentGalleryImages = [];
let currentGalleryIndex = 0;
let filterRequestId = 0;

const $ = selector => document.querySelector(selector);

const iconPaths = {
  home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>',
  key: '<circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 8-8 2 2-2 2 2 2-3 3-2-2-3 3"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M10 21v-3h4v3"/>',
  store: '<path d="M3 10h18l-2-7H5zM5 10v11h14V10M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 21v-6h6v6"/>',
  construction: '<path d="M3 21h18M6 21V5h12v16M4 5h16M9 9h6M9 13h6M9 17h6"/>',
  location: '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  area: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h6V3M15 21v-6h6"/>',
  bed: '<path d="M3 5v15M3 15h18v5M3 10h18v5M7 10V7h5a3 3 0 0 1 3 3"/>',
  parking: '<path d="M5 20V4h8a5 5 0 0 1 0 10H5M3 20h18"/>',
  elevator: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="m8 8 2-2 2 2m-4 8 2 2 2-2M15 7h2v10h-2"/>',
  storage: '<path d="M3 7h18v14H3zM3 7l2-4h14l2 4M8 11v6m8-6v6"/>',
  terrace: '<path d="M3 21h18M5 21V9h14v12M3 9l9-6 9 6M9 13h6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  convert: '<path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3"/>'
};

function lineIcon(name, size = 22) {
  return `
    <svg class="saee-icon"
      viewBox="0 0 24 24"
      width="${size}" height="${size}"
      fill="none" stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true">
      ${iconPaths[name] || iconPaths.home}
    </svg>
  `;
}

function getCategoryIcon(title) {
  const icons = {
    "فروش": "home",
    "اجاره": "key",
    "اداری": "building",
    "مغازه": "store",
    "مشارکت در ساخت": "construction"
  };

  return lineIcon(icons[String(title || "").trim()] || "home");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function formatNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number.toLocaleString("fa-IR")
    : "۰";
}

function formatDecimal(value) {
  return Number(value).toLocaleString("fa-IR", {
    maximumFractionDigits: 2
  });
}

function formatMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return "توافقی";
  }

  if (number >= 1_000_000_000) {
    return `${formatDecimal(number / 1_000_000_000)} میلیارد تومان`;
  }

  if (number >= 1_000_000) {
    return `${formatDecimal(number / 1_000_000)} میلیون تومان`;
  }

  return `${formatNumber(number)} تومان`;
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const number = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function isRentConvertible(property) {
  const value = property?.rent_convertible;

  return value === true ||
    value === 1 ||
    String(value).trim().toLowerCase() === "true" ||
    String(value).trim() === "1" ||
    String(value).trim() === "تبدیل دارد";
}

function getRentConversionData(property) {
  const startDeposit = numericValue(property?.deposit);
  const startRent = numericValue(property?.monthly_rent);
  const endDeposit = numericValue(property?.end_deposit);
  const endRent = numericValue(property?.end_monthly_rent);

  return {
    startDeposit,
    startRent,
    endDeposit: endDeposit > 0 ? endDeposit : startDeposit,
    endRent: endRent > 0 ? endRent : startRent
  };
}

async function loadSite() {
  ensureExtraStyles();

  const results = await Promise.allSettled([
    loadSettings(),
    loadCategories(),
    loadNeighborhoods(),
    loadProperties()
  ]);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`Site loading task ${index + 1}:`, result.reason);
    }
  });
}

async function loadSettings() {
  const { data, error } = await db
    .from("site_settings")
    .select("setting_key, setting_value");

  if (error) {
    console.error("Settings error:", error);
    return;
  }

  const settings = {};

  (data || []).forEach(item => {
    settings[item.setting_key] = item.setting_value || "";
  });

  if (settings.site_name) {
    document.title = settings.site_name;
  }

  if ($("#aboutTitle")) {
    $("#aboutTitle").textContent = settings.about_title || "درباره ما";
  }

  if ($("#aboutText")) {
    $("#aboutText").textContent =
      settings.about_text || "اطلاعات این بخش به‌زودی تکمیل می‌شود.";
  }

  if ($("#footerSlogan")) {
    $("#footerSlogan").textContent =
      settings.footer_slogan || "انتخاب درست، آینده روشن";
  }

  const phones = [
    settings.contact_phone_1,
    settings.contact_phone_2,
    settings.contact_phone_3
  ].filter(Boolean);

  if ($("#contactPhones")) {
    $("#contactPhones").innerHTML = phones.map(phone => `
      <a href="tel:${escapeAttribute(phone)}">${escapeHtml(phone)}</a>
    `).join("");
  }

  ["instagramLink", "whatsappLink"].forEach(id => {
    const element = $("#" + id);
    if (!element) return;

    const key = id === "instagramLink"
      ? "instagram_url"
      : "whatsapp_url";

    if (settings[key]) {
      element.href = settings[key];
      element.style.display = "";
    } else {
      element.style.display = "none";
    }
  });

  if (settings.hero_image_url && $(".hero")) {
    $(".hero").style.backgroundImage =
      `linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.72)),url("${settings.hero_image_url}")`;
  }
}

async function loadCategories() {
  const { data, error } = await db
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    console.error("Categories error:", error);
    return;
  }

  categories = data || [];
  renderCategories();

  if (categories.length) {
    const initialCategory =
      categories.find(item => item.slug === "sale") ||
      categories.find(item => item.title === "فروش") ||
      categories[0];

    await selectCategory(initialCategory.id);
  }
}

function renderCategories() {
  const container = $("#categories");
  if (!container) return;

  container.innerHTML = categories.map(category => `
    <button
      type="button"
      class="category-btn ${String(category.id) === String(selectedCategory) ? "active" : ""}"
      data-category-id="${escapeAttribute(category.id)}"
      onclick="selectCategory('${escapeAttribute(category.id)}')">
      ${getCategoryIcon(category.title)}
      <span>${escapeHtml(category.title)}</span>
    </button>
  `).join("");
}

async function selectCategory(categoryId) {
  const id = String(categoryId);

  if (String(selectedCategory) !== id) {
    selectedFilters.clear();
  }

  selectedCategory = id;

  document.querySelectorAll(".category-btn").forEach(button => {
    button.classList.toggle(
      "active",
      String(button.dataset.categoryId) === id
    );
  });

  filters = [];
  if ($("#filters")) $("#filters").innerHTML = "";

  renderProperties();
  await loadFilters(id);
}

async function loadFilters(categoryId) {
  const requestId = ++filterRequestId;

  const { data, error } = await db
    .from("filter_options")
    .select("*")
    .eq("category_id", String(categoryId))
    .eq("is_active", true)
    .order("sort_order");

  if (
    requestId !== filterRequestId ||
    String(selectedCategory) !== String(categoryId)
  ) {
    return;
  }

  if (error) {
    console.error("Filters error:", error);
    filters = [];
    renderFilters();
    return;
  }

  filters = data || [];

  const availableIds = new Set(filters.map(item => String(item.id)));

  selectedFilters = new Set(
    Array.from(selectedFilters).filter(id => availableIds.has(id))
  );

  renderFilters();
  renderProperties();
}

function renderFilters() {
  const container = $("#filters");
  if (!container) return;

  const parents = filters.filter(item => !item.parent_id);
  const children = filters.filter(item => item.parent_id);

  container.innerHTML = parents.map(parent => {
    const id = String(parent.id);
    const childItems = children.filter(
      item => String(item.parent_id) === id
    );

    return `
      <div class="filter-group">
        <button type="button"
          class="filter-btn ${selectedFilters.has(id) ? "active" : ""}"
          data-filter-id="${escapeAttribute(id)}"
          onclick="toggleFilter('${escapeAttribute(id)}')">
          ${escapeHtml(parent.title)}
        </button>

        ${childItems.length ? `
          <div class="filter-children">
            ${childItems.map(child => {
              const childId = String(child.id);

              return `
                <button type="button"
                  class="filter-btn ${selectedFilters.has(childId) ? "active" : ""}"
                  data-filter-id="${escapeAttribute(childId)}"
                  onclick="toggleFilter('${escapeAttribute(childId)}')">
                  ${escapeHtml(child.title)}
                </button>
              `;
            }).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");
}

function toggleFilter(filterId) {
  const id = String(filterId);

  if (selectedFilters.has(id)) {
    selectedFilters.delete(id);
  } else {
    selectedFilters.add(id);
  }

  document.querySelectorAll("[data-filter-id]").forEach(button => {
    button.classList.toggle(
      "active",
      selectedFilters.has(String(button.dataset.filterId))
    );
  });

  renderProperties();
}
async function loadNeighborhoods() {
  const { data, error } = await db
    .from("neighborhoods")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("Neighborhoods error:", error);
    neighborhoods = [];
  } else {
    neighborhoods = data || [];
  }

  renderNeighborhoodPicker();
}

function renderNeighborhoodPicker() {
  const select = $("#neighborhoodSelect");
  if (!select) return;

  select.innerHTML = neighborhoods.map(item => `
    <option value="${escapeAttribute(item.id)}">
      ${escapeHtml(item.name)}
    </option>
  `).join("");

  select.hidden = true;

  let picker = $("#neighborhoodPicker");

  if (!picker) {
    picker = document.createElement("div");
    picker.id = "neighborhoodPicker";
    picker.className = "saee-neighborhood-picker";
    select.insertAdjacentElement("afterend", picker);
  }

  const count = selectedNeighborhoods.size;

  picker.innerHTML = `
    <button type="button"
      class="neighborhood-toggle"
      id="neighborhoodToggle"
      aria-expanded="false">
      <span class="neighborhood-toggle-label">
        ${lineIcon("location", 19)}
        <span>انتخاب محله</span>
      </span>
      <span class="neighborhood-toggle-arrow">
        ${count ? formatNumber(count) + " انتخاب" : "⌄"}
      </span>
    </button>

    <div class="neighborhood-panel" id="neighborhoodPanel" hidden>
      <input type="search"
        id="neighborhoodSearch"
        placeholder="جست‌وجوی محله..."
        value="${escapeAttribute(neighborhoodSearch)}">

      <div class="neighborhood-options" id="neighborhoodOptions">
        ${renderNeighborhoodOptions()}
      </div>

      <div class="neighborhood-actions">
        <button type="button" id="clearNeighborhoods">پاک کردن</button>
      </div>
    </div>
  `;

  $("#neighborhoodToggle").addEventListener("click", () => {
    const panel = $("#neighborhoodPanel");
    panel.hidden = !panel.hidden;

    $("#neighborhoodToggle").setAttribute(
      "aria-expanded",
      String(!panel.hidden)
    );
  });

  $("#neighborhoodSearch").addEventListener("input", event => {
    neighborhoodSearch = event.target.value;

    const options = $("#neighborhoodOptions");
    if (options) options.innerHTML = renderNeighborhoodOptions();
  });

  $("#neighborhoodOptions").addEventListener("change", event => {
    if (!event.target.matches('input[type="checkbox"]')) return;

    const id = String(event.target.value);

    if (event.target.checked) {
      selectedNeighborhoods.add(id);
    } else {
      selectedNeighborhoods.delete(id);
    }

    const arrow = $("#neighborhoodToggle .neighborhood-toggle-arrow");

    if (arrow) {
      arrow.textContent = selectedNeighborhoods.size
        ? `${formatNumber(selectedNeighborhoods.size)} انتخاب`
        : "⌄";
    }

    const options = $("#neighborhoodOptions");
    if (options) options.innerHTML = renderNeighborhoodOptions();

    renderProperties();
  });

  $("#clearNeighborhoods").addEventListener("click", () => {
    selectedNeighborhoods.clear();
    const arrow = $("#neighborhoodToggle .neighborhood-toggle-arrow");
    if (arrow) arrow.textContent = "⌄";

    const options = $("#neighborhoodOptions");
    if (options) options.innerHTML = renderNeighborhoodOptions();

    renderProperties();
  });
}

function renderNeighborhoodOptions() {
  const search = neighborhoodSearch.trim().toLowerCase();

  const visible = neighborhoods.filter(item =>
    String(item.name || "").toLowerCase().includes(search)
  );

  if (!visible.length) {
    return '<p class="neighborhood-empty">محله‌ای پیدا نشد.</p>';
  }

  return visible.map(item => {
    const id = String(item.id);
    const checked = selectedNeighborhoods.has(id);

    return `
      <label class="neighborhood-option ${checked ? "selected" : ""}">
        <input type="checkbox"
          value="${escapeAttribute(id)}"
          ${checked ? "checked" : ""}>
        <span>${escapeHtml(item.name)}</span>
      </label>
    `;
  }).join("");
}

async function loadProperties() {
  const { data, error } = await db
    .from("properties")
    .select(`
      *,
      categories(title, slug),
      property_images(id, image_url, sort_order),
      property_neighborhoods(neighborhood_id),
      property_filters(filter_option_id)
    `)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Properties error:", error);

    if ($("#properties")) {
      $("#properties").innerHTML =
        '<p class="empty-state">دریافت فایل‌های ملکی با مشکل مواجه شد.</p>';
    }

    return;
  }

  properties = (data || []).map(property => ({
    ...property,
    property_images: (property.property_images || []).slice().sort(
      (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)
    )
  }));

  renderProperties();
}

function getPropertyImage(property) {
  return property.property_images?.[0]?.image_url || "";
}

function getPropertyCode(property) {
  return property.property_code || property.code || property.id || "";
}

/*
 * قیمت را از روی مقادیر ثبت‌شده تشخیص می‌دهیم؛
 * نوع دسته‌بندی به‌تنهایی تعیین‌کننده نیست.
 */
function getPropertyPrice(property) {
  const deposit = numericValue(property.deposit);
  const rent = numericValue(property.monthly_rent);
  const price = numericValue(property.price);

  if (deposit > 0 || rent > 0) {
    if (deposit > 0 && rent > 0) {
      return `ودیعه: ${formatMoney(deposit)} · اجاره ماهانه: ${formatMoney(rent)}`;
    }

    if (deposit > 0) {
      return `${formatMoney(deposit)} رهن کامل`;
    }

    return `اجاره ماهانه: ${formatMoney(rent)}`;
  }

  return price > 0 ? formatMoney(price) : "توافقی";
}

/*
 * کادر بزرگ دعوت به تبدیل فقط برای فایل‌های قابل تبدیل.
 * این کادر در کارت کلیک‌پذیر است و صفحه جزئیات همان ملک را باز می‌کند.
 */
function getRentConversionCardMarkup(property) {
  if (!isRentConvertible(property)) return "";

  const data = getRentConversionData(property);
  const hasConversion =
    data.startDeposit !== data.endDeposit ||
    data.startRent !== data.endRent;

  if (!hasConversion) return "";

  return `
    <button
      type="button"
      class="saee-conversion-card-button"
      onclick="event.stopPropagation();openPropertyDetails('${escapeAttribute(property.id)}', true)"
      aria-label="برای تبدیل رهن و اجاره کلیک کنید">
      <span class="saee-conversion-card-icon">
        ${lineIcon("convert", 24)}
      </span>
      <span class="saee-conversion-card-text">
        <strong>تبدیل رهن و اجاره</strong>
        <span>برای تبدیل رهن و اجاره کلیک کنید</span>
      </span>
      <span class="saee-conversion-card-arrow" aria-hidden="true">‹</span>
    </button>
  `;
}

function getRentConversionMarkup(property) {
  if (!isRentConvertible(property)) return "";

  const data = getRentConversionData(property);
  const depositDifference = Math.abs(data.endDeposit - data.startDeposit);
  const rentDifference = Math.abs(data.endRent - data.startRent);

  if (depositDifference === 0 && rentDifference === 0) return "";

  // اجاره با گام‌های ۱۰۰ هزار تومانی تغییر می‌کند؛ آخرین نقطه دقیقاً انتهای بازه است.
  let steps = rentDifference > 0
    ? Math.ceil(rentDifference / 100000)
    : Math.ceil(depositDifference / 10000000);
  steps = Math.max(1, Math.min(steps, 10000));

  return `
    <section class="saee-rent-conversion" aria-label="تبدیل رهن و اجاره">
      <h3 class="saee-rent-title">تبدیل رهن و اجاره</h3>
      <label class="saee-rent-slider-accessible-label" for="saeeRentConversionSlider">
        میزان تبدیل رهن و اجاره
      </label>
      <input
        id="saeeRentConversionSlider"
        class="saee-rent-slider"
        type="range"
        min="0"
        max="${steps}"
        step="1"
        value="0"
        data-start-deposit="${data.startDeposit}"
        data-start-rent="${data.startRent}"
        data-end-deposit="${data.endDeposit}"
        data-end-rent="${data.endRent}"
        oninput="updateRentConversion(this.value)">
      <div class="saee-rent-slider-labels">
        <span>رهن کمتر</span>
        <span>رهن بیشتر</span>
      </div>
      <div class="saee-rent-current">
        <div>
          <span>ودیعه انتخابی</span>
          <strong id="saeeRentCurrentDeposit">${escapeHtml(formatMoney(data.startDeposit))}</strong>
        </div>
        <div>
          <span>اجاره ماهانه انتخابی</span>
          <strong id="saeeRentCurrentMonthly">${escapeHtml(formatMoney(data.startRent))}</strong>
        </div>
      </div>
    </section>
  `;
}

function updateRentConversion(value) {
  const slider = $("#saeeRentConversionSlider");
  if (!slider) return;

  const startDeposit = numericValue(slider.dataset.startDeposit);
  const startRent = numericValue(slider.dataset.startRent);
  const endDeposit = numericValue(slider.dataset.endDeposit);
  const endRent = numericValue(slider.dataset.endRent);
  const max = Math.max(1, numericValue(slider.max));
  const position = Math.max(0, Math.min(max, numericValue(value)));
  const ratio = position / max;

  let deposit;
  let rent;

  if (position === 0) {
    deposit = startDeposit;
    rent = startRent;
  } else if (position === max) {
    // مقدار انتهایی عیناً از دیتابیس حفظ می‌شود.
    deposit = endDeposit;
    rent = endRent;
  } else {
    deposit = Math.round(startDeposit + (endDeposit - startDeposit) * ratio);
    const difference = Math.abs(endRent - startRent);
    const direction = Math.sign(endRent - startRent);

    if (difference > 0) {
      const changed = Math.min(difference, position * 100000);
      rent = startRent + direction * changed;
    } else {
      rent = startRent;
    }
  }

  const depositElement = $("#saeeRentCurrentDeposit");
  const rentElement = $("#saeeRentCurrentMonthly");

  if (depositElement) depositElement.textContent = formatMoney(deposit);
  if (rentElement) rentElement.textContent = formatMoney(rent);

  slider.style.setProperty("--saee-rent-progress", `${(position / max) * 100}%`);
}

function getPropertyFeatures(property) {
  const features = [];

  if (property.area) {
    features.push(["area", `${formatNumber(property.area)} متر`]);
  }

  if (property.bedrooms !== null && property.bedrooms !== undefined) {
    features.push(["bed", `${formatNumber(property.bedrooms)} خواب`]);
  }

  if (property.parking) features.push(["parking", "پارکینگ"]);
  if (property.elevator) features.push(["elevator", "آسانسور"]);
  if (property.storage) features.push(["storage", "انباری"]);
  if (property.terrace) features.push(["terrace", "تراس"]);

  return features;
}

function renderProperties() {
  const container = $("#properties");
  if (!container) return;

  const filtered = properties.filter(property => {
    if (
      selectedCategory &&
      String(property.category_id) !== String(selectedCategory)
    ) {
      return false;
    }

    if (selectedNeighborhoods.size) {
      const ids = (property.property_neighborhoods || [])
        .map(item => String(item.neighborhood_id));

      if (!Array.from(selectedNeighborhoods).some(id => ids.includes(id))) {
        return false;
      }
    }

    if (selectedFilters.size) {
      const ids = (property.property_filters || [])
        .map(item => String(item.filter_option_id));

      if (!Array.from(selectedFilters).every(id => ids.includes(id))) {
        return false;
      }
    }

    return true;
  });

  if ($("#propertyCount")) {
    $("#propertyCount").textContent =
      `${formatNumber(filtered.length)} فایل`;
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p>در حال حاضر فایلی با این مشخصات موجود نیست.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(renderPropertyCard).join("");
}

function getCategoryClass(title) {
  const classes = {
    "فروش": "sale",
    "اجاره": "rent",
    "مشارکت در ساخت": "construction",
    "مغازه": "shop",
    "اداری": "office"
  };

  return classes[String(title || "").trim()] || "default";
}

function renderPropertyCard(property) {
  const image = getPropertyImage(property);
  const categoryTitle = property.categories?.title || "ملک";
  const features = getPropertyFeatures(property);

  const imageMarkup = image
    ? `<img src="${escapeAttribute(image)}"
        alt="${escapeAttribute(property.title || "تصویر ملک")}"
        loading="lazy">`
    : `<div class="property-no-image">تصویری ثبت نشده</div>`;

  return `
    <article class="property-card"
      tabindex="0"
      role="button"
      aria-label="${escapeAttribute(property.title || "مشاهده مشخصات ملک")}"
      onclick="openPropertyDetails('${escapeAttribute(property.id)}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPropertyDetails('${escapeAttribute(property.id)}')}">

      <div class="property-image">
        ${imageMarkup}

        <span class="property-category-badge category-${getCategoryClass(categoryTitle)}">
          ${getCategoryIcon(categoryTitle)}
          <span>${escapeHtml(categoryTitle)}</span>
        </span>
      </div>

      <div class="property-card-body">
        <div class="property-code-label">
          کد ملک: ${escapeHtml(getPropertyCode(property))}
        </div>

        <h3 class="property-title">
          ${escapeHtml(property.title || "ملک بدون عنوان")}
        </h3>

        ${
          property.location_text
            ? `<div class="property-location">
                ${lineIcon("location", 17)}
                <span>${escapeHtml(property.location_text)}</span>
              </div>`
            : ""
        }

        <div class="property-price">
          ${escapeHtml(getPropertyPrice(property))}
        </div>

        ${getRentConversionCardMarkup(property)}

        ${
          features.length
            ? `<div class="property-features">
                ${features.map(([icon, label]) => `
                  <span class="property-feature">
                    ${lineIcon(icon, 17)}
                    <span>${escapeHtml(label)}</span>
                  </span>
                `).join("")}
              </div>`
            : ""
        }

        <button type="button"
          class="property-details-button"
          onclick="event.stopPropagation();openPropertyDetails('${escapeAttribute(property.id)}')">
          <span>مشاهده جزئیات</span>
          <span aria-hidden="true">←</span>
        </button>
      </div>
    </article>
  `;
}

function ensureModal() {
  let modal = $("#propertyModal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "propertyModal";
    modal.hidden = true;
    document.body.appendChild(modal);
  }

  return modal;
}

function openPropertyDetails(propertyId, focusConversion = false) {
  const property = properties.find(
    item => String(item.id) === String(propertyId)
  );

  if (!property) {
    console.error("ملک پیدا نشد:", propertyId);
    return;
  }

  const modal = ensureModal();

  currentGalleryImages = (property.property_images || [])
    .map(item => item.image_url)
    .filter(Boolean);

  currentGalleryIndex = 0;

  const detailRows = [
    ["کد ملک", getPropertyCode(property)],
    ["دسته‌بندی", property.categories?.title || "ملک"],
    ["متراژ", property.area ? `${formatNumber(property.area)} متر مربع` : ""],
    [
      "تعداد خواب",
      property.bedrooms !== null && property.bedrooms !== undefined
        ? formatNumber(property.bedrooms)
        : ""
    ],
    [
      "طبقه",
      property.floor !== null && property.floor !== undefined
        ? formatNumber(property.floor)
        : ""
    ],
    ["موقعیت", property.location_text || ""],
    ["آدرس", property.address || ""],
    ["پارکینگ", property.parking ? "دارد" : ""],
    ["آسانسور", property.elevator ? "دارد" : ""],
    ["انباری", property.storage ? "دارد" : ""],
    ["تراس", property.terrace ? "دارد" : ""]
  ].filter(item => item[1] !== "" && item[1] !== null);

  const features = getPropertyFeatures(property);

  const imagesMarkup = currentGalleryImages.length
    ? `
      <div class="detail-main-gallery">
        <button type="button"
          class="detail-main-image-button"
          onclick="openFullscreenImage(currentGalleryIndex)"
          aria-label="نمایش تصویر در اندازه بزرگ">
          <img
            id="detailMainImage"
            src="${escapeAttribute(currentGalleryImages[0])}"
            alt="تصویر اصلی ملک"
            fetchpriority="high">
        </button>

        ${
          currentGalleryImages.length > 1
            ? `
              <button type="button"
                class="detail-gallery-prev"
                onclick="changeDetailGallery(-1)"
                aria-label="تصویر قبلی">‹</button>

              <button type="button"
                class="detail-gallery-next"
                onclick="changeDetailGallery(1)"
                aria-label="تصویر بعدی">›</button>

              <div class="detail-gallery-counter" id="detailGalleryCounter">
                ۱ / ${formatNumber(currentGalleryImages.length)}
              </div>
            `
            : ""
        }
      </div>
    `
    : '<div class="property-no-image detail-no-image">تصویری ثبت نشده است.</div>';

  modal.innerHTML = `
    <div class="property-modal-backdrop"
      onclick="closePropertyDetails()"></div>

    <section class="property-modal-content"
      role="dialog"
      aria-modal="true"
      aria-label="${escapeAttribute(property.title || "جزئیات ملک")}">

      <button type="button"
        class="property-modal-close"
        onclick="closePropertyDetails()"
        aria-label="بستن">
        ${lineIcon("close", 22)}
      </button>

      ${imagesMarkup}

      <div class="property-modal-body">
        <div class="property-code-label">
          کد ملک: ${escapeHtml(getPropertyCode(property))}
        </div>

        <h2>${escapeHtml(property.title || "مشخصات ملک")}</h2>

        <div class="detail-price">
          ${escapeHtml(getPropertyPrice(property))}
        </div>

        ${getRentConversionMarkup(property)}
        
        ${
          features.length
            ? `<div class="detail-features">
                ${features.map(([icon, label]) => `
                  <span class="property-feature">
                    ${lineIcon(icon, 17)}
                    <span>${escapeHtml(label)}</span>
                  </span>
                `).join("")}
              </div>`
            : ""
        }

        <div class="detail-table">
          ${detailRows.map(([label, value]) => `
            <div class="detail-row">
              <span class="detail-label">${escapeHtml(label)}</span>
              <span class="detail-value">${escapeHtml(String(value))}</span>
            </div>
          `).join("")}
        </div>

        ${
          property.description
            ? `<div class="detail-description">
                <h3>توضیحات ملک</h3>
                <p>${escapeHtml(property.description).replace(/\n/g, "<br>")}</p>
              </div>`
            : ""
        }
      </div>
    </section>
  `;

  modal.hidden = false;
  document.body.classList.add("modal-open");

  const slider = $("#saeeRentConversionSlider");
  if (slider) {
    updateRentConversion(slider.value);

    if (focusConversion) {
      setTimeout(() => {
        const conversion = $(".saee-rent-conversion");
        if (conversion) {
          conversion.scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
        }
      }, 100);
    }
  }

  if (history.state?.saeeLayer !== "details") {
    history.pushState({ saeeLayer: "details" }, "");
  }
}

/* حرکت بین تصاویر صفحه جزئیات */
function changeDetailGallery(direction) {
  if (!currentGalleryImages.length) return;

  currentGalleryIndex =
    (currentGalleryIndex + direction + currentGalleryImages.length) %
    currentGalleryImages.length;

  const image = $("#detailMainImage");
  const counter = $("#detailGalleryCounter");

  if (image) {
    image.src = currentGalleryImages[currentGalleryIndex];
    image.alt = `تصویر ${formatNumber(currentGalleryIndex + 1)} ملک`;
  }

  if (counter) {
    counter.textContent =
      `${formatNumber(currentGalleryIndex + 1)} / ${formatNumber(currentGalleryImages.length)}`;
  }
}

function closePropertyDetails() {
  const viewer = $("#fullscreenImageViewer");

  if (viewer && !viewer.hidden) {
    closeFullscreenImage();
    return;
  }

  const modal = $("#propertyModal");
  if (modal) modal.hidden = true;

  document.body.classList.remove("modal-open");

  if (history.state?.saeeLayer === "details") {
    history.back();
  }
}

function openFullscreenImage(index) {
  if (!currentGalleryImages.length) return;

  currentGalleryIndex = Math.max(
    0,
    Math.min(index, currentGalleryImages.length - 1)
  );

  let viewer = $("#fullscreenImageViewer");

  if (!viewer) {
    viewer = document.createElement("div");
    viewer.id = "fullscreenImageViewer";
    viewer.className = "fullscreen-image-viewer";
    viewer.hidden = true;
    document.body.appendChild(viewer);
  }

  renderFullscreenImage();
  viewer.hidden = false;

  if (history.state?.saeeLayer !== "image") {
    history.pushState({ saeeLayer: "image" }, "");
  }
}

function renderFullscreenImage() {
  const viewer = $("#fullscreenImageViewer");
  if (!viewer) return;

  const url = currentGalleryImages[currentGalleryIndex];
  if (!url) return;

  viewer.innerHTML = `
    <button type="button"
      class="fullscreen-close"
      onclick="closeFullscreenImage()"
      aria-label="بستن">
      ${lineIcon("close", 25)}
    </button>

    <button type="button"
      class="fullscreen-prev"
      onclick="changeFullscreenImage(-1)"
      aria-label="تصویر قبلی">‹</button>

    <img class="fullscreen-image"
      src="${escapeAttribute(url)}"
      alt="تصویر بزرگ ملک">

    <button type="button"
      class="fullscreen-next"
      onclick="changeFullscreenImage(1)"
      aria-label="تصویر بعدی">›</button>

    <div class="fullscreen-counter">
      ${formatNumber(currentGalleryIndex + 1)} /
      ${formatNumber(currentGalleryImages.length)}
    </div>
  `;
}

function changeFullscreenImage(direction) {
  if (!currentGalleryImages.length) return;

  currentGalleryIndex =
    (currentGalleryIndex + direction + currentGalleryImages.length) %
    currentGalleryImages.length;

  renderFullscreenImage();

  const image = $("#detailMainImage");
  const counter = $("#detailGalleryCounter");

  if (image) {
    image.src = currentGalleryImages[currentGalleryIndex];
    image.alt = `تصویر ${formatNumber(currentGalleryIndex + 1)} ملک`;
  }

  if (counter) {
    counter.textContent =
      `${formatNumber(currentGalleryIndex + 1)} / ${formatNumber(currentGalleryImages.length)}`;
  }
}

function closeFullscreenImage() {
  const viewer = $("#fullscreenImageViewer");
  if (viewer) viewer.hidden = true;

  if (history.state?.saeeLayer === "image") {
    history.back();
  }
}

window.addEventListener("popstate", () => {
  const viewer = $("#fullscreenImageViewer");
  const modal = $("#propertyModal");

  if (viewer && !viewer.hidden) {
    viewer.hidden = true;
    return;
  }

  if (modal && !modal.hidden) {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }
});
function ensureExtraStyles() {
  if ($("#saeeExtraStyles")) return;

  const style = document.createElement("style");
  style.id = "saeeExtraStyles";

  style.textContent = `
    .saee-icon {
      display: inline-block;
      flex-shrink: 0;
      vertical-align: middle;
    }

    .category-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      min-height: 48px;
      padding: 10px 16px;
      color: #e9e8e2;
      background: #151513;
      border: 1px solid #42413b;
      border-radius: 10px;
      font: inherit;
      cursor: pointer;
    }

    .category-btn.active {
      color: #111110;
      background: #dfc16c;
      border-color: #dfc16c;
    }

    #filters {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 9px;
      width: 100%;
    }

    .filter-group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
      min-width: 0;
    }

    .filter-children {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
    }

    .filter-btn {
      min-height: 40px;
      padding: 8px 13px;
      color: #e7e6df;
      background: #171715;
      border: 1px solid #45443d;
      border-radius: 9px;
      font: inherit;
      cursor: pointer;
    }

    .filter-btn.active {
      color: #111110;
      background: #dfc16c;
      border-color: #dfc16c;
    }

    /* انتخاب محله */
    .saee-neighborhood-picker {
      position: relative;
      width: 100%;
      max-width: 440px;
      color: #efeee8;
    }

    .neighborhood-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      min-height: 48px;
      padding: 10px 14px;
      color: #e9e8e2;
      background: #151513;
      border: 1px solid #45443d;
      border-radius: 12px;
      font: inherit;
      cursor: pointer;
    }

    .neighborhood-toggle-label {
      display: inline-flex;
      align-items: center;
      gap: 9px;
    }

    .neighborhood-toggle-arrow {
      color: #dfc16c;
      font-size: .9rem;
    }

    .neighborhood-panel {
      position: absolute;
      z-index: 50;
      top: calc(100% + 8px);
      right: 0;
      left: 0;
      padding: 12px;
      background: #141412;
      border: 1px solid #45443d;
      border-radius: 13px;
      box-shadow: 0 12px 30px rgba(0,0,0,.35);
    }

    .neighborhood-panel input[type="search"] {
      width: 100%;
      min-height: 42px;
      padding: 10px 12px;
      color: #f1f0e9;
      background: #1b1b18;
      border: 1px solid #45443d;
      border-radius: 9px;
      outline: none;
      font: inherit;
      box-sizing: border-box;
    }

    .neighborhood-panel input[type="search"]:focus {
      border-color: #dfc16c;
    }

    .neighborhood-options {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      max-height: 240px;
      overflow-y: auto;
      padding: 12px 0;
    }

    .neighborhood-option {
      position: relative;
      display: inline-flex;
      align-items: center;
      cursor: pointer;
    }

    .neighborhood-option input[type="checkbox"] {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
      pointer-events: none;
    }

    .neighborhood-option span {
      display: inline-block;
      padding: 8px 13px;
      color: #e9e8e2;
      background: #1b1b18;
      border: 1px solid #44433c;
      border-radius: 999px;
      font-size: .9rem;
      transition: background .15s ease, color .15s ease;
    }

    .neighborhood-option.selected span {
      color: #111110;
      background: #dfc16c;
      border-color: #dfc16c;
    }

    .neighborhood-option input:focus-visible + span {
      outline: 2px solid #dfc16c;
      outline-offset: 3px;
    }

    .neighborhood-actions {
      display: flex;
      justify-content: flex-start;
      border-top: 1px solid #33332e;
      padding-top: 10px;
    }

    .neighborhood-actions button {
      min-height: 38px;
      padding: 7px 13px;
      color: #e9e8e2;
      background: #1b1b18;
      border: 1px solid #45443d;
      border-radius: 9px;
      font: inherit;
      cursor: pointer;
    }

    .neighborhood-empty {
      width: 100%;
      color: #bcbab1;
      text-align: center;
    }

    /* کارت ملک */
    .property-card {
      position: relative;
      overflow: hidden;
      color: #efeee8;
      background: #111110;
      border: 1px solid #383833;
      border-radius: 12px;
      box-shadow: none;
    }

    .property-image {
      position: relative;
      aspect-ratio: 16 / 10;
      overflow: hidden;
      background: #191918;
    }

    .property-image > img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .property-category-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      color: #fff;
      border-radius: 999px;
      font-size: .82rem;
      line-height: 1.4;
    }

    .category-sale { background: #16854c; }
    .category-rent { background: #2678cb; }
    .category-construction { background: #75452e; }
    .category-shop { background: #9a6723; }
    .category-office { background: #68645f; }
    .category-default { background: #55534d; }

    .property-card-body {
      padding: 13px;
    }

    .property-code-label {
      display: inline-block;
      margin-bottom: 8px;
      padding: 4px 8px;
      color: #dfc16c;
      background: #1a1915;
      border: 1px solid #454035;
      border-radius: 6px;
      font-size: .82rem;
      font-weight: 700;
    }

    .property-title {
      margin: 0 0 8px;
      color: #f1f0e9;
      line-height: 1.8;
    }

    .property-location {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #bcbcb6;
      font-size: .85rem;
    }

    .property-price,
    .detail-price {
      color: #dfc16c;
      font-weight: 700;
      line-height: 1.9;
      overflow-wrap: anywhere;
    }

    /* دکمه بزرگ تبدیل در کارت */
    .saee-conversion-card-button {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 76px;
      margin-top: 12px;
      padding: 12px;
            color: #f0d78c;
      text-align: right;
      background: linear-gradient(135deg, #292417, #1b1913);
      border: 1px solid #b89a4c;
      border-radius: 12px;
      font: inherit;
      cursor: pointer;
      box-sizing: border-box;
      transition: background .18s ease, border-color .18s ease;
    }

    .saee-conversion-card-button:hover {
      background: #332b19;
      border-color: #dfc16c;
    }

    .saee-conversion-card-button:active {
      background: #3a301b;
    }

    .saee-conversion-card-button:focus-visible {
      outline: 2px solid #dfc16c;
      outline-offset: 3px;
    }

    .saee-conversion-card-icon {
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      flex-shrink: 0;
      color: #dfc16c;
      background: #111110;
      border: 1px solid #51472e;
      border-radius: 10px;
    }

    .saee-conversion-card-text {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .saee-conversion-card-text strong {
      color: #f0d78c;
      font-size: .96rem;
      line-height: 1.7;
    }

    .saee-conversion-card-text > span {
      color: #d4cbb5;
      font-size: .79rem;
      line-height: 1.8;
    }

    .saee-conversion-card-arrow {
      flex-shrink: 0;
      color: #dfc16c;
      font-size: 1.8rem;
      line-height: 1;
    }

    .property-features,
    .detail-features {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 12px;
    }

    .property-feature {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 8px;
      color: #deded8;
      background: #191918;
      border: 1px solid #393936;
      border-radius: 7px;
      font-size: .82rem;
    }

    .property-details-button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 44px;
      margin-top: 14px;
      padding: 9px 12px;
      color: #f2f2ed;
      background: #151513;
      border: 1px solid #77736a;
      border-radius: 8px;
      font: inherit;
      cursor: pointer;
    }

    .property-details-button:active {
      background: #292820;
    }

    .property-no-image {
      display: grid;
      place-items: center;
      min-height: 150px;
      color: #aaa9a1;
      background: #191918;
    }

    /* پنجره جزئیات */
    .property-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0,0,0,.82);
    }

    .property-modal-content {
      position: fixed;
      inset: 3vh 3vw;
      z-index: 1001;
      overflow-y: auto;
      color: #f2f2ed;
      background: #111110;
      border: 1px solid #393936;
      border-radius: 12px;
    }

    .property-modal-content[hidden],
    .fullscreen-image-viewer[hidden],
    .neighborhood-panel[hidden] {
      display: none !important;
    }

    .property-modal-close {
      position: sticky;
      top: 8px;
      float: left;
      z-index: 5;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      margin: 8px;
      color: #fff;
      background: #111110;
      border: 1px solid #555550;
      border-radius: 50%;
      cursor: pointer;
    }

    .detail-main-gallery {
      position: relative;
      clear: both;
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: #191918;
    }

    .detail-main-image-button {
      display: block;
      width: 100%;
      height: 100%;
      padding: 0;
      background: transparent;
      border: 0;
      cursor: zoom-in;
    }

    .detail-main-image-button img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .detail-gallery-prev,
    .detail-gallery-next {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      color: #fff;
      background: rgba(15,15,15,.88);
      border: 1px solid #666158;
      border-radius: 50%;
      font-size: 1.8rem;
      cursor: pointer;
    }

    .detail-gallery-prev { left: 12px; }
    .detail-gallery-next { right: 12px; }

    .detail-gallery-counter {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      padding: 6px 12px;
      color: #fff;
      background: rgba(15,15,15,.88);
      border-radius: 20px;
      font-size: .85rem;
      pointer-events: none;
    }

    .detail-no-image { clear: both; }

    .property-modal-body {
      padding: 16px;
    }

    .detail-table {
      margin-top: 16px;
      border-top: 1px solid #393936;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 11px 0;
      border-bottom: 1px solid #30302d;
    }

    .detail-label {
      flex-shrink: 0;
      color: #bcbcb6;
    }

    .detail-value {
      text-align: left;
      overflow-wrap: anywhere;
    }

    .detail-description {
      margin-top: 18px;
      line-height: 1.9;
    }

    /* اسلایدر تبدیل داخل جزئیات */
    .saee-rent-conversion {
      margin: 16px 0;
      padding: 14px;
      color: #efeee8;
      background: #171714;
      border: 1px solid #494333;
      border-radius: 13px;
    }

    .saee-rent-title {
      margin: 0 0 14px;
      color: #dfc16c;
      font-size: 1rem;
      line-height: 1.8;
    }

    .saee-rent-slider-accessible-label {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0,0,0,0);
      white-space: nowrap;
      border: 0;
    }

    .saee-rent-slider {
      display: block;
      width: 100%;
      height: 24px;
      margin: 0;
      padding: 0;
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      cursor: pointer;
      direction: ltr;
      --saee-rent-progress: 0%;
    }

    .saee-rent-slider::-webkit-slider-runnable-track {
      height: 7px;
      background: linear-gradient(
        to right,
        #dfc16c 0%,
        #dfc16c var(--saee-rent-progress),
        #424139 var(--saee-rent-progress),
        #424139 100%
      );
      border-radius: 99px;
    }

    .saee-rent-slider::-moz-range-track {
      height: 7px;
      background: #424139;
      border-radius: 99px;
    }

    .saee-rent-slider::-moz-range-progress {
      height: 7px;
      background: #dfc16c;
      border-radius: 99px;
    }

    .saee-rent-slider::-webkit-slider-thumb {
      width: 22px;
      height: 22px;
      margin-top: -7px;
      appearance: none;
      -webkit-appearance: none;
      background: #dfc16c;
      border: 3px solid #111110;
      border-radius: 50%;
      box-shadow: 0 0 0 1px #dfc16c;
    }

    .saee-rent-slider::-moz-range-thumb {
      width: 17px;
      height: 17px;
      background: #dfc16c;
      border: 3px solid #111110;
      border-radius: 50%;
      box-shadow: 0 0 0 1px #dfc16c;
    }

    .saee-rent-slider:focus-visible {
      outline: 2px solid #dfc16c;
      outline-offset: 5px;
      border-radius: 5px;
    }

    .saee-rent-slider-labels {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-top: 4px;
      color: #a8a69d;
      font-size: .78rem;
    }

    .saee-rent-current {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }

    .saee-rent-current > div {
      display: flex;
      flex-direction: column;
      gap: 7px;
      min-width: 0;
      padding: 11px;
      background: #211e15;
      border: 1px solid #4b4128;
      border-radius: 9px;
    }

    .saee-rent-current span {
      color: #c6c0ad;
      font-size: .8rem;
      line-height: 1.8;
    }

    .saee-rent-current strong {
      color: #dfc16c;
      font-size: .9rem;
      line-height: 1.8;
      overflow-wrap: anywhere;
    }

    /* نمایش تمام‌صفحه تصویر */
    .fullscreen-image-viewer {
      position: fixed;
      inset: 0;
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #050505;
    }

    .fullscreen-image {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }

    .fullscreen-close,
    .fullscreen-prev,
    .fullscreen-next {
      position: absolute;
      z-index: 2;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      color: #fff;
      background: rgba(15,15,15,.9);
      border: 1px solid #555550;
      border-radius: 50%;
      font-size: 1.6rem;
      cursor: pointer;
    }

    .fullscreen-close { top: 15px; right: 15px; }
    .fullscreen-prev { top: 50%; left: 12px; }
    .fullscreen-next { top: 50%; right: 12px; }

    .fullscreen-counter {
      position: absolute;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      padding: 7px 12px;
      color: #fff;
      background: rgba(15,15,15,.9);
      border-radius: 20px;
    }

    .empty-state {
      padding: 24px 12px;
      color: #ccc;
      text-align: center;
      line-height: 1.9;
    }

    body.modal-open {
      overflow: hidden;
    }

    @media (max-width: 600px) {
      .property-modal-content {
        inset: 0;
        border: 0;
        border-radius: 0;
      }

      .property-card-body {
        padding: 11px;
      }

      #filters {
        gap: 7px;
      }

      .filter-btn {
        min-height: 38px;
        padding: 7px 10px;
        font-size: .9rem;
      }

      .detail-main-gallery {
        aspect-ratio: 4 / 3;
      }

      .property-modal-body {
        padding: 13px;
      }

      .saee-conversion-card-button {
        min-height: 72px;
        gap: 9px;
        padding: 10px;
      }

      .saee-conversion-card-icon {
        width: 40px;
        height: 40px;
      }

      .saee-conversion-card-text strong {
        font-size: .88rem;
      }

      .saee-conversion-card-text > span {
        font-size: .73rem;
      }

      .saee-rent-conversion {
        padding: 11px;
      }

      .saee-rent-current {
        gap: 7px;
      }

      .saee-rent-current > div {
        padding: 9px;
      }

      .saee-rent-current strong {
        font-size: .8rem;
      }
    }
  `;

  document.head.appendChild(style);
}

loadSite();
