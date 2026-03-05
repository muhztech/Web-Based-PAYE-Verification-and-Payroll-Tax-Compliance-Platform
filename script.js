/* ================= GLOBAL ================= */

let selectedFile = null;
let processedData = [];

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

  const reader = new FileReader();

  reader.onload = e => {

    previewContainer.innerHTML =
      `<img src="${e.target.result}" style="max-width:100%;border-radius:8px;">`;

  };

  reader.readAsDataURL(file);
}

/* ================= IMAGE PREPROCESSING ================= */

function preprocessImage(file) {

  return new Promise(resolve => {

    const img = new Image();
    const reader = new FileReader();

    reader.onload = e => {

      img.src = e.target.result;

      img.onload = () => {

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = img.width;
        canvas.height = img.height;

        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {

          let gray =
            data[i] * 0.3 +
            data[i + 1] * 0.59 +
            data[i + 2] * 0.11;

          gray = gray > 140 ? 255 : 0;

          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }

        ctx.putImageData(imageData, 0, 0);

        resolve(canvas);
      };
    };

    reader.readAsDataURL(file);
  });
}

/* ================= OCR PROCESS ================= */

async function processSelectedFile() {

  if (!selectedFile) {

    alert("Upload payslip first");
    return;
  }

  loading.innerText = "Enhancing image...";

  const processedImage = await preprocessImage(selectedFile);

  loading.innerText = "Running AI OCR...";

  const { data: { text } } =
    await Tesseract.recognize(processedImage, "eng", {
      logger: m => console.log(m)
    });

  loading.innerText = "";

  console.log("RAW OCR:", text);

  const clean = normalizeText(text);

  const lines = clean.split("\n");

  const gross = smartFind(lines, [
    "GROSS PAY",
    "GROSS SALARY",
    "TOTAL PAY",
    "TOTAL EARNINGS",
    "GROSS"
  ]);

  const pension = smartFind(lines, [
    "PENSION",
    "RETIREMENT",
    "PFA"
  ]) || 0;

  const nhf = smartFind(lines, [
    "NHF",
    "HOUSING FUND",
    "NATIONAL HOUSING"
  ]) || 0;

  const nhis = smartFind(lines, [
    "NHIS",
    "HEALTH INSURANCE"
  ]) || 0;

  const paye = smartFind(lines, [
    "PAYE",
    "PAY AS YOU EARN",
    "PAYE TAX",
    "TAX"
  ]) || 0;

  if (!gross) {

    result.innerHTML = "⚠ Gross Pay not detected.";
    return;
  }

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
}

/* ================= NORMALIZE TEXT ================= */

function normalizeText(text) {

  return text
    .toUpperCase()
    .replace(/₦/g, "")
    .replace(/NGN/g, "")
    .replace(/,/g, "")
    .replace(/[O]/g, "0")
    .replace(/[I]/g, "1")
    .replace(/\r/g, "")
    .trim();
}

/* ================= FINTECH PARSER ================= */

function smartFind(lines, keywords) {

  for (let line of lines) {

    for (let key of keywords) {

      if (line.includes(key)) {

        const num = line.match(/[0-9]+(\.[0-9]{1,2})?/);

        if (num) return Number(num[0]);
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

/* ================= EXCEL PROCESS ================= */

function processExcel() {

  const file = excelFile.files[0];

  if (!file) {

    alert("Upload Excel file");
    return;
  }

  const reader = new FileReader();

  reader.onload = e => {

    const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    processedData = json.map(r => {

      const gross = Number(r["Gross Salary"]) || 0;
      const pension = Number(r["Pension"]) || 0;
      const nhf = Number(r["NHF"]) || 0;
      const nhis = Number(r["NHIS"]) || 0;
      const other = Number(r["Other Deductions"]) || 0;
      const oldPAYE = Number(r["Old PAYE"]) || 0;

      const newPAYE = computePAYE(gross, pension, nhf, nhis, other);

      return {
        ...r,
        "New PAYE": Math.round(newPAYE),
        "Difference": Math.round(oldPAYE - newPAYE)
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
