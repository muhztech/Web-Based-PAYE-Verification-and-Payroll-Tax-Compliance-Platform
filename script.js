/* ================= GLOBAL ================= */

let selectedFile = null;
let processedData = [];
let lastGross = 0;
let lastPension = 0;
let lastNHF = 0;
let lastNHIS = 0;
let lastPAYE = 0;

const previewContainer = document.getElementById("previewContainer");
const loading = document.getElementById("loading");
const result = document.getElementById("result");

/* ================= TAB SWITCH ================= */

function openTab(id, el) {

  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

  el.classList.add("active");
  document.getElementById(id).classList.add("active");
}

/* ================= TAX CONFIG ================= */

const TAX_FREE = 800000;

const TAX_BANDS = [
  { limit: 2200000, rate: 0.15 },
  { limit: 6800000, rate: 0.18 },
  { limit: 4000000, rate: 0.21 },
  { limit: 12000000, rate: 0.23 },
  { limit: Infinity, rate: 0.25 }
];

/* ================= TAX ENGINE ================= */

function computePAYE(monthlyGross, pension = 0, nhf = 0, nhis = 0, other = 0) {

  if (!monthlyGross) return 0;

  const annualIncome = monthlyGross * 12;

  const annualDeductions = (pension + nhf + nhis + other) * 12;

  let taxable = Math.max(annualIncome - annualDeductions - TAX_FREE, 0);

  let tax = 0;

  for (let band of TAX_BANDS) {

    if (taxable <= 0) break;

    let amount = Math.min(band.limit, taxable);

    tax += amount * band.rate;

    taxable -= amount;
  }

  return tax / 12;
}

/* ================= FILE INPUT ================= */

galleryInput.onchange = e => {

  selectedFile = e.target.files[0];
  preview(selectedFile);
};

cameraInput.onchange = e => {

  selectedFile = e.target.files[0];
  preview(selectedFile);
};

/* ================= IMAGE PREVIEW ================= */

function preview(file) {

  if (file.type === "application/pdf") {

    previewContainer.innerHTML =
      `<p>📄 PDF uploaded: ${file.name}</p>`;

    return;
  }

  const reader = new FileReader();

  reader.onload = e => {

    previewContainer.innerHTML =
      `<img src="${e.target.result}" style="max-width:100%;border-radius:8px;">`;

  };

  reader.readAsDataURL(file);
}

/* ================= OCR PROCESS ================= */

async function processSelectedFile() {

  if (!selectedFile) {

    alert("Upload payslip first");
    return;
  }

  loading.innerText = "Reading payslip...";

  let imageData;

  if (selectedFile.type === "application/pdf") {

    imageData = await convertPDFtoImage(selectedFile);

  } else {

    imageData = selectedFile;
  }

  Tesseract.recognize(imageData, 'eng', {
    logger: m => console.log(m)
  })

  .then(({ data: { text } }) => {

    loading.innerText = "";

    const clean = normalizeText(text);

    const gross =
      extractAmount(clean, [
        "GROSS PAY",
        "GROSS SALARY",
        "TOTAL PAY",
        "TOTAL EARNINGS"
      ]);

    const pension =
      extractAmount(clean, [
        "PENSION",
        "PFA",
        "RETIREMENT"
      ]) || 0;

    const nhf =
      extractAmount(clean, [
        "NHF",
        "HOUSING FUND"
      ]) || 0;

    const nhis =
      extractAmount(clean, [
        "NHIS",
        "HEALTH INSURANCE"
      ]) || 0;

    const paye =
      extractAmount(clean, [
        "PAYE",
        "PAYE TAX",
        "PAY AS YOU EARN",
        "TAX"
      ]) || 0;

    if (!gross) {

      result.innerHTML = "⚠ Gross Pay not detected from payslip.";
      return;
    }

    lastGross = gross;
    lastPension = pension;
    lastNHF = nhf;
    lastNHIS = nhis;
    lastPAYE = paye;

    const newPAYE = computePAYE(gross, pension, nhf, nhis);

    result.innerHTML = `
      <b>Gross:</b> ₦${gross.toLocaleString()}<br>
      <b>Pension:</b> ₦${pension.toLocaleString()}<br>
      <b>NHF:</b> ₦${nhf.toLocaleString()}<br>
      <b>NHIS:</b> ₦${nhis.toLocaleString()}<br>
      <b>Old PAYE:</b> ₦${paye.toLocaleString()}
      <hr>
      <b>Recomputed PAYE:</b> ₦${newPAYE.toLocaleString()}<br>
      <b>Difference:</b> ₦${(paye - newPAYE).toLocaleString()}
      `;
  });
}

/* ================= RENT RELIEF ================= */

function applyRentRelief() {

  const rentChecked = document.getElementById("rentCheck").checked;
  const employerHouse = document.getElementById("employerHouse").checked;
  const rentAmount = Number(document.getElementById("rentAmount").value);

  if (!lastGross) {
    alert("Process a payslip first.");
    return;
  }

  if (employerHouse) {

    result.innerHTML += `<hr><span class="warning">
    ⚠ Rent relief not allowed because employer provides accommodation.
    </span>`;

    return;
  }

  if (!rentChecked) {

    result.innerHTML += `<hr>
    <span class="warning">
    Employee did not declare rent. No relief applied.
    </span>`;

    return;
  }

  const annualIncome = lastGross * 12;

  const maxRelief = annualIncome * 0.20;

  const relief = Math.min(rentAmount, maxRelief);

  const reliefMonthly = relief / 12;

  const newPAYE = computePAYE(
    lastGross,
    lastPension,
    lastNHF,
    lastNHIS,
    reliefMonthly
  );

  const diff = lastPAYE - newPAYE;

  let message = "";

  if (diff > 0) {

    message = `
    <span class="warning">
    ⚠ PAYE Over-Deduction Detected<br>
    Refund Due: ₦${diff.toLocaleString()}
    </span>`;
  }

  result.innerHTML += `

  <hr>

  <b>Rent Relief Applied</b><br>

  Annual Rent Declared: ₦${rentAmount.toLocaleString()}<br>
  Allowed Relief: ₦${relief.toLocaleString()}<br>

  <hr>

  <b>Correct PAYE After Relief:</b> ₦${newPAYE.toLocaleString()}<br>

  ${message}
  `;
}

/* ================= PDF OCR ================= */

async function convertPDFtoImage(file) {

  const pdfData = await file.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 1.5 });

  const canvas = document.createElement("canvas");

  const context = canvas.getContext("2d");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;

  return new Promise(resolve => {

    canvas.toBlob(blob => {

      const img = new Image();

      img.onload = () => resolve(img);

      img.src = URL.createObjectURL(blob);

    }, "image/jpeg", 0.7);

  });
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

/* ================= AMOUNT EXTRACTOR ================= */

function extractAmount(text, keywords) {

  for (let key of keywords) {

    const regex = new RegExp(
      key + "\\s*[:\\-]?\\s*([0-9]+(?:\\.[0-9]{1,2})?)"
    );

    const match = text.match(regex);

    if (match) {

      const value = Number(match[1]);

      if (!isNaN(value)) {
        return value;
      }
    }
  }

  return null;
}

/* ================= PIT CALCULATOR ================= */

function calculatePIT() {

  const gross = Number(pitGross.value);
  const exp = Number(pitExpenses.value);

  const newPAYE = computePAYE(gross, 0, 0, 0, exp);

  pitResult.innerHTML =
    `<b>Monthly PIT:</b> ₦${newPAYE.toLocaleString()}`;
}

/* ================= EXCEL PROCESS (FIXED) ================= */

function processExcel() {

  const file = excelFile.files[0];

  if (!file) {

    alert("Upload Excel file");
    return;
  }

  const reader = new FileReader();

  reader.onload = e => {

    const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });

    const sheet = wb.Sheets[wb.SheetNames[0]];

    const json = XLSX.utils.sheet_to_json(sheet);

    processedData = json.map(r => {

      const gross = Number(r["Gross Salary"]) || 0;
      const pension = Number(r["Pension"]) || 0;
      const nhf = Number(r["NHF"]) || 0;
      const nhis = Number(r["NHIS"]) || 0;
      const other = Number(r["Other Deductions"]) || 0;

      const rent = Number(r["Rent"]) || 0;

      const rentingValue =
        r["Renting"] ??
        r["Renting (Yes/No)"] ??
        "";

      const renting =
        String(rentingValue).toLowerCase().trim() === "yes" ||
        String(rentingValue).toLowerCase().trim() === "true" ||
        String(rentingValue).trim() === "1";

      const employerHouse =
        String(r["Employer Housing"] || "")
        .toLowerCase()
        .trim() === "yes";

      const oldPAYE =
        Number(r["PAYE Deducted"]) ||
        Number(r["Old PAYE"]) ||
        0;

      let reliefMonthly = 0;
      let compliance = "OK";

      if (renting && !employerHouse) {

        const annualIncome = gross * 12;

        const maxRelief = annualIncome * 0.20;

        const relief = Math.min(rent, maxRelief);

        reliefMonthly = relief / 12;

        const recomputed =
          computePAYE(gross, pension, nhf, nhis, reliefMonthly);

        if (oldPAYE > recomputed) {

          compliance = "⚠ PAYE Over-Deduction";
        }
      }

      const newPAYE =
        computePAYE(gross, pension, nhf, nhis, other + reliefMonthly);

      return {
        ...r,
        "Rent Relief Applied": Math.round(reliefMonthly),
        "New PAYE": Math.round(newPAYE),
        "Difference": Math.round(oldPAYE - newPAYE),
        "Compliance Flag": compliance
      };
    });

    previewExcel(processedData);

    downloadBtn.style.display = "block";
  };

  reader.readAsArrayBuffer(file);
}

/* ================= EXCEL PREVIEW ================= */

function previewExcel(data) {

  if (!data.length) return;

  let html = "<table><tr>";

  Object.keys(data[0]).forEach(k => {

    html += `<th>${k}</th>`;
  });

  html += "</tr>";

  data.forEach(row => {

    html += "<tr>";

    Object.values(row).forEach(v => {

      html += `<td>${v}</td>`;
    });

    html += "</tr>";
  });

  html += "</table>";

  excelPreview.innerHTML = html;
}

/* ================= DOWNLOAD EXCEL ================= */

function downloadExcel() {

  const ws = XLSX.utils.json_to_sheet(processedData);

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Processed");

  XLSX.writeFile(wb, "Processed_PAYE.xlsx");
}
