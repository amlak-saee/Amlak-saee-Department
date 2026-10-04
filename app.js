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
    console.error(error);
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

  data.forEach(item => {
    settings[item.setting_key] = item.setting_value || "";
  });

  if (settings.site_name) {
    document.title = settings.site_name;
  }

  if (settings.about_title) {
    $("#aboutTitle").textContent = settings.about_title;
  }

  $("#aboutText").textContent =
    settings.about_text || "اطلاعات این بخش به‌زودی تکمیل می‌شود.";

  $("#footerSlogan").textContent =
    settings.footer_slogan || "انتخاب درست، آینده روشن";

  const phones = [
    settings.contact_phone_1,
    settings.contact_phone_2,
    settings.contact_phone_3
  ].filter(Boolean);

  $("#contactPhones").innerHTML = phones.length
    ? phones.map(phone => `
        <a href="tel:${escapeAttribute(phone)}">
          ${escapeHtml(phone)}
        </a>
      `).join("")
    : "<span>شماره تماسی ثبت نشده است.</span>";

  if (settings.instagram_url) {
    $("#instagramLink").href = settings.instagram_url;
    $("#instagramLink").style.display = "";
  } else {
    $("#instagramLink").style.display = "none";
  }

  if (settings.whatsapp_url) {
    $("#whatsappLink").href = settings.whatsapp_url;
    $("#whatsappLink").style.display = "";
  } else {
    $("#whatsappLink").style.display = "none";
  }

  if (settings.hero_image_url) {
    document.querySelector(".hero").style.backgroundImage =
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
    $("#categories").textContent = "خطا در دریافت دسته‌بندی‌ها";
    return;
  }

  categories = data || [];

  renderCategories();

  if (categories.length) {
    const sale =
      categories.find(category => category.slug === "sale") ||
      categories[0];

    selectCategory(sale.id);
  }
}

function renderCategories() {
  $("#categories").innerHTML = categories.map(category => `
    <button
      class="category-btn"
      data-category-id="${category.id}"
      onclick="selectCategory('${category.id}')">
      ${escapeHtml(category.title)}
    </button>
  `).join("");
}

async function selectCategory(categoryId) {
  selectedCategory = categoryId;
  selectedFilters.clear();

  document.querySelectorAll(".category-btn").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.categoryId === categoryId
    );
  });

  await loadFilters(categoryId);
  renderProperties();
}

async function loadFilters(categoryId) {
  const { data, error } = await db
    .from("filter_options")
    .select("*")
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("sort_order");

  if (error) {
    console.error("Filters error:", error);
    $("#filters").innerHTML = "";
    return;
  }

  filters = data || [];

  renderFilters();
}

function renderFilters() {
  const parents = filters.filter(filter => !filter.parent_id);
  const children = filters.filter(filter => filter.parent_id);

  $("#filters").innerHTML = parents.map(parent => {
    const childFilters = children.filter(
      child => child.parent_id === parent.id
    );

    return `
      <div class="filter-group">
        <button
          class="filter-btn"
          onclick="toggleFilter('${parent.id}')">
          ${escapeHtml(parent.title)}
        </button>

        ${
          childFilters.length
            ? `
              <div class="filter-children">
                ${childFilters.map(child => `
                  <button
                    class="filter-btn"
                    onclick="toggleFilter('${child.id}')">
                    ${escapeHtml(child.title)}
                  </button>
                `).join("")}
              </div>
            `
            : ""
        }
      </div>
    `;
  }).join("");
}

function toggleFilter(filterId) {
  if (selectedFilters.has(filterId)) {
    selectedFilters.delete(filterId);
  } else {
    selectedFilters.add(filterId);
  }

  document.querySelectorAll(".filter-btn").forEach(button => {
    const match = button.getAttribute("onclick");
    if (!match) return;

    const id = match.match(/'([^']+)'/)?.[1];

    if (id) {
      button.classList.toggle(
        "active",
        selectedFilters.has(id)
      );
    }
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

  $("#neighborhoodSelect").innerHTML =
    neighborhoods.length
      ? neighborhoods.map(item => `
          <option value="${item.id}">
            ${escapeHtml(item.name)}
          </option>
        `).join("")
      : `<option value="">محله‌ای ثبت نشده است</option>`;

  $("#neighborhoodSelect").addEventListener(
    "change",
    handleNeighborhoodChange
  );
}

function handleNeighborhoodChange(event) {
  selectedNeighborhoods = new Set(
    Array.from(event.target.selectedOptions)
      .map(option => option.value)
      .filter(Boolean)
  );

  renderProperties();
}

async function loadProperties() {
  const { data, error } = await db
    .from("properties")
    .select(`
      *,
      category_id,
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
    $("#properties").innerHTML =
      "<p>خطا در دریافت فایل‌های ملکی.</p>";
    return;
  }

  properties = data || [];

  renderProperties();
}

function renderProperties() {
  let result = [...properties];

  if (selectedCategory) {
    result = result.filter(
      property => property.category_id === selectedCategory
    );
  }

  if (selectedNeighborhoods.size) {
    result = result.filter(property => {
      const ids =
        property.property_neighborhoods?.map(
          item => item.neighborhood_id
        ) || [];

      return ids.some(id => selectedNeighborhoods.has(id));
    });
  }

  if (selectedFilters.size) {
    result = result.filter(property => {
      const ids =
        property.property_filters?.map(
          item => item.filter_option_id
        ) || [];

      return Array.from(selectedFilters)
        .every(filterId => ids.includes(filterId));
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
    .sort((a, b) => a.sort_order - b.sort_order)
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
    features.push(`${property.area} متر`);
  }

  if (property.bedrooms) {
    features.push(`${property.bedrooms} خواب`);
  }

  if (property.parking) {
    features.push("پارکینگ");
  }

  if (property.elevator) {
    features.push("آسانسور");
  }

  if (property.storage) {
    features.push("انباری");
  }

  if (property.terrace) {
    features.push("تراس");
  }

  return `
    <article
      class="property-card"
      onclick="openPropertyDetails('${property.id}')"
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
    item => item.id === propertyId
  );

  if (!property) return;

  const images = getPropertyImages(property);

  currentGalleryImages = images;
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

  const images = getPropertyImages(property);
  currentGalleryImages = images;

  const neighborhoodsForProperty =
    property.property_neighborhoods || [];

  const neighborhoodNames = neighborhoodsForProperty
    .map(item => {
      const neighborhood = neighborhoods.find(
        n => n.id === item.neighborhood_id
      );

      return neighborhood?.name;
    })
    .filter(Boolean);

  const category =
    categories.find(
      item => item.id === property.category_id
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
                  class="gallery-arrow gallery-prev"
                  onclick="previousGalleryImage()">
                  ‹
                </button>

                <button
                  class="gallery-arrow gallery-next"
                  onclick="nextGalleryImage()">
                  ›
                </button>
              `
              : ""
          }

          <div
            id="galleryCounter"
            class="gallery-counter">
            1 / ${images.length}
          </div>
        </div>

        ${
          images.length > 1
            ? `
              <div class="property-thumbnails">
                ${images.map((image, index) => `
                  <button
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
              ? `
                <div>
                  <span>پارکینگ</span>
                  <strong>دارد</strong>
                </div>
              `
              : ""
          }

          ${
            property.elevator
              ? `
                <div>
                  <span>آسانسور</span>
                  <strong>دارد</strong>
                </div>
              `
              : ""
          }

          ${
            property.storage
              ? `
                <div>
                  <span>انباری</span>
                  <strong>دارد</strong>
                </div>
              `
              : ""
          }

          ${
            property.terrace
              ? `
                <div>
                  <span>تراس</span>
                  <strong>دارد</strong>
                </div>
              `
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

  currentGalleryIndex = index;

  updateGalleryImage();
}

function nextGalleryImage() {
  if (currentGalleryImages.length <= 1) return;

  currentGalleryIndex =
    (currentGalleryIndex + 1) %
    currentGalleryImages.length;

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
    image.src =
      currentGalleryImages[currentGalleryIndex];

    image.alt =
      `تصویر ${currentGalleryIndex + 1}`;
  }

  if (counter) {
    counter.textContent =
      `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
  }

  document
    .querySelectorAll(".property-thumbnail")
    .forEach((thumbnail, index) => {
      thumbnail.classList.toggle(
        "active",
        index === currentGalleryIndex
      );
    });
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
        class="image-viewer-close"
        onclick="closeFullscreenImage()">
        ×
      </button>

      <button
        class="image-viewer-arrow image-viewer-prev"
        onclick="previousFullscreenImage()">
        ‹
      </button>

      <img
        id="fullscreenImage"
        src=""
        alt="تصویر ملک">

      <button
        class="image-viewer-arrow image-viewer-next"
        onclick="nextFullscreenImage()">
        ›
      </button>

      <div
        id="fullscreenCounter"
        class="image-viewer-counter">
      </div>
    `;

    document.body.appendChild(viewer);
  }

  updateFullscreenImage();

  viewer.classList.add("open");
}

function updateFullscreenImage() {
  const image = $("#fullscreenImage");
  const counter = $("#fullscreenCounter");

  if (image) {
    image.src =
      currentGalleryImages[currentGalleryIndex];
  }

  if (counter) {
    counter.textContent =
      `${currentGalleryIndex + 1} / ${currentGalleryImages.length}`;
  }
}

function nextFullscreenImage() {
  nextGalleryImage();
  updateFullscreenImage();
}

function previousFullscreenImage() {
  previousGalleryImage();
  updateFullscreenImage();
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

  if (event.key === "ArrowRight") {
    nextGalleryImage();
    updateFullscreenImage();
  }

  if (event.key === "ArrowLeft") {
    previousGalleryImage();
    updateFullscreenImage();
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
