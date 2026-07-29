const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { PDF_DIR } = require('./db');

async function embedImageFromBase64(pdfDoc, base64) {
  if (!base64) return null;
  try {
    const match = base64.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    const type = match ? match[1] : 'png';
    const data = match ? match[2] : base64;
    const bytes = Buffer.from(data, 'base64');
    if (type === 'png') return await pdfDoc.embedPng(bytes);
    return await pdfDoc.embedJpg(bytes);
  } catch (e) {
    return null;
  }
}

async function genererBonDeSortie(bon, identite) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let y = height - 60;

  // Logo (haut de page)
  const logo = await embedImageFromBase64(pdfDoc, identite && identite.logo_base64);
  if (logo) {
    const logoDims = logo.scale(60 / logo.height);
    page.drawImage(logo, { x: 50, y: y - 40, width: logoDims.width, height: 60 });
  }

  page.drawText(identite && identite.nom_structure ? identite.nom_structure : "DIABYCIT EVEN'S", {
    x: logo ? 130 : 50, y: y - 10, size: 16, font: fontBold, color: rgb(0.1, 0.15, 0.13)
  });

  y -= 90;
  page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  y -= 40;

  page.drawText('BON DE SORTIE', { x: 50, y, size: 20, font: fontBold, color: rgb(0.1, 0.15, 0.13) });
  y -= 20;
  page.drawText(`N° ${bon.id}`, { x: 50, y, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 40;

  const champ = (label, value) => {
    page.drawText(label, { x: 50, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(String(value || ''), { x: 220, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 26;
  };

  champ('Date :', bon.date);
  champ('Bénéficiaire :', bon.beneficiaire);
  champ('Motif :', bon.motif);
  champ('Type de ressource :', bon.type_ressource === 'argent' ? 'Somme d\'argent' : 'Matériel');

  if (bon.type_ressource === 'argent') {
    champ('Montant :', `${bon.montant} `);
  } else {
    champ('Matériel :', bon.materiel_liste);
  }

  y -= 20;
  page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });

  // Tampon et signature en bas de page
  const bottomY = 110;
  const tampon = await embedImageFromBase64(pdfDoc, identite && identite.tampon_base64);
  const signature = await embedImageFromBase64(pdfDoc, identite && identite.signature_base64);

  page.drawText('Cachet :', { x: 50, y: bottomY + 70, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  if (tampon) {
    const d = tampon.scale(70 / tampon.height);
    page.drawImage(tampon, { x: 50, y: bottomY, width: d.width, height: 70 });
  }

  page.drawText('Signature :', { x: 350, y: bottomY + 70, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  if (signature) {
    const d = signature.scale(60 / signature.height);
    page.drawImage(signature, { x: 350, y: bottomY, width: d.width, height: 60 });
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `bon-${bon.id}-${Date.now()}.pdf`;
  const filepath = path.join(PDF_DIR, filename);
  fs.writeFileSync(filepath, pdfBytes);
  return filename;
}

module.exports = { genererBonDeSortie };
