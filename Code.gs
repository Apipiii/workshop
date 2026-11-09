// ============================================================
// KONFIGURASI KOLOM (1-based index)
// Form: A=Timestamp, B=Email, C=Nim, D=Nama, E=Pengalaman HTML/CSS
// Script tambah: F=ID, G=Barcode URL, H=Hadir, I=Jam Absen
// ============================================================
const SHEET_NAME    = 'Form Responses 1'; // sesuaikan nama sheet
const KOL_ID        = 6;
const KOL_BARCODE   = 7;
const KOL_HADIR     = 8;
const KOL_JAM       = 9;

// ============================================================
// GET: ambil daftar peserta
// ============================================================
function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    const result = { peserta: [] };

    if (lastRow > 1) {
      const rows = sheet.getRange(2, 1, lastRow - 1, KOL_JAM).getValues();
      rows.forEach(r => {
        const id = r[KOL_ID - 1];
        if (id) {
          result.peserta.push({
            id:    String(id),
            nama:  r[3] || '-',
            nim:   r[2] || '-',
            email: r[1] || '-',
            level: r[4] || '-',
            hadir: r[KOL_HADIR - 1] === true || String(r[KOL_HADIR - 1]).toUpperCase() === 'TRUE',
            jam:   r[KOL_JAM - 1] ? String(r[KOL_JAM - 1]) : null
          });
        }
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ peserta: [], error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// POST: catat kehadiran berdasarkan ID
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action || 'absen';

    if (action !== 'absen') {
      return jsonOut({ success: false, error: 'Aksi tidak dikenal' });
    }

    const id = String(body.id || '').trim();
    if (!id) return jsonOut({ success: false, error: 'ID kosong' });

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonOut({ success: false, error: 'Belum ada data' });

    const ids = sheet.getRange(2, KOL_ID, lastRow - 1, 1).getValues();

    let targetRow = -1;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) {
        targetRow = i + 2;
        break;
      }
    }

    if (targetRow === -1) {
      return jsonOut({ success: false, error: 'ID tidak ditemukan' });
    }

    const hadirCell = sheet.getRange(targetRow, KOL_HADIR);
    const sudahHadir = hadirCell.getValue();
    if (sudahHadir === true || String(sudahHadir).toUpperCase() === 'TRUE') {
      const jam = sheet.getRange(targetRow, KOL_JAM).getValue();
      return jsonOut({
        success: false,
        error: 'Sudah absen',
        jam: jam ? String(jam) : null
      });
    }

    const now = new Date();
    const jamStr = Utilities.formatDate(now, 'Asia/Jakarta', 'HH:mm:ss');
    hadirCell.setValue(true);
    sheet.getRange(targetRow, KOL_JAM).setValue(jamStr);

    const nama = sheet.getRange(targetRow, 4).getValue();

    return jsonOut({ success: true, nama: nama, jam: jamStr });
  } catch (err) {
    return jsonOut({ success: false, error: err.toString() });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// GENERATE ID + BARCODE UNTUK SEMUA BARIS YANG BELUM PUNYA ID
// Jalankan manual dari editor, atau biarkan trigger onFormSubmit
// ============================================================
function generateIdDanBarcode() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  // Set header
  sheet.getRange(1, KOL_ID).setValue('ID Unik');
  sheet.getRange(1, KOL_BARCODE).setValue('Barcode URL');
  sheet.getRange(1, KOL_HADIR).setValue('Hadir');
  sheet.getRange(1, KOL_JAM).setValue('Jam Absen');

  const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

  for (let i = 0; i < data.length; i++) {
    const row = i + 2;
    const existingId = sheet.getRange(row, KOL_ID).getValue();
    if (existingId) continue;

    const nim = data[i][2] ? String(data[i][2]).trim() : 'X';
    const id = 'WKS-' + nim + '-' + Date.now().toString().slice(-4) + i;

    sheet.getRange(row, KOL_ID).setValue(id);

    const barcodeUrl = 'https://barcode.tec-it.com/barcode.ashx?data='
      + encodeURIComponent(id)
      + '&code=Code128&translate-esc=on';
    sheet.getRange(row, KOL_BARCODE).setValue(barcodeUrl);
  }
}

// ============================================================
// TRIGGER OTOMATIS SAAT ADA FORM SUBMIT BARU
// (pasang via Triggers → onFormSubmit → From spreadsheet → On form submit)
// ============================================================
function onFormSubmit(e) {
  // Beri jeda sedikit agar baris baru benar-benar tersimpan
  Utilities.sleep(1000);
  generateIdDanBarcode();
}