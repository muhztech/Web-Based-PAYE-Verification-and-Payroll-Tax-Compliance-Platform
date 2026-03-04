/* ================= GLOBAL STATE ================= */

let selectedFile = null;
let processedData = [];

const previewContainer = document.getElementById('previewContainer');
const loading = document.getElementById("loading");
const result = document.getElementById("result");

/* ================= TAX CONFIG ================= */

const TAX_FREE = 800000; // Annual tax free threshold

const TAX_BANDS = [
  { band: 2200000, rate: 0.15 },
  { band: 6800000, rate: 0.18 },
  { band: 4000000, rate: 0.21 },
  { band: 12000000, rate: 0.23 },
  { band: Infinity, rate: 0.25 }
];

/* ================= CORE TAX ENGINE ================= */

function computePAYE(monthlyGross, monthlyPension = 0) {

  if (!monthlyGross || isNaN(monthlyGross)) return 0;

  const annualIncome = monthlyGross * 12;
  const annualPension = monthlyPension * 12;

  const taxableIncome = Math.max(annualIncome - annualPension, 0);

  if (taxableIncome <= TAX_FREE) return 0;

  let remaining = taxableIncome - TAX_FREE;
  let tax = 0;

  for (let band of TAX_BANDS) {

    if (remaining <= 0) break;

    const amount = Math.min(band.band, remaining);
    tax += amount * band.rate;
    remaining -= amount;
  }

  return tax / 12;
}

/* ================= PREVIEW HANDLING ================= */

function showPreview(file) {
  const reader = new FileReader();
  reader.onload = e => {
    previewContainer.innerHTML =
      `<img src="${e.target.result}" 
             style="max-width:100%;border-radius:8px;" 
             alt="Payslip Preview">`;
  };
  reader.readAsDataURL(file);
}

/* ================= INPUT HANDLERS ================= */

document.getElementById('galleryInput')?.addEventListener('change', e => {
  if (e.target.files.length) {
    selectedFile = e.target.files[0];
    showPreview(selectedFile);
  }
});

document.getElementById('cameraInput')?.addEventListener('change', e => {
  if (e.target.files.length) {
    selectedFile = e.target.files[0];
    showPreview(selectedFile);
  }
});

function processSelectedFile() {
  if (!selectedFile) {
    alert("Upload payslip first");
    return;
  }

  processPayslip(selectedFile);
}

/* ================= FLUTTER BRIDGE ================= */

window.receiveFlutterImage = function (base64Image) {

  try {

    previewContainer.innerHTML =
      `<img src="data:image/png;base64,${base64Image}" 
             style="max-width:100%;border-radius:8px;">`;

    const byteCharacters = atob(base64Image);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "image/png" });

    selectedFile = new File([blob], "payslip.png", { type: "image/png" });

    processPayslip(selectedFile);

  } catch (err) {
    console.error("Flutter image error:", err);
    alert("Error processing image from mobile app.");
  }
};

/* ================= OCR PROCESS ================= */

function processPayslip(file) {

  loading.innerText = "Reading payslip... Please wait";
  result.innerHTML = "";

  Tesseract.recognize(file, 'eng', {
    logger: m => console.log(m)
  })
  .then(({ data: { text } }) => {

    loading.innerText = "";

    if (!text || text.length < 20) {
      result.innerHTML = "⚠ Unable to read text clearly.";
      return;
    }

    console.log("OCR TEXT:", text);

    const clean = normalizeText(text);

    const gross =
      extractAmount(clean, GROSS_KEYWORDS) ||
      sumComponents(clean);

    const pension =
      extractAmount(clean, PENSION_KEYWORDS) || 0;

    const oldPAYE =
      extractAmount(clean, PAYE_KEYWORDS) || 0;

    if (!gross || gross <= 0) {
      result.innerHTML = "⚠ Gross Pay not detected.";
      return;
    }

    const newPAYE = computePAYE(gross, pension);
    const difference = oldPAYE - newPAYE;

    displayResult(gross, pension, oldPAYE, newPAYE, difference);

  })
  .catch(err => {
    console.error("OCR Error:", err);
    loading.innerText = "";
    result.innerHTML = "❌ OCR failed. Check Console (F12).";
  });
}

/* ================= DISPLAY ================= */

function displayResult(gross, pension, oldPAYE, newPAYE, diff) {

  result.innerHTML = `
    <p><b>Detected Gross Pay:</b> ₦${gross.toLocaleString()}</p>
    <p><b>Detected Pension:</b> ₦${pension.toLocaleString()}</p>
    <p><b>Current PAYE:</b> ₦${oldPAYE.toLocaleString()}</p>
    <hr>
    <p><b>Correct PAYE:</b> ₦${newPAYE.toLocaleString()}</p>
    <p><b>Difference:</b> ₦${diff.toLocaleString()}</p>
  `;
}

/* ================= TEXT CLEANING ================= */

function normalizeText(text) {
  return text
    .toUpperCase()
    .replace(/₦/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* ================= KEYWORDS ================= */

const GROSS_KEYWORDS = [
  "GROSS PAY",
  "GROSS SALARY",
  "TOTAL EMOLUMENT",
  "TOTAL PAY",
  "TOTAL EARNINGS",
  "GROSS"
];

const PENSION_KEYWORDS = [
  "PENSION",
  "PFA",
  "RETIREMENT"
];

const PAYE_KEYWORDS = [
  "PAYE",
  "PAY AS YOU EARN",
  "TAX"
];

/* ================= AMOUNT EXTRACTION ================= */

function extractAmount(text, keywords) {

  for (let key of keywords) {

    const regex = new RegExp(
      key + "\\s*[:\\-]?\\s*([0-9]{2,12}(?:\\.\\d{2})?)"
    );

    const match = text.match(regex);

    if (match) return Number(match[1]);
  }

  return null;
}

/* ================= FALLBACK COMPONENT SUM ================= */

function sumComponents(text) {

  let total = 0;

  const components = [
    "BASIC",
    "HOUSING",
    "RENT",
    "TRANSPORT",
    "MEAL",
    "UTILITY",
    "ALLOWANCE"
  ];

  for (let comp of components) {

    const regex =
      new RegExp(comp + "\\s*[:\\-]?\\s*([0-9]{2,12})", "g");

    let match;

    while ((match = regex.exec(text)) !== null) {
      total += Number(match[1]);
    }
  }

  return total > 0 ? total : null;
}

/* ================= EXCEL PROCESSING ================= */

function processExcel() {

  const file = document.getElementById("excelFile")?.files[0];

  if (!file) {
    alert("Upload Excel file first.");
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e) {

    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    processedData = json.map(row => {

      const gross = Number(row["Gross Salary"]) || 0;
      const pension = Number(row["Pension"]) || 0;
      const oldPAYE = Number(row["Old PAYE"]) || 0;

      const newPAYE = computePAYE(gross, pension);
      const difference = oldPAYE - newPAYE;

      return {
        ...row,
        "New PAYE": newPAYE,
        "Difference": difference
      };
    });

    previewExcel(processedData);
  };

  reader.readAsArrayBuffer(file);
}

/* ================= EXCEL PREVIEW ================= */

function previewExcel(data) {

  const container = document.getElementById("excelPreview");
  if (!container || data.length === 0) return;

  let html = "<table><tr>";

  Object.keys(data[0]).forEach(k => {
    html += `<th>${k}</th>`;
  });

  html += "</tr>";

  data.slice(0, 20).forEach(row => {
    html += "<tr>";
    Object.values(row).forEach(v => {
      html += `<td>${v}</td>`;
    });
    html += "</tr>";
  });

  html += "</table>";

  container.innerHTML = html;
}

/* ================= DOWNLOAD EXCEL ================= */

function downloadExcel() {

  if (!processedData.length) {
    alert("No processed data to download.");
    return;
  }

  const ws = XLSX.utils.json_to_sheet(processedData);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Processed Payroll");
  XLSX.writeFile(wb, "Processed_PAYE.xlsx");
}
