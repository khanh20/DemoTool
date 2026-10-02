const db = require('../core/database');
const { launchAccountBrowser } = require('../core/browser');
const { generatePostContent } = require('../core/ai-content');

/**
 * Helper: Random delay between actions to mimic human behavior
 */
function randomDelay(minMs = 2000, maxMs = 5000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Post to personal wall
 * @param {Object} params
 * @param {number} params.accountId
 * @param {string} [params.content] Custom content or empty to generate via AI
 * @param {Object} [params.aiOptions] If generating via AI: { systemInstruction, userContext }
 */
async function postToWall({ accountId, content, aiOptions }) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) throw new Error('Không tìm thấy tài khoản');

  let postText = content;
  if (!postText && aiOptions) {
    postText = await generatePostContent({
      systemInstruction: aiOptions.systemInstruction,
      userContext: aiOptions.userContext,
      targetType: 'wall'
    });
  }

  if (!postText) throw new Error('Nội dung bài viết không được rỗng');

  const { page } = await launchAccountBrowser(account, { headless: false });

  try {
    // Navigate to personal profile or feed
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await randomDelay(3000, 5000);

    // Look for post creation box on Facebook feed
    // Facebook has multiple selectors depending on account / language
    const postBoxSelectors = [
      '[aria-label*="Bạn đang nghĩ gì"]',
      '[aria-label*="What\'s on your mind"]',
      'div[role="button"]:has-text("Bạn đang nghĩ gì")',
      'div[role="button"]:has-text("What\'s on your mind")',
      'span:has-text("Bạn đang nghĩ gì")',
      'span:has-text("What\'s on your mind")'
    ];

    let clicked = false;
    for (const selector of postBoxSelectors) {
      try {
        const el = await page.$(selector);
        if (el && await el.isVisible()) {
          await el.click();
          clicked = true;
          break;
        }
      } catch (e) {}
    }

    if (!clicked) {
      // Try clicking via keyboard or direct focus
      await page.keyboard.press('KeyP');
      await randomDelay(1500, 2500);
    }

    await randomDelay(2000, 3000);

    // Find the active modal text input
    const inputSelectors = [
      'div[role="dialog"] div[contenteditable="true"]',
      'form div[contenteditable="true"]',
      'div[aria-label*="Bạn đang nghĩ gì"][contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]'
    ];

    let typed = false;
    for (const selector of inputSelectors) {
      try {
        const inputEl = await page.$(selector);
        if (inputEl && await inputEl.isVisible()) {
          await inputEl.click();
          await randomDelay(500, 1000);
          
          // Human-like typing with small variance
          for (const char of postText) {
            await page.keyboard.type(char, { delay: Math.floor(Math.random() * 50) + 30 });
          }
          typed = true;
          break;
        }
      } catch (e) {}
    }

    if (!typed) {
      throw new Error('Không thể định vị ô nhập bài viết trên Facebook');
    }

    await randomDelay(2000, 4000);

    // Find and click "Đăng" / "Post" button
    const submitSelectors = [
      'div[role="dialog"] aria-label="Đăng"',
      'div[role="dialog"] aria-label="Post"',
      'div[role="dialog"] div[role="button"]:has-text("Đăng")',
      'div[role="dialog"] div[role="button"]:has-text("Post")',
      'div[aria-label="Đăng"]',
      'div[aria-label="Post"]'
    ];

    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn && await btn.isVisible()) {
          const isDisabled = await btn.getAttribute('aria-disabled');
          if (isDisabled !== 'true') {
            await btn.click();
            submitted = true;
            break;
          }
        }
      } catch (e) {}
    }

    if (!submitted) {
      // Fallback: press Enter with Ctrl
      await page.keyboard.press('Control+Enter');
      submitted = true;
    }

    await randomDelay(4000, 6000);

    // Save record to DB
    db.prepare(`
      INSERT INTO posts (account_id, target_type, content, status, posted_at)
      VALUES (?, 'wall', ?, 'success', CURRENT_TIMESTAMP)
    `).run(accountId, postText);

    db.prepare(`
      INSERT INTO logs (account_id, action, status, message)
      VALUES (?, 'post_wall', 'success', ?)
    `).run(accountId, `Đã đăng bài lên tường: "${postText.substring(0, 40)}..."`);

    return { success: true, content: postText };

  } catch (error) {
    db.prepare(`
      INSERT INTO posts (account_id, target_type, content, status, error_message)
      VALUES (?, 'wall', ?, 'failed', ?)
    `).run(accountId, postText, error.message);

    db.prepare(`
      INSERT INTO logs (account_id, action, status, message)
      VALUES (?, 'post_wall', 'error', ?)
    `).run(accountId, `Lỗi đăng bài tường: ${error.message}`);

    throw error;
  }
}

module.exports = {
  postToWall,
  randomDelay,
};
