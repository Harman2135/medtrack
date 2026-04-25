const SOON_DAYS = 30;
const LOW_STOCK_LIMIT = 10;
const IMPORTABLE_FORMS = ["Tablet", "Capsule", "Syrup", "Injection", "Ointment", "Drops"];
const PASSWORD_MIN_LENGTH = 8;

const today = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

const toDate = (value) => {
  const parsed = new Date(`${value}T00:00:00`);
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const daysUntil = (value) => Math.ceil((toDate(value) - today()) / 86400000);

const formatDate = (value) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(toDate(value));
};

const formatMoney = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatReceiptMoney = (value) => formatMoney(value).replace("\u20b9", "Rs ");

const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

let state = {
  medicines: [],
  sales: [],
  lastReceipt: "",
};
let activeView = "dashboardView";
let currentCart = [];
let activeReport = "inventory";
let currentUser = null;
let pendingBillImport = null;
let activeMedicineMode = "manual";
let authMeta = {
  authRules: {
    passwordMinLength: PASSWORD_MIN_LENGTH,
    requiresSpecialCharacter: true,
  },
};

const els = {
  loginView: document.getElementById("loginView"),
  createAccountView: document.getElementById("createAccountView"),
  appView: document.getElementById("appView"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  showCreateAccountBtn: document.getElementById("showCreateAccountBtn"),
  createAccountForm: document.getElementById("createAccountForm"),
  backToLoginBtn: document.getElementById("backToLoginBtn"),
  registerName: document.getElementById("registerName"),
  registerUsername: document.getElementById("registerUsername"),
  registerPassword: document.getElementById("registerPassword"),
  registerConfirmPassword: document.getElementById("registerConfirmPassword"),
  createAccountMessage: document.getElementById("createAccountMessage"),
  logoutBtn: document.getElementById("logoutBtn"),
  confirmLogoutBtn: document.getElementById("confirmLogoutBtn"),
  cancelLogoutBtn: document.getElementById("cancelLogoutBtn"),
  logoutModal: document.getElementById("logoutModal"),
  pageTitle: document.getElementById("pageTitle"),
  currentUserName: document.getElementById("currentUserName"),
  dashboardUserName: document.getElementById("dashboardUserName"),
  globalSearch: document.getElementById("globalSearch"),
  printReceiptBtn: document.getElementById("printReceiptBtn"),
  totalMedicines: document.getElementById("totalMedicines"),
  soonCount: document.getElementById("soonCount"),
  expiredCount: document.getElementById("expiredCount"),
  salesValue: document.getElementById("salesValue"),
  criticalStockList: document.getElementById("criticalStockList"),
  recentSalesList: document.getElementById("recentSalesList"),
  medicineForm: document.getElementById("medicineForm"),
  medicineFormTitle: document.getElementById("medicineFormTitle"),
  resetMedicineForm: document.getElementById("resetMedicineForm"),
  medicineFormMessage: document.getElementById("medicineFormMessage"),
  manualModeBtn: document.getElementById("manualModeBtn"),
  billModeBtn: document.getElementById("billModeBtn"),
  billModePanel: document.getElementById("billModePanel"),
  billApiStatus: document.getElementById("billApiStatus"),
  billScanForm: document.getElementById("billScanForm"),
  billFile: document.getElementById("billFile"),
  billScanBtn: document.getElementById("billScanBtn"),
  billScanMessage: document.getElementById("billScanMessage"),
  billScanSummary: document.getElementById("billScanSummary"),
  billPreviewBody: document.getElementById("billPreviewBody"),
  importScannedBtn: document.getElementById("importScannedBtn"),
  clearImportedBtn: document.getElementById("clearImportedBtn"),
  medicineTableBody: document.getElementById("medicineTableBody"),
  statusFilter: document.getElementById("statusFilter"),
  saleDatePill: document.getElementById("saleDatePill"),
  scanForm: document.getElementById("scanForm"),
  scanBarcode: document.getElementById("scanBarcode"),
  scanQuantity: document.getElementById("scanQuantity"),
  discountPercent: document.getElementById("discountPercent"),
  scanMessage: document.getElementById("scanMessage"),
  barcodeLookup: document.getElementById("barcodeLookup"),
  cartTableBody: document.getElementById("cartTableBody"),
  billSummary: document.getElementById("billSummary"),
  cartTotal: document.getElementById("cartTotal"),
  clearCartBtn: document.getElementById("clearCartBtn"),
  completeSaleBtn: document.getElementById("completeSaleBtn"),
  receiptOutput: document.getElementById("receiptOutput"),
  printCurrentReceiptBtn: document.getElementById("printCurrentReceiptBtn"),
  refreshAlertsBtn: document.getElementById("refreshAlertsBtn"),
  alertsList: document.getElementById("alertsList"),
  inventoryReportBtn: document.getElementById("inventoryReportBtn"),
  salesReportBtn: document.getElementById("salesReportBtn"),
  expiryReportBtn: document.getElementById("expiryReportBtn"),
  exportReportBtn: document.getElementById("exportReportBtn"),
  reportSummary: document.getElementById("reportSummary"),
  reportHead: document.getElementById("reportHead"),
  reportBody: document.getElementById("reportBody"),
  accountName: document.getElementById("accountName"),
  accountUsername: document.getElementById("accountUsername"),
  changePasswordForm: document.getElementById("changePasswordForm"),
  oldPassword: document.getElementById("oldPassword"),
  newPassword: document.getElementById("newPassword"),
  confirmNewPassword: document.getElementById("confirmNewPassword"),
  changePasswordMessage: document.getElementById("changePasswordMessage"),
};

const formFields = {
  medicineId: document.getElementById("medicineId"),
  medicineName: document.getElementById("medicineName"),
  batchNumber: document.getElementById("batchNumber"),
  manufactureDate: document.getElementById("manufactureDate"),
  expiryDate: document.getElementById("expiryDate"),
  quantity: document.getElementById("quantity"),
  barcode: document.getElementById("barcode"),
  mrp: document.getElementById("mrp"),
  saleRate: document.getElementById("saleRate"),
  gstPercent: document.getElementById("gstPercent"),
  dosage: document.getElementById("dosage"),
  form: document.getElementById("form"),
  manufacturer: document.getElementById("manufacturer"),
  supplierName: document.getElementById("supplierName"),
  supplierContact: document.getElementById("supplierContact"),
};

async function apiRequest(url, options = {}) {
  const request = {
    method: options.method || "GET",
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  };

  if (options.body !== undefined) {
    request.body = options.body instanceof FormData ? options.body : JSON.stringify(options.body);
  }

  const response = await fetch(url, request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

function setAppState(nextState) {
  state = {
    medicines: (nextState?.medicines || []).map(normalizeMedicineRecord),
    sales: nextState?.sales || [],
    lastReceipt: nextState?.lastReceipt || "",
  };
}

async function persistState() {
  await apiRequest("/api/app-state", {
    method: "PUT",
    body: { state },
  });
}

function showCreateAccountScreen() {
  els.loginView.hidden = true;
  els.createAccountView.hidden = false;
  els.appView.hidden = true;
  setMessage(els.createAccountMessage, "");
  resetPasswordVisibility();
}

function showAuthenticatedApp() {
  els.loginView.hidden = true;
  els.createAccountView.hidden = true;
  els.appView.hidden = false;
  els.logoutModal.hidden = true;
  setMessage(els.changePasswordMessage, "");
  resetPasswordVisibility();
  showView(activeView);
}

function showLoggedOutView() {
  currentUser = null;
  currentCart = [];
  pendingBillImport = null;
  setAppState({ medicines: [], sales: [], lastReceipt: "" });
  els.appView.hidden = true;
  els.loginView.hidden = false;
  els.createAccountView.hidden = true;
  els.loginError.textContent = "";
  els.loginForm.reset();
  els.createAccountForm.reset();
  setMessage(els.createAccountMessage, "");
  setMessage(els.changePasswordMessage, "");
  els.logoutModal.hidden = true;
  resetPasswordVisibility();
}

function applyBootstrap(payload) {
  authMeta = {
    authRules: payload.authRules || authMeta.authRules,
  };
  currentUser = payload.user || null;
  if (payload.state) {
    setAppState(payload.state);
  }
}

async function initializeApp() {
  try {
    const payload = await apiRequest("/api/bootstrap");
    applyBootstrap(payload);
    if (payload.authenticated) {
      showAuthenticatedApp();
      await checkBillApiStatus();
      return;
    }
    showLoggedOutView();
  } catch (error) {
    showLoggedOutView();
    els.loginError.textContent = error instanceof Error ? error.message : "Unable to connect to MedTrack.";
  }
}

function renderCurrentUser() {
  const name = currentUser?.name || "User";
  const username = currentUser?.username || "-";
  els.currentUserName.textContent = name;
  els.dashboardUserName.textContent = name;
  els.accountName.textContent = name;
  els.accountUsername.textContent = username;
}

function resetPasswordVisibility() {
  document.querySelectorAll(".password-toggle").forEach((button) => {
    const inputId = button.dataset.passwordToggle;
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = "password";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "Show password");
  });
}

function getExpiryInfo(medicine) {
  const days = daysUntil(medicine.expiryDate);
  if (days < 0) {
    return { key: "expired", label: "Expired", days };
  }
  if (days <= SOON_DAYS) {
    return { key: "soon", label: "Expiring soon", days };
  }
  return { key: "safe", label: "Safe", days };
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.style.color = isError ? "var(--red)" : "var(--brand-dark)";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moneyNumber(value) {
  return Number(value || 0);
}

function percentNumber(value) {
  return Number(value || 0);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function clampDiscount(value) {
  return Math.min(100, Math.max(0, percentNumber(value)));
}

function normalizeMedicineRecord(medicine) {
  const mrp = roundMoney(medicine.mrp ?? medicine.price ?? medicine.saleRate ?? 0);
  const saleRate = roundMoney(medicine.saleRate ?? medicine.price ?? medicine.mrp ?? 0);
  const gstPercent = percentNumber(medicine.gstPercent ?? 0);
  const packSize = Math.round(Number(medicine.packSize || 0));
  const purchaseQty = Math.round(Number(medicine.purchaseQty || 0));

  return {
    ...medicine,
    manufactureDate: medicine.manufactureDate || "",
    packSize: packSize > 0 ? packSize : 0,
    purchaseQty: purchaseQty > 0 ? purchaseQty : 0,
    mrp,
    saleRate,
    gstPercent,
  };
}

function getItemPricing(item) {
  const quantity = Number(item.quantity || 0);
  const discountPercent = clampDiscount(item.discountPercent);
  const mrp = Number(item.mrp || 0);
  const saleRate = Number(item.saleRate || 0);
  const gstPercent = Number(item.gstPercent || 0);
  const gstUnit = roundMoney(saleRate * (gstPercent / 100));
  const shopkeeperUnit = roundMoney(saleRate + gstUnit);
  const discountedMrpUnit = roundMoney(mrp * (1 - discountPercent / 100));
  const sellingPriceUnit = Math.max(discountedMrpUnit, shopkeeperUnit);
  const sellingPriceTotal = roundMoney(sellingPriceUnit * quantity);
  const gstTotal = roundMoney(gstUnit * quantity);
  const shopkeeperTotal = roundMoney(shopkeeperUnit * quantity);
  const mrpTotal = roundMoney(mrp * quantity);
  const discountTotal = roundMoney((mrp - sellingPriceUnit) * quantity);

  return {
    mrpUnit: mrp,
    saleRateUnit: saleRate,
    requestedDiscountPercent: discountPercent,
    sellingPriceUnit,
    gstUnit,
    shopkeeperUnit,
    mrpTotal,
    discountTotal,
    sellingPriceTotal,
    gstTotal,
    shopkeeperTotal,
    total: sellingPriceTotal,
  };
}

function maxAllowedDiscountPercent(medicine) {
  const mrp = Number(medicine?.mrp || 0);
  const saleRate = Number(medicine?.saleRate || 0);
  const gstPercent = Number(medicine?.gstPercent || 0);
  if (mrp <= 0) return 0;
  const shopkeeperUnit = roundMoney(saleRate + roundMoney(saleRate * (gstPercent / 100)));
  const maxDiscount = ((mrp - shopkeeperUnit) / mrp) * 100;
  return Math.max(0, roundMoney(maxDiscount));
}

function cartBreakdown() {
  return currentCart.reduce(
    (summary, item) => {
      const pricing = getItemPricing(item);
      summary.mrpTotal += pricing.mrpTotal;
      summary.discountTotal += pricing.discountTotal;
      summary.sellingPriceTotal += pricing.sellingPriceTotal;
      summary.gstTotal += pricing.gstTotal;
      summary.shopkeeperTotal += pricing.shopkeeperTotal;
      summary.finalTotal += pricing.total;
      return summary;
    },
    {
      mrpTotal: 0,
      discountTotal: 0,
      sellingPriceTotal: 0,
      gstTotal: 0,
      shopkeeperTotal: 0,
      finalTotal: 0,
    },
  );
}

function normalizeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function sanitizeIsoDate(value) {
  const trimmed = String(value ?? "").trim();
  return isIsoDate(trimmed) ? trimmed : "";
}

function normalizeImportedForm(value) {
  const match = IMPORTABLE_FORMS.find((option) => normalizeKey(option) === normalizeKey(value));
  return match || "Tablet";
}

function makeAutoBarcode(name, batchNumber, index) {
  const seed = (batchNumber || name || "MED").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 14) || "MED";
  return `AUTO-${seed}-${Date.now().toString(36).toUpperCase()}${String(index + 1).padStart(2, "0")}`;
}

function reserveBarcode(rawBarcode, name, batchNumber, index, usedBarcodes) {
  const trimmed = String(rawBarcode ?? "").trim();
  if (trimmed && !usedBarcodes.has(normalizeKey(trimmed))) {
    usedBarcodes.add(normalizeKey(trimmed));
    return { value: trimmed, generated: false };
  }

  let candidate = makeAutoBarcode(name, batchNumber, index);
  while (usedBarcodes.has(normalizeKey(candidate))) {
    candidate = `${candidate}${Math.floor(Math.random() * 10)}`;
  }
  usedBarcodes.add(normalizeKey(candidate));
  return { value: candidate, generated: true };
}

function prepareBillImport(payload) {
  const extracted = payload?.extracted || {};
  const warnings = Array.isArray(extracted.warnings) ? extracted.warnings.filter(Boolean) : [];
  const usedBarcodes = new Set(state.medicines.map((medicine) => normalizeKey(medicine.barcode)).filter(Boolean));
  const medicines = [];

  (Array.isArray(extracted.medicines) ? extracted.medicines : []).forEach((item, index) => {
    const name = String(item?.name ?? "").trim();
    const batchNumber = String(item?.batchNumber ?? "").trim();
    const manufactureDate = sanitizeIsoDate(item?.manufactureDate);
    const expiryDate = sanitizeIsoDate(item?.expiryDate);
    const packSizeRaw = Number(item?.packSize ?? 0);
    const purchaseQtyRaw = Number(item?.purchaseQty ?? 0);
    const packSize = Number.isFinite(packSizeRaw) && packSizeRaw > 0 ? Math.round(packSizeRaw) : 0;
    const purchaseQty = Number.isFinite(purchaseQtyRaw) && purchaseQtyRaw > 0 ? Math.round(purchaseQtyRaw) : 0;
    const quantityRaw = Number(item?.quantity ?? 0);
    const quantity = packSize && purchaseQty
      ? packSize * purchaseQty
      : Math.round(quantityRaw);
    const mrp = roundMoney(item?.mrp ?? 0);
    const saleRate = roundMoney(item?.saleRate ?? item?.rate ?? 0);
    const gstPercent = percentNumber(item?.gstPercent ?? 0);

    if (!name || !batchNumber) {
      warnings.push(`Skipped row ${index + 1}: missing medicine name or batch number.`);
      return;
    }
    if (!expiryDate) {
      warnings.push(`Skipped ${name}: missing expiry date.`);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      warnings.push(`Skipped ${name}: invalid quantity.`);
      return;
    }
    if (!Number.isFinite(mrp) || mrp < 0) {
      warnings.push(`Skipped ${name}: invalid MRP.`);
      return;
    }
    if (!Number.isFinite(saleRate) || saleRate < 0) {
      warnings.push(`Skipped ${name}: invalid sale rate.`);
      return;
    }

    const barcode = reserveBarcode(item?.barcode, name, batchNumber, index, usedBarcodes);
    if (barcode.generated) {
      warnings.push(`Generated an internal barcode for ${name} (${batchNumber}).`);
    }

    medicines.push({
      id: makeId("med"),
      name,
      batchNumber,
      manufactureDate,
      expiryDate,
      packSize,
      purchaseQty,
      quantity,
      barcode: barcode.value,
      mrp,
      saleRate,
      gstPercent,
      dosage: String(item?.dosage ?? "").trim(),
      form: normalizeImportedForm(item?.form),
      manufacturer: String(item?.manufacturer ?? "").trim(),
      supplierName: String(extracted.supplierName ?? "").trim(),
      supplierContact: "",
      barcodeGenerated: barcode.generated,
    });
  });

  return {
    sourceFileName: String(payload?.sourceFileName ?? "").trim(),
    supplierName: String(extracted.supplierName ?? "").trim(),
    invoiceNumber: String(extracted.invoiceNumber ?? "").trim(),
    invoiceDate: sanitizeIsoDate(extracted.invoiceDate),
    warnings,
    medicines,
  };
}

function resetBillImport(clearMessage = true) {
  pendingBillImport = null;
  els.billScanForm.reset();
  if (clearMessage) setMessage(els.billScanMessage, "");
  renderBillImport();
}

function renderBillImport() {
  if (!pendingBillImport) {
    els.billScanSummary.className = "import-summary empty-state";
    els.billScanSummary.textContent = "No bill scanned yet.";
    els.billPreviewBody.innerHTML =
      `<tr><td colspan="10"><div class="empty-state">Preview rows will appear here after scanning.</div></td></tr>`;
    els.importScannedBtn.disabled = true;
    return;
  }

  const meta = [
    pendingBillImport.sourceFileName ? `File: ${escapeHtml(pendingBillImport.sourceFileName)}` : "",
    pendingBillImport.supplierName ? `Supplier: ${escapeHtml(pendingBillImport.supplierName)}` : "",
    pendingBillImport.invoiceNumber ? `Invoice: ${escapeHtml(pendingBillImport.invoiceNumber)}` : "",
    pendingBillImport.invoiceDate ? `Invoice date: ${formatDate(pendingBillImport.invoiceDate)}` : "",
    `Rows ready: ${pendingBillImport.medicines.length}`,
  ].filter(Boolean);

  const warningMarkup = pendingBillImport.warnings.length
    ? `<div class="import-warning-list">${pendingBillImport.warnings
      .map((warning) => `<p>${escapeHtml(warning)}</p>`)
      .join("")}</div>`
    : `<p class="import-success-note">No extraction warnings.</p>`;

  els.billScanSummary.className = "import-summary";
  els.billScanSummary.innerHTML = `
    <div class="import-meta">
      ${meta.map((line) => `<p>${line}</p>`).join("")}
    </div>
    ${warningMarkup}
  `;

  els.billPreviewBody.innerHTML = pendingBillImport.medicines.length
    ? pendingBillImport.medicines
      .map(
        (medicine) => `
          <tr>
            <td>
              <strong>${escapeHtml(medicine.name)}</strong><br>
              <small>${escapeHtml(medicine.barcode)}</small>
            </td>
            <td>${escapeHtml(medicine.batchNumber)}</td>
            <td>${formatDate(medicine.manufactureDate)}</td>
            <td>${formatDate(medicine.expiryDate)}</td>
            <td>${medicine.packSize || "-"}</td>
            <td>${medicine.purchaseQty || "-"}</td>
            <td>${medicine.quantity}</td>
            <td>${formatMoney(medicine.mrp)}</td>
            <td>${formatMoney(medicine.saleRate)}</td>
            <td>${medicine.gstPercent}%</td>
          </tr>
        `,
      )
      .join("")
    : `<tr><td colspan="10"><div class="empty-state">No importable medicine rows were found.</div></td></tr>`;

  els.importScannedBtn.disabled = pendingBillImport.medicines.length === 0;
}

async function mergeImportedMedicineRows() {
  if (!pendingBillImport?.medicines.length) {
    setMessage(els.billScanMessage, "No scanned medicines are ready to import.", true);
    return;
  }

  let created = 0;
  let updated = 0;

  pendingBillImport.medicines.forEach((item) => {
    const existing = state.medicines.find(
      (medicine) =>
        normalizeKey(medicine.name) === normalizeKey(item.name)
        && normalizeKey(medicine.batchNumber) === normalizeKey(item.batchNumber),
    );

    if (existing) {
      existing.quantity = Number(existing.quantity) + Number(item.quantity);
      existing.packSize = item.packSize || existing.packSize || 0;
      existing.purchaseQty = item.purchaseQty || existing.purchaseQty || 0;
      existing.manufactureDate = item.manufactureDate || existing.manufactureDate;
      existing.expiryDate = item.expiryDate || existing.expiryDate;
      existing.mrp = Number(item.mrp);
      existing.saleRate = Number(item.saleRate);
      existing.gstPercent = percentNumber(item.gstPercent);
      existing.dosage = item.dosage || existing.dosage;
      existing.form = item.form || existing.form;
      existing.manufacturer = item.manufacturer || existing.manufacturer;
      existing.supplierName = item.supplierName || existing.supplierName;
      if ((!existing.barcode || existing.barcode.startsWith("AUTO-")) && !item.barcodeGenerated) {
        existing.barcode = item.barcode;
      }
      updated += 1;
      return;
    }

    state.medicines.push(normalizeMedicineRecord({
      id: item.id,
      name: item.name,
      batchNumber: item.batchNumber,
      manufactureDate: item.manufactureDate,
      expiryDate: item.expiryDate,
      packSize: item.packSize || 0,
      purchaseQty: item.purchaseQty || 0,
      quantity: Number(item.quantity),
      barcode: item.barcode,
      mrp: Number(item.mrp),
      saleRate: Number(item.saleRate),
      gstPercent: percentNumber(item.gstPercent),
      dosage: item.dosage,
      form: item.form,
      manufacturer: item.manufacturer,
      supplierName: item.supplierName,
      supplierContact: "",
    }));
    created += 1;
  });

  try {
    await persistState();
    render();
    setMessage(els.billScanMessage, `Imported ${created} new row(s) and updated ${updated} existing row(s).`);
    resetBillImport(false);
  } catch (error) {
    setMessage(els.billScanMessage, error instanceof Error ? error.message : "Could not save imported medicines.", true);
  }
}

async function checkBillApiStatus() {
  if (window.location.protocol === "file:") {
    els.billApiStatus.textContent = "Run via server";
    els.billApiStatus.className = "pill bad-pill";
    return;
  }

  try {
    const response = await fetch("/api/health");
    const payload = await response.json();
    if (!payload.ok) throw new Error("Server health check failed.");

    if (payload.geminiConfigured) {
      els.billApiStatus.textContent = "Gemini ready";
      els.billApiStatus.className = "pill good-pill";
    } else {
      els.billApiStatus.textContent = "Add API key";
      els.billApiStatus.className = "pill neutral-pill";
    }
  } catch {
    els.billApiStatus.textContent = "Backend offline";
    els.billApiStatus.className = "pill bad-pill";
  }
}

function filteredMedicines() {
  const query = els.globalSearch.value.trim().toLowerCase();
  const filter = els.statusFilter.value;
  return state.medicines
    .filter((medicine) => {
      const haystack = `${medicine.name} ${medicine.barcode} ${medicine.batchNumber}`.toLowerCase();
      return !query || haystack.includes(query);
    })
    .filter((medicine) => {
      const expiry = getExpiryInfo(medicine).key;
      if (filter === "all") return true;
      if (filter === "low") return Number(medicine.quantity) <= LOW_STOCK_LIMIT;
      return expiry === filter;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function showView(viewId) {
  activeView = viewId;
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active-view", view.id === viewId);
  });
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });
  const titles = {
    dashboardView: "Dashboard",
    medicineView: "Medicine Inventory",
    billingView: "Barcode Billing",
    alertsView: "Expiry Alerts",
    reportsView: "Reports",
    accountView: "Account",
  };
  els.pageTitle.textContent = titles[viewId] || "MedTrack";
  render();
}

function render() {
  renderCurrentUser();
  renderDashboard();
  renderMedicines();
  renderBillImport();
  renderCart();
  renderAlerts();
  renderReport();
  els.saleDatePill.textContent = formatDate(new Date().toISOString().slice(0, 10));
  els.receiptOutput.textContent = state.lastReceipt || "No receipt generated yet.";
}

function setMedicineMode(mode) {
  activeMedicineMode = mode === "bill" ? "bill" : "manual";
  els.manualModeBtn.classList.toggle("active-segment", activeMedicineMode === "manual");
  els.billModeBtn.classList.toggle("active-segment", activeMedicineMode === "bill");
  els.medicineForm.hidden = activeMedicineMode !== "manual";
  els.billModePanel.hidden = activeMedicineMode !== "bill";
}

function renderDashboard() {
  const expiryItems = state.medicines.map((medicine) => ({ medicine, expiry: getExpiryInfo(medicine) }));
  const soon = expiryItems.filter((item) => item.expiry.key === "soon").length;
  const expired = expiryItems.filter((item) => item.expiry.key === "expired").length;
  const totalSales = state.sales.reduce((sum, sale) => sum + sale.totalAmount, 0);

  els.totalMedicines.textContent = state.medicines.length;
  els.soonCount.textContent = soon;
  els.expiredCount.textContent = expired;
  els.salesValue.textContent = formatMoney(totalSales);

  const critical = state.medicines
    .filter((medicine) => Number(medicine.quantity) <= LOW_STOCK_LIMIT || getExpiryInfo(medicine).key !== "safe")
    .sort((a, b) => Number(a.quantity) - Number(b.quantity))
    .slice(0, 5);

  els.criticalStockList.innerHTML = critical.length
    ? critical
      .map((medicine) => {
        const expiry = getExpiryInfo(medicine);
        return `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(medicine.name)}</strong>
                <small>${escapeHtml(medicine.batchNumber)} | ${formatDate(medicine.expiryDate)}</small>
              </div>
              <span class="status ${expiry.key}">${expiry.label}</span>
            </div>
          `;
      })
      .join("")
    : `<div class="empty-state">No critical stock found.</div>`;

  const recentSales = [...state.sales].slice(-5).reverse();
  els.recentSalesList.innerHTML = recentSales.length
    ? recentSales
      .map(
        (sale) => `
            <div class="list-row">
              <div>
                <strong>${escapeHtml(sale.transactionId)}</strong>
                <small>${sale.items.length} item(s) | ${formatDate(sale.saleDate)}</small>
              </div>
              <strong>${formatMoney(sale.totalAmount)}</strong>
            </div>
          `,
      )
      .join("")
    : `<div class="empty-state">No sales recorded yet.</div>`;
}

function renderMedicines() {
  const rows = filteredMedicines();
  els.medicineTableBody.innerHTML = rows.length
    ? rows
      .map((medicine) => {
        const expiry = getExpiryInfo(medicine);
        const lowStock = Number(medicine.quantity) <= LOW_STOCK_LIMIT;
        return `
            <tr>
              <td>
                <strong>${escapeHtml(medicine.name)}</strong><br>
                <small>${escapeHtml(medicine.dosage || "-")} ${escapeHtml(medicine.form || "")}</small>
              </td>
              <td>${escapeHtml(medicine.batchNumber)}</td>
              <td>${escapeHtml(medicine.barcode)}</td>
              <td>${formatDate(medicine.expiryDate)}</td>
              <td>${Number(medicine.quantity)}</td>
              <td>${formatMoney(medicine.mrp)}</td>
              <td>${formatMoney(medicine.saleRate)}</td>
              <td>${medicine.gstPercent}%</td>
              <td>
                <span class="status ${expiry.key}">${expiry.label}</span>
                ${lowStock ? `<span class="status low">Low stock</span>` : ""}
              </td>
              <td class="actions">
                <button class="mini-btn" type="button" data-edit="${medicine.id}">Edit</button>
                <button class="mini-btn danger" type="button" data-delete="${medicine.id}">Delete</button>
              </td>
            </tr>
          `;
      })
      .join("")
    : `<tr><td colspan="10"><div class="empty-state">No medicine records match the current search.</div></td></tr>`;
}

function renderCart() {
  els.cartTableBody.innerHTML = currentCart.length
    ? currentCart
      .map(
        (item) => {
          const pricing = getItemPricing(item);
          return `
            <tr>
              <td>
                <strong>${escapeHtml(item.name)}</strong><br>
                <small>${escapeHtml(item.batchNumber)}</small>
              </td>
              <td>${item.quantity}</td>
              <td>${formatMoney(item.mrp)}</td>
              <td>${item.discountPercent}%</td>
              <td>${formatMoney(pricing.shopkeeperTotal)}</td>
              <td>${formatMoney(pricing.total)}</td>
              <td><button class="mini-btn danger" type="button" data-cart-remove="${item.id}">Remove</button></td>
            </tr>
          `;
        },
      )
      .join("")
    : `<tr><td colspan="7"><div class="empty-state">No items in current bill.</div></td></tr>`;
  const summary = cartBreakdown();
  els.billSummary.innerHTML = currentCart.length
    ? `
      <div><span>MRP total</span><strong>${formatMoney(summary.mrpTotal)}</strong></div>
      <div><span>Discount</span><strong>${formatMoney(summary.discountTotal)}</strong></div>
      <div><span>Customer pays</span><strong>${formatMoney(summary.sellingPriceTotal)}</strong></div>
      <div><span>Shopkeeper gets (sale + GST)</span><strong>${formatMoney(summary.shopkeeperTotal)}</strong></div>
    `
    : "";
  els.cartTotal.textContent = formatMoney(summary.finalTotal);
  els.completeSaleBtn.disabled = currentCart.length === 0;
}

function renderAlerts() {
  const alerts = state.medicines
    .map((medicine) => ({ medicine, expiry: getExpiryInfo(medicine) }))
    .filter((item) => item.expiry.key !== "safe")
    .sort((a, b) => a.expiry.days - b.expiry.days);

  els.alertsList.innerHTML = alerts.length
    ? alerts
      .map(({ medicine, expiry }) => {
        const timing =
          expiry.key === "expired"
            ? `Expired ${Math.abs(expiry.days)} day(s) ago`
            : `${expiry.days} day(s) remaining`;
        return `
            <article class="alert-item ${expiry.key}">
              <span class="status ${expiry.key}">${expiry.label}</span>
              <h3>${escapeHtml(medicine.name)}</h3>
              <p>${escapeHtml(medicine.batchNumber)} | ${formatDate(medicine.expiryDate)}</p>
              <p>Stock: ${Number(medicine.quantity)} | ${timing}</p>
              <p>Supplier: ${escapeHtml(medicine.supplierName || "-")}</p>
            </article>
          `;
      })
      .join("")
    : `<div class="empty-state">No expired or soon-expiring medicines.</div>`;
}

function reportRows() {
  if (activeReport === "sales") {
    return state.sales.map((sale) => ({
      transaction: sale.transactionId,
      date: sale.saleDate,
      items: sale.items.map((item) => `${item.name} (${item.quantity})`).join(", "),
      amount: sale.totalAmount,
    }));
  }
  if (activeReport === "expiry") {
    return state.medicines.map((medicine) => {
      const expiry = getExpiryInfo(medicine);
      return {
        medicine: medicine.name,
        batch: medicine.batchNumber,
        expiry: medicine.expiryDate,
        days: expiry.days,
        status: expiry.label,
        quantity: medicine.quantity,
      };
    });
  }
  return state.medicines.map((medicine) => ({
    medicine: medicine.name,
    batch: medicine.batchNumber,
    barcode: medicine.barcode,
    quantity: medicine.quantity,
    mrp: medicine.mrp,
    saleRate: medicine.saleRate,
    gstPercent: medicine.gstPercent,
    value: Number(medicine.quantity) * Number(medicine.saleRate),
    supplier: medicine.supplierName || "-",
  }));
}

function renderReport() {
  document.querySelectorAll("#reportsView .filter-row .ghost-btn").forEach((button) => {
    const report = button.id.replace("ReportBtn", "");
    button.classList.toggle("active-filter", report === activeReport);
  });

  const rows = reportRows();
  if (activeReport === "sales") {
    els.reportSummary.innerHTML = `
      ${summaryTile("Transactions", state.sales.length)}
      ${summaryTile("Sold units", state.sales.reduce((sum, sale) => sum + sale.items.reduce((qty, item) => qty + item.quantity, 0), 0))}
      ${summaryTile("Total amount", formatMoney(state.sales.reduce((sum, sale) => sum + sale.totalAmount, 0)))}
    `;
    els.reportHead.innerHTML = `<tr><th>Transaction ID</th><th>Sale date</th><th>Items</th><th>Total amount</th></tr>`;
    els.reportBody.innerHTML = rows.length
      ? rows
        .map(
          (row) =>
            `<tr><td>${escapeHtml(row.transaction)}</td><td>${formatDate(row.date)}</td><td>${escapeHtml(row.items)}</td><td>${formatMoney(row.amount)}</td></tr>`,
        )
        .join("")
      : `<tr><td colspan="4"><div class="empty-state">No sales available.</div></td></tr>`;
    return;
  }

  if (activeReport === "expiry") {
    const expired = rows.filter((row) => row.status === "Expired").length;
    const soon = rows.filter((row) => row.status === "Expiring soon").length;
    els.reportSummary.innerHTML = `
      ${summaryTile("Expired", expired)}
      ${summaryTile("Expiring soon", soon)}
      ${summaryTile("Safe", rows.length - expired - soon)}
    `;
    els.reportHead.innerHTML = `<tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th>Days</th><th>Status</th><th>Qty</th></tr>`;
    els.reportBody.innerHTML = rows.length
      ? rows
        .map(
          (row) =>
            `<tr><td>${escapeHtml(row.medicine)}</td><td>${escapeHtml(row.batch)}</td><td>${formatDate(row.expiry)}</td><td>${row.days}</td><td>${escapeHtml(row.status)}</td><td>${row.quantity}</td></tr>`,
        )
        .join("")
      : `<tr><td colspan="6"><div class="empty-state">No expiry data available.</div></td></tr>`;
    return;
  }

  const stockValue = rows.reduce((sum, row) => sum + row.value, 0);
  const units = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
  els.reportSummary.innerHTML = `
    ${summaryTile("Medicine records", rows.length)}
    ${summaryTile("Available units", units)}
    ${summaryTile("Stock value", formatMoney(stockValue))}
  `;
  els.reportHead.innerHTML = `<tr><th>Medicine</th><th>Batch</th><th>Barcode</th><th>Qty</th><th>MRP</th><th>Sale rate</th><th>GST</th><th>Value</th><th>Supplier</th></tr>`;
  els.reportBody.innerHTML = rows.length
    ? rows
      .map(
        (row) =>
          `<tr><td>${escapeHtml(row.medicine)}</td><td>${escapeHtml(row.batch)}</td><td>${escapeHtml(row.barcode)}</td><td>${row.quantity}</td><td>${formatMoney(row.mrp)}</td><td>${formatMoney(row.saleRate)}</td><td>${row.gstPercent}%</td><td>${formatMoney(row.value)}</td><td>${escapeHtml(row.supplier)}</td></tr>`,
      )
      .join("")
    : `<tr><td colspan="9"><div class="empty-state">No inventory available.</div></td></tr>`;
}

function summaryTile(label, value) {
  return `<article class="summary-tile"><span>${label}</span><strong>${value}</strong></article>`;
}

function getMedicineFormData() {
  return {
    id: formFields.medicineId.value || makeId("med"),
    name: formFields.medicineName.value.trim(),
    batchNumber: formFields.batchNumber.value.trim(),
    manufactureDate: formFields.manufactureDate.value,
    expiryDate: formFields.expiryDate.value,
    quantity: Number(formFields.quantity.value),
    barcode: formFields.barcode.value.trim(),
    mrp: roundMoney(formFields.mrp.value),
    saleRate: roundMoney(formFields.saleRate.value),
    gstPercent: percentNumber(formFields.gstPercent.value),
    dosage: formFields.dosage.value.trim(),
    form: formFields.form.value,
    manufacturer: formFields.manufacturer.value.trim(),
    supplierName: formFields.supplierName.value.trim(),
    supplierContact: formFields.supplierContact.value.trim(),
  };
}

function validateMedicine(data) {
  if (!data.expiryDate) {
    return "Expiry date is required.";
  }
  if (data.manufactureDate && toDate(data.expiryDate) < toDate(data.manufactureDate)) {
    return "Expiry date must be after manufacture date.";
  }
  const duplicate = state.medicines.find(
    (medicine) => medicine.barcode === data.barcode && medicine.id !== data.id,
  );
  if (duplicate) {
    return "Barcode already exists for another medicine.";
  }
  if (data.quantity < 0 || data.mrp < 0 || data.saleRate < 0 || data.gstPercent < 0) {
    return "Quantity, MRP, sale rate, and GST cannot be negative.";
  }
  if (data.saleRate > data.mrp) {
    return "Sale rate should not be higher than MRP.";
  }
  return "";
}

function resetMedicineForm(clearMessage = true) {
  els.medicineForm.reset();
  formFields.medicineId.value = "";
  formFields.gstPercent.value = "0";
  els.medicineFormTitle.textContent = "Medicine Entry";
  if (clearMessage) setMessage(els.medicineFormMessage, "");
}

function editMedicine(id) {
  const medicine = state.medicines.find((item) => item.id === id);
  if (!medicine) return;
  setMedicineMode("manual");
  formFields.medicineId.value = medicine.id;
  formFields.medicineName.value = medicine.name;
  formFields.batchNumber.value = medicine.batchNumber;
  formFields.manufactureDate.value = medicine.manufactureDate;
  formFields.expiryDate.value = medicine.expiryDate;
  formFields.quantity.value = medicine.quantity;
  formFields.barcode.value = medicine.barcode;
  formFields.mrp.value = medicine.mrp;
  formFields.saleRate.value = medicine.saleRate;
  formFields.gstPercent.value = medicine.gstPercent;
  formFields.dosage.value = medicine.dosage || "";
  formFields.form.value = medicine.form || "Tablet";
  formFields.manufacturer.value = medicine.manufacturer || "";
  formFields.supplierName.value = medicine.supplierName || "";
  formFields.supplierContact.value = medicine.supplierContact || "";
  els.medicineFormTitle.textContent = "Update Medicine";
  showView("medicineView");
}

async function deleteMedicine(id) {
  const medicine = state.medicines.find((item) => item.id === id);
  if (!medicine) return;
  const usedInSale = state.sales.some((sale) => sale.items.some((item) => item.id === id));
  if (usedInSale) {
    setMessage(els.medicineFormMessage, "Medicine has sales history, so it was kept for reporting.", true);
    return;
  }
  state.medicines = state.medicines.filter((item) => item.id !== id);
  currentCart = currentCart.filter((item) => item.id !== id);
  try {
    await persistState();
    render();
  } catch (error) {
    setMessage(els.medicineFormMessage, error instanceof Error ? error.message : "Could not delete medicine.", true);
  }
}

function findMedicineByBarcode(barcode) {
  return state.medicines.find((medicine) => medicine.barcode.toLowerCase() === barcode.trim().toLowerCase());
}

function updateBarcodeLookup() {
  const barcode = els.scanBarcode.value.trim();
  if (!barcode) {
    els.barcodeLookup.innerHTML = "Scan a barcode to retrieve medicine details.";
    return;
  }
  const medicine = findMedicineByBarcode(barcode);
  if (!medicine) {
    els.barcodeLookup.innerHTML = `<strong>No matching medicine found.</strong>`;
    return;
  }
  const expiry = getExpiryInfo(medicine);
  els.barcodeLookup.innerHTML = `
    <strong>${escapeHtml(medicine.name)}</strong>
    <p>${escapeHtml(medicine.batchNumber)} | MRP ${formatMoney(medicine.mrp)} | Sale ${formatMoney(medicine.saleRate)} | GST ${medicine.gstPercent}%</p>
    <p>Stock ${Number(medicine.quantity)} | Max discount ${maxAllowedDiscountPercent(medicine).toFixed(2)}%</p>
    <span class="status ${expiry.key}">${expiry.label}</span>
  `;
}

function cartTotal() {
  return cartBreakdown().finalTotal;
}

function addToCart(barcode, quantity, discountPercent) {
  const medicine = findMedicineByBarcode(barcode);
  if (!medicine) return "Medicine not found for this barcode.";
  const expiry = getExpiryInfo(medicine);
  if (expiry.key === "expired") return "Expired medicine cannot be sold.";
  if (quantity <= 0) return "Quantity sold must be at least 1.";
  if (discountPercent < 0 || discountPercent > 100) return "Discount must be between 0% and 100%.";
  const maxDiscount = maxAllowedDiscountPercent(medicine);
  if (discountPercent > maxDiscount) {
    return `Maximum allowed discount for this item is ${maxDiscount.toFixed(2)}% to avoid loss.`;
  }
  const existing = currentCart.find((item) => item.id === medicine.id);
  const alreadyInCart = existing ? existing.quantity : 0;
  if (alreadyInCart + quantity > Number(medicine.quantity)) {
    return "Requested quantity is higher than available stock.";
  }
  if (existing) {
    existing.quantity += quantity;
    existing.discountPercent = clampDiscount(discountPercent);
  } else {
    currentCart.push({
      id: medicine.id,
      name: medicine.name,
      batchNumber: medicine.batchNumber,
      barcode: medicine.barcode,
      mrp: Number(medicine.mrp),
      saleRate: Number(medicine.saleRate),
      gstPercent: percentNumber(medicine.gstPercent),
      discountPercent: clampDiscount(discountPercent),
      quantity,
    });
  }
  return "";
}

async function completeSale() {
  if (!currentCart.length) return;
  for (const item of currentCart) {
    const medicine = state.medicines.find((record) => record.id === item.id);
    if (!medicine || Number(medicine.quantity) < item.quantity) {
      setMessage(els.scanMessage, "Stock changed. Please review the current bill.", true);
      return;
    }
    if (getExpiryInfo(medicine).key === "expired") {
      setMessage(els.scanMessage, `${medicine.name} is expired and cannot be sold.`, true);
      return;
    }
  }

  currentCart.forEach((item) => {
    const medicine = state.medicines.find((record) => record.id === item.id);
    medicine.quantity = Number(medicine.quantity) - item.quantity;
  });

  const summary = cartBreakdown();
  const sale = {
    transactionId: makeId("txn").replace("txn_", "TXN-").toUpperCase(),
    medicineId: currentCart[0]?.id || "",
    quantitySold: currentCart.reduce((sum, item) => sum + item.quantity, 0),
    saleDate: new Date().toISOString().slice(0, 10),
    totalAmount: summary.finalTotal,
    billSummary: summary,
    cashier: currentUser?.name || "User",
    items: currentCart.map((item) => ({ ...item })),
  };
  state.sales.push(sale);
  state.lastReceipt = buildReceipt(sale);
  currentCart = [];
  try {
    await persistState();
    setMessage(els.scanMessage, "Sale confirmation generated and stock updated.");
    render();
  } catch (error) {
    setMessage(els.scanMessage, error instanceof Error ? error.message : "Could not complete sale.", true);
  }
}

function buildReceipt(sale) {
  const line = "-".repeat(38);
  const rows = sale.items
    .map((item) => {
      const pricing = getItemPricing(item);
      const name = item.name.slice(0, 18).padEnd(18, " ");
      const qty = String(item.quantity).padStart(3, " ");
      const amount = formatReceiptMoney(pricing.total).padStart(12, " ");
      return `${name}${qty}${amount}`;
    })
    .join("\n");
  const summary = sale.billSummary || cartBreakdown();
  return [
    "MEDTRACK PHARMACY",
    "Inventory & Expiry Monitoring",
    line,
    `Bill: ${sale.transactionId}`,
    `Date: ${formatDate(sale.saleDate)}`,
    `Cashier: ${sale.cashier}`,
    line,
    "Item               Qty      Amount",
    rows,
    line,
    `MRP total: ${formatReceiptMoney(summary.mrpTotal)}`,
    `Discount: ${formatReceiptMoney(summary.discountTotal)}`,
    `Bill total: ${formatReceiptMoney(sale.totalAmount)}`,
    "Thank you",
  ].join("\n");
}

function printReceipt() {
  if (!state.lastReceipt) {
    setMessage(els.scanMessage, "No receipt available to print.", true);
    return;
  }
  window.print();
}

function setReport(report) {
  activeReport = report;
  renderReport();
}

function exportCsv() {
  const rows = reportRows();
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = String(row[header] ?? "");
          return `"${value.replaceAll('"', '""')}"`;
        })
        .join(","),
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `medtrack-${activeReport}-report.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function scanBillFile(event) {
  event.preventDefault();
  const file = els.billFile.files?.[0];

  if (!file) {
    setMessage(els.billScanMessage, "Choose a bill PDF or image first.", true);
    return;
  }

  els.billScanBtn.disabled = true;
  els.importScannedBtn.disabled = true;
  setMessage(els.billScanMessage, "Scanning bill with Gemini. This can take a few seconds.");

  try {
    const formData = new FormData();
    formData.append("billFile", file);

    const response = await fetch("/api/scan-bill", {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Bill scan failed.");
    }

    pendingBillImport = prepareBillImport(payload);
    renderBillImport();

    if (!pendingBillImport.medicines.length) {
      setMessage(els.billScanMessage, "The bill was scanned, but no importable medicine rows were found.", true);
      return;
    }

    setMessage(els.billScanMessage, `Bill scanned. Review ${pendingBillImport.medicines.length} row(s) and import when ready.`);
  } catch (error) {
    pendingBillImport = null;
    renderBillImport();
    setMessage(els.billScanMessage, error instanceof Error ? error.message : "Bill scan failed.", true);
  } finally {
    els.billScanBtn.disabled = false;
  }
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await apiRequest("/api/auth/login", {
      method: "POST",
      body: {
        username: els.username.value.trim(),
        password: els.password.value,
      },
    });
    applyBootstrap({
      ...payload,
      authenticated: true,
      authRules: authMeta.authRules,
    });
    els.loginError.textContent = "";
    activeView = "dashboardView";
    showAuthenticatedApp();
    await checkBillApiStatus();
  } catch (error) {
    els.loginError.textContent = error instanceof Error ? error.message : "Invalid username or password.";
  }
});

els.showCreateAccountBtn.addEventListener("click", showCreateAccountScreen);
els.backToLoginBtn.addEventListener("click", showLoggedOutView);

els.createAccountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await apiRequest("/api/auth/register", {
      method: "POST",
      body: {
        name: els.registerName.value.trim(),
        username: els.registerUsername.value.trim(),
        password: els.registerPassword.value,
        confirmPassword: els.registerConfirmPassword.value,
      },
    });
    applyBootstrap({
      ...payload,
      authenticated: true,
      authRules: authMeta.authRules,
    });
    setMessage(els.createAccountMessage, "Account created successfully.");
    activeView = "dashboardView";
    showAuthenticatedApp();
    await checkBillApiStatus();
  } catch (error) {
    setMessage(els.createAccountMessage, error instanceof Error ? error.message : "Could not create account.", true);
  }
});

els.changePasswordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = await apiRequest("/api/auth/change-password", {
      method: "POST",
      body: {
        oldPassword: els.oldPassword.value,
        newPassword: els.newPassword.value,
        confirmPassword: els.confirmNewPassword.value,
      },
    });
    els.changePasswordForm.reset();
    showLoggedOutView();
    els.loginError.textContent = "Password updated. Please log in again with your new password.";
  } catch (error) {
    setMessage(els.changePasswordMessage, error instanceof Error ? error.message : "Could not change password.", true);
  }
});

els.logoutBtn.addEventListener("click", () => {
  els.logoutModal.hidden = false;
});

els.cancelLogoutBtn.addEventListener("click", () => {
  els.logoutModal.hidden = true;
});

els.confirmLogoutBtn.addEventListener("click", async () => {
  try {
    await apiRequest("/api/auth/logout", { method: "POST", body: {} });
  } catch {
    // Keep local logout responsive even if the request fails.
  }
  showLoggedOutView();
});

document.querySelectorAll(".password-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    if (!input) return;
    const shouldShow = input.type === "password";
    input.type = shouldShow ? "text" : "password";
    button.setAttribute("aria-pressed", shouldShow ? "true" : "false");
    button.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
  });
});

document.querySelectorAll(".nav-link").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

document.querySelectorAll("[data-view-jump]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.viewJump));
});

els.globalSearch.addEventListener("input", renderMedicines);
els.statusFilter.addEventListener("change", renderMedicines);
els.manualModeBtn.addEventListener("click", () => setMedicineMode("manual"));
els.billModeBtn.addEventListener("click", () => setMedicineMode("bill"));
els.billScanForm.addEventListener("submit", scanBillFile);
els.clearImportedBtn.addEventListener("click", () => resetBillImport());
els.importScannedBtn.addEventListener("click", mergeImportedMedicineRows);

els.medicineForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = getMedicineFormData();
  const error = validateMedicine(data);
  if (error) {
    setMessage(els.medicineFormMessage, error, true);
    return;
  }
  const index = state.medicines.findIndex((medicine) => medicine.id === data.id);
  if (index >= 0) {
    state.medicines[index] = normalizeMedicineRecord(data);
    resetMedicineForm(false);
    setMessage(els.medicineFormMessage, "Medicine record updated.");
  } else {
    state.medicines.push(normalizeMedicineRecord(data));
    resetMedicineForm(false);
    setMessage(els.medicineFormMessage, "Medicine stored in database.");
  }
  try {
    await persistState();
    render();
  } catch (saveError) {
    setMessage(els.medicineFormMessage, saveError instanceof Error ? saveError.message : "Could not save medicine.", true);
  }
});

els.resetMedicineForm.addEventListener("click", resetMedicineForm);

els.medicineTableBody.addEventListener("click", (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  if (editId) editMedicine(editId);
  if (deleteId) void deleteMedicine(deleteId);
});

els.scanBarcode.addEventListener("input", updateBarcodeLookup);

els.scanForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const quantity = Number(els.scanQuantity.value);
  const discountPercent = clampDiscount(els.discountPercent.value);
  const error = addToCart(els.scanBarcode.value, quantity, discountPercent);
  if (error) {
    setMessage(els.scanMessage, error, true);
    renderCart();
    return;
  }
  setMessage(els.scanMessage, "Item added to bill.");
  els.scanBarcode.value = "";
  els.scanQuantity.value = "1";
  els.discountPercent.value = "0";
  updateBarcodeLookup();
  renderCart();
});

els.cartTableBody.addEventListener("click", (event) => {
  const removeId = event.target.dataset.cartRemove;
  if (!removeId) return;
  currentCart = currentCart.filter((item) => item.id !== removeId);
  renderCart();
});

els.clearCartBtn.addEventListener("click", () => {
  currentCart = [];
  renderCart();
});

els.completeSaleBtn.addEventListener("click", () => {
  void completeSale();
});
els.printReceiptBtn.addEventListener("click", printReceipt);
els.printCurrentReceiptBtn.addEventListener("click", printReceipt);
els.refreshAlertsBtn.addEventListener("click", renderAlerts);
els.inventoryReportBtn.addEventListener("click", () => setReport("inventory"));
els.salesReportBtn.addEventListener("click", () => setReport("sales"));
els.expiryReportBtn.addEventListener("click", () => setReport("expiry"));
els.exportReportBtn.addEventListener("click", exportCsv);

setMedicineMode("manual");
updateBarcodeLookup();
initializeApp();
