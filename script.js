// ==========================================================================
// 1. CONFIG & GLOBAL STATE
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyDENUj0Rsdz4Lg9xlZWRAeqrafD9hWCVw0",
  authDomain: "pickup01-e696a.firebaseapp.com",
  projectId: "pickup01-e696a",
  storageBucket: "pickup01-e696a.firebasestorage.app",
  messagingSenderId: "930076984246",
  appId: "1:930076984246:web:269377b19c383a65fcf717",
  measurementId: "G-K1SV5Y5Z2P"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();

const STATE = {
  currentUser: null,
  userRole: 'staff',
  rawItems: [],
  dailyGrouped: [],
  currentDetailDate: null,
  chartInstance: null
};

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2000,
  timerProgressBar: true
});

function showToast(icon, title) {
  Toast.fire({ icon, title });
}

// ==========================================================================
// 2. AUTHENTICATION & ROLE MANAGEMENT
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  lucide.createIcons();
  initFlatpickr();
  addItemRow();
  bindGlobalEvents();

  // Auth Observer
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      STATE.currentUser = user;
      document.getElementById('loginModal').style.display = 'none';
      document.getElementById('userProfileBox').style.display = 'flex';
      document.getElementById('recorder').value = user.email.split('@')[0];

      try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
          STATE.userRole = userDoc.data().role || 'staff';
        } else {
          STATE.userRole = 'staff';
          await db.collection('users').doc(user.uid).set({
            email: user.email,
            role: 'staff',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      } catch (err) {
        console.error("Fetch Role Error:", err);
        STATE.userRole = 'staff';
      }

      updateUserUI();
      initRealtimeListener();

    } else {
      STATE.currentUser = null;
      STATE.userRole = 'staff';
      document.getElementById('loginModal').style.display = 'flex';
      document.getElementById('userProfileBox').style.display = 'none';
    }
  });
});

function updateUserUI() {
  if (!STATE.currentUser) return;
  document.getElementById('userEmail').innerText = STATE.currentUser.email;
  document.getElementById('userAvatar').innerText = STATE.currentUser.email.charAt(0).toUpperCase();

  const badge = document.getElementById('userRoleBadge');
  badge.innerText = STATE.userRole.toUpperCase();
  badge.className = `role-badge ${STATE.userRole}`;

  // Toggle CSS attribute for role-based access control
  document.body.setAttribute('data-role', STATE.userRole);
}

// Handle Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const loginBtn = document.getElementById('loginBtn');

  loginBtn.disabled = true;
  loginBtn.innerHTML = 'กำลังตรวจสอบ...';

  try {
    await auth.signInWithEmailAndPassword(email, password);
    showToast('success', 'เข้าสู่ระบบสำเร็จ');
  } catch (err) {
    showToast('error', 'เข้าสู่ระบบไม่สำเร็จ: ' + err.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.innerHTML = `<i data-lucide="log-in"></i> เข้าสู่ระบบ`;
    lucide.createIcons();
  }
});

function logoutUser() {
  auth.signOut().then(() => {
    showToast('success', 'ออกจากระบบเรียบร้อย');
    location.reload();
  });
}

// ==========================================================================
// 3. EVENT BINDING & NAVIGATION
// ==========================================================================
function bindGlobalEvents() {
  // Navigation Tabs
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const pageId = el.getAttribute('data-page');
      switchPage(pageId);
    });
  });

  // Action Buttons
  document.getElementById('btnLogout').addEventListener('click', logoutUser);
  document.getElementById('btnApplyFilter').addEventListener('click', applyCurrentFilters);
  document.getElementById('btnThemeToggle').addEventListener('click', toggleTheme);
  document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);
  document.getElementById('btnExportPDF').addEventListener('click', () => window.print());
  document.getElementById('btnQuick7Days').addEventListener('click', () => setQuickDate('7days'));
  document.getElementById('btnQuickMonth').addEventListener('click', () => setQuickDate('thisMonth'));
  document.getElementById('btnAddRow').addEventListener('click', addItemRow);
  document.getElementById('fabQuickForm').addEventListener('click', () => switchPage('form'));
  document.getElementById('btnCloseDetail').addEventListener('click', closeDetailModal);
  document.getElementById('btnCloseEdit').addEventListener('click', closeEditModal);

  // Search Listeners
  document.getElementById('topGlobalSearch').addEventListener('keyup', liveSearchDailyTable);
  document.getElementById('detailTableSearch').addEventListener('keyup', liveSearchDetailModal);

  // Dynamic Live Total Calculator
  document.getElementById('itemsContainer').addEventListener('input', calculateFormLiveSummary);

  // Form Submissions
  document.getElementById('pickupForm').addEventListener('submit', handlePickupSubmit);
  document.getElementById('editForm').addEventListener('submit', handleEditSubmit);

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      switchPage('dashboard');
      const searchInput = document.getElementById('topGlobalSearch');
      if (searchInput) { searchInput.focus(); searchInput.select(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      switchPage('form');
    }
    if (e.key === 'Escape') {
      closeDetailModal();
      closeEditModal();
    }
  });
}

function switchPage(pageId) {
  document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.segmented-tab').forEach(t => t.classList.remove('active'));

  const targetPage = document.getElementById('page-' + pageId);
  if (targetPage) targetPage.classList.add('active');

  document.querySelectorAll(`[data-page="${pageId}"]`).forEach(el => {
    if (el.classList.contains('menu-item') || el.classList.contains('segmented-tab')) {
      el.classList.add('active');
    }
  });
}

// ==========================================================================
// 4. DATABASE & REALTIME LISTENER
// ==========================================================================
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

    STATE.rawItems = rawItems;
    applyCurrentFilters();
  }, (error) => {
    console.error("Firestore Listener Error: ", error);
  });
}

// ==========================================================================
// 5. DATA PROCESSING & FILTERS
// ==========================================================================
function applyCurrentFilters() {
  const startDate = document.getElementById('filterStartDate').value;
  const endDate = document.getElementById('filterEndDate').value;
  const itemType = document.getElementById('filterItemType').value;

  let filtered = [...STATE.rawItems];

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

  STATE.dailyGrouped = Object.values(groupedMap).sort((a, b) => a.date.localeCompare(b.date));

  updateDashboard({ totalQty, totalPrice, generalQty, generalPrice, nunQty, nunPrice });
  renderDailyTable(STATE.dailyGrouped);
  renderWaveGradientChart(STATE.dailyGrouped);

  if (STATE.currentDetailDate) openDetailModal(STATE.currentDetailDate);
}

// ==========================================================================
// 6. UI RENDERERS & CHARTS
// ==========================================================================
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
            <div class="text-main" style="font-weight:600;">ไม่พบข้อมูลรายการ</div>
            <button class="btn-clean btn-xs mt-sm" id="btnResetFilter"><i data-lucide="rotate-ccw"></i> ล้างตัวกรอง</button>
          </div>
        </td>
      </tr>
    `;
    document.getElementById('btnResetFilter')?.addEventListener('click', resetFilter);
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
      <td class="text-emerald" style="font-weight: 600;">${group.totalPrice.toLocaleString()} บาท</td>
      <td>
        <div style="display:flex; gap:6px;">
          <span class="badge-pastel emerald">ทั่วไป: ${genQty}</span>
          <span class="badge-pastel purple">แม่ชี: ${nunQty}</span>
        </div>
      </td>
      <td class="text-center">
        <button class="btn-clean btn-xs btn-view-detail" data-date="${group.date}">
          ดูรายละเอียด (${group.items.length})
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Bind View Detail Buttons
  document.querySelectorAll('.btn-view-detail').forEach(btn => {
    btn.addEventListener('click', () => openDetailModal(btn.getAttribute('data-date')));
  });

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td>รวมทั้งสิ้น (${dailyGrouped.length} วัน)</td>
        <td>${grandQty.toLocaleString()} ชิ้น</td>
        <td class="text-emerald">${grandPrice.toLocaleString()} บาท</td>
        <td colspan="2" class="text-right text-muted-sm">สรุปยอดช่วงเวลาที่เลือก</td>
      </tr>
    `;
  }

  lucide.createIcons();
}

function renderWaveGradientChart(dailyGrouped) {
  const canvas = document.getElementById('proportionWaveChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (STATE.chartInstance) STATE.chartInstance.destroy();

  const isDark = document.body.classList.contains('dark-theme');
  const gridColor = isDark ? '#334155' : '#e2e8f0';
  const textColor = isDark ? '#cbd5e1' : '#475569';

  const labels = dailyGrouped.map(g => g.date.slice(5));
  const genData = dailyGrouped.map(g => (g.breakdown['ทั่วไป'] ? g.breakdown['ทั่วไป'].qty : 0));
  const nunData = dailyGrouped.map(g => (g.breakdown['แม่ชี'] ? g.breakdown['แม่ชี'].qty : 0));

  const gradGen = ctx.createLinearGradient(0, 0, 0, 200);
  gradGen.addColorStop(0, isDark ? 'rgba(45, 212, 191, 0.35)' : 'rgba(13, 148, 136, 0.35)');
  gradGen.addColorStop(1, 'rgba(13, 148, 136, 0.01)');

  const gradNun = ctx.createLinearGradient(0, 0, 0, 200);
  gradNun.addColorStop(0, isDark ? 'rgba(129, 140, 248, 0.35)' : 'rgba(99, 102, 241, 0.35)');
  gradNun.addColorStop(1, 'rgba(99, 102, 241, 0.01)');

  STATE.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length ? labels : ['ไม่มีข้อมูล'],
      datasets: [
        {
          label: 'สินค้าทั่วไป',
          data: genData.length ? genData : [0],
          borderColor: isDark ? '#2dd4bf' : '#0d9488',
          borderWidth: 2.5,
          backgroundColor: gradGen,
          fill: true,
          tension: 0.45,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: 'สินค้าแม่ชี',
          data: nunData.length ? nunData : [0],
          borderColor: isDark ? '#818cf8' : '#6366f1',
          borderWidth: 2.5,
          backgroundColor: gradNun,
          fill: true,
          tension: 0.45,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Prompt', size: 11 }, color: textColor, boxWidth: 12 } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: textColor } },
        y: { grid: { color: gridColor }, ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: textColor }, beginAtZero: true }
      }
    }
  });
}

// ==========================================================================
// 7. MODALS & FORMS
// ==========================================================================
function openDetailModal(dateStr) {
  STATE.currentDetailDate = dateStr;
  const group = STATE.dailyGrouped.find(g => g.date === dateStr);
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

  if (generalItems.length === 0) genBody.innerHTML = '<tr><td colspan="6" class="table-loading-cell">ไม่มีรายการสินค้าทั่วไป</td></tr>';
  else generalItems.forEach(row => genBody.appendChild(createDetailRow(row)));

  if (nunItems.length === 0) nunBody.innerHTML = '<tr><td colspan="6" class="table-loading-cell">ไม่มีรายการสินค้าแม่ชี</td></tr>';
  else nunItems.forEach(row => nunBody.appendChild(createDetailRow(row)));

  bindDetailActionEvents();
  lucide.createIcons();
  document.getElementById('detailModal').style.display = 'flex';
}

function createDetailRow(row) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><small class="text-muted-sm">${row[0]}</small></td>
    <td>${Number(row[3]).toLocaleString()}</td>
    <td style="font-weight:600;">${Number(row[5]).toLocaleString()} บาท</td>
    <td>${row[7]}</td>
    <td><span class="text-muted-sm">${row[6]}</span></td>
    <td class="text-center admin-only">
      <button class="btn-clean btn-xs btn-edit-item" data-id="${row[0]}"><i data-lucide="edit-3"></i></button>
      <button class="btn-clean btn-xs btn-delete-item" data-id="${row[0]}" style="color: #ef4444;"><i data-lucide="trash-2"></i></button>
    </td>
  `;
  return tr;
}

function bindDetailActionEvents() {
  document.querySelectorAll('.btn-edit-item').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.getAttribute('data-id')));
  });
  document.querySelectorAll('.btn-delete-item').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.getAttribute('data-id')));
  });
}

function closeDetailModal() {
  document.getElementById('detailModal').style.display = 'none';
  STATE.currentDetailDate = null;
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
    <div class="text-center">
      <button type="button" class="btn-delete-icon btn-remove-row" title="ลบรายการ"><i data-lucide="trash-2"></i></button>
    </div>
  `;

  rowDiv.querySelector('.btn-remove-row').addEventListener('click', function() {
    if (document.querySelectorAll('.form-item-grid').length > 1) {
      rowDiv.remove();
      calculateFormLiveSummary();
    } else {
      showToast('warning', 'ต้องมีอย่างน้อย 1 รายการ');
    }
  });

  container.appendChild(rowDiv);
  lucide.createIcons();
  calculateFormLiveSummary();
}

function calculateFormLiveSummary() {
  let totalQty = 0, totalPrice = 0;
  document.querySelectorAll('.form-item-grid').forEach(row => {
    totalQty += Number(row.querySelector('.item-qty').value) || 0;
    totalPrice += Number(row.querySelector('.item-price').value) || 0;
  });

  document.getElementById('liveTotalQty').innerText = totalQty.toLocaleString();
  document.getElementById('liveTotalPrice').innerText = totalPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function handlePickupSubmit(e) {
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
        document.getElementById('recorder').value = STATE.currentUser ? STATE.currentUser.email.split('@')[0] : '';
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
}

function openEditModal(id) {
  if (STATE.userRole !== 'admin') {
    showToast('error', 'สิทธิ์ไม่เพียงพอ! เฉพาะ Admin เท่านั้น');
    return;
  }
  const targetItem = STATE.rawItems.find(r => r[0] === id);
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

function handleEditSubmit(e) {
  e.preventDefault();
  if (STATE.userRole !== 'admin') {
    showToast('error', 'สิทธิ์ไม่เพียงพอ! เฉพาะ Admin เท่านั้น');
    return;
  }

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
}

function deleteItem(id) {
  if (STATE.userRole !== 'admin') {
    showToast('error', 'สิทธิ์ไม่เพียงพอ! เฉพาะ Admin เท่านั้น');
    return;
  }

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

// ==========================================================================
// 8. UTILITIES & HELPERS
// ==========================================================================
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const isDark = savedTheme === 'dark';
  if (isDark) document.body.classList.add('dark-theme');
  updateThemeIcon(isDark);
}

function toggleTheme() {
  document.body.classList.toggle('dark-theme');
  const isDark = document.body.classList.contains('dark-theme');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);
  if (STATE.dailyGrouped) renderWaveGradientChart(STATE.dailyGrouped);
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
  flatpickr("#recordDate", { locale: "th", dateFormat: "Y-m-d", defaultDate: today, disableMobile: true });
  flatpickr("#filterStartDate", { locale: "th", dateFormat: "Y-m-d", disableMobile: true });
  flatpickr("#filterEndDate", { locale: "th", dateFormat: "Y-m-d", disableMobile: true });
  flatpickr("#editDate", { locale: "th", dateFormat: "Y-m-d", disableMobile: true });
}

function setQuickDate(preset) {
  const today = new Date();
  let startDate = new Date(), endDate = new Date();

  if (preset === '7days') { startDate = new Date(); startDate.setDate(today.getDate() - 6); endDate = today; }
  else if (preset === 'thisMonth') { startDate = new Date(today.getFullYear(), today.getMonth(), 1); endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0); }

  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  document.getElementById('filterStartDate').value = fmt(startDate);
  document.getElementById('filterEndDate').value = fmt(endDate);
  applyCurrentFilters();
}

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
  if (!STATE.dailyGrouped || STATE.dailyGrouped.length === 0) {
    showToast('warning', 'ไม่มีข้อมูลสำหรับส่งออก CSV');
    return;
  }

  let csvContent = "\uFEFFวันที่,ยอดรวมสินค้า (ชิ้น),มูลค่ารวม (บาท),จำนวนทั่วไป,จำนวนแม่ชี\n";
  STATE.dailyGrouped.forEach(group => {
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