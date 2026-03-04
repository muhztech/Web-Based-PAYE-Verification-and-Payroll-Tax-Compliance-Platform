/* ================= GLOBAL STATE ================= */

let selectedFile = null;
let processedData = [];
const previewContainer = document.getElementById('previewContainer');

/* ================= TAX CONFIG ================= */

const TAX_FREE = 800000;

const TAX_BANDS = [
  { limit: 2200000, rate: 0.15 },
  { limit: 9000000, rate: 0.18 },
  { limit: 13000000, rate: 0.21 },
  { limit: 25000000, rate: 0.23 },
  { limit: Infinity, rate: 0.25 }
];

/* ================= CORE TAX ENGINE ================= */

function computePAYE(monthlyGross, monthlyPension = 0) {

  if (!monthlyGross || monthlyGross <= 0) return 0;

  const annualIncome = monthlyGross * 12;
  const annualPension = monthlyPension * 12;
  const taxableIncome = annualIncome - annualPension;

  let tax = 0;

  if (taxableIncome > TAX_FREE) {

    let remaining = taxableIncome - TAX_FREE;

    for (let band of TAX_BANDS) {

      if (remaining <= 0) break;

      const amount = Math.min(band.limit, remaining);
      tax += amount * band.rate;
      remaining -= amount;
    }
  }

  return tax / 12;
}

/* ================= FILE PREVIEW ================= */

function showPreviewFromFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    previewContainer.innerHTML =
      `<img src="${e.target.result}" style="max-width:100%;border-radius:8px;">`;
  };
  reader.readAsDataURL(file);
}

/* ================= INPUT HANDLERS ================= */

document.getElementById('cameraInput')?.addEventListener('change', e => {
  if (e.target.files.length) {
    selectedFile = e.target.files[0];
    showPreviewFromFile(selectedFile);
  }
});

document.getElementById('galleryInput')?.addEventListener('change', e => {
  if (e.target.files.length) {
    selectedFile = e.target.files[0];
    showPreviewFromFile(selectedFile);
  }
});

function processSelectedFile() {
  if (!selectedFile) {
    alert("Upload or capture payslip first.");
    return;
  }
  processPayslip(selectedFile);
}

/* ================= OCR PROCESS ================= */

function processPayslip(file) {

  const loading = document.getElementById("loading");
  const resultBox = document.getElementById("result");

  loading.innerText = "Reading payslip... please wait";

  Tesseract.recognize(file, 'eng', {
    logger: m => console.log(m)
  })
    .then(({ data: { text } }) => {

      loading.innerText = "";

      if (!text || text.length < 20) {
        resultBox.innerHTML = "⚠ OCR could not read text clearly.";
        return;
      }

      console.log("OCR RAW TEXT:", text);

      const cleanText = normalizeText(text);

      const gross =
        extractAmount(cleanText, GROSS_KEYWORDS) ||
        sumComponents(cleanText);

      const pension =
        extractAmount(cleanText, PENSION_KEYWORDS) || 0;

      const currentPAYE =
        extractAmount(cleanText, PAYE_KEYWORDS) || 0;

      if (!gross || gross <= 0) {
        resultBox.innerHTML =
          "⚠ Gross Pay not confidently detected. Try clearer image.";
        return;
      }

      const newPAYE = computePAYE(gross, pension);
      const difference = currentPAYE - newPAYE;

      displayResult(gross, pension, currentPAYE, newPAYE, difference);
    })
    .catch(err => {
      console.error("OCR ERROR:", err);
      loading.innerText = "";
      resultBox.innerHTML = "❌ Error processing payslip.";
    });
}

/* ================= DISPLAY RESULT ================= */

function displayResult(gross, pension, oldPAYE, newPAYE, difference) {

  document.getElementById("result").innerHTML = `
    <p><b>Detected Gross Pay:</b> ₦${gross.toLocaleString()}</p>
    <p><b>Detected Pension:</b> ₦${pension.toLocaleString()}</p>
    <p><b>Current PAYE:</b> ₦${oldPAYE.toLocaleString()}</p>
    <hr>
    <p><b>Correct PAYE (New Law):</b> ₦${newPAYE.toLocaleString()}</p>
    <p><b>Difference:</b> ₦${difference.toLocaleString()}</p>
  `;
}

/* ================= TEXT NORMALIZATION ================= */

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
  "PAY AS YOU EARN"
];

/* ================= SMART AMOUNT EXTRACTION ================= */

function extractAmount(text, keywords) {

  for (let key of keywords) {

    const regex = new RegExp(
      key + "[^0-9]{0,30}([0-9]+(?:\\.[0-9]{1,2})?)"
    );

    const match = text.match(regex);

    if (match) {
      const value = Number(match[1]);
      if (!isNaN(value) && value > 0) {
        return value;
      }
    }
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
      new RegExp(comp + "[^0-9]{0,30}([0-9]+)", "g");

    let match;

    while ((match = regex.exec(text)) !== null) {
      total += Number(match[1]);
    }
  }

  return total > 0 ? total : null;
}
