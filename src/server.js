const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const db = require('./core/database');
const accountManager = require('./core/account-manager');
const aiContent = require('./core/ai-content');
const { closeAccountBrowser } = require('./core/browser');

const { postToWall } = require('./modules/post-wall');
const { getGroupsByAccount, addGroup, deleteGroup, postToGroup } = require('./modules/post-group');
const { autoInteractWall, autoInteractGroup } = require('./modules/interact');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup upload folder for images
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `img_${Date.now()}_${Math.round(Math.random() * 1E6)}${ext}`);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'ui')));

// ========================
// FILE UPLOAD API
// ========================
app.post('/api/upload', upload.array('images', 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Không có ảnh nào được gửi lên' });
    }
    const filePaths = req.files.map(f => f.path);
    res.json({ success: true, filePaths });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// ACCOUNTS API
// ========================
app.get('/api/accounts', (req, res) => {
  try {
    const accounts = accountManager.getAllAccounts();
    res.json({ success: true, data: accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/accounts', (req, res) => {
  try {
    const { name, email, password, proxy } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Tên tài khoản không được để trống' });
    const acc = accountManager.addAccount({ name, email, password, proxy });
    res.json({ success: true, data: acc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/accounts/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = accountManager.updateAccount(id, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    accountManager.deleteAccount(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/accounts/:id/open-login', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    accountManager.openLoginSession(id).catch(e => console.error('Login session error:', e));
    res.json({ success: true, message: 'Đang mở Chrome để bạn đăng nhập...' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/accounts/:id/check-status', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await accountManager.checkAccountStatus(id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/accounts/:id/close-browser', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await closeAccountBrowser(id);
    res.json({ success: true, message: 'Đã đóng trình duyệt' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// AUTOMATION POST & INTERACT
// ========================
app.post('/api/automation/post-wall', async (req, res) => {
  try {
    const { accountId, content, imagePaths, aiOptions } = req.body;
    if (!accountId) return res.status(400).json({ success: false, error: 'Thiếu accountId' });
    
    postToWall({ accountId: parseInt(accountId), content, imagePaths: imagePaths || [], aiOptions })
      .catch(e => console.error('Post wall error:', e));

    res.json({ success: true, message: 'Đã gửi lệnh đăng bài lên tường! Trình duyệt đang thực hiện.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/automation/post-group', async (req, res) => {
  try {
    const { accountId, groupUrl, content, imagePaths, aiOptions } = req.body;
    if (!accountId || !groupUrl) return res.status(400).json({ success: false, error: 'Thiếu accountId hoặc link nhóm' });

    postToGroup({ accountId: parseInt(accountId), groupUrl, content, imagePaths: imagePaths || [], aiOptions })
      .catch(e => console.error('Post group error:', e));

    res.json({ success: true, message: 'Đã gửi lệnh đăng bài vào nhóm! Trình duyệt đang thực hiện.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/automation/interact-wall', async (req, res) => {
  try {
    const { accountId, maxLikes } = req.body;
    if (!accountId) return res.status(400).json({ success: false, error: 'Thiếu accountId' });

    autoInteractWall({ accountId: parseInt(accountId), maxLikes: maxLikes || 5 })
      .catch(e => console.error('Interact wall error:', e));

    res.json({ success: true, message: 'Đang tự động tương tác like bài trên newsfeed...' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/automation/interact-group', async (req, res) => {
  try {
    const { accountId, groupUrl, maxLikes } = req.body;
    if (!accountId || !groupUrl) return res.status(400).json({ success: false, error: 'Thiếu accountId hoặc URL nhóm' });

    autoInteractGroup({ accountId: parseInt(accountId), groupUrl, maxLikes: maxLikes || 3 })
      .catch(e => console.error('Interact group error:', e));

    res.json({ success: true, message: 'Đang tự động tương tác trong nhóm...' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// GROUPS API
// ========================
app.get('/api/accounts/:id/groups', (req, res) => {
  try {
    const groups = getGroupsByAccount(parseInt(req.params.id));
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/accounts/:id/groups', (req, res) => {
  try {
    const { name, url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Link nhóm không được rỗng' });
    const g = addGroup(parseInt(req.params.id), name || 'Nhóm Facebook', url.trim());
    res.json({ success: true, data: g });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/groups/:id', (req, res) => {
  try {
    deleteGroup(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// AI & PROMPTS API
// ========================
app.get('/api/settings/gemini-key', (req, res) => {
  const key = aiContent.getApiKey();
  const maskedKey = key ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '';
  res.json({ success: true, hasKey: Boolean(key), maskedKey });
});

app.post('/api/settings/gemini-key', (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ success: false, error: 'Key không được rỗng' });
    aiContent.setApiKey(key.trim());
    res.json({ success: true, message: 'Đã lưu Gemini API Key' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/prompts', (req, res) => {
  try {
    const prompts = aiContent.getAllPrompts();
    res.json({ success: true, data: prompts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/prompts', (req, res) => {
  try {
    const { title, systemInstruction, userContext, targetType } = req.body;
    if (!title || !systemInstruction) {
      return res.status(400).json({ success: false, error: 'Tiêu đề và hướng dẫn AI là bắt buộc' });
    }
    const prompt = aiContent.createPrompt({ title, systemInstruction, userContext, targetType });
    res.json({ success: true, data: prompt });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/prompts/:id', (req, res) => {
  try {
    aiContent.deletePrompt(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/preview-generate', async (req, res) => {
  try {
    const { systemInstruction, userContext, targetType } = req.body;
    const content = await aiContent.generatePostContent({ systemInstruction, userContext, targetType });
    res.json({ success: true, content });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================
// LOGS & STATS API
// ========================
app.get('/api/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const logs = db.prepare(`
      SELECT l.*, a.name as account_name 
      FROM logs l 
      LEFT JOIN accounts a ON l.account_id = a.id 
      ORDER BY l.id DESC 
      LIMIT ?
    `).all(limit);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Facebook Automation Tool đang chạy tại:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`===============================================`);
});
