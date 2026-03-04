<script>
/* ================= GLOBAL STATE ================= */

let selectedFile = null;
const previewContainer = document.getElementById('previewContainer');

/* ================= PREVIEW FUNCTIONS ================= */

function showPreviewFromFile(file){
  const reader = new FileReader();
  reader.onload = e => {
    previewContainer.innerHTML =
      `<img src="${e.target.result}" 
            style="max-width:100%;border-radius:8px;" 
            alt="Payslip Preview">`;
  };
  reader.readAsDataURL(file);
}

function showPreviewFromBase64(base64){
  previewContainer.innerHTML =
    `<img src="data:image/png;base64,${base64}" 
          style="max-width:100%;border-radius:8px;" 
          alt="Payslip Preview">`;
}

/* ================= WEB INPUT HANDLERS ================= */

document.getElementById('cameraInput')?.addEventListener('change', e => {
  if(e.target.files.length){
    selectedFile = e.target.files[0];
    showPreviewFromFile(selectedFile);
  }
});

document.getElementById('galleryInput')?.addEventListener('change', e => {
  if(e.target.files.length){
    selectedFile = e.target.files[0];
    showPreviewFromFile(selectedFile);
  }
});

function processSelectedFile(){
  if(!selectedFile){
    alert("Please take a photo or upload a payslip first!");
    return;
  }
  processPayslip(selectedFile);
}

/* ================= FLUTTER BRIDGE ================= */
/* Flutter calls this function */

window.receiveFlutterImage = function(base64Image){

  try {
    showPreviewFromBase64(base64Image);

    // Convert base64 → File (important fix)
    const byteCharacters = atob(base64Image);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "image/png" });

    // Proper File object (CRITICAL FIX)
    selectedFile = new File([blob], "payslip.png", { type: "image/png" });

    processPayslip(selectedFile);

  } catch (err) {
    console.error("Flutter image error:", err);
    alert("Failed to process image from mobile app.");
  }
};

/* ================= OCR PROCESS ================= */

function processPayslip(file){

  document.getElementById("loading").innerText =
    "Reading payslip… please wait";

  Tesseract.recognize(file, 'eng', {
    logger: m => console.log(m)
  })
  .then(({ data: { text } }) => {

    document.getElementById("loading").innerText = "";

    const cleanText = normalizeText(text);
    console.log("OCR TEXT:", cleanText);

    let gross =
      extractAmount(cleanText, GROSS_KEYWORDS) ||
      sumComponents(cleanText);

    let pension = extractAmount(cleanText, PENSION_KEYWORDS) || 0;
    let currentPAYE =
      extractAmount(cleanText, PAYE_KEYWORDS) || 0;

    if(!gross){
      alert(
        "Could not confidently detect Gross Pay.\n" +
        "Tip: ensure payslip is clear and well-lit."
      );
      return;
    }

    calculateNewPAYE(gross, pension, currentPAYE);

  })
  .catch(err => {
    console.error(err);
    document.getElementById("loading").innerText = "";
    alert("Error reading payslip. Please try again.");
  });
}

/* ================= TEXT NORMALIZATION ================= */

function normalizeText(text){
  return text
    .toUpperCase()
    .replace(/₦/g,"")
    .replace(/\s+/g," ")
    .replace(/,/g,"");
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

function extractAmount(text, keywords){
  for(let key of keywords){
    const regex = new RegExp(
      key + "[^0-9]{0,25}([0-9]{2,9}(?:\\.\\d{2})?)"
    );
    const match = text.match(regex);
    if(match){
      return Number(match[1]);
    }
  }
  return null;
}

/* ================= FALLBACK: SUM COMPONENTS ================= */

function sumComponents(text){

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

  for(let comp of components){

    const regex =
      new RegExp(comp + "[^0-9]{0,25}([0-9]{2,9})","g");

    let match;

    while((match = regex.exec(text)) !== null){
      total += Number(match[1]);
    }
  }

  return total > 0 ? total : null;
}

/* ================= PAYE CALCULATION ================= */

function calculateNewPAYE(monthlyGross, pensionMonthly, currentPAYE){

  const annualIncome = monthlyGross * 12;
  const pensionAnnual = pensionMonthly * 12;
  const taxableIncome = annualIncome - pensionAnnual;

  let tax = 0;

  if(taxableIncome > 800000){

    let remaining = taxableIncome - 800000;

    const bands = [
      { limit: 2200000, rate: 0.15 },
      { limit: 9000000, rate: 0.18 },
      { limit: 13000000, rate: 0.21 },
      { limit: 25000000, rate: 0.23 },
      { limit: Infinity, rate: 0.25 }
    ];

    for(let band of bands){

      if(remaining <= 0) break;

      let amount = Math.min(band.limit, remaining);

      tax += amount * band.rate;
      remaining -= amount;
    }
  }

  const monthlyNewPAYE = tax / 12;
  const difference = currentPAYE - monthlyNewPAYE;

  document.getElementById("result").innerHTML = `
    <p><b>Detected Gross Pay:</b> ₦${monthlyGross.toLocaleString()}</p>
    <p><b>Detected Pension:</b> ₦${pensionMonthly.toLocaleString()}</p>
    <p><b>Current PAYE:</b> ₦${currentPAYE.toLocaleString()}</p>
    <hr>
    <p><b>Correct PAYE (New Law):</b> ₦${monthlyNewPAYE.toLocaleString()}</p>
    <p><b>Difference:</b> ₦${difference.toLocaleString()}</p>
  `;
}
</script>
