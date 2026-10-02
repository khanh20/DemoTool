const db = require('../core/database');
const { launchAccountBrowser } = require('../core/browser');
const { generatePostContent } = require('../core/ai-content');
const { randomDelay } = require('./post-wall');

/**
 * Get all groups saved for an account
 */
function getGroupsByAccount(accountId) {
  return db.prepare('SELECT * FROM groups WHERE account_id = ? ORDER BY id DESC').all(accountId);
}

/**
 * Add a group URL
 */
function addGroup(accountId, name, url) {
  const stmt = db.prepare('INSERT INTO groups (account_id, name, url) VALUES (?, ?, ?)');
  const res = stmt.run(accountId, name, url);
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(res.lastInsertRowid);
}

/**
 * Delete a group
 */
function deleteGroup(id) {
  db.prepare('DELETE FROM groups WHERE id = ?').run(id);
  return true;
}

/**
 * Post to a specific Facebook group
 * @param {Object} params
 * @param {number} params.accountId
 * @param {string} params.groupUrl
 * @param {string} [params.content]
 * @param {Object} [params.aiOptions]
 */
async function postToGroup({ accountId, groupUrl, content, aiOptions }) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) throw new Error('Không tìm thấy tài khoản');

  let postText = content;
  if (!postText && aiOptions) {
    postText = await generatePostContent({
      systemInstruction: aiOptions.systemInstruction,
      userContext: aiOptions.userContext,
      targetType: 'group'
    });
  }

  if (!postText) throw new Error('Nội dung bài viết không được rỗng');

  const { page } = await launchAccountBrowser(account, { headless: false });

  try {
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await randomDelay(3000, 5000);

    // Group post box selectors
    const boxSelectors = [
      'span:has-text("Viết gì đó...")',
      'span:has-text("Write something...")',
      'div[role="button"]:has-text("Viết gì đó...")',
      'div[role="button"]:has-text("Write something...")',
      '[aria-label*="Viết gì đó"]',
      '[aria-label*="Write something"]'
    ];

    let clicked = false;
    for (const selector of boxSelectors) {
      try {
        const el = await page.$(selector);
        if (el && await el.isVisible()) {
          await el.click();
          clicked = true;
          break;
        }
      } catch (e) {}
    }

    await randomDelay(2000, 3000);

    // Typing inside group textbox
    const inputSelectors = [
      'div[role="dialog"] div[contenteditable="true"]',
      'form div[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]'
    ];

    let typed = false;
    for (const selector of inputSelectors) {
      try {
        const inputEl = await page.$(selector);
        if (inputEl && await inputEl.isVisible()) {
          await inputEl.click();
          await randomDelay(500, 1000);

          for (const char of postText) {
            await page.keyboard.type(char, { delay: Math.floor(Math.random() * 50) + 30 });
          }
          typed = true;
          break;
        }
      } catch (e) {}
    }

    if (!typed) {
      throw new Error('Không tìm thấy ô nhập bài trong nhóm (có thể nhóm yêu cầu duyệt trước)');
    }

    await randomDelay(2000, 4000);

    // Click "Đăng" / "Post"
    const submitSelectors = [
      'div[role="dialog"] aria-label="Đăng"',
      'div[role="dialog"] div[role="button"]:has-text("Đăng")',
      'div[role="dialog"] div[role="button"]:has-text("Post")',
      'div[aria-label="Đăng"]',
      'div[aria-label="Post"]'
    ];

    for (const selector of submitSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn && await btn.isVisible()) {
          await btn.click();
          break;
        }
      } catch (e) {}
    }

    await randomDelay(4000, 6000);

    db.prepare(`
      INSERT INTO posts (account_id, target_type, target_id, content, status, posted_at)
      VALUES (?, 'group', ?, ?, 'success', CURRENT_TIMESTAMP)
    `).run(accountId, groupUrl, postText);

    db.prepare(`
      INSERT INTO logs (account_id, action, status, message)
      VALUES (?, 'post_group', 'success', ?)
    `).run(accountId, `Đã đăng bài vào nhóm: ${groupUrl}`);

    return { success: true, content: postText };

  } catch (err) {
    db.prepare(`
      INSERT INTO posts (account_id, target_type, target_id, content, status, error_message)
      VALUES (?, 'group', ?, ?, 'failed', ?)
    `).run(accountId, groupUrl, postText, err.message);

    db.prepare(`
      INSERT INTO logs (account_id, action, status, message)
      VALUES (?, 'post_group', 'error', ?)
    `).run(accountId, `Lỗi đăng bài group: ${err.message}`);

    throw err;
  }
}

module.exports = {
  getGroupsByAccount,
  addGroup,
  deleteGroup,
  postToGroup,
};
