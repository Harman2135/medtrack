import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const maxFileBytes = 20 * 1024 * 1024;
const sessionCookieName = "medtrack_session";
const passwordMinLength = 8;
const sessions = new Map();
const dataDir = path.join(__dirname, "data");
const dataFilePath = path.join(dataDir, "medtrack-data.json");

const supportedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const staticMimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["supplierName", "invoiceNumber", "invoiceDate", "warnings", "medicines"],
  properties: {
    supplierName: {
      type: ["string", "null"],
      description: "Wholesaler or supplier name, if visible on the bill.",
    },
    invoiceNumber: {
      type: ["string", "null"],
      description: "Invoice or bill number, if visible.",
    },
    invoiceDate: {
      type: ["string", "null"],
      format: "date",
      description: "Invoice date in YYYY-MM-DD format, if visible.",
    },
    warnings: {
      type: "array",
      items: {
        type: "string",
      },
      description: "Important extraction caveats or missing fields.",
    },
    medicines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "batchNumber",
          "manufactureDate",
          "expiryDate",
          "packSize",
          "purchaseQty",
          "quantity",
          "mrp",
          "saleRate",
          "gstPercent",
          "barcode",
          "dosage",
          "form",
          "manufacturer",
          "lineTotal",
        ],
        properties: {
          name: {
            type: "string",
            description: "Medicine name exactly as shown on the bill.",
          },
          batchNumber: {
            type: "string",
            description: "Batch or lot number.",
          },
          manufactureDate: {
            type: ["string", "null"],
            format: "date",
            description: "Manufacture date in YYYY-MM-DD. If only MM/YY is shown, use the first day of that month.",
          },
          expiryDate: {
            type: ["string", "null"],
            format: "date",
            description: "Expiry date in YYYY-MM-DD. If only MM/YY is shown, use the last day of that month.",
          },
          packSize: {
            type: ["number", "null"],
            description: "Units per pack from the bill's Pack column.",
          },
          purchaseQty: {
            type: ["number", "null"],
            description: "Number of packs purchased from the bill's Qty column.",
          },
          quantity: {
            type: "number",
            description: "Total stock units for this line item. When both packSize and purchaseQty are visible, set quantity to packSize multiplied by purchaseQty.",
          },
          mrp: {
            type: "number",
            description: "Printed MRP per unit from the bill, typically bold if present.",
          },
          saleRate: {
            type: "number",
            description: "Per-unit sale rate from the wholesaler bill before GST.",
          },
          gstPercent: {
            type: ["number", "null"],
            description: "GST percent for the line item, such as 5, 12, or 18.",
          },
          barcode: {
            type: ["string", "null"],
            description: "Barcode only if clearly visible on the bill. Otherwise null.",
          },
          dosage: {
            type: ["string", "null"],
            description: "Strength or pack info such as 500 mg or 100 ml.",
          },
          form: {
            type: ["string", "null"],
            description: "Tablet, Capsule, Syrup, Injection, Ointment, Drops, or null.",
          },
          manufacturer: {
            type: ["string", "null"],
            description: "Manufacturer name if visible.",
          },
          lineTotal: {
            type: ["number", "null"],
            description: "Extended line total if visible.",
          },
        },
      },
    },
  },
};

const seedMedicines = [
  {
    id: "med_1",
    name: "Paracetamol",
    batchNumber: "PCM-0426",
    manufactureDate: "2025-01-10",
    expiryDate: "2027-01-10",
    quantity: 120,
    barcode: "890100000001",
    mrp: 22,
    saleRate: 18.5,
    gstPercent: 12,
    dosage: "500 mg",
    form: "Tablet",
    manufacturer: "CareWell Pharma",
    supplierName: "Metro Medical Supply",
    supplierContact: "9876543210",
  },
  {
    id: "med_2",
    name: "Cough Relief",
    batchNumber: "CRS-111",
    manufactureDate: "2024-08-01",
    expiryDate: "2026-05-05",
    quantity: 18,
    barcode: "890100000002",
    mrp: 98,
    saleRate: 86,
    gstPercent: 12,
    dosage: "100 ml",
    form: "Syrup",
    manufacturer: "Northline Labs",
    supplierName: "Unity Distributors",
    supplierContact: "9845011223",
  },
  {
    id: "med_3",
    name: "Amoxycin",
    batchNumber: "AMX-900",
    manufactureDate: "2024-03-12",
    expiryDate: "2026-04-12",
    quantity: 7,
    barcode: "890100000003",
    mrp: 48,
    saleRate: 42,
    gstPercent: 5,
    dosage: "250 mg",
    form: "Capsule",
    manufacturer: "Shield Biotech",
    supplierName: "Prime Health Traders",
    supplierContact: "9811122233",
  },
];

await loadEnvFile();
await ensureAppDataFile();

async function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  try {
    const contents = await fs.readFile(envPath, "utf8");
    contents.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separator = trimmed.indexOf("=");
      if (separator === -1) return;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch {
    // Ignore missing .env files and rely on shell environment variables instead.
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeUsername(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hasSpecialCharacter(password) {
  return /[^A-Za-z0-9]/.test(password);
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, hash, salt) {
  const candidateHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidateHash, "hex"), Buffer.from(hash, "hex"));
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
  };
}

function sanitizeState(data) {
  return {
    medicines: Array.isArray(data.medicines) ? data.medicines : [],
    sales: Array.isArray(data.sales) ? data.sales : [],
    lastReceipt: typeof data.lastReceipt === "string" ? data.lastReceipt : "",
  };
}

function buildSeedData() {
  const password = createPasswordRecord("Admin@123");
  return {
    users: [
      {
        id: "user_1",
        name: "Pharmacy Admin",
        username: "admin",
        passwordHash: password.hash,
        passwordSalt: password.salt,
        previousPasswordHash: "",
        previousPasswordSalt: "",
        createdAt: new Date().toISOString(),
      },
    ],
    medicines: clone(seedMedicines),
    sales: [],
    lastReceipt: "",
  };
}

async function ensureAppDataFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFilePath);
  } catch {
    await writeAppData(buildSeedData());
  }
}

async function readAppData() {
  const raw = await fs.readFile(dataFilePath, "utf8");
  const parsed = JSON.parse(raw);
  let dirty = false;

  if (!Array.isArray(parsed.users)) {
    parsed.users = [];
    dirty = true;
  }
  if (!Array.isArray(parsed.medicines)) {
    parsed.medicines = [];
    dirty = true;
  }
  if (!Array.isArray(parsed.sales)) {
    parsed.sales = [];
    dirty = true;
  }
  if (typeof parsed.lastReceipt !== "string") {
    parsed.lastReceipt = "";
    dirty = true;
  }

  parsed.users = parsed.users.map((user) => {
    if (user.passwordHash && user.passwordSalt) {
      return {
        ...user,
        username: normalizeUsername(user.username),
        previousPasswordHash: user.previousPasswordHash || "",
        previousPasswordSalt: user.previousPasswordSalt || "",
      };
    }

    const passwordRecord = createPasswordRecord(user.password || "Admin@123");
    dirty = true;
    return {
      id: user.id || generateId("user"),
      name: user.name || "User",
      username: normalizeUsername(user.username || user.email || user.name || `user${Date.now()}`),
      passwordHash: passwordRecord.hash,
      passwordSalt: passwordRecord.salt,
      previousPasswordHash: "",
      previousPasswordSalt: "",
      createdAt: user.createdAt || new Date().toISOString(),
    };
  });

  if (!parsed.users.length) {
    const seed = buildSeedData();
    parsed.users = seed.users;
    dirty = true;
  }

  if (dirty) {
    await writeAppData(parsed);
  }

  return parsed;
}

async function writeAppData(data) {
  const tempFilePath = `${dataFilePath}.tmp`;
  await fs.writeFile(tempFilePath, JSON.stringify(data, null, 2));
  await fs.rename(tempFilePath, dataFilePath);
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separator = entry.indexOf("=");
      if (separator === -1) return cookies;
      const key = entry.slice(0, separator);
      const value = entry.slice(separator + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function createSession(userId) {
  const sessionId = crypto.randomBytes(24).toString("hex");
  sessions.set(sessionId, {
    userId,
    createdAt: Date.now(),
  });
  return sessionId;
}

function setSessionCookie(res, sessionId) {
  const parts = [
    `${sessionCookieName}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=604800",
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  const parts = [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function getAuthenticatedUser(req, data) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[sessionCookieName];
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  return data.users.find((user) => user.id === session.userId) || null;
}

function requireAuth(req, res, data) {
  const user = getAuthenticatedUser(req, data);
  if (!user) {
    sendJson(res, 401, { error: "Please log in to continue." });
    return null;
  }
  return user;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function validatePasswordRules(password, confirmPassword, user) {
  if (password !== confirmPassword) {
    return "Password and confirm password must match.";
  }
  if (password.length < passwordMinLength) {
    return `Password must be at least ${passwordMinLength} characters long.`;
  }
  if (!hasSpecialCharacter(password)) {
    return "Password must include at least one special character.";
  }
  if (user?.passwordHash && user?.passwordSalt && verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return "New password cannot be the same as the last password.";
  }
  if (
    user?.previousPasswordHash
    && user?.previousPasswordSalt
    && verifyPassword(password, user.previousPasswordHash, user.previousPasswordSalt)
  ) {
    return "New password cannot be the same as the last password.";
  }
  return "";
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

function createPrompt() {
  return [
    "Extract medicine inventory details from this Indian pharmacy wholesaler bill.",
    "Return JSON only that matches the provided schema.",
    "Read every medicine row carefully and capture each line item separately.",
    "Do not invent values. If a field is not visible, use null.",
    "Normalize dates to YYYY-MM-DD.",
    "If manufacture date is shown only as MM/YY, convert it to the first day of that month.",
    "If expiry date is shown only as MM/YY, convert it to the last day of that month.",
    "Extract the Pack column as packSize and the Qty column as purchaseQty when visible.",
    "If both packSize and purchaseQty are present, set quantity to packSize multiplied by purchaseQty.",
    "Extract the bold printed MRP as mrp when visible.",
    "Extract the wholesaler sale rate as saleRate.",
    "Extract GST percent as gstPercent when visible.",
    "Quantity, mrp, saleRate, and gstPercent must be numbers without currency symbols.",
    "Form should be Tablet, Capsule, Syrup, Injection, Ointment, Drops, or null.",
    "Include warnings for unreadable text, missing fields, or uncertain rows.",
  ].join("\n");
}

async function parseMultipartForm(req) {
  const request = new Request(`http://${host}:${port}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req,
    duplex: "half",
  });
  return request.formData();
}

async function scanBillWithGemini(file) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in .env or your shell environment.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > maxFileBytes) {
    throw new Error("The uploaded file is larger than 20 MB.");
  }

  if (!supportedMimeTypes.has(file.type)) {
    throw new Error("Unsupported file type. Use PDF, JPG, PNG, WEBP, HEIC, or HEIF.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: createPrompt() },
              {
                inline_data: {
                  mime_type: file.type,
                  data: buffer.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
          responseJsonSchema: extractionSchema,
        },
      }),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || "Gemini request failed.";
    throw new Error(message);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return JSON.parse(text);
}

async function serveStaticFile(req, res) {
  const rawPath = new URL(req.url, `http://${host}:${port}`).pathname;
  const requestedPath = rawPath === "/" ? "/index.html" : rawPath;
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(__dirname, normalizedPath);

  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      return serveStaticFile({ url: `${rawPath.replace(/\/$/, "")}/index.html` }, res);
    }

    const extension = path.extname(filePath).toLowerCase();
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": staticMimeTypes[extension] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    const indexPath = path.join(__dirname, "index.html");
    const data = await fs.readFile(indexPath);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
    });
    res.end(data);
  }
}

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { error: "Invalid request." });
    return;
  }

  const url = new URL(req.url, `http://${host}:${port}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      geminiConfigured: Boolean(getGeminiApiKey()),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const data = await readAppData();
    const user = getAuthenticatedUser(req, data);
    sendJson(res, 200, {
      ok: true,
      authenticated: Boolean(user),
      user: user ? publicUser(user) : null,
      state: user ? sanitizeState(data) : null,
      authRules: {
        passwordMinLength,
        requiresSpecialCharacter: true,
      },
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    try {
      const body = await readJsonBody(req);
      const name = String(body.name ?? "").trim();
      const username = normalizeUsername(body.username);
      const password = String(body.password ?? "");
      const confirmPassword = String(body.confirmPassword ?? "");
      const data = await readAppData();

      if (!name || !username) {
        sendJson(res, 400, { error: "Name and username are required." });
        return;
      }

      if (!/^[a-z0-9._-]{3,20}$/.test(username)) {
        sendJson(res, 400, { error: "Username must be 3-20 characters and use letters, numbers, dot, underscore, or dash." });
        return;
      }

      const passwordError = validatePasswordRules(password, confirmPassword);
      if (passwordError) {
        sendJson(res, 400, { error: passwordError });
        return;
      }

      if (data.users.some((user) => user.username === username)) {
        sendJson(res, 409, { error: "That username is already in use." });
        return;
      }

      const passwordRecord = createPasswordRecord(password);
      const newUser = {
        id: generateId("user"),
        name,
        username,
        passwordHash: passwordRecord.hash,
        passwordSalt: passwordRecord.salt,
        previousPasswordHash: "",
        previousPasswordSalt: "",
        createdAt: new Date().toISOString(),
      };

      data.users.push(newUser);
      await writeAppData(data);

      const sessionId = createSession(newUser.id);
      setSessionCookie(res, sessionId);
      sendJson(res, 201, {
        ok: true,
        user: publicUser(newUser),
        state: sanitizeState(data),
      });
    } catch {
      sendJson(res, 400, { error: "Invalid registration payload." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      const body = await readJsonBody(req);
      const username = normalizeUsername(body.username);
      const password = String(body.password ?? "");
      const data = await readAppData();
      const user = data.users.find((item) => item.username === username);

      if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
        sendJson(res, 401, { error: "Invalid username or password." });
        return;
      }

      const sessionId = createSession(user.id);
      setSessionCookie(res, sessionId);
      sendJson(res, 200, {
        ok: true,
        user: publicUser(user),
        state: sanitizeState(data),
      });
    } catch {
      sendJson(res, 400, { error: "Invalid login payload." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies[sessionCookieName];
    if (sessionId) {
      sessions.delete(sessionId);
    }
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/change-password") {
    try {
      const data = await readAppData();
      const user = requireAuth(req, res, data);
      if (!user) return;

      const body = await readJsonBody(req);
      const oldPassword = String(body.oldPassword ?? "");
      const newPassword = String(body.newPassword ?? "");
      const confirmPassword = String(body.confirmPassword ?? "");

      if (!verifyPassword(oldPassword, user.passwordHash, user.passwordSalt)) {
        sendJson(res, 400, { error: "Old password is incorrect." });
        return;
      }

      const passwordError = validatePasswordRules(newPassword, confirmPassword, user);
      if (passwordError) {
        sendJson(res, 400, { error: passwordError });
        return;
      }

      user.previousPasswordHash = user.passwordHash;
      user.previousPasswordSalt = user.passwordSalt;
      const nextPassword = createPasswordRecord(newPassword);
      user.passwordHash = nextPassword.hash;
      user.passwordSalt = nextPassword.salt;
      await writeAppData(data);

      sendJson(res, 200, {
        ok: true,
        message: "Password changed successfully.",
      });
    } catch {
      sendJson(res, 400, { error: "Invalid change password payload." });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/app-state") {
    const data = await readAppData();
    const user = requireAuth(req, res, data);
    if (!user) return;
    sendJson(res, 200, {
      ok: true,
      user: publicUser(user),
      state: sanitizeState(data),
    });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/app-state") {
    try {
      const data = await readAppData();
      const user = requireAuth(req, res, data);
      if (!user) return;

      const body = await readJsonBody(req);
      const nextState = body.state;
      if (!nextState || !Array.isArray(nextState.medicines) || !Array.isArray(nextState.sales)) {
        sendJson(res, 400, { error: "Invalid application state payload." });
        return;
      }

      data.medicines = nextState.medicines;
      data.sales = nextState.sales;
      data.lastReceipt = typeof nextState.lastReceipt === "string" ? nextState.lastReceipt : "";
      await writeAppData(data);
      sendJson(res, 200, { ok: true });
    } catch {
      sendJson(res, 400, { error: "Invalid application state payload." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/scan-bill") {
    const data = await readAppData();
    const user = requireAuth(req, res, data);
    if (!user) return;

    try {
      const formData = await parseMultipartForm(req);
      const file = formData.get("billFile");

      if (!(file instanceof File)) {
        sendJson(res, 400, { error: "Please upload a PDF or image bill file." });
        return;
      }

      const extracted = await scanBillWithGemini(file);
      sendJson(res, 200, {
        ok: true,
        sourceFileName: file.name,
        extracted,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bill scan failed.";
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (req.method === "GET") {
    await serveStaticFile(req, res);
    return;
  }

  sendJson(res, 404, { error: "Not found." });
});

server.listen(port, host, () => {
  console.log(`MedTrack running on http://${host}:${port}`);
});
