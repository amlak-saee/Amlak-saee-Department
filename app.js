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
        <a href="tel:${phone}">
          ${phone}
        </a>
      `).join("")
    : "<span>شماره تماسی ثبت نشده است.</span>";

  if (settings.instagram_url) {
    $("#instagramLink").href = settings.instagram_url;
  } else {
    $("#instagramLink").style.display = "none";
  }

  if (settings.whatsapp_url) {
    $("#whatsappLink").href = settings.whatsapp_url;
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

function renderPropertyCard(property) {
  const images =
    [...(property.property_images || [])]
      .sort((a, b) => a.sort_order - b.sort_order);

  const image =
    images[0]?.image_url ||
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80";

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
    <article class="property-card">
      <img
        src="${escapeAttribute(image)}"
        alt="${escapeAttribute(property.title)}"
        loading="lazy">

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
