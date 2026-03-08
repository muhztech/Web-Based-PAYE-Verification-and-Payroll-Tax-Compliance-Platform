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

/* ================= EXCEL TEMPLATE DOWNLOAD ================= */

function downloadTemplate(){

const headers = [
"Employee Name",
"Gross Salary",
"Pension",
"NHF",
"NHIS",
"Rent",
"Renting",
"Old PAYE"
];

const example = [[
"John Doe",
350000,
28000,
8750,
5000,
120000,
"Yes",
46000
]];

const worksheet = XLSX.utils.aoa_to_sheet([headers,...example]);

const workbook = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll");

XLSX.writeFile(workbook,"Payroll_Template.xlsx");

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

const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });

const sheet = wb.Sheets[wb.SheetNames[0]];

const json = XLSX.utils.sheet_to_json(sheet);

processedData = json.map(r => {

const gross = Number(r["Gross Salary"]) || 0;
const pension = Number(r["Pension"]) || 0;
const nhf = Number(r["NHF"]) || 0;
const nhis = Number(r["NHIS"]) || 0;

const rent = Number(r["Rent"]) || 0;

const renting = (r["Renting"] || "").toString().toLowerCase();

const oldPAYE = Number(r["Old PAYE"]) || 0;

/* ================= RENT RELIEF LOGIC ================= */

let rentRelief = 0;

if(renting === "yes"){

const annualIncome = gross * 12;

const maxRelief = annualIncome * 0.20;

rentRelief = Math.min(rent, maxRelief) / 12;

}

/* ================= NEW PAYE ================= */

const newPAYE = computePAYE(
gross,
pension,
nhf,
nhis,
rentRelief
);

return {

...r,

"Rent Relief Applied": Math.round(rentRelief),

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

/* ================= DOWNLOAD PROCESSED EXCEL ================= */

function downloadExcel() {

const ws = XLSX.utils.json_to_sheet(processedData);

const wb = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(wb, ws, "Processed");

XLSX.writeFile(wb, "Processed_PAYE.xlsx");

}
