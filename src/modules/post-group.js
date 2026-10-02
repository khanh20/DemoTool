const db = require('../core/database');
const { launchAccountBrowser } = require('../core/browser');
const { generatePostContent } = require('../core/ai-content');
const { randomDelay } = require('./post-wall');
const fs = require('fs');

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
 * Post to a specific Facebook group (Supports Text + Images)
 * @param {Object} params
 * @param {number} params.accountId
 * @param {string} params.groupUrl
 * @param {string} [params.content]
 * @param {string[]} [params.imagePaths]
 * @param {Object} [params.aiOptions]
 */
async function postToGroup({ accountId, groupUrl, content, imagePaths = [], aiOptions }) {
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

  if (!postText && (!imagePaths || imagePaths.length === 0)) {
    throw new Error('Nội dung bài viết hoặc hình ảnh không được để trống');
  }

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

    await randomDelay(2000, 3500);

    // 1. Upload Images to Group if provided
    if (Array.isArray(imagePaths) && imagePaths.length > 0) {
      const validFiles = imagePaths.filter(p => fs.existsSync(p));
      if (validFiles.length > 0) {
        try {
          const fileInput = await page.$('input[type="file"][accept*="image"]');
          if (fileInput) {
            await fileInput.setInputFiles(validFiles);
            await randomDelay(3000, 5000);
          } else {
            const photoBtn = await page.$('[aria-label*="Ảnh/video"], [aria-label*="Photo/video"], div[role="button"]:has-text("Ảnh/video")');
            if (photoBtn) {
              await photoBtn.click();
              await randomDelay(1500, 2500);
              const dynamicInput = await page.$('input[type="file"][accept*="image"]');
              if (dynamicInput) {
                await dynamicInput.setInputFiles(validFiles);
                await randomDelay(3000, 5000);
              }
            }
          }
        } catch (imgErr) {
          console.warn('Group image upload warning:', imgErr.message);
        }
      }
    }

    // 2. Typing inside group textbox
    if (postText) {
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
              await page.keyboard.type(char, { delay: Math.floor(Math.random() * 45) + 25 });
            }
            typed = true;
            break;
          }
        } catch (e) {}
      }

      if (!typed) {
        throw new Error('Không tìm thấy ô nhập bài trong nhóm (có thể nhóm yêu cầu duyệt trước)');
      }
    }

    await randomDelay(2500, 4500);

    // 3. Click "Đăng" / "Post"
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
          const isDisabled = await btn.getAttribute('aria-disabled');
          if (isDisabled !== 'true') {
            await btn.click();
            break;
          }
        }
      } catch (e) {}
    }

    await randomDelay(5000, 7000);

    const imagePathsJson = (imagePaths && imagePaths.length > 0) ? JSON.stringify(imagePaths) : null;
    db.prepare(`
      INSERT INTO posts (account_id, target_type, target_id, content, image_paths, status, posted_at)
      VALUES (?, 'group', ?, ?, ?, 'success', CURRENT_TIMESTAMP)
    `).run(accountId, groupUrl, postText || '(Bài đăng hình ảnh)', imagePathsJson);

    db.prepare(`
      INSERT INTO logs (account_id, action, status, message)
      VALUES (?, 'post_group', 'success', ?)
    `).run(accountId, `Đã đăng bài vào nhóm: ${groupUrl}`);

    return { success: true, content: postText };

  } catch (err) {
    db.prepare(`
      INSERT INTO posts (account_id, target_type, target_id, content, status, error_message)
      VALUES (?, 'group', ?, ?, 'failed', ?)
    `).run(accountId, groupUrl, postText || '', err.message);

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
