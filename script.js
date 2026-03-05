/* ================= GLOBAL STATE ================= */

let selectedFile = null;
let processedData = [];

const previewContainer = document.getElementById("previewContainer");
const loading = document.getElementById("loading");
const result = document.getElementById("result");

/* ================= TAB SWITCH ================= */

function openTab(id, el) {

  document.querySelectorAll(".tab").forEach(t =>
    t.classList.remove("active")
  );

  document.querySelectorAll(".tab-content").forEach(c =>
    c.classList.remove("active")
  );

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

/* ================= CORE TAX ENGINE ================= */

function computePAYE(monthlyGross, pension = 0, nhf = 0, nhis = 0, other = 0) {

  if (!monthlyGross) return 0;

  const annualIncome = monthlyGross * 12;

  const annualDeductions =
    (pension + nhf + nhis + other) * 12;

  let taxableIncome =
    annualIncome - annualDeductions - TAX_FREE;

  taxableIncome = Math.max(taxableIncome, 0);

  let tax = 0;

  for (let band of TAX_BANDS) {

    if (taxableIncome <= 0) break;

    const amount = Math.min(band.limit, taxableIncome);

    tax += amount * band.rate;

    taxableIncome -= amount;
  }

  return tax / 12;
}

/* ================= IMAGE PREVIEW ================= */

function preview(file) {

  const reader = new FileReader();

  reader.onload = function (e) {

    previewContainer.innerHTML =
      `<img src="${e.target.result}"
      style="max-width:100%;border-radius:8px;">`;

  };

  reader.readAsDataURL(file);
}

/* ================= INPUT HANDLERS ================= */

const galleryInput = document.getElementById("galleryInput");
const cameraInput = document.getElementById("cameraInput");

if (galleryInput) {
  galleryInput.onchange = e => {
    selectedFile = e.target.files[0];
    preview(selectedFile);
  };
}

if (cameraInput) {
  cameraInput.onchange = e => {
    selectedFile = e.target.files[0];
    preview(selectedFile);
  };
}

/* ================= PROCESS PAYSLIP ================= */

function processSelectedFile() {

  if (!selectedFile) {
    alert("Upload payslip first");
    return;
  }

  loading.innerText = "Reading payslip...";

  Tesseract.recognize(selectedFile, "eng")

    .then(({ data: { text } }) => {

      loading.innerText = "";

      const clean =
        text.toUpperCase().replace(/₦|,/g, "");

      const gross =
        extract(clean, ["GROSS PAY", "TOTAL PAY", "GROSS"]);

      const pension =
        extract(clean, ["PENSION"]) || 0;

      const paye =
        extract(clean, ["PAYE", "PAYE TAX", "TAX"]) || 0;

      const newPAYE =
        computePAYE(gross, pension);

      result.innerHTML = `
      <p><b>Gross:</b> ₦${gross}</p>
      <p><b>Pension:</b> ₦${pension}</p>
      <p><b>PAYE (Slip):</b> ₦${paye}</p>
      <hr>
      <p><b>Recomputed PAYE:</b> ₦${newPAYE.toLocaleString()}</p>
      `;
    });
}

/* ================= TEXT EXTRACTION ================= */

function extract(text, keywords) {

  for (let key of keywords) {

    let regex =
      new RegExp(key + "\\s*[:\\-]?\\s*([0-9]{2,12})");

    let match = text.match(regex);

    if (match) return Number(match[1]);
  }

  return null;
}

/* ================= PIT CALCULATOR ================= */

function calculatePIT() {

  const gross =
    Number(document.getElementById("pitGross").value);

  const exp =
    Number(document.getElementById("pitExpenses").value);

  const newPAYE =
    computePAYE(gross, 0, 0, 0, exp);

  document.getElementById("pitResult").innerHTML =
    `Monthly PIT: ₦${newPAYE.toLocaleString()}`;
}

/* ================= EXCEL PROCESSING ================= */

function processExcel() {

  const file =
    document.getElementById("excelFile").files[0];

  if (!file) {
    alert("Upload Excel file first");
    return;
  }

  const reader = new FileReader();

  reader.onload = function (e) {

    const wb =
      XLSX.read(new Uint8Array(e.target.result),
        { type: "array" });

    const sheet =
      wb.Sheets[wb.SheetNames[0]];

    const json =
      XLSX.utils.sheet_to_json(sheet);

    processedData = json.map(r => {

      const gross =
        Number(r["Gross Salary"]) || 0;

      const pension =
        Number(r["Pension"]) || 0;

      const nhf =
        Number(r["NHF"]) || 0;

      const nhis =
        Number(r["NHIS"]) || 0;

      const other =
        Number(r["Other Deductions"]) || 0;

      const oldPAYE =
        Number(r["Old PAYE"]) || 0;

      const newPAYE =
        computePAYE(gross, pension, nhf, nhis, other);

      return {
        ...r,
        "New PAYE": Math.round(newPAYE),
        "Difference": Math.round(oldPAYE - newPAYE)
      };
    });

    previewExcel(processedData);

    document.getElementById("downloadBtn").style.display =
      "block";
  };

  reader.readAsArrayBuffer(file);
}

/* ================= EXCEL PREVIEW ================= */

function previewExcel(data) {

  if (!data.length) return;

  const container =
    document.getElementById("excelPreview");

  let html = "<table border='1'><tr>";

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
    alert("No processed data");
    return;
  }

  const ws =
    XLSX.utils.json_to_sheet(processedData);

  const wb =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    ws,
    "Processed Payroll"
  );

  XLSX.writeFile(
    wb,
    "Processed_PAYE.xlsx"
  );
}
