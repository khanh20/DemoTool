// State
let accounts = [];
let prompts = [];

// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');
const pageHeading = document.getElementById('pageHeading');
const pageSubheading = document.getElementById('pageSubheading');
const btnRefresh = document.getElementById('btnRefresh');

const accountsTableBody = document.getElementById('accountsTableBody');
const totalAccountsPill = document.getElementById('totalAccountsPill');
const activeAccountsPill = document.getElementById('activeAccountsPill');

const modalAddAccount = document.getElementById('modalAddAccount');
const btnOpenAddAccount = document.getElementById('btnOpenAddAccount');
const btnCloseAddModal = document.getElementById('btnCloseAddModal');
const btnCancelAddModal = document.getElementById('btnCancelAddModal');
const btnSubmitAddAccount = document.getElementById('btnSubmitAddAccount');

const geminiApiKeyInput = document.getElementById('geminiApiKeyInput');
const btnSaveApiKey = document.getElementById('btnSaveApiKey');
const keyStatusBadge = document.getElementById('keyStatusBadge');

const promptTitle = document.getElementById('promptTitle');
const promptTargetType = document.getElementById('promptTargetType');
const promptSystem = document.getElementById('promptSystem');
const promptContext = document.getElementById('promptContext');
const btnSavePrompt = document.getElementById('btnSavePrompt');
const btnTestAI = document.getElementById('btnTestAI');
const aiOutputContent = document.getElementById('aiOutputContent');
const promptsList = document.getElementById('promptsList');

const logsContainer = document.getElementById('logsContainer');

// Automation Elements
const wallSelectAccount = document.getElementById('wallSelectAccount');
const wallPostMode = document.getElementById('wallPostMode');
const wallAiConfig = document.getElementById('wallAiConfig');
const wallPromptSelect = document.getElementById('wallPromptSelect');
const wallContextExtra = document.getElementById('wallContextExtra');
const wallCustomConfig = document.getElementById('wallCustomConfig');
const wallCustomText = document.getElementById('wallCustomText');
const btnExecutePostWall = document.getElementById('btnExecutePostWall');

const groupSelectAccount = document.getElementById('groupSelectAccount');
const groupTargetUrl = document.getElementById('groupTargetUrl');
const groupPromptSelect = document.getElementById('groupPromptSelect');
const groupContextExtra = document.getElementById('groupContextExtra');
const btnExecutePostGroup = document.getElementById('btnExecutePostGroup');

const likeSelectAccount = document.getElementById('likeSelectAccount');
const likeCount = document.getElementById('likeCount');
const btnExecuteLikeWall = document.getElementById('btnExecuteLikeWall');

const wallImageInput = document.getElementById('wallImageInput');
const groupImageInput = document.getElementById('groupImageInput');

async function uploadFiles(files) {
  if (!files || files.length === 0) return [];
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('images', files[i]);
  }
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });
  const json = await res.json();
  if (json.success) return json.filePaths;
  throw new Error(json.error || 'Lỗi tải ảnh');
}

// NAVIGATION
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tabName = item.getAttribute('data-tab');

    navItems.forEach(i => i.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    item.classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    switch (tabName) {
      case 'accounts':
        pageHeading.textContent = 'Quản lý Tài Khoản Facebook';
        pageSubheading.textContent = 'Quản lý profile độc lập, mở Chrome hiển thị, tự lưu Cookie';
        loadAccounts();
        break;
      case 'automation':
        pageHeading.textContent = 'Tác Vụ Tự Động Hóa';
        pageSubheading.textContent = 'Đăng bài lên tường, đăng vào group, tương tác like/comment an toàn';
        populateAutomationSelects();
        break;
      case 'ai-prompts':
        pageHeading.textContent = 'AI Prompts Sinh Bài Tự Động';
        pageSubheading.textContent = 'Cấu hình prompt Google Gemini để sinh status như người thật';
        loadPrompts();
        break;
      case 'logs':
        pageHeading.textContent = 'Nhật Ký & Hoạt Động';
        pageSubheading.textContent = 'Theo dõi chi tiết các tác vụ login, tương tác, kiểm tra trạng thái';
        loadLogs();
        break;
      case 'settings':
        pageHeading.textContent = 'Cấu Hình Hệ Thống';
        pageSubheading.textContent = 'Quản lý Gemini API Key và các thông số vận hành';
        loadSettings();
        break;
    }
  });
});

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.borderColor = isError ? 'var(--danger)' : 'var(--primary)';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

// ==========================
// ACCOUNTS LOGIC
// ==========================
async function loadAccounts() {
  try {
    const res = await fetch('/api/accounts');
    const json = await res.json();
    if (json.success) {
      accounts = json.data;
      renderAccountsTable();
      populateAutomationSelects();
    }
  } catch (err) {
    showToast('Không tải được danh sách nick', true);
  }
}

function renderAccountsTable() {
  totalAccountsPill.textContent = `Tổng: ${accounts.length} nick`;
  const activeCount = accounts.filter(a => a.status === 'active').length;
  activeAccountsPill.textContent = `Đang hoạt động: ${activeCount}`;

  if (accounts.length === 0) {
    accountsTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">
          Chưa có tài khoản Facebook nào. Hãy bấm <b>Thêm Tài Khoản Mới</b> để bắt đầu.
        </td>
      </tr>
    `;
    return;
  }

  accountsTableBody.innerHTML = accounts.map(acc => {
    let badgeClass = 'badge-unverified';
    let statusText = 'Chưa đăng nhập';
    if (acc.status === 'active') {
      badgeClass = 'badge-active';
      statusText = 'Live / Sẵn sàng';
    } else if (acc.status === 'checkpoint') {
      badgeClass = 'badge-checkpoint';
      statusText = 'Checkpoint';
    } else if (acc.status === 'error') {
      badgeClass = 'badge-error';
      statusText = 'Lỗi';
    }

    return `
      <tr>
        <td>#${acc.id}</td>
        <td><b>${escapeHtml(acc.name)}</b></td>
        <td>${escapeHtml(acc.email || '—')}</td>
        <td><span class="badge ${badgeClass}">${statusText}</span></td>
        <td>${acc.proxy ? `<code>${escapeHtml(acc.proxy)}</code>` : '<span class="text-muted">Không proxy</span>'}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-primary btn-sm" onclick="openLoginBrowser(${acc.id})" title="Mở trình duyệt Chrome hiển thị">
              <i class="ph-bold ph-globe"></i> Mở Chrome
            </button>
            <button class="btn btn-secondary btn-sm" onclick="checkStatus(${acc.id})" title="Kiểm tra trạng thái Cookie">
              <i class="ph-bold ph-magnifying-glass"></i> Check
            </button>
            <button class="btn btn-secondary btn-sm" onclick="closeBrowser(${acc.id})" title="Đóng Chrome">
              <i class="ph-bold ph-x"></i>
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteAccount(${acc.id})" title="Xóa tài khoản">
              <i class="ph-bold ph-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.openLoginBrowser = async function(id) {
  showToast('Đang khởi chạy Chrome...');
  try {
    const res = await fetch(`/api/accounts/${id}/open-login`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast('Đã mở Chrome! Hãy đăng nhập trên trình duyệt vừa xuất hiện.');
      setTimeout(loadAccounts, 10000);
    } else {
      showToast(json.error || 'Lỗi mở trình duyệt', true);
    }
  } catch (e) {
    showToast(e.message, true);
  }
};

window.checkStatus = async function(id) {
  showToast('Đang kiểm tra phiên đăng nhập...');
  try {
    const res = await fetch(`/api/accounts/${id}/check-status`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast(`Trạng thái: ${json.data.message}`);
      loadAccounts();
    } else {
      showToast(json.error || 'Lỗi kiểm tra', true);
    }
  } catch (e) {
    showToast(e.message, true);
  }
};

window.closeBrowser = async function(id) {
  try {
    const res = await fetch(`/api/accounts/${id}/close-browser`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast('Đã đóng trình duyệt');
    }
  } catch (e) {
    showToast(e.message, true);
  }
};

window.deleteAccount = async function(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa tài khoản này và profile tương ứng?')) return;
  try {
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast('Đã xóa tài khoản');
      loadAccounts();
    }
  } catch (e) {
    showToast(e.message, true);
  }
};

btnOpenAddAccount.addEventListener('click', () => {
  document.getElementById('accName').value = '';
  document.getElementById('accEmail').value = '';
  document.getElementById('accPass').value = '';
  document.getElementById('accProxy').value = '';
  modalAddAccount.classList.add('open');
});

function closeAddModal() {
  modalAddAccount.classList.remove('open');
}
btnCloseAddModal.addEventListener('click', closeAddModal);
btnCancelAddModal.addEventListener('click', closeAddModal);

btnSubmitAddAccount.addEventListener('click', async () => {
  const name = document.getElementById('accName').value.trim();
  const email = document.getElementById('accEmail').value.trim();
  const password = document.getElementById('accPass').value.trim();
  const proxy = document.getElementById('accProxy').value.trim();

  if (!name) {
    alert('Vui lòng nhập tên tài khoản');
    return;
  }

  try {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, proxy })
    });
    const json = await res.json();
    if (json.success) {
      showToast('Tạo tài khoản thành công!');
      closeAddModal();
      loadAccounts();
    } else {
      alert(json.error || 'Có lỗi xảy ra');
    }
  } catch (err) {
    alert(err.message);
  }
});

// ==========================
// AUTOMATION LOGIC
// ==========================
function populateAutomationSelects() {
  const accountOptions = accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (ID: ${a.id})</option>`).join('');
  wallSelectAccount.innerHTML = accountOptions;
  groupSelectAccount.innerHTML = accountOptions;
  likeSelectAccount.innerHTML = accountOptions;
  groupLikeSelectAccount.innerHTML = accountOptions;

  const wallPrompts = prompts.filter(p => p.target_type === 'wall');
  const groupPrompts = prompts.filter(p => p.target_type === 'group');

  wallPromptSelect.innerHTML = (wallPrompts.length > 0 ? wallPrompts : prompts).map(p => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join('') || '<option value="">(Chưa có prompt)</option>';
  groupPromptSelect.innerHTML = (groupPrompts.length > 0 ? groupPrompts : prompts).map(p => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join('') || '<option value="">(Chưa có prompt)</option>';
}

wallPostMode.addEventListener('change', () => {
  if (wallPostMode.value === 'ai') {
    wallAiConfig.style.display = 'block';
    wallCustomConfig.style.display = 'none';
  } else {
    wallAiConfig.style.display = 'none';
    wallCustomConfig.style.display = 'block';
  }
});

btnExecutePostWall.addEventListener('click', async () => {
  const accountId = wallSelectAccount.value;
  if (!accountId) {
    alert('Vui lòng chọn tài khoản!');
    return;
  }

  const mode = wallPostMode.value;
  let payload = { accountId };

  if (mode === 'custom') {
    const text = wallCustomText.value.trim();
    if (!text) return alert('Vui lòng nhập nội dung');
    payload.content = text;
  } else {
    const promptId = parseInt(wallPromptSelect.value);
    const p = prompts.find(item => item.id === promptId);
    if (!p) return alert('Vui lòng tạo mẫu Prompt AI trước!');
    payload.aiOptions = {
      systemInstruction: p.system_instruction,
      userContext: (p.user_context || '') + (wallContextExtra.value ? `\nLưu ý thêm: ${wallContextExtra.value}` : '')
    };
  }

  // Upload image attachments if any
  if (wallImageInput && wallImageInput.files.length > 0) {
    showToast('Đang tải ảnh đính kèm lên máy chủ...');
    try {
      payload.imagePaths = await uploadFiles(wallImageInput.files);
    } catch (err) {
      return alert(`Lỗi tải ảnh: ${err.message}`);
    }
  }

  showToast('Đang khởi chạy Chrome và đăng bài lên tường...');
  try {
    const res = await fetch('/api/automation/post-wall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      showToast(json.message);
      if (wallImageInput) wallImageInput.value = '';
    } else {
      showToast(json.error, true);
    }
  } catch (e) {
    showToast(e.message, true);
  }
});

btnExecutePostGroup.addEventListener('click', async () => {
  const accountId = groupSelectAccount.value;
  const groupUrl = groupTargetUrl.value.trim();
  if (!accountId || !groupUrl) return alert('Vui lòng nhập chọn tài khoản và link nhóm!');

  const promptId = parseInt(groupPromptSelect.value);
  const p = prompts.find(item => item.id === promptId);

  const payload = {
    accountId,
    groupUrl,
    aiOptions: p ? {
      systemInstruction: p.system_instruction,
      userContext: (p.user_context || '') + (groupContextExtra.value ? `\nLưu ý: ${groupContextExtra.value}` : '')
    } : {
      systemInstruction: 'Viết bài chia sẻ hữu ích trong hội nhóm Facebook',
      userContext: groupContextExtra.value
    }
  };

  // Upload image attachments if any
  if (groupImageInput && groupImageInput.files.length > 0) {
    showToast('Đang tải ảnh đính kèm lên máy chủ...');
    try {
      payload.imagePaths = await uploadFiles(groupImageInput.files);
    } catch (err) {
      return alert(`Lỗi tải ảnh: ${err.message}`);
    }
  }

  showToast('Đang mở Chrome để đăng bài vào nhóm...');
  try {
    const res = await fetch('/api/automation/post-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      showToast(json.message);
      if (groupImageInput) groupImageInput.value = '';
    } else {
      showToast(json.error, true);
    }
  } catch (e) {
    showToast(e.message, true);
  }
});

btnExecuteLikeWall.addEventListener('click', async () => {
  const accountId = likeSelectAccount.value;
  const maxLikes = parseInt(likeCount.value) || 5;
  if (!accountId) return alert('Vui lòng chọn tài khoản!');

  showToast('Bắt đầu tự động tương tác like newsfeed...');
  try {
    const res = await fetch('/api/automation/interact-wall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, maxLikes })
    });
    const json = await res.json();
    showToast(json.message);
  } catch (e) {
    showToast(e.message, true);
  }
});

btnExecuteLikeGroup.addEventListener('click', async () => {
  const accountId = groupLikeSelectAccount.value;
  const groupUrl = groupLikeUrl.value.trim();
  const maxLikes = parseInt(groupLikeCount.value) || 3;
  if (!accountId || !groupUrl) return alert('Vui lòng chọn tài khoản và nhập link nhóm');

  showToast('Bắt đầu tự động tương tác trong nhóm...');
  try {
    const res = await fetch('/api/automation/interact-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, groupUrl, maxLikes })
    });
    const json = await res.json();
    showToast(json.message);
  } catch (e) {
    showToast(e.message, true);
  }
});

// ==========================
// AI & PROMPT LOGIC
// ==========================
async function loadPrompts() {
  try {
    const res = await fetch('/api/prompts');
    const json = await res.json();
    if (json.success) {
      prompts = json.data;
      renderPromptsList();
      populateAutomationSelects();
    }
  } catch (err) {
    showToast('Lỗi tải danh sách prompts', true);
  }
}

function renderPromptsList() {
  if (prompts.length === 0) {
    promptsList.innerHTML = '<p class="text-muted">Chưa có prompt nào được lưu.</p>';
    return;
  }

  promptsList.innerHTML = prompts.map(p => `
    <div class="prompt-item">
      <div>
        <div class="prompt-title">${escapeHtml(p.title)}</div>
        <div class="prompt-badge">Đăng lên: ${p.target_type === 'wall' ? 'Tường' : 'Group'}</div>
      </div>
      <div>
        <button class="btn btn-secondary btn-sm" onclick="applyPrompt(${p.id})">Áp dụng</button>
        <button class="btn btn-danger btn-sm" onclick="deletePrompt(${p.id})">Xóa</button>
      </div>
    </div>
  `).join('');
}

window.applyPrompt = function(id) {
  const p = prompts.find(item => item.id === id);
  if (!p) return;
  promptTitle.value = p.title;
  promptTargetType.value = p.target_type;
  promptSystem.value = p.system_instruction;
  promptContext.value = p.user_context || '';
  showToast(`Đã nạp prompt: ${p.title}`);
};

window.deletePrompt = async function(id) {
  if (!confirm('Bạn có muốn xóa prompt này?')) return;
  try {
    const res = await fetch(`/api/prompts/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast('Đã xóa prompt');
      loadPrompts();
    }
  } catch (e) {
    showToast(e.message, true);
  }
};

btnSavePrompt.addEventListener('click', async () => {
  const title = promptTitle.value.trim();
  const targetType = promptTargetType.value;
  const systemInstruction = promptSystem.value.trim();
  const userContext = promptContext.value.trim();

  if (!title || !systemInstruction) {
    alert('Vui lòng nhập Tiêu đề và System Instruction');
    return;
  }

  try {
    const res = await fetch('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, targetType, systemInstruction, userContext })
    });
    const json = await res.json();
    if (json.success) {
      showToast('Đã lưu mẫu Prompt thành công!');
      loadPrompts();
    } else {
      alert(json.error);
    }
  } catch (e) {
    alert(e.message);
  }
});

btnTestAI.addEventListener('click', async () => {
  const systemInstruction = promptSystem.value.trim();
  const userContext = promptContext.value.trim();
  const targetType = promptTargetType.value;

  if (!systemInstruction) {
    alert('Vui lòng nhập System Instruction trước khi thử nghiệm');
    return;
  }

  aiOutputContent.textContent = '⏳ Đang gọi Gemini AI sinh bài viết theo thời gian thực...';

  try {
    const res = await fetch('/api/ai/preview-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction, userContext, targetType })
    });
    const json = await res.json();
    if (json.success) {
      aiOutputContent.textContent = json.content;
      showToast('AI đã sinh bài thành công!');
    } else {
      aiOutputContent.textContent = `❌ Lỗi: ${json.error}`;
      showToast(json.error, true);
    }
  } catch (e) {
    aiOutputContent.textContent = `❌ Lỗi kết nối: ${e.message}`;
  }
});

// ==========================
// SETTINGS LOGIC
// ==========================
async function loadSettings() {
  try {
    const res = await fetch('/api/settings/gemini-key');
    const json = await res.json();
    if (json.success) {
      if (json.hasKey) {
        keyStatusBadge.innerHTML = `<span class="badge badge-active"><i class="ph-bold ph-check-circle"></i> Đã cấu hình Key (${json.maskedKey})</span>`;
      } else {
        keyStatusBadge.innerHTML = '<span class="badge badge-unverified"><i class="ph-bold ph-warning-circle"></i> Chưa cài đặt Key (Chưa thể dùng AI)</span>';
      }
    }
  } catch (e) {}
}

btnSaveApiKey.addEventListener('click', async () => {
  const key = geminiApiKeyInput.value.trim();
  if (!key) {
    alert('Vui lòng dán Gemini API Key');
    return;
  }
  try {
    const res = await fetch('/api/settings/gemini-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const json = await res.json();
    if (json.success) {
      showToast('Đã lưu Gemini API Key');
      geminiApiKeyInput.value = '';
      loadSettings();
    } else {
      alert(json.error);
    }
  } catch (e) {
    alert(e.message);
  }
});

// ==========================
// LOGS LOGIC
// ==========================
async function loadLogs() {
  try {
    const res = await fetch('/api/logs?limit=40');
    const json = await res.json();
    if (json.success) {
      if (json.data.length === 0) {
        logsContainer.innerHTML = '<p class="text-muted p-3">Chưa có nhật ký nào.</p>';
        return;
      }
      logsContainer.innerHTML = json.data.map(log => {
        let statusClass = 'log-info';
        if (log.status === 'success') statusClass = 'log-success';
        if (log.status === 'warning') statusClass = 'log-warning';
        if (log.status === 'error') statusClass = 'log-error';

        const time = new Date(log.created_at).toLocaleTimeString('vi-VN');
        const accTag = log.account_name ? `<b>[${escapeHtml(log.account_name)}]</b> ` : '';

        return `
          <div class="log-entry ${statusClass}">
            <span class="log-time">${time}</span>
            <span class="log-text">${accTag}${escapeHtml(log.message)}</span>
          </div>
        `;
      }).join('');
    }
  } catch (e) {}
}

// REFRESH BUTTON
btnRefresh.addEventListener('click', () => {
  loadAccounts();
  loadPrompts();
  loadLogs();
  showToast('Đã làm mới dữ liệu');
});

// UTILITY
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[m]);
}

// INITIAL LOAD
loadAccounts();
loadPrompts();
loadSettings();
