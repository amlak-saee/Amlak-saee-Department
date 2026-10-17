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

const $ = (selector) => document.querySelector(selector);

async function loadSite() {
  try {
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
      ${escapeHtml(category.title)}
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

  // جلوگیری از نمایش نتیجه‌ی درخواست قدیمی هنگام تعویض سریع دسته‌ها
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

  // فقط فیلترهایی نگه داشته شوند که متعلق به دسته‌ی فعلی‌اند
  const availableIds = new Set(
    filters.map(filter => String(filter.id))
  );

  selectedFilters = new Set(
    Array.from(selectedFilters).filter(id => availableIds.has(id))
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

  // اگر فیلتر فعال باشد، خاموش می‌شود؛ در غیر این صورت فعال می‌شود
  if (selectedFilters.has(id)) {
    selectedFilters.delete(id);
  } else {
    selectedFilters.add(id);
  }

  // وضعیت ظاهری دکمه‌ها مطابق انتخاب واقعی به‌روزرسانی می‌شود
  document.querySelectorAll(".filter-btn[data-filter-id]").forEach(button => {
    const buttonId = String(button.dataset.filterId);

    button.classList.toggle(
      "active",
      selectedFilters.has(buttonId)
    );
  });

  renderProperties();
}

async function loadNeighborhoods() {
  const { data, error } = await db
    .from("neighborhoods")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    console.error("Neighborhoods error:", error);
    return;
  }

  neighborhoods = data || [];

  if (!$("#neighborhoodSelect")) return;

  $("#neighborhoodSelect").innerHTML = neighborhoods.length
    ? neighborhoods.map(item => `
        <option value="${escapeAttribute(item.id)}">
          ${escapeHtml(item.name)}
        </option>
      `).join("")
    : `<option value="">محله‌ای ثبت نشده است</option>`;

  $("#neighborhoodSelect").removeEventListener(
    "change",
    handleNeighborhoodChange
  );

  $("#neighborhoodSelect").addEventListener(
    "change",
    handleNeighborhoodChange
  );
}

function handleNeighborhoodChange(event) {
  selectedNeighborhoods = new Set(
    Array.from(event.target.selectedOptions)
      .map(option => String(option.value))
      .filter(Boolean)
  );

  renderProperties();
}

async function loadProperties() {
  const { data, error } = await db
    .from("properties")
    .select(`
      *,
      property_images (
        image_url,
        sort_order
      ),
      property_neighborhoods (
        neighborhood_id
      ),
      property_filters (
        filter_option_id
      )
    `)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Properties error:", error);

    if ($("#properties")) {
      $("#properties").innerHTML =
        "<p>خطا در دریافت فایل‌های ملکی.</p>";
    }

    return;
  }

  properties = data || [];

  renderProperties();
}

function renderProperties() {
  if (!$("#properties")) return;

  let result = [...properties];

  // فیلتر دسته‌بندی
  if (selectedCategory) {
    result = result.filter(
      property =>
        String(property.category_id) === String(selectedCategory)
    );
  }

  // چند محله با منطق OR:
  // ملک باید در حداقل یکی از محله‌های انتخاب‌شده باشد
  if (selectedNeighborhoods.size) {
    result = result.filter(property => {
      const ids = (
        property.property_neighborhoods || []
      ).map(item => String(item.neighborhood_id));

      return ids.some(id => selectedNeighborhoods.has(id));
    });
  }

  // چند فیلتر با منطق OR:
  // ملک باید با حداقل یکی از فیلترهای انتخاب‌شده مطابقت داشته باشد
  if (selectedFilters.size) {
    result = result.filter(property => {
      const ids = (
        property.property_filters || []
      ).map(item => String(item.filter_option_id));

      return Array.from(selectedFilters).some(
        filterId => ids.includes(String(filterId))
      );
    });
  }

  if (!result.length) {
    $("#properties").innerHTML = `
      <div class="empty-state">
        <p>فایلی با این مشخصات پیدا نشد.</p>
      </div>
    `;
    return;
  }

  $("#properties").innerHTML = result
    .map(renderPropertyCard)
    .join("");
}

function getPropertyImages(property) {
  const images = [...(property.property_images || [])]
    .filter(image => image.image_url)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map(image => image.image_url);

  return images.length
    ? images
    : [
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80"
      ];
}

function renderPropertyCard(property) {
  const images = getPropertyImages(property);
  const image = images[0];

  const features = [];

  if (property.area) {
    features.push(`${formatNumber(property.area)} متر`);
  }

  if (property.bedrooms) {
    features.push(`${formatNumber(property.bedrooms)} خواب`);
  }

  if (property.parking) features.push("پارکینگ");
  if (property.elevator) features.push("آسانسور");
  if (property.storage) features.push("انباری");
  if (property.terrace) features.push("تراس");

  return `
    <article
      class="property-card"
      onclick="openPropertyDetails('${escapeAttribute(property.id)}')"
      style="cursor:pointer">

      <div class="property-image-wrap">
        <img
          src="${escapeAttribute(image)}"
          alt="${escapeAttribute(property.title)}"
          loading="lazy">

        ${
          images.length > 1
            ? `<span class="property-image-count">📷 ${images.length}</span>`
            : ""
        }
      </div>

      <div class="property-content">
        <h3>${escapeHtml(property.title)}</h3>

        ${
          property.location_text
            ? `<p>${escapeHtml(property.location_text)}</p>`
            : ""
        }

        <div class="property-meta">
          ${features.map(item => `
            <span>${escapeHtml(item)}</span>
          `).join("")}
        </div>

        ${
          property.price
            ? `
              <div class="property-price">
                ${formatNumber(property.price)} تومان
              </div>
            `
            : ""
        }
      </div>
    </article>
  `;
}

function openPropertyDetails(propertyId) {
  const property = properties.find(
    item => String(item.id) === String(propertyId)
  );

  if (!property) return;

  currentGalleryImages = getPropertyImages(property);
  currentGalleryIndex = 0;

  let modal = document.getElementById("propertyModal");

  if (!modal) {
    createPropertyModal();
    modal = document.getElementById("propertyModal");
  }

  renderPropertyModal(property);

  modal.classList.add("open");
  document.body.classList.add("modal-open");
}

function createPropertyModal() {
  const modal = document.createElement("div");

  modal.id = "propertyModal";
  modal.className = "property-modal";

  modal.innerHTML = `
    <div
      class="property-modal-backdrop"
      onclick="closePropertyDetails()">
    </div>

    <div class="property-modal-box">
      <button
        class="property-modal-close"
        onclick="closePropertyDetails()"
        aria-label="بستن">
        ×
      </button>

      <div id="propertyModalContent"></div>
    </div>
  `;

  document.body.appendChild(modal);
}

function renderPropertyModal(property) {
  const modalContent = $("#propertyModalContent");
  if (!modalContent) return;

  const images = getPropertyImages(property);
  currentGalleryImages = images;

  const neighborhoodsForProperty =
    property.property_neighborhoods || [];

  const neighborhoodNames = neighborhoodsForProperty
    .map(item => {
      const neighborhood = neighborhoods.find(
        n => String(n.id) === String(item.neighborhood_id)
      );

      return neighborhood?.name;
    })
    .filter(Boolean);

  const category =
    categories.find(
      item => String(item.id) === String(property.category_id)
    )?.title || "";

  modalContent.innerHTML = `
    <div class="property-detail">
      <div class="property-gallery">
        <div class="property-main-image">
          <img
            id="propertyGalleryImage"
            src="${escapeAttribute(images[0])}"
            alt="${escapeAttribute(property.title)}"
            onclick="openFullscreenImage()">

          ${
            images.length > 1
              ? `
                <button
                  type="button"
                  class="gallery-arrow gallery-prev"
                  onclick="previousGalleryImage()">
                  ‹
                </button>

                <button
                  type="button"
                  class="gallery-arrow gallery-next"
                  onclick="nextGalleryImage()">
                  ›
                </button>
              `
              : ""
          }

          <div id="galleryCounter" class="gallery-counter">
            1 / ${images.length}
          </div>
        </div>

        ${
          images.length > 1
            ? `
              <div class="property-thumbnails">
                ${images.map((image, index) => `
                  <button
                    type="button"
                    class="property-thumbnail ${index === 0 ? "active" : ""}"
                    onclick="goToGalleryImage(${index})">
                    <img
                      src="${escapeAttribute(image)}"
                      alt="تصویر ${index + 1}"
                      loading="lazy">
                  </button>
                `).join("")}
              </div>
            `
            : ""
        }
      </div>

      <div class="property-detail-content">
        <span class="property-detail-category">
          ${escapeHtml(category)}
        </span>

        <h2>${escapeHtml(property.title)}</h2>

        ${
          property.location_text
            ? `
              <div class="detail-row">
                <strong>محل:</strong>
                <span>${escapeHtml(property.location_text)}</span>
              </div>
            `
            : ""
        }

        ${
          neighborhoodNames.length
            ? `
              <div class="detail-row">
                <strong>محله:</strong>
                <span>${escapeHtml(neighborhoodNames.join("، "))}</span>
              </div>
            `
            : ""
        }

        <div class="detail-features">
          ${
            property.area
              ? `
                <div>
                  <span>متراژ</span>
                  <strong>${formatNumber(property.area)} متر</strong>
                </div>
              `
              : ""
          }

          ${
            property.bedrooms
              ? `
                <div>
                  <span>خواب</span>
                  <strong>${formatNumber(property.bedrooms)}</strong>
                </div>
              `
              : ""
          }

          ${
            property.parking
              ? `<div><span>پارکینگ</span><strong>دارد</strong></div>`
              : ""
          }

          ${
            property.elevator
              ? `<div><span>آسانسور</span><strong>دارد</strong></div>`
              : ""
          }

          ${
            property.storage
              ? `<div><span>انباری</span><strong>دارد</strong></div>`
              : ""
          }

          ${
            property.terrace
              ? `<div><span>تراس</span><strong>دارد</strong></div>`
              : ""
          }
        </div>

        ${
          property.price
            ? `
              <div class="detail-price">
                <span>قیمت</span>
                <strong>${formatNumber(property.price)} تومان</strong>
              </div>
            `
            : ""
        }

        ${
          property.monthly_rent
            ? `
              <div class="detail-price">
                <span>اجاره ماهانه</span>
                <strong>${formatNumber(property.monthly_rent)} تومان</strong>
              </div>
            `
            : ""
        }

        ${
          property.deposit
            ? `
              <div class="detail-price">
                <span>ودیعه</span>
                <strong>${formatNumber(property.deposit)} تومان</strong>
              </div>
            `
            : ""
        }

        ${
          property.frontage_type
            ? `
              <div class="detail-row">
                <strong>موقعیت:</strong>
                <span>${escapeHtml(property.frontage_type)}</span>
              </div>
            `
            : ""
        }

        ${
          property.address
            ? `
              <div class="detail-row">
                <strong>آدرس:</strong>
                <span>${escapeHtml(property.address)}</span>
              </div>
            `
            : ""
        }

        ${
          property.description
            ? `
              <div class="detail-description">
                <h3>توضیحات ملک</h3>
                <p>${escapeHtml(property.description)}</p>
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function goToGalleryImage(index) {
  if (!currentGalleryImages.length) return;

  if (index < 0 || index >= currentGalleryImages.length) return;

  currentGalleryIndex = index;
  updateGalleryImage();
}

function nextGalleryImage() {
  if (currentGalleryImages.length <= 1) return;

  currentGalleryIndex =
    (currentGalleryIndex + 1) % currentGalleryImages.length;

  updateGalleryImage();
}

function previousGalleryImage() {
  if (currentGalleryImages.length <= 1) return;

  currentGalleryIndex =
    (currentGalleryIndex - 1 + currentGalleryImages.length) %
    currentGalleryImages.length;

  updateGalleryImage();
}

function updateGalleryImage() {
  const image = $("#propertyGalleryImage");
  const counter = $("#galleryCounter");

  if (image) {
    image.src = currentGalleryImages[currentGalleryIndex];
    image.alt = `تصویر ${currentGalleryIndex + 1}`;
  }

  if (counter) {
    counter.textContent =
      `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
  }

  document.querySelectorAll(".property-thumbnail").forEach(
    (thumbnail, index) => {
      thumbnail.classList.toggle(
        "active",
        index === currentGalleryIndex
      );
    }
  );

  const viewer = $("#imageViewer");

  if (viewer?.classList.contains("open")) {
    updateFullscreenImage();
  }
}

function openFullscreenImage() {
  if (!currentGalleryImages.length) return;

  let viewer = document.getElementById("imageViewer");

  if (!viewer) {
    viewer = document.createElement("div");

    viewer.id = "imageViewer";
    viewer.className = "image-viewer";

    viewer.innerHTML = `
      <button
        type="button"
        class="image-viewer-close"
        onclick="closeFullscreenImage()">
        ×
      </button>

      <button
        type="button"
        class="image-viewer-arrow image-viewer-prev"
        onclick="previousFullscreenImage()">
        ‹
      </button>

      <img
        id="fullscreenImage"
        src=""
        alt="تصویر ملک">

      <button
        type="button"
        class="image-viewer-arrow image-viewer-next"
        onclick="nextFullscreenImage()">
        ›
      </button>

      <div id="fullscreenCounter" class="image-viewer-counter"></div>
    `;

    document.body.appendChild(viewer);
  }

  updateFullscreenImage();
  viewer.classList.add("open");
}

function updateFullscreenImage() {
  const image = $("#fullscreenImage");
  const counter = $("#fullscreenCounter");

  if (image && currentGalleryImages.length) {
    image.src = currentGalleryImages[currentGalleryIndex];
  }

  if (counter && currentGalleryImages.length) {
    counter.textContent =
      `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
  }
}

function nextFullscreenImage() {
  nextGalleryImage();
}

function previousFullscreenImage() {
  previousGalleryImage();
}

function closeFullscreenImage() {
  const viewer = $("#imageViewer");

  if (viewer) {
    viewer.classList.remove("open");
  }
}

function closePropertyDetails() {
  const modal = $("#propertyModal");

  if (modal) {
    modal.classList.remove("open");
  }

  closeFullscreenImage();
  document.body.classList.remove("modal-open");
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeFullscreenImage();
    closePropertyDetails();
  }

  const viewer = $("#imageViewer");

  if (
    viewer?.classList.contains("open") ||
    $("#propertyModal")?.classList.contains("open")
  ) {
    if (event.key === "ArrowRight") {
      previousGalleryImage();
    }

    if (event.key === "ArrowLeft") {
      nextGalleryImage();
    }
  }
});

function formatNumber(value) {
  return Number(value).toLocaleString("fa-IR");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

loadSite();
