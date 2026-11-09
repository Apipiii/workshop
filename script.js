// ============================================================
// KONFIGURASI — GANTI DENGAN URL WEB APP APPS SCRIPT KAMU
// Contoh: https://script.google.com/macros/s/AKfycb.../exec
// ============================================================
const API_URL = 'https://script.google.com/macros/s/XXXXXXXXXXXX/exec';

// ============================================================
// STATE
// ============================================================
let peserta = [];
let pesertaFiltered = [];
let html5QrCode = null;
let scanning = false;
let scanCooldown = false;

// ============================================================
// ELEMEN
// ============================================================
const statusEl   = document.getElementById('scanStatus');
const btnStart   = document.getElementById('btnStart');
const btnStop    = document.getElementById('btnStop');
const btnRefresh = document.getElementById('btnRefresh');
const searchBox  = document.getElementById('searchBox');
const tbody      = document.getElementById('tabelPeserta');

// ============================================================
// UTIL STATUS
// ============================================================
function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'scan-status ' + type;
}

// ============================================================
// AMBIL DATA PESERTA DARI API
// ============================================================
async function muatPeserta() {
  try {
    const res = await fetch(API_URL + '?action=list', { cache: 'no-store' });
    const data = await res.json();
    peserta = data.peserta || [];
    terapkanFilter();
  } catch (err) {
    console.error('Gagal memuat peserta:', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#f87171">Gagal memuat data. Periksa URL API.</td></tr>';
  }
}

// ============================================================
// FILTER PENCARIAN
// ============================================================
function terapkanFilter() {
  const q = (searchBox.value || '').toLowerCase().trim();
  if (!q) {
    pesertaFiltered = peserta.slice();
  } else {
    pesertaFiltered = peserta.filter(p =>
      (p.nama || '').toLowerCase().includes(q) ||
      String(p.nim || '').toLowerCase().includes(q)
    );
  }
  render();
}

searchBox.addEventListener('input', terapkanFilter);

// ============================================================
// RENDER TABEL & STATISTIK
// ============================================================
function render() {
  if (pesertaFiltered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;opacity:.6">Tidak ada peserta</td></tr>';
  } else {
    tbody.innerHTML = pesertaFiltered.map((p) => {
      const idx = peserta.indexOf(p);
      const levelNum = parseInt(p.level) || 0;
      return `
        <tr>
          <td><code>${p.id}</code></td>
          <td>${p.nama}</td>
          <td>${p.nim || '-'}</td>
          <td>${p.level || '-'}
            <div class="skill-bar"><span style="width:${Math.min(levelNum * 10, 100)}%"></span></div>
          </td>
          <td><span class="badge ${p.hadir ? 'hadir' : 'belum'}">${p.hadir ? 'Hadir' : 'Belum'}</span></td>
          <td>${p.jam || '-'}</td>
          <td>
            <button class="btn btn-primary btn-small" onclick="tampilBarcode(${idx})">Barcode</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  const total = peserta.length;
  const hadir = peserta.filter(p => p.hadir).length;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statHadir').textContent = hadir;
  document.getElementById('statBelum').textContent = total - hadir;
}

// ============================================================
// TAMPILKAN BARCODE PESERTA
// ============================================================
function tampilBarcode(i) {
  const p = peserta[i];
  document.getElementById('qrNama').textContent = `${p.nama} (${p.id})`;
  document.getElementById('qrImg').src =
    `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(p.id)}&code=Code128&translate-esc=on`;
  document.getElementById('qrModal').classList.add('active');
}

document.getElementById('btnTutupQR').addEventListener('click', () => {
  document.getElementById('qrModal').classList.remove('active');
});

// ============================================================
// SCANNER — START (area scan luas & responsif)
// ============================================================
btnStart.addEventListener('click', async () => {
  if (scanning) return;

  // Hitung ukuran kotak scan berdasarkan lebar layar
  const readerW = document.getElementById('reader').clientWidth || 360;
  const boxW = Math.min(readerW - 20, 600);   // lebar maks 600px
  const boxH = Math.round(boxW * 0.55);        // rasio 55% dari lebar
  const qrbox = {
    width: boxW,
    height: Math.min(boxH, 320)                // tinggi maks 320px
  };

  try {
    html5QrCode = new Html5Qrcode("reader");
    await html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 15,
        qrbox: qrbox,
        aspectRatio: 1.777,
        disableFlip: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      },
      onScanSuccess
    );

    // Perbesar overlay kotak scan bawaan library
    const overlay = document.querySelector('#reader__dashboard_section_csr');
    if (overlay) overlay.style.padding = '0';

    scanning = true;
    btnStart.style.display = 'none';
    btnStop.style.display = 'inline-block';
    setStatus('Arahkan kamera ke barcode peserta (kotak lebar)...', 'info');
  } catch (err) {
    setStatus('Gagal membuka kamera: ' + err, 'error');
  }
});

// ============================================================
// SCANNER — STOP
// ============================================================
btnStop.addEventListener('click', async () => {
  if (!scanning) return;
  try {
    await html5QrCode.stop();
    html5QrCode.clear();
  } catch (e) { /* ignore */ }
  scanning = false;
  btnStart.style.display = 'inline-block';
  btnStop.style.display = 'none';
  setStatus('Scan dihentikan.');
});

// ============================================================
// CALLBACK SAAT BARCODE TERBACA
// ============================================================
async function onScanSuccess(decodedText) {
  if (scanCooldown) return;
  scanCooldown = true;
  setTimeout(() => scanCooldown = false, 2000);

  const id = (decodedText || '').trim();
  const p = peserta.find(x => String(x.id) === id);

  if (!p) {
    setStatus(`❌ Barcode tidak dikenali: "${id}"`, 'error');
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    return;
  }

  if (p.hadir) {
    setStatus(`⚠️ ${p.nama} sudah absen pukul ${p.jam}`, 'error');
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    return;
  }

  setStatus('⏳ Mencatat kehadiran...', 'info');

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'absen', id: id })
    });
    const result = await res.json();

    if (result.success) {
      p.hadir = true;
      p.jam = result.jam;
      terapkanFilter();
      setStatus(`✅ Absensi berhasil: ${result.nama} pukul ${result.jam}`, 'success');
      if (navigator.vibrate) navigator.vibrate(150);
    } else {
      setStatus(`⚠️ ${result.error}${result.jam ? ' pukul ' + result.jam : ''}`, 'error');
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }
  } catch (err) {
    setStatus('❌ Gagal mencatat kehadiran. Periksa koneksi.', 'error');
  }
}

// ============================================================
// REFRESH MANUAL
// ============================================================
btnRefresh.addEventListener('click', () => {
  setStatus('Memuat ulang data...', 'info');
  muatPeserta().then(() => setStatus('Data diperbarui.', 'info'));
});

// ============================================================
// INIT
// ============================================================
muatPeserta();
setInterval(muatPeserta, 30000);