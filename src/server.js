const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const db = require('./core/database');
const accountManager = require('./core/account-manager');
const aiContent = require('./core/ai-content');
const { closeAccountBrowser } = require('./core/browser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'ui')));

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
    // Non-blocking response while browser opens
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
