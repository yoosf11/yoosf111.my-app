// 1. إعدادات قاعدة البيانات السحابية المجانية (Supabase)
const SUPABASE_URL = 'https://ahgokztpqzzknphuyyys.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z3OH28tFzHhPyyP6xaUICA_yZk9gopk';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentLang = 'ar';

// 2. تسجيل الـ Service Worker لتثبيت التطبيق على الأجهزة تلقائياً
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Error:', err));
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('installBtn');
    installBtn.classList.remove('hidden');
    installBtn.addEventListener('click', () => {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            installBtn.classList.add('hidden');
            deferredPrompt = null;
        });
    });
});

// 3. تشفير عالي الأمان لكلمات المرور (SHA-256 + Salt)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + "_SECURE_HARRAZ_2026_SALT");
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 5. تسجيل الدخول
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = currentLang === 'ar' ? "جاري التحقق..." : "Verifying...";
 const { data, error } = await db.rpc('login_user', {
    p_username: username,
    p_password: password
});
const user = data && data.length ? data[0] : null;
currentPassword = password;

    if (error || !user) {
        errorEl.textContent = currentLang === 'ar' ? "خطأ في اسم المستخدم أو كلمة المرور!" : "Invalid credentials!";
        return;
    }

    currentUser = user;
    errorEl.textContent = "";
    document.getElementById('loginSection').classList.add('hidden');

   if (user.role === 'super_admin' || user.role === 'admin' || (user.permissions && user.permissions.length > 0)) {
        openAdminDashboard();
    } else {
        openStudentDashboard();
    }
});

// 6. واجهة الطالب وتسجيل الحضور
function openStudentDashboard() {
    document.getElementById('studentSection').classList.remove('hidden');
    document.getElementById('studentWelcome').textContent = `مرحباً: ${currentUser.full_name}`;
}

async function markAttendance() {
    const enteredName = document.getElementById('confirmFullName').value.trim();
    const statusEl = document.getElementById('attendanceStatus');

    // التحقق من مطابقة الاسم الثلاثي
    if (enteredName !== currentUser.full_name) {
        statusEl.style.color = "red";
        statusEl.textContent = "خطأ! الاسم الثلاثي غير مطابق لبياناتك المسجلة. تم إرسال تنبيه للإدارة.";
        await sendAlert(`⚠️ محاولة تغيير اسم: الحساب (${currentUser.username}) حاول التسجيل باسم (${enteredName})`);
        return;
    }

    // طلب الوصول للموقع الجغرافي (Location)
    statusEl.style.color = "#C59B27";
    statusEl.textContent = "جاري طلب الوصول للموقع الجغرافي (Location)...";

    if (!navigator.geolocation) {
        statusEl.textContent = "المتصفح لا يدعم تحديد الموقع.";
        return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const locationCoords = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        const now = new Date();
        const todayDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0];
        const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const dayName = days[now.getDay()];

        // منع التكرار في نفس اليوم
        const { data: existing } = await db
            .from('attendance')
            .select('id')
            .eq('student_username', currentUser.username)
            .eq('attend_date', todayDate)
            .single();

        if (existing) {
            statusEl.style.color = "red";
            statusEl.textContent = "تحذير! لقد سجلت حضورك اليوم مسبقاً. تم إرسال تحذير تلقائي للدكتور والمشرف.";
            await sendAlert(`🚫 تكرار حضور: الطالب (${currentUser.full_name}) حاول التسجيل أكثر من مرة اليوم (${todayDate}).`);
            return;
        }

        // حفظ الحضور
        const { error } = await db.from('attendance').insert([{
            student_username: currentUser.username,
            student_name: currentUser.full_name,
            attend_date: todayDate,
            attend_time: currentTime,
            day_name: dayName,
            location: locationCoords
        }]);

        if (!error) {
            statusEl.style.color = "green";
            statusEl.textContent = `✅ تم تسجيل حضورك بنجاح في مادة تفكير ابتكاري يوم ${dayName} الساعة ${currentTime}`;
        } else {
            statusEl.style.color = "red";
            statusEl.textContent = "حدث خطأ أثناء التسجيل.";
        }
    }, () => {
        statusEl.style.color = "red";
        statusEl.textContent = "❌ يجب السماح بالوصول للموقع (Location) لتسجيل الحضور!";
    });
}

async function sendAlert(msg) {
    await db.from('alerts').insert([{ message: msg }]);
}

// 7. لوحة تحكم الإدارة والمشرفين
function hasPerm(perm) {
    return currentUser.role === 'super_admin' || (currentUser.permissions && currentUser.permissions.includes(perm));
}

async function openAdminDashboard() {
    document.getElementById('adminSection').classList.remove('hidden');
    document.getElementById('adminWelcome').textContent = `أهلاً: ${currentUser.full_name}`;
    
    const isSuper = currentUser.role === 'super_admin';
    document.getElementById('roleBadge').textContent = isSuper ? "مدير النظام (صلاحيات كاملة)" : "مشرف بصلاحيات محددة";

    // إخفاء قسم التنبيهات وصلاحيات التعيين عن المشرفين الفرعيين (فقط للدكتور ويوسف)
    if (!isSuper) {
        document.getElementById('alertsContainer').classList.add('hidden');
        document.getElementById('permissionsSection').classList.add('hidden');
    } else {
        loadAlerts();
    }

    if (!hasPerm('export_excel')) document.getElementById('exportExcelBtn').classList.add('hidden');
    if (!hasPerm('add_user')) document.getElementById('addUserForm').classList.add('hidden');

    loadAttendance();
    loadUsers();
}

async function loadAlerts() {
const { data } = await db.rpc('admin_list_users', { p_admin: currentUser.username, p_pass: currentPassword });   
 const list = document.getElementById('alertsList');
    list.innerHTML = "";
    if (data) {
        data.forEach(alert => {
            const li = document.createElement('li');
            li.className = "alert-item";
            li.innerHTML = `${alert.message} <small>${new Date(alert.created_at).toLocaleString('ar-EG')}</small>`;
            list.appendChild(li);
        });
    }
}

async function loadAttendance() {
    // يدعم أكثر من 2000 طالب
    const { data } = await db.from('attendance').select('*').order('attend_date', { ascending: false }).limit(3000);
    const tbody = document.getElementById('attendanceBody');
    tbody.innerHTML = "";
    if (data) {
        data.forEach(row => {
            tbody.innerHTML += `
                <tr>
                    <td>${row.student_name}</td>
                    <td>${row.day_name}</td>
                    <td>${row.attend_date}</td>
                    <td>${row.attend_time}</td>
                    <td><a href="https://maps.google.com/?q=${row.location}" target="_blank">عرض الموقع</a></td>
                </tr>
            `;
        });
    }
}

async function loadUsers() {
    // لا يتم عرض المديرين الأساسيين في القائمة لحمايتهم من الحذف أو التعديل
    const { data } = await db.rpc('admin_list_users', { p_admin: currentUser.username, p_pass: currentPassword });
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = "";
    if (data) {
        data.forEach(u => {
            let actionsHtml = "";
            if (hasPerm('warn_user')) {
                actionsHtml += `<button onclick="warnUser('${u.id}', ${u.warnings_count})" class="btn-outline" style="margin:0 4px;">تحذير</button>`;
            }
            if (hasPerm('delete_user')) {
                actionsHtml += `<button onclick="deleteUser('${u.id}')" class="btn-danger-sm">حذف</button>`;
            }
            tbody.innerHTML += `
                <tr>
                    <td>${u.full_name}</td>
                    <td>${u.username}</td>
                    <td>${u.warnings_count}</td>
                    <td>${actionsHtml || '-'}</td>
                </tr>
            `;
        });
    }
}
;
// إضافة مستخدم جديد (المستخدمون المضافون بواسطة المشرفين لا يحصلون على أي صلاحيات إدارية)
document.getElementById('addUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!hasPerm('add_user')) return;

    const fullName = document.getElementById('newFullName').value.trim();
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value;
    
    let selectedPerms = [];
    // فقط المدير الأساسي (د. السيد حراز أو يوسف) يمكنه منح صلاحيات
    if (currentUser.role === 'super_admin') {
        const checkboxes = document.querySelectorAll('.permissions-check input:checked');
        selectedPerms = Array.from(checkboxes).map(cb => cb.value);
    }

   const { data: ok, error } = await db.rpc('admin_add_user', {
    p_admin: currentUser.username,
    p_pass: currentPassword,
    p_username: username,
    p_full_name: fullName,
    p_password: password,
    p_permissions: selectedPerms
});

   if (!error && ok) {
        alert("تمت إضافة المستخدم بنجاح!");
        document.getElementById('addUserForm').reset();
        loadUsers();
    } else {
        alert("خطأ: اسم المستخدم مستخدم بالفعل.");
    }
});

async function warnUser(id, count) {
    if (!hasPerm('warn_user')) return;
await db.rpc('admin_warn_user', { p_admin: currentUser.username, p_pass: currentPassword, p_user_id: id });
    alert("تم تسجيل تحذير.");
    loadUsers();
}

async function deleteUser(id) {
    if (!hasPerm('delete_user')) return;
    if (confirm("هل أنت متأكد من حذف هذا المستخدم؟")) {
        await db.from('users').delete().eq('id', id);
        loadUsers();
    }
}

// فرز أبجدي من أ إلى ي
function sortTable(tableId, colIndex) {
    const table = document.getElementById(tableId);
    const tbody = table.tBodies[0];
    const rows = Array.from(tbody.rows);
    rows.sort((a, b) => a.cells[colIndex].textContent.localeCompare(b.cells[colIndex].textContent, 'ar'));
    rows.forEach(row => tbody.appendChild(row));
}

function sortUsersAZ() {
    sortTable('usersTable', 0);
}

// سحب البيانات إلى Excel
function exportToExcel() {
    if (!hasPerm('export_excel')) return;
    const table = document.getElementById('attendanceTable');
    const wb = XLSX.utils.table_to_book(table, { sheet: "الحضور" });
    XLSX.writeFile(wb, `حضور_تفكير_ابتكاري_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(tabId).classList.remove('hidden');
}

function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    document.getElementById('langToggle').textContent = currentLang === 'ar' ? 'English' : 'عربي';
    document.querySelectorAll('[data-ar]').forEach(el => {
        el.textContent = el.getAttribute(`data-${currentLang}`);
    });
}

function logout() {
    location.reload();
}