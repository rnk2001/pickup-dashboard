// 1. ตั้งค่า Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDENUj0Rsdz4Lg9xlZWRAeqrafD9hWCVw0",
  authDomain: "pickup01-e696a.firebaseapp.com",
  projectId: "pickup01-e696a",
  storageBucket: "pickup01-e696a.firebasestorage.app",
  messagingSenderId: "930076984246",
  appId: "1:930076984246:web:269377b19c383a65fcf717",
  measurementId: "G-K1SV5Y5Z2P"
};

// 2. เริ่มต้นใช้งาน Firebase & Firestore
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// 3. ตั้งค่า SweetAlert2 Toast แจ้งเตือนมุมขวาบน
const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2000,
  timerProgressBar: true
});

function showToast(icon, title) {
  Toast.fire({ icon: icon, title: title });
}

let allRawItems = [];
let globalDailyGrouped = [];
let currentDetailDate = null;
let waveChartInstance = null;

// 4. ทำงานเมื่อโหลด DOM เรียบร้อยแล้ว
document.addEventListener('DOMContentLoaded', function() {
  initTheme();
  lucide.createIcons();
  initFlatpickr();
  addItemRow();
  initKeyboardShortcuts();
  initRealtimeListener();
  initLiveFormCalculation();
});

/* Dark / Light Theme Toggle Functions */
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const isDark = savedTheme === 'dark';
  if (isDark) {
    document.body.classList.add('dark-theme');
  }
  updateThemeIcon(isDark);
}

function toggleTheme() {
  document.body.classList.toggle('dark-theme');
  const isDark = document.body.classList.contains('dark-theme');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);

  if (globalDailyGrouped) {
    renderWaveGradientChart(globalDailyGrouped);
  }
}

function updateThemeIcon(isDark) {
  const iconElem = document.getElementById('themeIcon');
  if (iconElem) {
    iconElem.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    lucide.createIcons();
  }
}

function initFlatpickr() {
  const today = new Date().toISOString().split('T')[0];

  flatpickr("#recordDate", {
    locale: "th",
    dateFormat: "Y-m-d",
    defaultDate: today,
    disableMobile: true
  });

  flatpickr("#filterStartDate", { locale: "th", dateFormat: "Y-m-d", disableMobile: true });
  flatpickr("#filterEndDate", { locale: "th", dateFormat: "Y-m-d", disableMobile: true });
  flatpickr("#editDate", { locale: "th", dateFormat: "Y-m-d", disableMobile: true });
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      switchPage(null, 'dashboard', document.querySelectorAll('.menu-item')[0]);
      const s = document.getElementById('topGlobalSearch');
      if (s) { s.focus(); s.select(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      switchPage(null, 'form', document.querySelectorAll('.menu-item')[1]);
    }
    if (e.key === 'Escape') {
      closeDetailModal();
      closeEditModal();
    }
  });
}

function switchPage(e, pageId, element) {
  if (e) e.preventDefault();
  document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.segmented-tab').forEach(t => t.classList.remove('active'));

  document.getElementById('page-' + pageId).classList.add('active');
  
  const idx = pageId === 'dashboard' ? 0 : 1;
  document.querySelectorAll('.menu-item')[idx].classList.add('active');
  document.querySelectorAll('.segmented-tab')[idx].classList.add('active');
}

function openQuickFormFAB() {
  switchPage(null, 'form', document.querySelectorAll('.menu-item')[1]);
}

// 5. โหลดและซิงค์ข้อมูลแบบ Realtime จาก Firestore
function initRealtimeListener() {
  db.collection("pickups").onSnapshot((snapshot) => {
    let rawItems = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      rawItems.push([
        doc.id,
        data.recordDate || '',
        data.itemType || '',
        Number(data.quantity) || 0,
        0,
        Number(data.totalPrice) || 0,
        data.note || '',
        data.recorder || '',
        data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : '') : ''
      ]);
    });

    allRawItems = rawItems;
    applyCurrentFilters();
  }, (error) => {
    console.error("Connection Error: ", error);
    showToast('error', 'การเชื่อมต่อขัดข้อง');
  });
}

function applyCurrentFilters() {
  const startDate = document.getElementById('filterStartDate').value;
  const endDate = document.getElementById('filterEndDate').value;
  const itemType = document.getElementById('filterItemType').value;

  let filtered = [...allRawItems];

  if (startDate) filtered = filtered.filter(row => row[1] >= startDate);
  if (endDate) filtered = filtered.filter(row => row[1] <= endDate);
  if (itemType && itemType !== 'ทั้งหมด') filtered = filtered.filter(row => row[2] === itemType);

  processAndRenderData(filtered);
}

function processAndRenderData(filteredItems) {
  let totalQty = 0, totalPrice = 0, generalQty = 0, generalPrice = 0, nunQty = 0, nunPrice = 0;
  const groupedMap = {};

  filteredItems.forEach(row => {
    const dateStr = row[1], type = row[2], qty = row[3], price = row[5];

    totalQty += qty;
    totalPrice += price;

    if (type === 'ทั่วไป') { generalQty += qty; generalPrice += price; }
    else if (type === 'แม่ชี') { nunQty += qty; nunPrice += price; }

    if (!groupedMap[dateStr]) {
      groupedMap[dateStr] = {
        date: dateStr,
        totalQty: 0,
        totalPrice: 0,
        breakdown: { 'ทั่วไป': { qty: 0, price: 0 }, 'แม่ชี': { qty: 0, price: 0 } },
        items: []
      };
    }

    groupedMap[dateStr].totalQty += qty;
    groupedMap[dateStr].totalPrice += price;
    if (!groupedMap[dateStr].breakdown[type]) groupedMap[dateStr].breakdown[type] = { qty: 0, price: 0 };
    groupedMap[dateStr].breakdown[type].qty += qty;
    groupedMap[dateStr].breakdown[type].price += price;
    groupedMap[dateStr].items.push(row);
  });

  globalDailyGrouped = Object.values(groupedMap).sort((a, b) => a.date.localeCompare(b.date));

  updateDashboard({ totalQty, totalPrice, generalQty, generalPrice, nunQty, nunPrice });
  renderDailyTable(globalDailyGrouped);
  renderWaveGradientChart(globalDailyGrouped);

  if (currentDetailDate) openDetailModal(currentDetailDate);
}

function updateDashboard(s) {
  document.getElementById('dashTotalQty').innerText = (s.totalQty || 0).toLocaleString();
  document.getElementById('dashTotalPrice').innerText = (s.totalPrice || 0).toLocaleString() + " บาท";
  document.getElementById('dashGeneralQty').innerText = (s.generalQty || 0).toLocaleString();
  document.getElementById('dashGeneralPrice').innerText = (s.generalPrice || 0).toLocaleString() + " บาท";
  document.getElementById('dashNunQty').innerText = (s.nunQty || 0).toLocaleString();
  document.getElementById('dashNunPrice').innerText = (s.nunPrice || 0).toLocaleString() + " บาท";
  
  const total = (s.generalQty + s.nunQty) || 1;
  const genRatio = Math.round((s.generalQty / total) * 100);
  document.getElementById('dashRatioPercent').innerText = genRatio + "% ทั่วไป";
}

/* Fintech Teal & Indigo Wave Gradient Chart */
function renderWaveGradientChart(dailyGrouped) {
  const canvas = document.getElementById('proportionWaveChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (waveChartInstance) waveChartInstance.destroy();

  const isDark = document.body.classList.contains('dark-theme');
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const textColor = isDark ? '#cbd5e1' : '#475569';

  const labels = dailyGrouped.map(g => g.date.slice(5)); // MM-DD
  const genData = dailyGrouped.map(g => (g.breakdown['ทั่วไป'] ? g.breakdown['ทั่วไป'].qty : 0));
  const nunData = dailyGrouped.map(g => (g.breakdown['แม่ชี'] ? g.breakdown['แม่ชี'].qty : 0));

  // Muted Teal Gradient
  const gradGen = ctx.createLinearGradient(0, 0, 0, 200);
  gradGen.addColorStop(0, isDark ? 'rgba(45, 212, 191, 0.35)' : 'rgba(13, 148, 136, 0.35)');
  gradGen.addColorStop(1, 'rgba(13, 148, 136, 0.01)');

  // Soft Indigo Gradient
  const gradNun = ctx.createLinearGradient(0, 0, 0, 200);
  gradNun.addColorStop(0, isDark ? 'rgba(129, 140, 248, 0.35)' : 'rgba(99, 102, 241, 0.35)');
  gradNun.addColorStop(1, 'rgba(99, 102, 241, 0.01)');

  waveChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length ? labels : ['ไม่มีข้อมูล'],
      datasets: [
        {
          label: 'สินค้าทั่วไป (Teal)',
          data: genData.length ? genData : [0],
          borderColor: isDark ? '#2dd4bf' : '#0d9488',
          borderWidth: 2.5,
          backgroundColor: gradGen,
          fill: true,
          tension: 0.45,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: isDark ? '#2dd4bf' : '#0d9488'
        },
        {
          label: 'สินค้าแม่ชี (Indigo)',
          data: nunData.length ? nunData : [0],
          borderColor: isDark ? '#818cf8' : '#6366f1',
          borderWidth: 2.5,
          backgroundColor: gradNun,
          fill: true,
          tension: 0.45,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: isDark ? '#818cf8' : '#6366f1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { family: 'Prompt, sans-serif', size: 11 }, color: textColor, boxWidth: 12 }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: textColor } },
        y: { grid: { color: gridColor }, ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: textColor }, beginAtZero: true }
      }
    }
  });
}

function renderDailyTable(dailyGrouped) {
  const tbody = document.getElementById('dailyTableBody');
  const tfoot = document.getElementById('dailyTableFoot');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (tfoot) tfoot.innerHTML = '';

  if (!dailyGrouped || dailyGrouped.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state-box">
            <div class="empty-state-icon"><i data-lucide="inbox"></i></div>
            <div style="font-weight:600; color:var(--text-main);">ไม่พบข้อมูลรายการ</div>
            <div style="font-size:0.78rem; margin-top:2px;">ลองปรับตัวกรองวันที่หรือค้นหาใหม่อีกครั้ง</div>
            <button class="btn-clean" style="margin-top:12px; font-size:0.75rem;" onclick="resetFilter()"><i data-lucide="rotate-ccw"></i> ล้างตัวกรอง</button>
          </div>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  let grandQty = 0, grandPrice = 0;

  dailyGrouped.forEach(group => {
    const genQty = (group.breakdown && group.breakdown['ทั่วไป']) ? group.breakdown['ทั่วไป'].qty : 0;
    const nunQty = (group.breakdown && group.breakdown['แม่ชี']) ? group.breakdown['แม่ชี'].qty : 0;

    grandQty += group.totalQty;
    grandPrice += group.totalPrice;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${group.date}</strong></td>
      <td>${group.totalQty.toLocaleString()} ชิ้น</td>
      <td style="font-weight: 600; color: var(--emerald-main);">${group.totalPrice.toLocaleString()} บาท</td>
      <td>
        <div style="display:flex; gap:6px;">
          <span class="badge-pastel emerald">ทั่วไป: ${genQty}</span>
          <span class="badge-pastel purple">แม่ชี: ${nunQty}</span>
        </div>
      </td>
      <td style="text-align: center;">
        <button class="btn-clean" style="padding: 4px 10px; font-size: 0.75rem;" onclick="openDetailModal('${group.date}')">
          ดูรายละเอียด (${group.items.length})
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td>รวมทั้งสิ้น (${dailyGrouped.length} วัน)</td>
        <td>${grandQty.toLocaleString()} ชิ้น</td>
        <td style="color: var(--emerald-main);">${grandPrice.toLocaleString()} บาท</td>
        <td colspan="2" style="text-align:right; font-weight:normal; color:var(--text-muted); font-size:0.78rem;">สรุปยอดช่วงเวลาที่เลือก</td>
      </tr>
    `;
  }

  lucide.createIcons();
}

function openDetailModal(dateStr) {
  currentDetailDate = dateStr;
  const group = globalDailyGrouped.find(g => g.date === dateStr);
  if (!group) return;

  document.getElementById('detailModalDate').innerText = dateStr;
  document.getElementById('detailTableSearch').value = '';
  
  const genBody = document.getElementById('detailGeneralBody');
  const nunBody = document.getElementById('detailNunBody');
  genBody.innerHTML = ''; nunBody.innerHTML = '';

  const generalItems = group.items.filter(r => r[2] === 'ทั่วไป');
  const nunItems = group.items.filter(r => r[2] === 'แม่ชี');

  document.getElementById('countGeneral').innerText = generalItems.length;
  document.getElementById('countNun').innerText = nunItems.length;

  if (generalItems.length === 0) genBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">ไม่มีรายการสินค้าทั่วไป</td></tr>';
  else generalItems.forEach(row => genBody.appendChild(createDetailRow(row)));

  if (nunItems.length === 0) nunBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:16px;">ไม่มีรายการสินค้าแม่ชี</td></tr>';
  else nunItems.forEach(row => nunBody.appendChild(createDetailRow(row)));

  lucide.createIcons();
  document.getElementById('detailModal').style.display = 'flex';
}

function createDetailRow(row) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><small style="color: var(--text-muted);">${row[0]}</small></td>
    <td>${Number(row[3]).toLocaleString()}</td>
    <td style="font-weight:600;">${Number(row[5]).toLocaleString()} บาท</td>
    <td>${row[7]}</td>
    <td><span style="color: var(--text-muted);">${row[6]}</span></td>
    <td style="text-align: center;">
      <button class="btn-clean" style="padding: 2px 8px; font-size: 0.72rem;" onclick="openEditModal('${row[0]}')"><i data-lucide="edit-3"></i></button>
      <button class="btn-clean" style="padding: 2px 8px; font-size: 0.72rem; color: #ef4444;" onclick="deleteItem('${row[0]}')"><i data-lucide="trash-2"></i></button>
    </td>
  `;
  return tr;
}

function closeDetailModal() {
  document.getElementById('detailModal').style.display = 'none';
  currentDetailDate = null;
}

function addItemRow() {
  const container = document.getElementById('itemsContainer');
  if (!container) return;
  const rowDiv = document.createElement('div');
  rowDiv.className = 'form-item-grid';
  rowDiv.innerHTML = `
    <div>
      <label class="form-group-label" style="margin-bottom:4px;">ประเภทสินค้า</label>
      <select class="item-type input-clean-field" required>
        <option value="ทั่วไป">ทั่วไป</option>
        <option value="แม่ชี">แม่ชี</option>
      </select>
    </div>
    <div>
      <label class="form-group-label" style="margin-bottom:4px;">จำนวน</label>
      <input type="number" class="item-qty input-clean-field" min="1" placeholder="0" required>
    </div>
    <div>
      <label class="form-group-label" style="margin-bottom:4px;">มูลค่ารวม (บาท)</label>
      <input type="number" class="item-price input-clean-field" min="0" step="any" placeholder="0.00" required>
    </div>
    <div>
      <label class="form-group-label" style="margin-bottom:4px;">หมายเหตุ</label>
      <input type="text" class="item-note input-clean-field" placeholder="ข้อมูลเพิ่มเติม">
    </div>
    <div style="text-align:center;">
      <button type="button" class="btn-delete-icon" onclick="removeItemRow(this)" title="ลบรายการ"><i data-lucide="trash-2"></i></button>
    </div>
  `;
  container.appendChild(rowDiv);
  lucide.createIcons();
  calculateFormLiveSummary();
}

function removeItemRow(btn) {
  const rows = document.querySelectorAll('.form-item-grid');
  if (rows.length > 1) {
    btn.closest('.form-item-grid').remove();
    calculateFormLiveSummary();
  } else {
    showToast('warning', 'ต้องมีอย่างน้อย 1 รายการ');
  }
}

/* Live Form Calculation */
function initLiveFormCalculation() {
  const container = document.getElementById('itemsContainer');
  if (container) {
    container.addEventListener('input', calculateFormLiveSummary);
  }
}

function calculateFormLiveSummary() {
  let totalQty = 0;
  let totalPrice = 0;

  document.querySelectorAll('.form-item-grid').forEach(row => {
    const q = Number(row.querySelector('.item-qty').value) || 0;
    const p = Number(row.querySelector('.item-price').value) || 0;
    totalQty += q;
    totalPrice += p;
  });

  const liveQtyElem = document.getElementById('liveTotalQty');
  const livePriceElem = document.getElementById('liveTotalPrice');

  if (liveQtyElem) liveQtyElem.innerText = totalQty.toLocaleString();
  if (livePriceElem) livePriceElem.innerText = totalPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

// 6. ฟังก์ชันบันทึกข้อมูลใหม่พร้อม SweetAlert2 Confirmation Modal
const pickupForm = document.getElementById('pickupForm');
if (pickupForm) {
  pickupForm.addEventListener('submit', function(e) {
    e.preventDefault();

    Swal.fire({
      title: 'ยืนยันการบันทึกข้อมูล?',
      text: "โปรดตรวจสอบข้อมูลให้ถูกต้องก่อนบันทึกเข้าสู่ระบบ",
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0f172a',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'ยืนยันบันทึก',
      cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
      if (result.isConfirmed) {
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = `กำลังบันทึก...`;

        try {
          const itemRows = document.querySelectorAll('.form-item-grid');
          const recordDate = document.getElementById('recordDate').value;
          const recorder = document.getElementById('recorder').value;

          const batch = db.batch();

          itemRows.forEach(row => {
            const docRef = db.collection("pickups").doc();
            batch.set(docRef, {
              recordDate: recordDate,
              recorder: recorder,
              itemType: row.querySelector('.item-type').value,
              quantity: Number(row.querySelector('.item-qty').value) || 0,
              totalPrice: Number(row.querySelector('.item-price').value) || 0,
              note: row.querySelector('.item-note').value || '',
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          });

          await batch.commit();

          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i data-lucide="save"></i> ยืนยันบันทึกข้อมูล`;
          lucide.createIcons();

          showToast('success', 'บันทึกข้อมูลเรียบร้อยแล้ว');

          document.getElementById('pickupForm').reset();
          initFlatpickr();
          document.getElementById('itemsContainer').innerHTML = '';
          addItemRow();

        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i data-lucide="save"></i> ยืนยันบันทึกข้อมูล`;
          showToast('error', 'ข้อผิดพลาด: ' + err.message);
        }
      }
    });
  });
}

function openEditModal(id) {
  const targetItem = allRawItems.find(r => r[0] === id);
  if (!targetItem) return;

  document.getElementById('editId').value = targetItem[0];
  document.getElementById('displayEditId').innerText = targetItem[0];
  document.getElementById('editDate').value = targetItem[1];
  document.getElementById('editItemType').value = targetItem[2];
  document.getElementById('editQuantity').value = targetItem[3];
  document.getElementById('editTotalPrice').value = targetItem[5];
  document.getElementById('editNote').value = targetItem[6];
  document.getElementById('editRecorder').value = targetItem[7];

  lucide.createIcons();
  document.getElementById('editModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
}

// 7. ฟังก์ชันอัปเดตการแก้ไขข้อมูลพร้อม SweetAlert2 Confirmation Modal
const editForm = document.getElementById('editForm');
if (editForm) {
  editForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const editId = document.getElementById('editId').value;

    Swal.fire({
      title: 'ยืนยันการแก้ไขข้อมูล?',
      text: `ต้องการอัปเดตข้อมูลรายการรหัส ${editId} ใช่หรือไม่`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0f172a',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'ยืนยันการแก้ไข',
      cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await db.collection("pickups").doc(editId).update({
            recordDate: document.getElementById('editDate').value,
            itemType: document.getElementById('editItemType').value,
            quantity: Number(document.getElementById('editQuantity').value) || 0,
            totalPrice: Number(document.getElementById('editTotalPrice').value) || 0,
            note: document.getElementById('editNote').value || '',
            recorder: document.getElementById('editRecorder').value || ''
          });

          closeEditModal();
          showToast('success', 'ปรับปรุงข้อมูลเรียบร้อยแล้ว');
        } catch (err) {
          showToast('error', 'ข้อผิดพลาด: ' + err.message);
        }
      }
    });
  });
}

// 8. ฟังก์ชันลบรายการพร้อม SweetAlert2 Confirmation Modal
function deleteItem(id) {
  Swal.fire({
    title: 'ยืนยันการลบรายการ?',
    text: `คุณกำลังจะลบรายการรหัส ${id} ข้อมูลนี้ไม่สามารถกู้คืนได้!`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ใช่, ลบเลย!',
    cancelButtonText: 'ยกเลิก'
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        await db.collection("pickups").doc(id).delete();
        showToast('success', 'ลบรายการเรียบร้อยแล้ว');
      } catch (err) {
        showToast('error', 'ข้อผิดพลาด: ' + err.message);
      }
    }
  });
}

function setQuickDate(preset) {
  const today = new Date();
  let startDate = new Date(), endDate = new Date();

  if (preset === 'today') { startDate = today; endDate = today; }
  else if (preset === '7days') { startDate = new Date(); startDate.setDate(today.getDate() - 6); endDate = today; }
  else if (preset === 'thisMonth') { startDate = new Date(today.getFullYear(), today.getMonth(), 1); endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0); }

  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  document.getElementById('filterStartDate').value = fmt(startDate);
  document.getElementById('filterEndDate').value = fmt(endDate);
  applyCurrentFilters();
}

function applyFilter() { applyCurrentFilters(); }
function resetFilter() {
  document.getElementById('filterStartDate').value = '';
  document.getElementById('filterEndDate').value = '';
  document.getElementById('filterItemType').value = 'ทั้งหมด';
  applyCurrentFilters();
}

function liveSearchDailyTable() {
  const query = (document.getElementById('topGlobalSearch').value || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#dailyTableBody tr');
  rows.forEach(row => { row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none'; });
}

function liveSearchDetailModal() {
  const query = document.getElementById('detailTableSearch').value.toLowerCase().trim();
  const rows = document.querySelectorAll('#detailGeneralBody tr, #detailNunBody tr');
  rows.forEach(row => { row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none'; });
}

function exportToCSV() {
  if (!globalDailyGrouped || globalDailyGrouped.length === 0) {
    showToast('warning', 'ไม่มีข้อมูลสำหรับส่งออก CSV');
    return;
  }

  let csvContent = "\uFEFFวันที่,ยอดรวมสินค้า (ชิ้น),มูลค่ารวม (บาท),จำนวนทั่วไป,จำนวนแม่ชี\n";
  globalDailyGrouped.forEach(group => {
    const genQty = (group.breakdown && group.breakdown['ทั่วไป']) ? group.breakdown['ทั่วไป'].qty : 0;
    const nunQty = (group.breakdown && group.breakdown['แม่ชี']) ? group.breakdown['แม่ชี'].qty : 0;
    csvContent += `"${group.date}",${group.totalQty},${group.totalPrice},${genQty},${nunQty}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `pickup_summary_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('success', 'ส่งออกข้อมูล CSV เรียบร้อย');
}

function exportToPDF() {
  if (!globalDailyGrouped || globalDailyGrouped.length === 0) {
    showToast('warning', 'ไม่มีข้อมูลสำหรับส่งออก PDF');
    return;
  }
  window.print();
}