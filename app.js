/**
 * 3D Makers Finance — Core Application Logic (Supabase Integration)
 * Authentication, Database CRUD operations, Formula Engine, and Role-Based Permissions.
 */

// ═══════════════════════════════════════════════════════════
// INITIALIZATION & CONFIG
// ═══════════════════════════════════════════════════════════

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null; // { id, email, name, role }
let appData = {
  assumptions: { filament_cost_per_gram: 0.015, printer_cost_per_hour: 0.30 },
  capital: [],
  products: [],
  purchases: [],
  sales: [],
  expenses: [],
  advertising: []
};

let activeTab = 'dashboard';

// Dropdown options
const DROPDOWNS = {
  capitalTypes: ['طابعة ثلاثية الأبعاد', 'موقع إلكتروني / منصة', 'معدات وأدوات', 'ترخيص وتصاريح', 'أخرى'],
  salesChannels: ['موقع إلكتروني', 'يد بيد', 'واتساب', 'أخرى'],
  expenseCategories: ['اشتراكات وخدمات رقمية', 'نقل وتوصيل', 'صيانة وإصلاح', 'مستلزمات مكتبية', 'أخرى']
};

// ═══════════════════════════════════════════════════════════
// AUTHENTICATION & SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════

async function checkSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Session error:', error);
    showLoginScreen();
    return;
  }

  if (session) {
    await loadUserProfile(session.user);
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  document.getElementById('login-container').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
}

function showAppScreen() {
  document.getElementById('login-container').style.display = 'none';
  document.getElementById('app-container').style.display = 'block';
  renderUserBadge();
  switchTab('dashboard');
}

async function loadUserProfile(authUser) {
  const { data: profile, error } = await supabase
    .from('users_profile')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (error) {
    console.error('Error fetching user profile from database:', error);
    // Fallback if public profile record is missing
    currentUser = {
      id: authUser.id,
      email: authUser.email,
      name: authUser.user_metadata?.name || 'شريك جديد',
      role: authUser.user_metadata?.role || 'sales_only'
    };
  } else {
    currentUser = {
      id: authUser.id,
      email: authUser.email,
      name: profile.name,
      role: profile.role
    };
  }

  showAppScreen();
  await loadAllData();
}

function renderUserBadge() {
  const badgeEl = document.getElementById('user-badge');
  if (!badgeEl || !currentUser) return;

  const roleText = currentUser.role === 'admin' ? 'مدير (كامل الصلاحيات)' : 'مبيعات (إضافة فقط)';
  const roleClass = currentUser.role === 'admin' ? 'admin' : 'sales_only';

  badgeEl.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: flex-end;">
      <span class="user-badge-name">${currentUser.name}</span>
      <span class="user-badge-role ${roleClass}">${roleText}</span>
    </div>
    <button class="btn-logout" onclick="logout()" title="تسجيل الخروج">🚪</button>
  `;
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const loginBtn = document.getElementById('login-btn');

  loginBtn.disabled = true;
  loginBtn.innerText = 'جاري التحقق...';

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showToast(error.message === 'Invalid login credentials' ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة' : error.message, 'error');
    loginBtn.disabled = false;
    loginBtn.innerText = 'تسجيل الدخول';
  } else {
    showToast('تم تسجيل الدخول بنجاح', 'success');
  }
}

async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast('حدث خطأ أثناء تسجيل الخروج', 'error');
  } else {
    currentUser = null;
    showLoginScreen();
    showToast('تم تسجيل الخروج', 'success');
  }
}

// ═══════════════════════════════════════════════════════════
// DATABASE CRUD OPERATIONS
// ═══════════════════════════════════════════════════════════

async function loadAllData() {
  try {
    const [
      assumptionsRes,
      capitalRes,
      productsRes,
      purchasesRes,
      salesRes,
      expensesRes,
      advertisingRes
    ] = await Promise.all([
      supabase.from('assumptions').select('*').eq('id', 1).single(),
      supabase.from('capital').select('*').order('date', { ascending: true }),
      supabase.from('products').select('*').order('name', { ascending: true }),
      supabase.from('purchases').select('*').order('date', { ascending: true }),
      supabase.from('sales').select('*').order('date', { ascending: true }),
      supabase.from('expenses').select('*').order('date', { ascending: true }),
      supabase.from('advertising').select('*').order('date', { ascending: true })
    ]);

    appData = {
      assumptions: assumptionsRes.data || { filament_cost_per_gram: 0.015, printer_cost_per_hour: 0.30 },
      capital: capitalRes.data || [],
      products: productsRes.data || [],
      purchases: purchasesRes.data || [],
      sales: salesRes.data || [],
      expenses: expensesRes.data || [],
      advertising: advertisingRes.data || []
    };

    renderTab(activeTab);
  } catch (e) {
    console.error('Error loading database tables:', e);
    showToast('خطأ في تحميل البيانات من قاعدة البيانات', 'error');
  }
}

// Inline update function for Admin
async function updateRecord(table, id, field, value) {
  if (currentUser.role !== 'admin') {
    showToast('عذراً، التعديل المباشر متاح للمشرف فقط', 'error');
    loadAllData(); // reset inputs
    return;
  }

  // Update locally first for responsive calculations
  const list = appData[table];
  const item = list.find(r => r.id === id);
  if (item) {
    item[field] = value;
  }

  const { error } = await supabase
    .from(table)
    .update({ [field]: value })
    .eq('id', id);

  if (error) {
    showToast('فشل في حفظ التعديل: ' + error.message, 'error');
    loadAllData(); // rollback
  } else {
    renderTab(activeTab);
  }
}

// Delete functions
async function deleteRecord(table, id) {
  if (currentUser.role !== 'admin') {
    showToast('حذف السجلات متاح فقط لمدير النظام', 'error');
    return;
  }

  if (confirm('هل أنت متأكد من رغبتك في حذف هذا السجل بشكل نهائي؟')) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      showToast('فشل الحذف: ' + error.message, 'error');
    } else {
      showToast('تم حذف السجل بنجاح', 'success');
      await loadAllData();
    }
  }
}

// Assumption update for Admin
async function updateAssumption(field, value) {
  if (currentUser.role !== 'admin') {
    showToast('صلاحيات تعديل الافتراضات متاحة فقط للمشرف', 'error');
    return;
  }

  appData.assumptions[field] = value;

  const { error } = await supabase
    .from('assumptions')
    .update({ [field]: value })
    .eq('id', 1);

  if (error) {
    showToast('فشل تعديل الافتراضات: ' + error.message, 'error');
    loadAllData();
  } else {
    renderProducts();
    showToast('تم تعديل الافتراضات وحفظها', 'success');
  }
}

// ═══════════════════════════════════════════════════════════
// FORMULA ENGINE
// ═══════════════════════════════════════════════════════════

function calcProductCosts(product) {
  const a = appData.assumptions;
  const filamentCost = (product.filament_weight || 0) * a.filament_cost_per_gram;
  const printerCost = (product.print_time || 0) * a.printer_cost_per_hour;
  const totalCost = filamentCost + printerCost + (product.extra_materials || 0);
  const suggestedPrice = totalCost * (1 + (product.desired_margin || 0));
  const actualProfit = (product.actual_price || 0) - totalCost;
  const actualMargin = product.actual_price ? actualProfit / product.actual_price : 0;

  return { filamentCost, printerCost, totalCost, suggestedPrice, actualProfit, actualMargin };
}

function calcDashboard() {
  const d = appData;

  // Capital
  const totalCapital = d.capital.reduce((s, r) => s + (r.amount || 0), 0);

  // Sales
  const salesRows = d.sales.map(s => ({
    ...s,
    total: (s.quantity || 0) * (s.unit_price || 0)
  }));
  const totalRevenue = salesRows.reduce((s, r) => s + r.total, 0);
  const totalUnitsSold = d.sales.reduce((s, r) => s + (r.quantity || 0), 0);
  const avgSellPrice = totalUnitsSold > 0 ? totalRevenue / totalUnitsSold : 0;

  // Purchases
  const totalPurchases = d.purchases.reduce((s, r) => s + (r.total_price || 0), 0);

  // Expenses
  const totalExpenses = d.expenses.reduce((s, r) => s + (r.amount || 0), 0);

  // Advertising
  const totalAdSpend = d.advertising.reduce((s, r) => s + (r.actual_spend || 0), 0);
  const totalAdRevenue = d.advertising.reduce((s, r) => s + (r.revenue || 0), 0);
  const avgROAS = totalAdSpend > 0 ? totalAdRevenue / totalAdSpend : 0;

  // Costs
  const totalOperatingCosts = totalPurchases + totalExpenses + totalAdSpend;

  // Avg production cost (from product calculator)
  const productsWithCosts = d.products.filter(p => p.filament_weight > 0);
  const avgProductionCost = productsWithCosts.length > 0
    ? productsWithCosts.reduce((s, p) => s + calcProductCosts(p).totalCost, 0) / productsWithCosts.length
    : 0;

  // Profit
  const netProfit = totalRevenue - totalOperatingCosts;
  const profitMargin = totalRevenue > 0 ? netProfit / totalRevenue : 0;

  // Capital recovery
  const remainingCapital = Math.max(totalCapital - netProfit, 0);
  const recoveryPercent = totalCapital > 0 ? Math.min(netProfit / totalCapital, 1) : 0;
  const isRecovered = netProfit >= totalCapital;

  return {
    totalCapital, totalRevenue, totalUnitsSold, avgSellPrice,
    totalPurchases, totalExpenses, totalAdSpend, totalOperatingCosts,
    avgProductionCost, netProfit, profitMargin,
    remainingCapital, recoveryPercent, isRecovered, avgROAS
  };
}

// ═══════════════════════════════════════════════════════════
// FORMATTING HELPERS
// ═══════════════════════════════════════════════════════════

function fmtCurrency(val) {
  if (val === null || val === undefined || isNaN(val)) return '$0.00';
  if (val < 0) return `($${Math.abs(val).toFixed(2)})`;
  return `$${val.toFixed(2)}`;
}

function fmtPercent(val) {
  if (val === null || val === undefined || isNaN(val)) return '0.0%';
  return `${(val * 100).toFixed(1)}%`;
}

function fmtNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return '0';
  return val.toLocaleString('en-US');
}

function fmtDecimal(val) {
  if (val === null || val === undefined || isNaN(val)) return '0.00';
  return val.toFixed(2);
}

// ═══════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════

function switchTab(tabId) {
  activeTab = tabId;

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });

  // Refresh the active tab
  renderTab(tabId);
}

function renderTab(tabId) {
  if (!currentUser) return;
  switch (tabId) {
    case 'dashboard': renderDashboard(); break;
    case 'capital': renderCapital(); break;
    case 'products': renderProducts(); break;
    case 'purchases': renderPurchases(); break;
    case 'sales': renderSales(); break;
    case 'expenses': renderExpenses(); break;
    case 'advertising': renderAdvertising(); break;
  }
}

// ═══════════════════════════════════════════════════════════
// TAB RENDERING FUNCTIONS
// ═══════════════════════════════════════════════════════════

function renderDashboard() {
  const d = calcDashboard();
  const el = document.getElementById('tab-dashboard');

  el.innerHTML = `
    <div class="dashboard-grid">
      <!-- Capital Section -->
      <div class="kpi-section-title">
        <span class="section-icon">💰</span>
        رأس المال / Capital
      </div>
      <div class="kpi-card accent-gold">
        <div class="kpi-label">إجمالي رأس المال المُستثمر</div>
        <div class="kpi-value gold">${fmtCurrency(d.totalCapital)}</div>
      </div>

      <!-- Revenue Section -->
      <div class="kpi-section-title">
        <span class="section-icon">🛒</span>
        الإيرادات والمبيعات / Revenue
      </div>
      <div class="kpi-card accent-emerald">
        <div class="kpi-label">إجمالي الإيرادات</div>
        <div class="kpi-value positive">${fmtCurrency(d.totalRevenue)}</div>
      </div>
      <div class="kpi-card accent-sky">
        <div class="kpi-label">عدد القطع المباعة</div>
        <div class="kpi-value neutral">${fmtNumber(d.totalUnitsSold)}</div>
      </div>
      <div class="kpi-card accent-indigo">
        <div class="kpi-label">متوسط سعر البيع لكل قطعة</div>
        <div class="kpi-value neutral">${fmtCurrency(d.avgSellPrice)}</div>
      </div>

      <!-- Costs Section -->
      <div class="kpi-section-title">
        <span class="section-icon">📦</span>
        التكاليف / Costs
      </div>
      <div class="kpi-card accent-rose">
        <div class="kpi-label">إجمالي مصاريف المواد</div>
        <div class="kpi-value negative">${fmtCurrency(d.totalPurchases)}</div>
      </div>
      <div class="kpi-card accent-rose">
        <div class="kpi-label">إجمالي المصاريف العامة</div>
        <div class="kpi-value negative">${fmtCurrency(d.totalExpenses)}</div>
      </div>
      <div class="kpi-card accent-rose">
        <div class="kpi-label">إجمالي مصاريف الإعلانات</div>
        <div class="kpi-value negative">${fmtCurrency(d.totalAdSpend)}</div>
      </div>
      <div class="kpi-card accent-rose">
        <div class="kpi-label">إجمالي التكاليف التشغيلية</div>
        <div class="kpi-value negative">${fmtCurrency(d.totalOperatingCosts)}</div>
      </div>
      <div class="kpi-card accent-indigo">
        <div class="kpi-label">متوسط تكلفة الإنتاج لكل قطعة</div>
        <div class="kpi-value neutral">${fmtCurrency(d.avgProductionCost)}</div>
      </div>

      <!-- Profit Section -->
      <div class="kpi-section-title">
        <span class="section-icon">📈</span>
        الربح / Profit
      </div>
      <div class="kpi-card accent-emerald">
        <div class="kpi-label">صافي الربح الإجمالي</div>
        <div class="kpi-value ${d.netProfit >= 0 ? 'positive' : 'negative'}">${fmtCurrency(d.netProfit)}</div>
      </div>
      <div class="kpi-card accent-indigo">
        <div class="kpi-label">نسبة هامش الربح الإجمالي</div>
        <div class="kpi-value ${d.profitMargin >= 0 ? 'positive' : 'negative'}">${fmtPercent(d.profitMargin)}</div>
      </div>
    </div>

    <!-- Capital Recovery Widget -->
    <div class="recovery-widget">
      <div class="kpi-section-title" style="padding:0 0 8px 0">
        <span class="section-icon">🖨️</span>
        استرداد رأس المال / Capital Recovery
      </div>
      <div class="recovery-progress-bar">
        <div class="recovery-progress-fill" style="width: ${Math.min(d.recoveryPercent * 100, 100)}%"></div>
      </div>
      <div class="recovery-labels">
        <span>${fmtCurrency(Math.min(d.netProfit > 0 ? d.netProfit : 0, d.totalCapital))} مسترد</span>
        <span>${fmtCurrency(d.totalCapital)} إجمالي</span>
      </div>
      <div style="margin-top: 16px; display: flex; gap: 24px; flex-wrap: wrap;">
        <div>
          <div class="kpi-label">المبلغ المتبقي</div>
          <div class="kpi-value ${d.remainingCapital > 0 ? 'negative' : 'positive'}" style="font-size:1.2rem">${fmtCurrency(d.remainingCapital)}</div>
        </div>
        <div>
          <div class="kpi-label">نسبة الاسترداد</div>
          <div class="kpi-value neutral" style="font-size:1.2rem">${fmtPercent(d.recoveryPercent)}</div>
        </div>
        <div>
          <div class="kpi-label">هل تم الاسترداد؟</div>
          <span class="kpi-badge ${d.isRecovered ? 'success' : 'warning'}">
            ${d.isRecovered ? '✅ نعم — تم الاسترداد' : '❌ لا — لم يتم بعد'}
          </span>
        </div>
      </div>
    </div>
  `;
}

function renderCapital() {
  const el = document.getElementById('tab-capital');
  const total = appData.capital.reduce((s, r) => s + (r.amount || 0), 0);

  const isAdmin = currentUser.role === 'admin';
  const readOnlyAttr = isAdmin ? '' : 'readonly';
  const disabledSelect = isAdmin ? '' : 'disabled';
  const hideClass = isAdmin ? '' : 'hidden-role-restricted';

  let rows = '';
  appData.capital.forEach((row, i) => {
    rows += `
      <tr>
        <td><input type="date" value="${row.date || ''}" ${readOnlyAttr} onchange="updateRecord('capital', ${row.id}, 'date', this.value)"></td>
        <td>
          <select ${disabledSelect} onchange="updateRecord('capital', ${row.id}, 'type', this.value)">
            <option value="">— اختر —</option>
            ${DROPDOWNS.capitalTypes.map(t => `<option value="${t}" ${row.type === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </td>
        <td><input type="text" class="text-input" value="${row.description || ''}" ${readOnlyAttr} onchange="updateRecord('capital', ${row.id}, 'description', this.value)"></td>
        <td><input type="number" step="0.01" value="${row.amount || ''}" ${readOnlyAttr} onchange="updateRecord('capital', ${row.id}, 'amount', parseFloat(this.value) || 0)"></td>
        <td><input type="text" class="text-input" value="${row.notes || ''}" ${readOnlyAttr} onchange="updateRecord('capital', ${row.id}, 'notes', this.value)"></td>
        <td class="row-actions ${hideClass}">
          <button class="btn-icon" onclick="deleteRecord('capital', ${row.id})" title="حذف">🗑️</button>
        </td>
      </tr>
    `;
  });

  el.innerHTML = `
    <div class="sheet-header">
      <div class="sheet-title"><span class="title-icon">💰</span> رأس المال — Capital</div>
      <div class="sheet-actions ${hideClass}">
        <button class="btn btn-primary" onclick="openAddModal()">+ إضافة استثمار</button>
      </div>
    </div>
    <div class="table-container">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>نوع الاستثمار</th>
              <th>الوصف</th>
              <th>المبلغ ($)</th>
              <th>ملاحظات</th>
              <th class="${hideClass}"></th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="${isAdmin ? 6 : 5}"><div class="empty-state"><div class="empty-icon">📋</div><p>لا توجد بيانات</p></div></td></tr>`}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right; font-weight:700;">إجمالي رأس المال المستثمر</td>
              <td class="calc-cell" style="font-weight:700;">${fmtCurrency(total)}</td>
              <td colspan="${isAdmin ? 2 : 1}"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function renderProducts() {
  const el = document.getElementById('tab-products');
  const a = appData.assumptions;

  const isAdmin = currentUser.role === 'admin';
  const readOnlyAttr = isAdmin ? '' : 'readonly';
  const hideClass = isAdmin ? '' : 'hidden-role-restricted';

  let rows = '';
  appData.products.forEach((p, i) => {
    const c = calcProductCosts(p);
    rows += `
      <tr>
        <td><input type="text" class="text-input" value="${p.name || ''}" ${readOnlyAttr} onchange="updateRecord('products', ${p.id}, 'name', this.value)"></td>
        <td><input type="number" step="1" value="${p.filament_weight || ''}" ${readOnlyAttr} onchange="updateRecord('products', ${p.id}, 'filament_weight', parseFloat(this.value) || 0)"></td>
        <td class="calc-cell">${fmtCurrency(c.filamentCost)}</td>
        <td><input type="number" step="0.5" value="${p.print_time || ''}" ${readOnlyAttr} onchange="updateRecord('products', ${p.id}, 'print_time', parseFloat(this.value) || 0)"></td>
        <td class="calc-cell">${fmtCurrency(c.printerCost)}</td>
        <td><input type="number" step="0.01" value="${p.extra_materials || ''}" ${readOnlyAttr} onchange="updateRecord('products', ${p.id}, 'extra_materials', parseFloat(this.value) || 0)"></td>
        <td class="calc-cell" style="font-weight:700;">${fmtCurrency(c.totalCost)}</td>
        <td><input type="number" step="0.05" value="${p.desired_margin || ''}" ${readOnlyAttr} onchange="updateRecord('products', ${p.id}, 'desired_margin', parseFloat(this.value) || 0)" style="width:80px"></td>
        <td class="calc-cell">${fmtCurrency(c.suggestedPrice)}</td>
        <td><input type="number" step="0.01" value="${p.actual_price || ''}" ${readOnlyAttr} onchange="updateRecord('products', ${p.id}, 'actual_price', parseFloat(this.value) || 0)"></td>
        <td class="calc-cell ${c.actualProfit >= 0 ? 'positive' : 'negative'}">${fmtCurrency(c.actualProfit)}</td>
        <td class="calc-cell ${c.actualMargin >= 0 ? 'positive' : 'negative'}">${fmtPercent(c.actualMargin)}</td>
        <td class="row-actions ${hideClass}">
          <button class="btn-icon" onclick="deleteRecord('products', ${p.id})" title="حذف">🗑️</button>
        </td>
      </tr>
    `;
  });

  el.innerHTML = `
    <div class="sheet-header">
      <div class="sheet-title"><span class="title-icon">🧮</span> حاسبة التكلفة والسعر — Product Calculator</div>
      <div class="sheet-actions ${hideClass}">
        <button class="btn btn-primary" onclick="openAddModal()">+ إضافة منتج</button>
      </div>
    </div>

    <div class="assumptions-box">
      <span class="assumptions-tag">🟨 افتراضات تكاليف الطابعة</span>
      <div class="assumption-group">
        <div class="assumption-label">سعر الفيلمنت لكل غرام ($)</div>
        <input type="number" step="0.001" value="${a.filament_cost_per_gram}" ${readOnlyAttr} onchange="updateAssumption('filament_cost_per_gram', parseFloat(this.value) || 0)">
      </div>
      <div class="assumption-group">
        <div class="assumption-label">تكلفة تشغيل الطابعة للساعة ($)</div>
        <input type="number" step="0.01" value="${a.printer_cost_per_hour}" ${readOnlyAttr} onchange="updateAssumption('printer_cost_per_hour', parseFloat(this.value) || 0)">
      </div>
    </div>

    <div class="table-container">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>اسم المنتج</th>
              <th>وزن الفيلمنت (غرام)</th>
              <th>تكلفة الفيلمنت ($)</th>
              <th>وقت الطباعة (ساعة)</th>
              <th>تكلفة التشغيل ($)</th>
              <th>مواد إضافية ($)</th>
              <th>إجمالي التكلفة ($)</th>
              <th>هامش الربح %</th>
              <th>سعر مقترح ($)</th>
              <th>سعر فعلي ($)</th>
              <th>الربح ($)</th>
              <th>الهامش %</th>
              <th class="${hideClass}"></th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="${isAdmin ? 13 : 12}"><div class="empty-state"><div class="empty-icon">📦</div><p>لا توجد منتجات</p></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderPurchases() {
  const el = document.getElementById('tab-purchases');
  const total = appData.purchases.reduce((s, r) => s + (r.total_price || 0), 0);

  const isAdmin = currentUser.role === 'admin';
  const readOnlyAttr = isAdmin ? '' : 'readonly';
  const hideClass = isAdmin ? '' : 'hidden-role-restricted';

  let rows = '';
  appData.purchases.forEach((row, i) => {
    const unitPrice = row.quantity > 0 ? row.total_price / row.quantity : 0;
    rows += `
      <tr>
        <td><input type="date" value="${row.date || ''}" ${readOnlyAttr} onchange="updateRecord('purchases', ${row.id}, 'date', this.value)"></td>
        <td><input type="text" class="text-input" value="${row.material || ''}" ${readOnlyAttr} onchange="updateRecord('purchases', ${row.id}, 'material', this.value)"></td>
        <td><input type="number" step="1" value="${row.quantity || ''}" ${readOnlyAttr} onchange="updateRecord('purchases', ${row.id}, 'quantity', parseFloat(this.value) || 0)"></td>
        <td><input type="number" step="0.01" value="${row.total_price || ''}" ${readOnlyAttr} onchange="updateRecord('purchases', ${row.id}, 'total_price', parseFloat(this.value) || 0)"></td>
        <td class="calc-cell">$${unitPrice.toFixed(3)}</td>
        <td><input type="text" class="text-input" value="${row.supplier || ''}" ${readOnlyAttr} onchange="updateRecord('purchases', ${row.id}, 'supplier', this.value)"></td>
        <td><input type="text" class="text-input" value="${row.notes || ''}" ${readOnlyAttr} onchange="updateRecord('purchases', ${row.id}, 'notes', this.value)"></td>
        <td class="row-actions ${hideClass}">
          <button class="btn-icon" onclick="deleteRecord('purchases', ${row.id})" title="حذف">🗑️</button>
        </td>
      </tr>
    `;
  });

  el.innerHTML = `
    <div class="sheet-header">
      <div class="sheet-title"><span class="title-icon">🛍️</span> سجل المشتريات — Purchases</div>
      <div class="sheet-actions ${hideClass}">
        <button class="btn btn-primary" onclick="openAddModal()">+ إضافة مشتريات</button>
      </div>
    </div>
    <div class="table-container">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>نوع المادة</th>
              <th>الكمية</th>
              <th>السعر الإجمالي ($)</th>
              <th>سعر الوحدة ($)</th>
              <th>المورّد</th>
              <th>ملاحظات</th>
              <th class="${hideClass}"></th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="${isAdmin ? 8 : 7}"><div class="empty-state"><div class="empty-icon">🛍️</div><p>لا توجد مشتريات</p></div></td></tr>`}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right; font-weight:700;">إجمالي مصاريف المواد</td>
              <td class="calc-cell" style="font-weight:700;">${fmtCurrency(total)}</td>
              <td colspan="${isAdmin ? 4 : 3}"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function renderSales() {
  const el = document.getElementById('tab-sales');
  const salesData = appData.sales.map(s => ({ ...s, total: (s.quantity || 0) * (s.unit_price || 0) }));
  const totalRevenue = salesData.reduce((s, r) => s + r.total, 0);
  const totalUnits = appData.sales.reduce((s, r) => s + (r.quantity || 0), 0);

  const isAdmin = currentUser.role === 'admin';
  const readOnlyAttr = isAdmin ? '' : 'readonly';
  const disabledSelect = isAdmin ? '' : 'disabled';
  const hideClass = isAdmin ? '' : 'hidden-role-restricted';

  let rows = '';
  appData.sales.forEach((row, i) => {
    const total = (row.quantity || 0) * (row.unit_price || 0);
    rows += `
      <tr>
        <td><input type="date" value="${row.date || ''}" ${readOnlyAttr} onchange="updateRecord('sales', ${row.id}, 'date', this.value)"></td>
        <td><input type="text" class="text-input" value="${row.product || ''}" ${readOnlyAttr} onchange="updateRecord('sales', ${row.id}, 'product', this.value)"></td>
        <td><input type="number" step="1" value="${row.quantity || ''}" ${readOnlyAttr} onchange="updateRecord('sales', ${row.id}, 'quantity', parseFloat(this.value) || 0)"></td>
        <td><input type="number" step="0.01" value="${row.unit_price || ''}" ${readOnlyAttr} onchange="updateRecord('sales', ${row.id}, 'unit_price', parseFloat(this.value) || 0)"></td>
        <td class="calc-cell" style="font-weight:600;">${fmtCurrency(total)}</td>
        <td>
          <select ${disabledSelect} onchange="updateRecord('sales', ${row.id}, 'channel', this.value)">
            <option value="">— اختر —</option>
            ${DROPDOWNS.salesChannels.map(c => `<option value="${c}" ${row.channel === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </td>
        <td><input type="text" class="text-input" value="${row.notes || ''}" ${readOnlyAttr} onchange="updateRecord('sales', ${row.id}, 'notes', this.value)"></td>
        <td class="row-actions ${hideClass}">
          <button class="btn-icon" onclick="deleteRecord('sales', ${row.id})" title="حذف">🗑️</button>
        </td>
      </tr>
    `;
  });

  el.innerHTML = `
    <div class="sheet-header">
      <div class="sheet-title"><span class="title-icon">💵</span> سجل المبيعات — Sales</div>
      <div class="sheet-actions">
        <!-- Nabil is sales_only, but he is allowed to add sales -->
        <button class="btn btn-primary" onclick="openAddModal()">+ إضافة بيع</button>
      </div>
    </div>
    <div class="table-container">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>اسم المنتج</th>
              <th>الكمية</th>
              <th>سعر الوحدة ($)</th>
              <th>الإجمالي ($)</th>
              <th>قناة البيع</th>
              <th>ملاحظات</th>
              <th class="${hideClass}"></th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="${isAdmin ? 8 : 7}"><div class="empty-state"><div class="empty-icon">💵</div><p>لا توجد مبيعات مسجلة</p></div></td></tr>`}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="text-align:right; font-weight:700;">إجمالي الإيرادات</td>
              <td class="calc-cell" style="font-weight:700;">${fmtNumber(totalUnits)}</td>
              <td></td>
              <td class="calc-cell" style="font-weight:700;">${fmtCurrency(totalRevenue)}</td>
              <td colspan="${isAdmin ? 3 : 2}"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function renderExpenses() {
  const el = document.getElementById('tab-expenses');
  const total = appData.expenses.reduce((s, r) => s + (r.amount || 0), 0);

  const isAdmin = currentUser.role === 'admin';
  const readOnlyAttr = isAdmin ? '' : 'readonly';
  const disabledSelect = isAdmin ? '' : 'disabled';
  const hideClass = isAdmin ? '' : 'hidden-role-restricted';

  let rows = '';
  appData.expenses.forEach((row, i) => {
    rows += `
      <tr>
        <td><input type="date" value="${row.date || ''}" ${readOnlyAttr} onchange="updateRecord('expenses', ${row.id}, 'date', this.value)"></td>
        <td>
          <select ${disabledSelect} onchange="updateRecord('expenses', ${row.id}, 'category', this.value)">
            <option value="">— اختر —</option>
            ${DROPDOWNS.expenseCategories.map(c => `<option value="${c}" ${row.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </td>
        <td><input type="text" class="text-input" value="${row.description || ''}" ${readOnlyAttr} onchange="updateRecord('expenses', ${row.id}, 'description', this.value)"></td>
        <td><input type="number" step="0.01" value="${row.amount || ''}" ${readOnlyAttr} onchange="updateRecord('expenses', ${row.id}, 'amount', parseFloat(this.value) || 0)"></td>
        <td><input type="text" class="text-input" value="${row.notes || ''}" ${readOnlyAttr} onchange="updateRecord('expenses', ${row.id}, 'notes', this.value)"></td>
        <td class="row-actions ${hideClass}">
          <button class="btn-icon" onclick="deleteRecord('expenses', ${row.id})" title="حذف">🗑️</button>
        </td>
      </tr>
    `;
  });

  el.innerHTML = `
    <div class="sheet-header">
      <div class="sheet-title"><span class="title-icon">📋</span> المصاريف العامة — Expenses</div>
      <div class="sheet-actions ${hideClass}">
        <button class="btn btn-primary" onclick="openAddModal()">+ إضافة مصروف</button>
      </div>
    </div>
    <div class="table-container">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>الفئة</th>
              <th>الوصف</th>
              <th>المبلغ ($)</th>
              <th>ملاحظات</th>
              <th class="${hideClass}"></th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="${isAdmin ? 6 : 5}"><div class="empty-state"><div class="empty-icon">📋</div><p>لا توجد مصاريف</p></div></td></tr>`}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right; font-weight:700;">إجمالي المصاريف</td>
              <td class="calc-cell" style="font-weight:700;">${fmtCurrency(total)}</td>
              <td colspan="${isAdmin ? 2 : 1}"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function renderAdvertising() {
  const el = document.getElementById('tab-advertising');
  const totalSpend = appData.advertising.reduce((s, r) => s + (r.actual_spend || 0), 0);
  const totalRev = appData.advertising.reduce((s, r) => s + (r.revenue || 0), 0);
  const avgROAS = totalSpend > 0 ? totalRev / totalSpend : 0;

  const isAdmin = currentUser.role === 'admin';
  const readOnlyAttr = isAdmin ? '' : 'readonly';
  const hideClass = isAdmin ? '' : 'hidden-role-restricted';

  let rows = '';
  appData.advertising.forEach((row, i) => {
    const roas = row.actual_spend > 0 ? row.revenue / row.actual_spend : 0;
    rows += `
      <tr>
        <td><input type="date" value="${row.date || ''}" ${readOnlyAttr} onchange="updateRecord('advertising', ${row.id}, 'date', this.value)"></td>
        <td><input type="text" class="text-input" value="${row.platform || ''}" ${readOnlyAttr} onchange="updateRecord('advertising', ${row.id}, 'platform', this.value)"></td>
        <td><input type="text" class="text-input" value="${row.campaign_type || ''}" ${readOnlyAttr} onchange="updateRecord('advertising', ${row.id}, 'campaign_type', this.value)"></td>
        <td><input type="number" step="0.01" value="${row.budget || ''}" ${readOnlyAttr} onchange="updateRecord('advertising', ${row.id}, 'budget', parseFloat(this.value) || 0)"></td>
        <td><input type="number" step="0.01" value="${row.actual_spend || ''}" ${readOnlyAttr} onchange="updateRecord('advertising', ${row.id}, 'actual_spend', parseFloat(this.value) || 0)"></td>
        <td><input type="number" step="1" value="${row.sales_count || ''}" ${readOnlyAttr} onchange="updateRecord('advertising', ${row.id}, 'sales_count', parseInt(this.value) || 0)"></td>
        <td><input type="number" step="0.01" value="${row.revenue || ''}" ${readOnlyAttr} onchange="updateRecord('advertising', ${row.id}, 'revenue', parseFloat(this.value) || 0)"></td>
        <td class="calc-cell ${roas >= 1 ? 'positive' : 'negative'}">${fmtDecimal(roas)}x</td>
        <td><input type="text" class="text-input" value="${row.notes || ''}" ${readOnlyAttr} onchange="updateRecord('advertising', ${row.id}, 'notes', this.value)"></td>
        <td class="row-actions ${hideClass}">
          <button class="btn-icon" onclick="deleteRecord('advertising', ${row.id})" title="حذف">🗑️</button>
        </td>
      </tr>
    `;
  });

  el.innerHTML = `
    <div class="sheet-header">
      <div class="sheet-title"><span class="title-icon">📣</span> الإعلانات — Advertising</div>
      <div class="sheet-actions ${hideClass}">
        <button class="btn btn-primary" onclick="openAddModal()">+ إضافة حملة</button>
      </div>
    </div>
    <div class="table-container">
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>المنصة</th>
              <th>نوع الحملة</th>
              <th>الميزانية ($)</th>
              <th>المبلغ الفعلي ($)</th>
              <th>عدد المبيعات</th>
              <th>الإيراد ($)</th>
              <th>ROAS</th>
              <th>ملاحظات</th>
              <th class="${hideClass}"></th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="${isAdmin ? 10 : 9}"><div class="empty-state"><div class="empty-icon">📣</div><p>لا توجد حملات إعلانية</p></div></td></tr>`}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align:right; font-weight:700;">إجمالي مصاريف الإعلانات</td>
              <td class="calc-cell" style="font-weight:700;">${fmtCurrency(totalSpend)}</td>
              <td></td>
              <td class="calc-cell" style="font-weight:700;">${fmtCurrency(totalRev)}</td>
              <td class="calc-cell" style="font-weight:700;">${fmtDecimal(avgROAS)}x</td>
              <td colspan="${isAdmin ? 2 : 1}"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════
// ADD RECORD MODAL ENGINE
// ═══════════════════════════════════════════════════════════

function openAddModal() {
  const modal = document.getElementById('add-modal');
  const title = document.getElementById('modal-title');
  const fieldsContainer = document.getElementById('modal-form-fields');

  let fieldsHtml = '';

  switch (activeTab) {
    case 'capital':
      title.innerText = 'إضافة استثمار جديد / New Investment';
      fieldsHtml = `
        <div class="form-group">
          <label class="form-label">التاريخ</label>
          <input type="date" class="form-input" id="m-date" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label class="form-label">نوع الاستثمار</label>
          <select class="form-select" id="m-type" required>
            <option value="">— اختر —</option>
            ${DROPDOWNS.capitalTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">الوصف</label>
          <input type="text" class="form-input" id="m-description" required placeholder="Creality Ender 3 V3...">
        </div>
        <div class="form-group">
          <label class="form-label">المبلغ ($)</label>
          <input type="number" step="0.01" class="form-input" id="m-amount" required placeholder="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">ملاحظات</label>
          <input type="text" class="form-input" id="m-notes">
        </div>
      `;
      break;
    case 'products':
      title.innerText = 'إضافة منتج جديد / New Product';
      fieldsHtml = `
        <div class="form-group">
          <label class="form-label">اسم المنتج</label>
          <input type="text" class="form-input" id="m-name" required placeholder="Keychain...">
        </div>
        <div class="form-group">
          <label class="form-label">وزن الفيلمنت (غرام)</label>
          <input type="number" step="1" class="form-input" id="m-filament_weight" required placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label">وقت الطباعة (ساعة)</label>
          <input type="number" step="0.1" class="form-input" id="m-print_time" required placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label">مواد إضافية ($)</label>
          <input type="number" step="0.01" class="form-input" id="m-extra_materials" required placeholder="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">هامش الربح المطلوب</label>
          <input type="number" step="0.05" class="form-input" id="m-desired_margin" required value="0.50">
        </div>
        <div class="form-group">
          <label class="form-label">سعر البيع الفعلي ($)</label>
          <input type="number" step="0.01" class="form-input" id="m-actual_price" required placeholder="0.00">
        </div>
      `;
      break;
    case 'purchases':
      title.innerText = 'إضافة مشتريات جديدة / New Purchase';
      fieldsHtml = `
        <div class="form-group">
          <label class="form-label">التاريخ</label>
          <input type="date" class="form-input" id="m-date" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label class="form-label">المادة المشتراة</label>
          <input type="text" class="form-input" id="m-material" required placeholder="فيلمنت أسود...">
        </div>
        <div class="form-group">
          <label class="form-label">الكمية (غرام/قطع)</label>
          <input type="number" step="1" class="form-input" id="m-quantity" required placeholder="1000">
        </div>
        <div class="form-group">
          <label class="form-label">السعر الإجمالي ($)</label>
          <input type="number" step="0.01" class="form-input" id="m-total_price" required placeholder="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">المورد</label>
          <input type="text" class="form-input" id="m-supplier" placeholder="Amazon...">
        </div>
        <div class="form-group">
          <label class="form-label">ملاحظات</label>
          <input type="text" class="form-input" id="m-notes">
        </div>
      `;
      break;
    case 'sales':
      title.innerText = 'تسجيل مبيعات جديدة / Record Sale';
      fieldsHtml = `
        <div class="form-group">
          <label class="form-label">التاريخ</label>
          <input type="date" class="form-input" id="m-date" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label class="form-label">اسم المنتج</label>
          <input type="text" class="form-input" id="m-product" required placeholder="مجسم...">
        </div>
        <div class="form-group">
          <label class="form-label">الكمية</label>
          <input type="number" step="1" class="form-input" id="m-quantity" required value="1">
        </div>
        <div class="form-group">
          <label class="form-label">سعر الوحدة ($)</label>
          <input type="number" step="0.01" class="form-input" id="m-unit_price" required placeholder="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">قناة البيع</label>
          <select class="form-select" id="m-channel" required>
            <option value="">— اختر —</option>
            ${DROPDOWNS.salesChannels.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">ملاحظات</label>
          <input type="text" class="form-input" id="m-notes">
        </div>
      `;
      break;
    case 'expenses':
      title.innerText = 'إضافة مصروف جديد / New Expense';
      fieldsHtml = `
        <div class="form-group">
          <label class="form-label">التاريخ</label>
          <input type="date" class="form-input" id="m-date" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label class="form-label">الفئة</label>
          <select class="form-select" id="m-category" required>
            <option value="">— اختر —</option>
            ${DROPDOWNS.expenseCategories.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">الوصف</label>
          <input type="text" class="form-input" id="m-description" required placeholder="صيانة...">
        </div>
        <div class="form-group">
          <label class="form-label">المبلغ ($)</label>
          <input type="number" step="0.01" class="form-input" id="m-amount" required placeholder="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">ملاحظات</label>
          <input type="text" class="form-input" id="m-notes">
        </div>
      `;
      break;
    case 'advertising':
      title.innerText = 'إضافة إعلان جديد / New Campaign';
      fieldsHtml = `
        <div class="form-group">
          <label class="form-label">التاريخ</label>
          <input type="date" class="form-input" id="m-date" required value="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label class="form-label">المنصة</label>
          <input type="text" class="form-input" id="m-platform" required placeholder="Instagram...">
        </div>
        <div class="form-group">
          <label class="form-label">نوع الحملة</label>
          <input type="text" class="form-input" id="m-campaign_type" required placeholder="Boost Post...">
        </div>
        <div class="form-group">
          <label class="form-label">الميزانية ($)</label>
          <input type="number" step="0.01" class="form-input" id="m-budget" required placeholder="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">المبلغ الفعلي ($)</label>
          <input type="number" step="0.01" class="form-input" id="m-actual_spend" required placeholder="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">عدد المبيعات</label>
          <input type="number" step="1" class="form-input" id="m-sales_count" required value="0">
        </div>
        <div class="form-group">
          <label class="form-label">الإيرادات ($)</label>
          <input type="number" step="0.01" class="form-input" id="m-revenue" required value="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">ملاحظات</label>
          <input type="text" class="form-input" id="m-notes">
        </div>
      `;
      break;
  }

  fieldsContainer.innerHTML = fieldsHtml;
  modal.classList.add('active');
}

function closeModal() {
  document.getElementById('add-modal').classList.remove('active');
}

async function handleModalSubmit(e) {
  e.preventDefault();

  const saveBtn = e.target.querySelector('button[type="submit"]');
  const originalText = saveBtn.innerText;
  saveBtn.disabled = true;
  saveBtn.innerText = 'جاري الحفظ...';

  // Extract fields
  const data = {};
  const inputs = document.querySelectorAll('#modal-form-fields input, #modal-form-fields select');
  inputs.forEach(input => {
    const field = input.id.replace('m-', ''); // Strip prefix
    let val = input.value;
    if (input.type === 'number') {
      val = parseFloat(val) || 0;
    }
    data[field] = val;
  });

  // Assign user UUID for sales tracking
  if (activeTab === 'sales') {
    data.created_by = currentUser.id;
  }

  const { error } = await supabase
    .from(activeTab)
    .insert([data]);

  if (error) {
    showToast('فشل حفظ البيانات: ' + error.message, 'error');
    saveBtn.disabled = false;
    saveBtn.innerText = originalText;
  } else {
    showToast('تمت إضافة السجل بنجاح', 'success');
    closeModal();
    await loadAllData();
  }
}

// ═══════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ═══════════════════════════════════════════════════════════
// LIFE CYCLE & LISTENERS
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // 1. Session & Auth Check
  checkSession();

  // 2. Auth State Change Listener
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await loadUserProfile(session.user);
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      showLoginScreen();
    }
  });

  // 3. Form Handlers
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  const modalForm = document.getElementById('modal-form');
  if (modalForm) {
    modalForm.addEventListener('submit', handleModalSubmit);
  }

  // 4. Tab Navigation Click Handlers
  document.querySelectorAll('.tab-nav .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
});
