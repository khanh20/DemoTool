const db = require('./database');
const { launchAccountBrowser, saveAccountCookies, closeAccountBrowser } = require('./browser');
const path = require('path');
const fs = require('fs');

/**
 * Get all accounts
 */
function getAllAccounts() {
  return db.prepare('SELECT id, name, email, status, proxy, created_at, updated_at FROM accounts ORDER BY id ASC').all();
}

/**
 * Get account by ID
 */
function getAccountById(id) {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
}

/**
 * Add a new Facebook account
 */
function addAccount({ name, email, password, proxy }) {
  const profileDirName = `profile_${Date.now()}`;
  const stmt = db.prepare(`
    INSERT INTO accounts (name, email, password, proxy, profile_dir, status)
    VALUES (?, ?, ?, ?, ?, 'unverified')
  `);
  const info = stmt.run(name, email || null, password || null, proxy || null, profileDirName);
  
  logAction(info.lastInsertRowid, 'account_created', 'info', `Tạo tài khoản: ${name}`);
  return getAccountById(info.lastInsertRowid);
}

/**
 * Update an account
 */
function updateAccount(id, { name, email, password, proxy }) {
  const stmt = db.prepare(`
    UPDATE accounts 
    SET name = COALESCE(?, name),
        email = COALESCE(?, email),
        password = COALESCE(?, password),
        proxy = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(name, email, password, proxy, id);
  return getAccountById(id);
}

/**
 * Delete an account
 */
function deleteAccount(id) {
  closeAccountBrowser(id);
  
  // Cleanup profile folder
  const profileDir = path.join(__dirname, '..', '..', 'data', 'profiles', `profile_${id}`);
  if (fs.existsSync(profileDir)) {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`Could not delete directory ${profileDir}:`, e.message);
    }
  }

  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  return true;
}

/**
 * Open visible Chrome for user to login manually (or verify session)
 * Then automatically check login and save cookies
 */
async function openLoginSession(accountId) {
  const account = getAccountById(accountId);
  if (!account) throw new Error('Account not found');

  const { context, page } = await launchAccountBrowser(account, { headless: false });

  logAction(accountId, 'open_browser', 'info', 'Đã mở trình duyệt Chrome cho tài khoản. Vui lòng đăng nhập nếu chưa đăng nhập.');

  // Navigate to Facebook
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.warn('Navigation warning:', e.message);
  }

  // Pre-fill credentials if available and fields exist
  if (account.email && account.password) {
    try {
      const emailField = await page.$('input[name="email"], input[id="email"]');
      if (emailField) {
        await emailField.fill(account.email);
        const passField = await page.$('input[name="pass"], input[id="pass"]');
        if (passField) {
          await passField.fill(account.password);
        }
      }
    } catch (e) {
      // User might already be logged in or page altered
    }
  }

  // Set up periodic cookie & status check in background while browser is open
  const checkInterval = setInterval(async () => {
    try {
      if (page.isClosed()) {
        clearInterval(checkInterval);
        return;
      }

      const url = page.url();
      const cookies = await context.cookies();
      const hasCUser = cookies.some(c => c.name === 'c_user');

      if (hasCUser) {
        // Logged in successfully!
        await saveAccountCookies(context, db, accountId);
        db.prepare("UPDATE accounts SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(accountId);
        logAction(accountId, 'login_success', 'success', 'Đăng nhập Facebook thành công! Đã lưu Cookie.');
      } else if (url.includes('checkpoint') || url.includes('disabled')) {
        db.prepare("UPDATE accounts SET status = 'checkpoint', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(accountId);
        logAction(accountId, 'checkpoint', 'warning', 'Tài khoản yêu cầu xác minh danh tính / Checkpoint');
      }
    } catch (err) {
      clearInterval(checkInterval);
    }
  }, 4000);

  return { success: true, message: 'Browser opened' };
}

/**
 * Check session status of an account
 */
async function checkAccountStatus(accountId) {
  const account = getAccountById(accountId);
  if (!account) throw new Error('Account not found');

  try {
    const { context, page } = await launchAccountBrowser(account, { headless: false });
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Allow Facebook to process session
    await page.waitForTimeout(3000);

    const cookies = await context.cookies();
    const hasCUser = cookies.some(c => c.name === 'c_user');
    const url = page.url();

    let newStatus = 'unverified';
    let message = 'Chưa đăng nhập';

    if (url.includes('checkpoint') || url.includes('disabled')) {
      newStatus = 'checkpoint';
      message = 'Bị Checkpoint/Xác minh!';
    } else if (hasCUser) {
      newStatus = 'active';
      message = 'Đang hoạt động tốt (Live)';
      await saveAccountCookies(context, db, accountId);
    }

    db.prepare('UPDATE accounts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, accountId);
    logAction(accountId, 'check_status', newStatus === 'active' ? 'success' : 'warning', message);

    return { status: newStatus, message };
  } catch (err) {
    db.prepare("UPDATE accounts SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(accountId);
    logAction(accountId, 'check_status', 'error', `Lỗi kiểm tra trạng thái: ${err.message}`);
    return { status: 'error', message: err.message };
  }
}

/**
 * Log action helper
 */
function logAction(accountId, action, status, message) {
  try {
    db.prepare(`
      INSERT INTO logs (account_id, action, status, message)
      VALUES (?, ?, ?, ?)
    `).run(accountId, action, status, message);
  } catch (err) {
    console.error('Log error:', err.message);
  }
}

module.exports = {
  getAllAccounts,
  getAccountById,
  addAccount,
  updateAccount,
  deleteAccount,
  openLoginSession,
  checkAccountStatus,
  logAction,
};
