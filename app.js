"use strict";

const { createClient } = supabase;

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

let currentGalleryImages = [];
let currentGalleryIndex = 0;
let filterRequestId = 0;
let neighborhoodSearch = "";

const $ = (selector) => document.querySelector(selector);

const categoryIcons = {
  "فروش": "🏠",
  "اجاره": "🔑",
  "اداری": "🏢",
  "مغازه": "🏬",
  "مشارکت در ساخت": "🏗️"
};

function getCategoryIcon(title) {
  return categoryIcons[String(title || "").trim()] || "🏘️";
}

async function loadSite() {
  try {
    ensureExtraStyles();

    await Promise.all([
      loadSettings(),
      loadCategories(),
      loadNeighborhoods(),
      loadProperties()
    ]);
  } catch (error) {
    console.error("Site loading error:", error);
  }
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
    $("#aboutTitle").textContent =
      settings.about_title || "درباره ما";
  }

  if ($("#aboutText")) {
    $("#aboutText").textContent =
      settings.about_text ||
      "اطلاعات این بخش به‌زودی تکمیل می‌شود.";
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
    $("#contactPhones").innerHTML = phones.length
      ? phones.map(phone => `
          <a href="tel:${escapeAttribute(phone)}">
            ${escapeHtml(phone)}
          </a>
        `).join("")
      : "<span>شماره تماسی ثبت نشده است.</span>";
  }

  if ($("#instagramLink")) {
    if (settings.instagram_url) {
      $("#instagramLink").href = settings.instagram_url;
      $("#instagramLink").style.display = "";
    } else {
      $("#instagramLink").style.display = "none";
    }
  }

  if ($("#whatsappLink")) {
    if (settings.whatsapp_url) {
      $("#whatsappLink").href = settings.whatsapp_url;
      $("#whatsappLink").style.display = "";
    } else {
      $("#whatsappLink").style.display = "none";
    }
  }

  if (settings.hero_image_url && $(".hero")) {
    $(".hero").style.backgroundImage =
      `linear-gradient(rgba(17,17,15,.55), rgba(17,17,15,.95)), url("${settings.hero_image_url}")`;
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

    if ($("#categories")) {
      $("#categories").textContent =
        "خطا در دریافت دسته‌بندی‌ها";
    }

    return;
  }

  categories = data || [];
  renderCategories();

  if (categories.length) {
    const sale =
      categories.find(category => category.slug === "sale") ||
      categories.find(category => category.title === "فروش") ||
      categories[0];

    await selectCategory(sale.id);
  } else if ($("#filters")) {
    $("#filters").innerHTML = "";
  }
}

function renderCategories() {
  if (!$("#categories")) return;

  $("#categories").innerHTML = categories.map(category => `
    <button
      type="button"
      class="category-btn ${String(category.id) === String(selectedCategory) ? "active" : ""}"
      data-category-id="${escapeAttribute(category.id)}"
      onclick="selectCategory('${escapeAttribute(category.id)}')">

      <span class="category-icon" aria-hidden="true">
        ${getCategoryIcon(category.title)}
      </span>

      <span>${escapeHtml(category.title)}</span>
    </button>
  `).join("");
}

async function selectCategory(categoryId) {
  const normalizedCategoryId = String(categoryId);

  if (String(selectedCategory) !== normalizedCategoryId) {
    selectedFilters.clear();
  }

  selectedCategory = normalizedCategoryId;

  document.querySelectorAll(".category-btn").forEach(button => {
    button.classList.toggle(
      "active",
      String(button.dataset.categoryId) === normalizedCategoryId
    );
  });

  await loadFilters(normalizedCategoryId);
  renderProperties();
}

async function loadFilters(categoryId) {
  const requestId = ++filterRequestId;
  const normalizedCategoryId = String(categoryId);

  if ($("#filters")) {
    $("#filters").innerHTML = "";
  }

  const { data, error } = await db
    .from("filter_options")
    .select("*")
    .eq("category_id", normalizedCategoryId)
    .eq("is_active", true)
    .order("sort_order");

  if (
    requestId !== filterRequestId ||
    String(selectedCategory) !== normalizedCategoryId
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

  const availableIds = new Set(
    filters.map(filter => String(filter.id))
  );

  selectedFilters = new Set(
    Array.from(selectedFilters).filter(
      id => availableIds.has(id)
    )
  );

  renderFilters();
}

function renderFilters() {
  if (!$("#filters")) return;

  const parents = filters.filter(filter => !filter.parent_id);
  const children = filters.filter(filter => filter.parent_id);

  $("#filters").innerHTML = parents.map(parent => {
    const parentId = String(parent.id);

    const childFilters = children.filter(
      child => String(child.parent_id) === parentId
    );

    return `
      <div class="filter-group">
        <button
          type="button"
          class="filter-btn ${selectedFilters.has(parentId) ? "active" : ""}"
          data-filter-id="${escapeAttribute(parentId)}"
          onclick="toggleFilter('${escapeAttribute(parentId)}')">
          ${escapeHtml(parent.title)}
        </button>

        ${
          childFilters.length
            ? `
              <div class="filter-children">
                ${childFilters.map(child => {
                  const childId = String(child.id);

                  return `
                    <button
                      type="button"
                      class="filter-btn ${selectedFilters.has(childId) ? "active" : ""}"
                      data-filter-id="${escapeAttribute(childId)}"
                      onclick="toggleFilter('${escapeAttribute(childId)}')">
                      ${escapeHtml(child.title)}
                    </button>
                  `;
                }).join("")}
              </div>
            `
            : ""
        }
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

  document.querySelectorAll(".filter-btn[data-filter-id]").forEach(button => {
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

  select.innerHTML = neighborhoods.map(neighborhood => `
    <option value="${escapeAttribute(neighborhood.id)}">
      ${escapeHtml(neighborhood.name)}
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

  const selectedNames = neighborhoods
    .filter(item => selectedNeighborhoods.has(String(item.id)))
    .map(item => item.name);

  picker.innerHTML = `
    <button type="button" class="neighborhood-toggle" id="neighborhoodToggle">
      <span>📍 انتخاب محله</span>
      <span class="neighborhood-count">
        ${selectedNames.length ? `(${selectedNames.length})` : ""}
      </span>
      <span>⌄</span>
    </button>

    <div class="neighborhood-panel" id="neighborhoodPanel" hidden>
      <input
        type="search"
        id="neighborhoodSearch"
        placeholder="جست‌وجوی محله..."
        value="${escapeAttribute(neighborhoodSearch)}"
      />

      <div class="neighborhood-options" id="neighborhoodOptions">
        ${renderNeighborhoodOptions()}
      </div>

      <div class="neighborhood-actions">
        <button type="button" id="clearNeighborhoods">پاک کردن انتخاب‌ها</button>
        <button type="button" id="applyNeighborhoods">تأیید</button>
      </div>
    </div>
  `;

  $("#neighborhoodToggle").addEventListener("click", () => {
    const panel = $("#neighborhoodPanel");
    panel.hidden = !panel.hidden;

    if (!panel.hidden) {
      $("#neighborhoodSearch").focus();
    }
  });

  $("#neighborhoodSearch").addEventListener("input", event => {
    neighborhoodSearch = event.target.value;
    $("#neighborhoodOptions").innerHTML = renderNeighborhoodOptions();
  });

  $("#neighborhoodOptions").addEventListener("change", event => {
    if (!event.target.matches('input[type="checkbox"]')) return;

    const id = String(event.target.value);

    if (event.target.checked) {
      selectedNeighborhoods.add(id);
    } else {
      selectedNeighborhoods.delete(id);
    }

    const searchInput = $("#neighborhoodSearch");
    const currentSearch = searchInput ? searchInput.value : "";

    $("#neighborhoodOptions").innerHTML = renderNeighborhoodOptions();

    const newSearchInput = $("#neighborhoodSearch");
    if (newSearchInput) newSearchInput.value = currentSearch;
  });

  $("#clearNeighborhoods").addEventListener("click", () => {
    selectedNeighborhoods.clear();
    renderNeighborhoodPicker();
    renderProperties();
  });

  $("#applyNeighborhoods").addEventListener("click", () => {
    $("#neighborhoodPanel").hidden = true;
    renderNeighborhoodPicker();
    renderProperties();
  });
}

function renderNeighborhoodOptions() {
  const search = neighborhoodSearch.trim().toLowerCase();

  const visible = neighborhoods.filter(item =>
    String(item.name || "").toLowerCase().includes(search)
  );

  if (!visible.length) {
    return `<p class="neighborhood-empty">محله‌ای پیدا نشد.</p>`;
  }

  return visible.map(item => {
    const id = String(item.id);
    const checked = selectedNeighborhoods.has(id) ? "checked" : "";

    return `
      <label class="neighborhood-option">
        <input type="checkbox" value="${escapeAttribute(id)}" ${checked}>
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
        `<p class="empty-state">دریافت فایل‌های ملکی با مشکل مواجه شد.</p>`;
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

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "۰";
  return number.toLocaleString("fa-IR");
}

function formatMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return "توافقی";
  }

  if (number >= 1_000_000_000) {
    const billions = number / 1_000_000_000;

    return `${formatDecimal(billions)} میلیارد تومان`;
  }

  if (number >= 1_000_000) {
    const millions = number / 1_000_000;

    return `${formatDecimal(millions)} میلیون تومان`;
  }

  return `${formatNumber(number)} تومان`;
}

function formatDecimal(value) {
  return Number(value.toFixed(2)).toLocaleString("fa-IR", {
    maximumFractionDigits: 2
  });
}

function getPropertyPrice(property) {
  const category = String(
    property.categories?.title || property.category || ""
  );

  if (category.includes("اجاره")) {
    const deposit = Number(property.deposit || 0);
    const rent = Number(property.monthly_rent || 0);

    const parts = [];

    if (deposit > 0) {
      parts.push(`ودیعه: ${formatMoney(deposit)}`);
    }

    if (rent > 0) {
      parts.push(`اجاره: ${formatMoney(rent)}`);
    }

    return parts.length ? parts.join(" · ") : "توافقی";
  }

  if (property.price) {
    return formatMoney(property.price);
  }

  return "توافقی";
}

function getPropertyImage(property) {
  return property.property_images?.[0]?.image_url || "";
}

function getPropertyCode(property) {
  return property.property_code ||
    property.code ||
    property.id ||
    "";
}

function getPropertyFeatures(property) {
  const features = [];

  if (property.area) {
    features.push(["📐", `${formatNumber(property.area)} متر`]);
  }

  if (property.bedrooms !== null && property.bedrooms !== undefined) {
    features.push(["🛏️", `${formatNumber(property.bedrooms)} خواب`]);
  }

  if (property.parking) features.push(["🚗", "پارکینگ"]);
  if (property.elevator) features.push(["🛗", "آسانسور"]);
  if (property.storage) features.push(["📦", "انباری"]);
  if (property.terrace) features.push(["🌿", "تراس"]);

  return features;
}

function renderProperties() {
  const container = $("#properties");
  if (!container) return;

  let filtered = properties.filter(property => {
    if (
      selectedCategory &&
      String(property.category_id) !== String(selectedCategory)
    ) {
      return false;
    }

    if (selectedNeighborhoods.size) {
      const propertyNeighborhoodIds = (
        property.property_neighborhoods || []
      ).map(item => String(item.neighborhood_id));

      const hasNeighborhood = Array.from(selectedNeighborhoods).some(id =>
        propertyNeighborhoodIds.includes(id)
      );

      if (!hasNeighborhood) return false;
    }

    if (selectedFilters.size) {
      const propertyFilterIds = (
        property.property_filters || []
      ).map(item => String(item.filter_option_id));

      const hasEveryFilter = Array.from(selectedFilters).every(id =>
        propertyFilterIds.includes(id)
      );

      if (!hasEveryFilter) return false;
    }

    return true;
  });

  const count = $("#propertyCount");
  if (count) {
    count.textContent = `${formatNumber(filtered.length)} فایل`;
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div style="font-size:2rem">🏠</div>
        <p>در حال حاضر فایلی با این مشخصات موجود نیست.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(renderPropertyCard).join("");
}

function renderPropertyCard(property) {
  const image = getPropertyImage(property);
  const code = getPropertyCode(property);
  const features = getPropertyFeatures(property);

  const categoryTitle =
    property.categories?.title || "ملک";

  const imageMarkup = image
    ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(property.title || "تصویر ملک")}" loading="lazy">`
    : `<div class="property-no-image">🏠<span>تصویری ثبت نشده</span></div>`;

  return `
    <article
      class="property-card"
      tabindex="0"
      role="button"
      aria-label="${escapeAttribute(property.title || "مشاهده مشخصات ملک")}"
      onclick="openPropertyDetails('${escapeAttribute(property.id)}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPropertyDetails('${escapeAttribute(property.id)}')}">

      <div class="property-image">
        ${imageMarkup}

        <span class="property-category-badge">
          ${getCategoryIcon(categoryTitle)}
          ${escapeHtml(categoryTitle)}
        </span>

        <span class="property-code">
          کد ${escapeHtml(String(code))}
        </span>
      </div>

      <div class="property-card-body">
        <h3 class="property-title">
          ${escapeHtml(property.title || "ملک بدون عنوان")}
        </h3>

        <div class="property-price">
          ${escapeHtml(getPropertyPrice(property))}
        </div>

        ${
          property.location_text
            ? `<div class="property-location">📍 ${escapeHtml(property.location_text)}</div>`
            : ""
        }

        ${
          features.length
            ? `
              <div class="property-features">
                ${features.map(([icon, label]) => `
                  <span class="property-feature">
                    <span>${icon}</span>
                    <span>${escapeHtml(label)}</span>
                  </span>
                `).join("")}
              </div>
            `
            : ""
        }

        <button
          type="button"
          class="property-details-button"
          onclick="event.stopPropagation();openPropertyDetails('${escapeAttribute(property.id)}')">
          مشاهده جزئیات
          <span aria-hidden="true">←</span>
        </button>
      </div>
    </article>
  `;
}
function openPropertyDetails(propertyId) {
  const property = properties.find(
    item => String(item.id) === String(propertyId)
  );

  if (!property) return;

  const modal = $("#propertyModal");
  if (!modal) {
    console.error("عنصر #propertyModal در index.html پیدا نشد.");
    return;
  }

  const images = (property.property_images || [])
    .map(item => item.image_url)
    .filter(Boolean);

  currentGalleryImages = images;
  currentGalleryIndex = 0;

  const code = getPropertyCode(property);
  const features = getPropertyFeatures(property);

  const detailItems = [
    ["دسته‌بندی", property.categories?.title || "ملک"],
    ["قیمت", getPropertyPrice(property)],
    ["متراژ", property.area ? `${formatNumber(property.area)} متر مربع` : ""],
    ["تعداد خواب", property.bedrooms !== null && property.bedrooms !== undefined ? formatNumber(property.bedrooms) : ""],
    ["طبقه", property.floor !== null && property.floor !== undefined ? formatNumber(property.floor) : ""],
    ["موقعیت", property.location_text || ""],
    ["آدرس", property.address || ""]
  ].filter(item => item[1]);

  const imageGallery = images.length
    ? `
      <div class="detail-gallery">
        ${images.map((url, index) => `
          <button
            type="button"
            class="detail-gallery-image"
            onclick="openFullscreenImage(${index})"
            aria-label="نمایش تصویر ${index + 1}">
            <img
              src="${escapeAttribute(url)}"
              alt="تصویر ملک ${index + 1}"
              loading="${index === 0 ? "eager" : "lazy"}">
          </button>
        `).join("")}
      </div>
    `
    : `<div class="property-no-image detail-no-image">🏠<span>تصویری برای این ملک ثبت نشده است.</span></div>`;

  const featuresMarkup = features.length
    ? `
      <div class="detail-features">
        ${features.map(([icon, label]) => `
          <span class="property-feature">
            <span>${icon}</span>
            <span>${escapeHtml(label)}</span>
          </span>
        `).join("")}
      </div>
    `
    : "";

  const detailRows = detailItems.map(([label, value]) => `
    <div class="detail-row">
      <span class="detail-label">${escapeHtml(label)}</span>
      <span class="detail-value">${escapeHtml(String(value))}</span>
    </div>
  `).join("");

  modal.innerHTML = `
    <div class="property-modal-backdrop" onclick="closePropertyDetails()"></div>

    <section
      class="property-modal-content"
      role="dialog"
      aria-modal="true"
      aria-label="${escapeAttribute(property.title || "جزئیات ملک")}">

      <button
        type="button"
        class="property-modal-close"
        onclick="closePropertyDetails()"
        aria-label="بستن پنجره">×</button>

      ${imageGallery}

      <div class="property-modal-body">
        <div class="detail-code">کد فایل: ${escapeHtml(String(code))}</div>

        <h2>${escapeHtml(property.title || "مشخصات ملک")}</h2>

        <div class="detail-price">
          ${escapeHtml(getPropertyPrice(property))}
        </div>

        ${featuresMarkup}

        <div class="detail-table">
          ${detailRows}
        </div>

        ${
          property.description
            ? `
              <div class="detail-description">
                <h3>توضیحات ملک</h3>
                <p>${escapeHtml(property.description).replace(/\n/g, "<br>")}</p>
              </div>
            `
            : ""
        }

        ${
          property.address
            ? `
              <div class="detail-address">
                <strong>آدرس:</strong>
                ${escapeHtml(property.address)}
              </div>
            `
            : ""
        }
      </div>
    </section>
  `;

  modal.hidden = false;
  document.body.classList.add("modal-open");

  if (!history.state || history.state.saeeLayer !== "details") {
    history.pushState({ saeeLayer: "details" }, "");
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

  const imageUrl = currentGalleryImages[currentGalleryIndex];

  if (!imageUrl) return;

  viewer.innerHTML = `
    <button
      type="button"
      class="fullscreen-close"
      onclick="closeFullscreenImage()"
      aria-label="بستن تصویر">×</button>

    <button
      type="button"
      class="fullscreen-prev"
      onclick="changeFullscreenImage(-1)"
      aria-label="تصویر قبلی">‹</button>

    <img
      class="fullscreen-image"
      src="${escapeAttribute(imageUrl)}"
      alt="تصویر بزرگ ملک">

    <button
      type="button"
      class="fullscreen-next"
      onclick="changeFullscreenImage(1)"
      aria-label="تصویر بعدی">›</button>

    <div class="fullscreen-counter">
      ${formatNumber(currentGalleryIndex + 1)}
      /
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
  } else if (modal && !modal.hidden) {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  }
});

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
function ensureExtraStyles() {
  if ($("#saeeExtraStyles")) return;

  const style = document.createElement("style");
  style.id = "saeeExtraStyles";

  style.textContent = `
    .category-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .category-icon {
      font-size: 1.2em;
    }

    .saee-neighborhood-picker {
      position: relative;
      width: 100%;
      max-width: 100%;
      z-index: 20;
    }

    .neighborhood-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      min-height: 46px;
      padding: 10px 14px;
      color: #f3d27b;
      background: #191917;
      border: 1px solid #b99845;
      border-radius: 8px;
      font: inherit;
      cursor: pointer;
    }

    .neighborhood-panel {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      left: 0;
      padding: 12px;
      background: #191917;
      border: 1px solid #b99845;
      border-radius: 10px;
      box-shadow: 0 10px 28px rgba(0,0,0,.4);
      z-index: 100;
    }

    .neighborhood-panel[hidden] {
      display: none !important;
    }

    #neighborhoodSearch {
      box-sizing: border-box;
      width: 100%;
      padding: 10px;
      margin-bottom: 10px;
      color: #fff;
      background: #10100f;
      border: 1px solid #65552e;
      border-radius: 7px;
      font: inherit;
    }

    .neighborhood-options {
      display: grid;
      gap: 4px;
      max-height: 220px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .neighborhood-option {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 9px 5px;
      color: #f1f1ed;
      cursor: pointer;
    }

    .neighborhood-option input {
      accent-color: #d2ad4f;
      width: 17px;
      height: 17px;
    }

    .neighborhood-empty {
      color: #ccc;
      text-align: center;
      padding: 10px;
    }

    .neighborhood-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    .neighborhood-actions button {
      flex: 1;
      min-height: 38px;
      padding: 8px;
      color: #f3d27b;
      background: #10100f;
      border: 1px solid #b99845;
      border-radius: 7px;
      font: inherit;
      cursor: pointer;
    }

    .neighborhood-actions #applyNeighborhoods {
      color: #111;
      background: #d2ad4f;
    }

    .property-card {
      overflow: hidden;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .property-image {
      position: relative;
      overflow: hidden;
      background: #20201d;
      aspect-ratio: 16 / 10;
    }

    .property-image > img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .property-category-badge,
    .property-code {
      position: absolute;
      bottom: 10px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 9px;
      color: #f5d57d;
      background: rgba(15,15,14,.9);
      border: 1px solid rgba(210,173,79,.7);
      border-radius: 6px;
      font-size: .8rem;
      font-weight: 700;
    }

    .property-category-badge {
      right: 10px;
    }

    .property-code {
      left: 10px;
    }

    .property-card-body {
      padding: 14px;
    }

    .property-title {
      margin: 0 0 10px;
      line-height: 1.7;
      font-size: 1.02rem;
    }

    .property-price,
    .detail-price {
      color: #f1cf70;
      font-weight: 800;
      line-height: 1.9;
      overflow-wrap: anywhere;
    }

    .property-location {
      margin-top: 7px;
      color: #c9c8c1;
      font-size: .88rem;
    }

    .property-features,
    .detail-features {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .property-feature {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 8px;
      color: #eee9d9;
      background: #22221e;
      border: 1px solid #49412d;
      border-radius: 6px;
      font-size: .82rem;
    }

    .property-details-button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      margin-top: 14px;
      padding: 10px 12px;
      color: #f2d17a;
      background: #171715;
      border: 1px solid #9f823c;
      border-radius: 7px;
      font: inherit;
      cursor: pointer;
    }

    .property-no-image {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      height: 100%;
      min-height: 160px;
      color: #c9b77e;
      background: #22221e;
      font-size: 2rem;
    }

    .property-no-image span {
      font-size: .8rem;
    }

    .property-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.78);
      z-index: 1000;
    }

    .property-modal-content {
      position: fixed;
      inset: 3vh 3vw;
      z-index: 1001;
      overflow-y: auto;
      overscroll-behavior: contain;
      background: #151513;
      border: 1px solid #7e6836;
      border-radius: 12px;
      color: #f2f0e8;
    }

    .property-modal-content[hidden],
    .fullscreen-image-viewer[hidden] {
      display: none !important;
    }

    .property-modal-close {
      position: sticky;
      top: 10px;
      float: left;
      margin: 10px;
      z-index: 5;
      width: 38px;
      height: 38px;
      color: #f3d27b;
      background: #171715;
      border: 1px solid #b99845;
      border-radius: 50%;
      font-size: 1.5rem;
      cursor: pointer;
    }

    .detail-gallery {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      clear: both;
    }

    .detail-gallery-image {
      padding: 0;
      border: 0;
      background: #222;
      cursor: pointer;
      aspect-ratio: 4 / 3;
      overflow: hidden;
    }

    .detail-gallery-image:first-child {
      grid-column: 1 / -1;
      aspect-ratio: 16 / 9;
    }

    .detail-gallery-image img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .property-modal-body {
      padding: 16px;
    }

    .property-modal-body h2 {
      line-height: 1.7;
      font-size: 1.25rem;
    }

    .detail-code {
      display: inline-block;
      padding: 6px 10px;
      color: #f4d47b;
      background: #262219;
      border: 1px solid #8e7438;
      border-radius: 6px;
      font-weight: 800;
    }

    .detail-table {
      margin-top: 16px;
      border-top: 1px solid #454034;
    }

    .detail-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      padding: 11px 0;
      border-bottom: 1px solid #34332d;
    }

    .detail-label {
      color: #c6b98e;
      flex-shrink: 0;
    }

    .detail-value {
      text-align: left;
      overflow-wrap: anywhere;
    }

    .detail-description {
      margin-top: 18px;
      line-height: 1.9;
      overflow-wrap: anywhere;
    }

    .detail-address {
      margin-top: 16px;
      line-height: 1.9;
      overflow-wrap: anywhere;
    }

    .fullscreen-image-viewer {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
      background: #050505;
    }

    .fullscreen-image {
      display: block;
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
      color: #f3d27b;
      background: rgba(20,20,18,.85);
      border: 1px solid #9f823c;
      border-radius: 50%;
      font-size: 1.7rem;
      cursor: pointer;
    }

    .fullscreen-close {
      top: 16px;
      right: 16px;
    }

    .fullscreen-prev {
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
    }

    .fullscreen-next {
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
    }

    .fullscreen-counter {
      position: absolute;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      padding: 7px 12px;
      color: #f3d27b;
      background: rgba(20,20,18,.85);
      border-radius: 20px;
    }

    .empty-state {
      padding: 24px 12px;
      text-align: center;
      color: #d6d0be;
      line-height: 1.9;
    }

    body.modal-open {
      overflow: hidden;
    }

    @media (max-width: 600px) {
      .property-modal-content {
        inset: 0;
        border-radius: 0;
        border: 0;
      }

      .property-modal-body {
        padding: 13px;
      }

      .property-card-body {
        padding: 12px;
      }

      .property-title {
        font-size: .98rem;
      }

      .property-feature {
        font-size: .78rem;
      }
    }
  `;

  document.head.appendChild(style);
}

loadSite();
