require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./database');

/**
 * Get API Key from DB settings or process.env
 */
function getApiKey() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
  return (row && row.value) ? row.value : process.env.GEMINI_API_KEY;
}

/**
 * Save API Key to settings
 */
function setApiKey(key) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('gemini_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key);
}

/**
 * Generate a Facebook post using Gemini
 * @param {Object} options
 * @param {string} options.systemInstruction Role / persona / guidelines
 * @param {string} options.userContext Extra prompt or context (e.g. topic, promotion, story)
 * @param {string} options.targetType 'wall' or 'group'
 */
async function generatePostContent({ systemInstruction, userContext, targetType = 'wall' }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Chưa cấu hình Gemini API Key! Vui lòng vào Cài đặt và nhập API Key.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: systemInstruction || 'Bạn là một người dùng Facebook tại Việt Nam, viết bài đăng tự nhiên, chân thật, mang tính cá nhân hoặc bán hàng tinh tế, sử dụng emoji phù hợp.',
  });

  const now = new Date();
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayName = days[now.getDay()];
  const timeStr = `${now.getHours()}:${now.getMinutes() < 10 ? '0' : ''}${now.getMinutes()}`;

  const promptText = `
Hôm nay là: ${dayName}, lúc ${timeStr}.
Môi trường đăng: ${targetType === 'wall' ? 'Tường cá nhân Facebook' : 'Hội nhóm Facebook'}.

Yêu cầu nội dung:
${userContext || 'Viết một bài đăng ngắn gọn, thu hút, tự nhiên theo đúng phong cách của bạn.'}

LƯU Ý QUAN TRỌNG:
- Chỉ trả về nội dung bài viết hoàn chỉnh để đăng ngay lên Facebook.
- KHÔNG thêm lời giải thích, KHÔNG ghi "Dưới đây là bài viết:" hay đặt trong dấu ngoặc kép.
- Hãy dùng ngôn ngữ tự nhiên như người thật đang gõ status trên Facebook.
  `.trim();

  const result = await model.generateContent(promptText);
  const response = await result.response;
  return response.text().trim();
}

/**
 * Prompt Templates Management
 */
function getAllPrompts() {
  return db.prepare('SELECT * FROM prompts ORDER BY id DESC').all();
}

function getPromptById(id) {
  return db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
}

function createPrompt({ title, systemInstruction, userContext, targetType }) {
  const stmt = db.prepare(`
    INSERT INTO prompts (title, system_instruction, user_context, target_type)
    VALUES (?, ?, ?, ?)
  `);
  const info = stmt.run(title, systemInstruction, userContext, targetType || 'wall');
  return getPromptById(info.lastInsertRowid);
}

function updatePrompt(id, { title, systemInstruction, userContext, targetType }) {
  db.prepare(`
    UPDATE prompts
    SET title = ?, system_instruction = ?, user_context = ?, target_type = ?
    WHERE id = ?
  `).run(title, systemInstruction, userContext, targetType || 'wall', id);
  return getPromptById(id);
}

function deletePrompt(id) {
  db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
  return true;
}

module.exports = {
  getApiKey,
  setApiKey,
  generatePostContent,
  getAllPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
};
