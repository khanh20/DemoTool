const db = require('../core/database');
const { launchAccountBrowser } = require('../core/browser');
const { randomDelay } = require('./post-wall');

/**
 * Auto-interact on Wall / Feed (Like recent posts)
 * @param {Object} params
 * @param {number} params.accountId
 * @param {number} [params.maxLikes=5] Number of posts to like
 */
async function autoInteractWall({ accountId, maxLikes = 5 }) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) throw new Error('Không tìm thấy tài khoản');

  const { page } = await launchAccountBrowser(account, { headless: false });

  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await randomDelay(3000, 5000);

    let likedCount = 0;

    // Scroll down and like posts
    for (let scroll = 0; scroll < 6 && likedCount < maxLikes; scroll++) {
      // Find like buttons: aria-label="Thích" or "Like"
      const likeButtons = await page.$$('[aria-label="Thích"], [aria-label="Like"], div[role="button"]:has-text("Thích")');

      for (const btn of likeButtons) {
        if (likedCount >= maxLikes) break;

        try {
          if (await btn.isVisible()) {
            await btn.scrollIntoViewIfNeeded();
            await randomDelay(1000, 2000);
            await btn.click();
            likedCount++;

            db.prepare(`
              INSERT INTO logs (account_id, action, status, message)
              VALUES (?, 'like', 'success', 'Đã thả like tự nhiên trên newsfeed')
            `).run(accountId);

            await randomDelay(3000, 6000); // Safe delay between likes
          }
        } catch (e) {}
      }

      // Scroll smoothly down like a human
      await page.mouse.wheel(0, 600);
      await randomDelay(2000, 4000);
    }

    return { success: true, count: likedCount };

  } catch (err) {
    db.prepare(`
      INSERT INTO logs (account_id, action, status, message)
      VALUES (?, 'like', 'error', ?)
    `).run(accountId, `Lỗi tương tác like: ${err.message}`);
    throw err;
  }
}

/**
 * Auto-interact in a specific Group (Like & scroll group feed)
 */
async function autoInteractGroup({ accountId, groupUrl, maxLikes = 3 }) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) throw new Error('Không tìm thấy tài khoản');

  const { page } = await launchAccountBrowser(account, { headless: false });

  try {
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await randomDelay(3000, 5000);

    let likedCount = 0;

    for (let i = 0; i < 4 && likedCount < maxLikes; i++) {
      const likeButtons = await page.$$('[aria-label="Thích"], [aria-label="Like"], div[role="button"]:has-text("Thích")');

      for (const btn of likeButtons) {
        if (likedCount >= maxLikes) break;
        try {
          if (await btn.isVisible()) {
            await btn.scrollIntoViewIfNeeded();
            await randomDelay(1000, 2500);
            await btn.click();
            likedCount++;

            db.prepare(`
              INSERT INTO logs (account_id, action, status, message)
              VALUES (?, 'like', 'success', ?)
            `).run(accountId, `Đã thả like bài viết trong nhóm ${groupUrl}`);

            await randomDelay(4000, 7000);
          }
        } catch (e) {}
      }

      await page.mouse.wheel(0, 700);
      await randomDelay(2000, 4000);
    }

    return { success: true, count: likedCount };

  } catch (err) {
    db.prepare(`
      INSERT INTO logs (account_id, action, status, message)
      VALUES (?, 'like', 'error', ?)
    `).run(accountId, `Lỗi tương tác nhóm: ${err.message}`);
    throw err;
  }
}

module.exports = {
  autoInteractWall,
  autoInteractGroup,
};
