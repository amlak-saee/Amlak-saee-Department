
"use strict";

const { createClient } = window.supabase;
const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

let categories = [];
let neighborhoods = [];
let filters = [];
let properties = [];

let selectedCategory = null;
let selectedFilters = new Set();
let selectedNeighborhoods = new Set();

let neighborhoodSearch = "";
let filterRequestId = 0;
let currentGalleryImages = [];
let currentGalleryIndex = 0;

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
  close: '<path d="m6 6 12 12M18 6 6 18"/>'
};

function lineIcon(name, size = 22) {
  return `<svg class="saee-icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.home}</svg>`;
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
  return Number.isFinite(number) ? number.toLocaleString("fa-IR") : "۰";
}

function formatDecimal(value) {
  return Number(value).toLocaleString("fa-IR", {
    maximumFractionDigits: 2
  });
}

function formatMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) return "توافقی";
  if (number >= 1_000_000_000) {
    return `${formatDecimal(number / 1_000_000_000)} میلیارد تومان`;
  }
  if (number >= 1_000_000) {
    return `${formatDecimal(number / 1_000_000)} میلیون تومان`;
  }
  return `${formatNumber(number)} تومان`;
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
      console.error(`خطا در بارگذاری بخش ${index + 1}:`, result.reason);
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

  if (settings.site_name) document.title = settings.site_name;

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
    $("#contactPhones").innerHTML = phones.map(phone =>
      `<a href="tel:${escapeAttribute(phone)}">${escapeHtml(phone)}</a>`
    ).join("");
  }

  ["instagramLink", "whatsappLink"].forEach(id => {
    const element = $("#" + id);
    if (!element) return;

    const key = id === "instagramLink" ? "instagram_url" : "whatsapp_url";

    if (settings[key]) {
      element.href = settings[key];
      element.style.display = "";
    } else {
      element.style.display = "none";
    }
  });

  // اگر تصویر در تنظیمات سایت ثبت شده باشد، همان تصویر حفظ می‌شود.
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
    <button type="button"
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
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("sort_order");

  if (requestId !== filterRequestId) return;

  if (error) {
    console.error("Filters error:", error);
    filters = [];
    renderFilters();
    return;
  }

  filters = data || [];
  renderFilters();
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

    if (!childItems.length) {
      return `
        <div class="filter-group filter-group-single">
          <button type="button"
            class="filter-btn ${selectedFilters.has(id) ? "active" : ""}"
            data-filter-id="${escapeAttribute(id)}"
            onclick="toggleFilter('${escapeAttribute(id)}')">
            ${escapeHtml(parent.title)}
          </button>
        </div>
      `;
    }

    return `
      <section class="filter-group">
        <div class="filter-group-title">${escapeHtml(parent.title)}</div>
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
      </section>
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

  renderFilters();
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
    return;
  }

  neighborhoods = data || [];

  const validIds = new Set(neighborhoods.map(item => String(item.id)));

  selectedNeighborhoods = new Set(
    [...selectedNeighborhoods].filter(id => validIds.has(String(id)))
  );

  renderNeighborhoodPicker();
}

function renderNeighborhoodPicker() {
  const select = $("#neighborhoodSelect");
  if (!select) return;

  // انتخاب چند محله با نگه‌داشتن کلید Ctrl در رایانه
  // و لمس چندگزینه‌ای در گوشی‌های پشتیبانی‌کننده از این قابلیت.
  select.innerHTML = neighborhoods.map(neighborhood => `
    <option value="${escapeAttribute(neighborhood.id)}"
      ${selectedNeighborhoods.has(String(neighborhood.id)) ? "selected" : ""}>
      ${escapeHtml(neighborhood.name || neighborhood.title || "محله")}
    </option>
  `).join("");

  select.addEventListener("change", handleNeighborhoodSelectChange, {
    once: true
  });

  updateNeighborhoodToggle();
}

function handleNeighborhoodSelectChange() {
  const select = $("#neighborhoodSelect");
  if (!select) return;

  selectedNeighborhoods = new Set(
    Array.from(select.selectedOptions).map(option => String(option.value))
  );

  updateNeighborhoodToggle();
  renderProperties();

  select.addEventListener("change", handleNeighborhoodSelectChange, {
    once: true
  });
}

function updateNeighborhoodToggle() {
  const toggle = $("#neighborhoodToggle");
  if (!toggle) return;

  const label = toggle.querySelector(".neighborhood-toggle-arrow");

  if (label) {
    label.textContent = selectedNeighborhoods.size
      ? `${formatNumber(selectedNeighborhoods.size)} انتخاب`
      : "⌄";
  }
}

async function loadProperties() {
  const { data, error } = await db
    .from("properties")
    .select(`
      *,
      categories(title),
      property_images(*),
      property_neighborhoods(neighborhood_id),
      property_filters(filter_option_id)
    `)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Properties error:", error);
    properties = [];
    renderProperties();
    return;
  }

  properties = data || [];
  renderProperties();
}

function getPropertyCode(property) {
  return property.property_code ||
    property.code ||
    String(property.id || "").slice(0, 8).toUpperCase();
}

function getPropertyImage(property) {
  const images = property.property_images || [];

  if (images.length) {
    const sorted = [...images].sort(
      (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)
    );

    const primary = sorted.find(image =>
      image.is_primary || image.is_cover || image.is_main
    );

    const image = primary || sorted[0];

    return image.image_url || image.url || image.public_url || "";
  }

  return property.image_url || property.cover_image || "";
}

function getCategoryClass(title) {
  const normalized = String(title || "").trim();

  if (normalized === "فروش") return "sale";
  if (normalized === "اجاره") return "rent";
  if (normalized === "اداری") return "office";
  if (normalized === "مغازه") return "shop";
  if (normalized === "مشارکت در ساخت") return "partnership";

  return "other";
}

function getPropertyPrice(property) {
  const category = property.categories?.title || "";

  if (category === "اجاره") {
    const deposit = Number(property.deposit || 0);
    const rent = Number(property.monthly_rent || property.rent || 0);

    if (deposit && rent) {
      return `ودیعه ${formatMoney(deposit)} · اجاره ${formatMoney(rent)}`;
    }
    if (deposit) return `ودیعه ${formatMoney(deposit)}`;
    if (rent) return `اجاره ${formatMoney(rent)}`;
  }

  if (property.price) return formatMoney(property.price);

  return "قیمت توافقی";
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
      const propertyNeighborhoods = (property.property_neighborhoods || [])
        .map(item => String(item.neighborhood_id));

      const hasNeighborhood = [...selectedNeighborhoods].some(id =>
        propertyNeighborhoods.includes(String(id))
      );

      if (!hasNeighborhood) return false;
    }

    if (selectedFilters.size) {
      const propertyFilters = (property.property_filters || [])
        .map(item => String(item.filter_option_id));

      const matchesAll = [...selectedFilters].every(id =>
        propertyFilters.includes(String(id))
      );

      if (!matchesAll) return false;
    }

    return true;
  });

  const count = $("#propertyCount");

  if (count) {
    count.textContent = `${formatNumber(filtered.length)} فایل ملکی`;
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-properties">
        <span>${lineIcon("home", 34)}</span>
        <h3>فعلاً فایلی پیدا نشد</h3>
        <p>محله یا فیلتر دیگری را انتخاب کنید.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(renderPropertyCard).join("");
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

function openPropertyDetails(propertyId) {
  const property = properties.find(item =>
    String(item.id) === String(propertyId)
  );

  if (!property) return;

  const existing = $("#propertyModal");
  if (existing) existing.remove();

  const images = (property.property_images || [])
    .map(item => item.image_url || item.url || item.public_url)
    .filter(Boolean);

  if (!images.length && getPropertyImage(property)) {
    images.push(getPropertyImage(property));
  }

  currentGalleryImages = images;
  currentGalleryIndex = 0;

  const features = getPropertyFeatures(property);
  const categoryTitle = property.categories?.title || "ملک";

  const modal = document.createElement("div");
  modal.id = "propertyModal";
  modal.className = "property-modal";
  modal.innerHTML = `
    <div class="property-modal-backdrop" onclick="closePropertyDetails()"></div>
    <section class="property-modal-content" role="dialog" aria-modal="true"
      aria-label="جزئیات ملک">

      <button type="button" class="property-modal-close"
        aria-label="بستن" onclick="closePropertyDetails()">
        ${lineIcon("close", 22)}
      </button>

      <div class="property-modal-gallery" id="propertyModalGallery">
        ${images.length
          ? `<img id="propertyModalImage"
              src="${escapeAttribute(images[0])}"
              alt="${escapeAttribute(property.title || "تصویر ملک")}">`
          : `<div class="property-no-image">تصویری ثبت نشده</div>`
        }

        ${images.length > 1 ? `
          <button type="button" class="gallery-prev"
            onclick="changeGalleryImage(-1)" aria-label="تصویر قبلی">‹</button>
          <button type="button" class="gallery-next"
            onclick="changeGalleryImage(1)" aria-label="تصویر بعدی">›</button>
          <span class="gallery-counter" id="galleryCounter">
            ۱ از ${formatNumber(images.length)}
          </span>
        ` : ""}
      </div>

      <div class="property-modal-body">
        <span class="property-category-badge category-${getCategoryClass(categoryTitle)}">
          ${getCategoryIcon(categoryTitle)}
          <span>${escapeHtml(categoryTitle)}</span>
        </span>

        <h2>${escapeHtml(property.title || "ملک بدون عنوان")}</h2>

        <div class="property-modal-code">
          کد ملک: ${escapeHtml(getPropertyCode(property))}
        </div>

        ${property.location_text ? `
          <p class="property-location">
            ${lineIcon("location", 18)}
            ${escapeHtml(property.location_text)}
          </p>
        ` : ""}

        <div class="property-modal-price">
          ${escapeHtml(getPropertyPrice(property))}
        </div>

        ${features.length ? `
          <div class="property-modal-features">
            ${features.map(([icon, label]) => `
              <span class="property-feature">
                ${lineIcon(icon, 19)}
                <span>${escapeHtml(label)}</span>
              </span>
            `).join("")}
          </div>
        ` : ""}

        ${property.description ? `
          <div class="property-description">
            <h3>توضیحات ملک</h3>
            <p>${escapeHtml(property.description).replace(/\n/g, "<br>")}</p>
          </div>
        ` : ""}

        ${property.address ? `
          <div class="property-address">
            <strong>آدرس:</strong>
            ${escapeHtml(property.address)}
          </div>
        ` : ""}

        <div class="property-modal-contact">
          <p>برای اطلاعات بیشتر با دپارتمان املاک ساعی تماس بگیرید.</p>
          ${$("#contactPhones")?.innerHTML || ""}
        </div>
      </div>
    </section>
  `;

  document.body.appendChild(modal);
  document.body.classList.add("modal-open");

  document.addEventListener("keydown", handleModalKeydown);
}

function closePropertyDetails() {
  const modal = $("#propertyModal");
  if (modal) modal.remove();

  document.body.classList.remove("modal-open");
  document.removeEventListener("keydown", handleModalKeydown);
}

function handleModalKeydown(event) {
  if (event.key === "Escape") {
    closePropertyDetails();
  } else if (event.key === "ArrowRight") {
    changeGalleryImage(1);
  } else if (event.key === "ArrowLeft") {
    changeGalleryImage(-1);
  }
}

function changeGalleryImage(direction) {
  if (!currentGalleryImages.length) return;

  currentGalleryIndex =
    (currentGalleryIndex + direction + currentGalleryImages.length) %
    currentGalleryImages.length;

  const image = $("#propertyModalImage");
  const counter = $("#galleryCounter");

  if (image) image.src = currentGalleryImages[currentGalleryIndex];

  if (counter) {
    counter.textContent =
      `${formatNumber(currentGalleryIndex + 1)} از ${formatNumber(currentGalleryImages.length)}`;
  }
}

function ensureExtraStyles() {
  if ($("#saeeExtraStyles")) return;

  const style = document.createElement("style");
  style.id = "saeeExtraStyles";
  style.textContent = `
    #filters {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
      gap: 12px;
      width: 100%;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      min-width: 0;
      padding: 12px;
      background: #171715;
      border: 1px solid #393936;
      border-radius: 12px;
    }

    .filter-group-title {
      color: #dfc16c;
      font-weight: 700;
      line-height: 1.8;
    }

    .filter-children {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 7px;
    }

    .filter-btn {
      border: 1px solid #49463b;
      background: #22221e;
      color: #eee9da;
      border-radius: 9px;
      padding: 9px 12px;
      font: inherit;
      cursor: pointer;
      transition: background .15s ease, border-color .15s ease;
    }

    .filter-btn.active {
      background: #dfc16c;
      color: #171715;
      border-color: #dfc16c;
    }

    .category-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
    }

    .property-code-label {
      display: none !important;
    }

    .property-modal-code {
      color: #dfc16c;
      margin: 10px 0;
      font-size: .95rem;
    }

    .property-modal-gallery {
      position: relative;
      background: #111110;
      min-height: 180px;
      overflow: hidden;
    }

    .property-modal-gallery img {
      display: block;
      width: 100%;
      max-height: 460px;
      object-fit: contain;
    }

    .property-modal-close,
    .gallery-prev,
    .gallery-next {
      position: absolute;
      z-index: 2;
      display: grid;
      place-items: center;
      border: 1px solid #49463b;
      background: rgba(17,17,16,.9);
      color: #dfc16c;
      border-radius: 50%;
      cursor: pointer;
    }

    .property-modal-close {
      top: 10px;
      right: 10px;
      width: 40px;
      height: 40px;
    }

    .gallery-prev,
    .gallery-next {
      top: 50%;
      transform: translateY(-50%);
      width: 38px;
      height: 38px;
      font-size: 28px;
    }

    .gallery-prev { right: 10px; }
    .gallery-next { left: 10px; }

    .gallery-counter {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(17,17,16,.85);
      color: #fff;
      border-radius: 8px;
      padding: 5px 9px;
      font-size: 12px;
    }

    .property-modal-features {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin: 16px 0;
    }

    .property-description,
    .property-address {
      line-height: 2;
      margin-top: 18px;
      overflow-wrap: anywhere;
    }

    .property-modal-contact {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid #393936;
    }

    .property-modal-contact a,
    #contactPhones a {
      display: inline-block;
      color: #dfc16c;
      margin: 5px 10px 5px 0;
      direction: ltr;
    }

    .property-modal {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: grid;
      place-items: center;
      padding: 14px;
    }

    .property-modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,.78);
    }

    .property-modal-content {
      position: relative;
      z-index: 1;
      width: min(720px, 100%);
      max-height: 92vh;
      overflow-y: auto;
      background: #171715;
      color: #f4f0e5;
      border: 1px solid #49463b;
      border-radius: 16px;
    }

    .property-modal-body {
      padding: 18px;
    }

    .property-modal-body h2 {
      line-height: 1.8;
      margin: 12px 0;
    }

    .property-modal-price {
      color: #dfc16c;
      font-weight: 700;
      font-size: 1.1rem;
      margin: 14px 0;
    }

    .empty-properties {
      text-align: center;
      padding: 35px 15px;
      color: #d8d0bb;
      background: #171715;
      border: 1px solid #393936;
      border-radius: 14px;
      grid-column: 1 / -1;
    }

    .empty-properties h3 {
      color: #dfc16c;
    }

    body.modal-open {
      overflow: hidden;
    }

    @media (max-width: 600px) {
      #filters {
        grid-template-columns: 1fr;
        gap: 9px;
      }

      .filter-group {
        padding: 10px;
      }

      .filter-btn {
        padding: 8px 10px;
        font-size: .9rem;
      }

      .property-modal {
        padding: 7px;
      }

      .property-modal-content {
        max-height: 96vh;
        border-radius: 12px;
      }

      .property-modal-body {
        padding: 13px;
      }
    }
  `;

  document.head.appendChild(style);
}
function setupNeighborhoodEvents() {
  const select = $("#neighborhoodSelect");
  if (!select) return;

  select.addEventListener("change", () => {
    selectedNeighborhoods = new Set(
      Array.from(select.selectedOptions).map(option => String(option.value))
    );

    updateNeighborhoodToggle();
    renderProperties();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadSite().catch(error => {
    console.error("Site startup error:", error);
  });
});
