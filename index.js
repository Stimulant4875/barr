import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

// --- تحلیل اطلاعیه (فعلاً اسکلت) ---
function parseAnnouncement(rawText) {
  // TODO: اینجا منطق دقیق بعد از دیدن نمونه واقعی نوشته می‌شود.
  // فعلاً متن خام بدون تغییر برمی‌گردد.
  
  return `📢 برنامه خاموشی (نسخه خام برای تست)\n\n${rawText}`;
}

// --- تابع اصلی (دریافت متن خام اطلاعیه) ---
async function getRawAnnouncementText() {
  console.log("شروع فرآیند وب‌گردی برای دریافت متن خام اطلاعیه...");
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    console.log(`در حال رفتن به صفحه: ${SPLUS_URL}`);
    await page.goto(SPLUS_URL, { waitUntil: "networkidle2", timeout: 90000 });
    
    console.log("در حال انتظار برای ظاهر شدن پیام‌ها...");
    await page.waitForSelector('div.channel-message-text', { timeout: 30000 });
    
    console.log("پیام‌ها ظاهر شدند.");
    const allMessages = await page.$$eval('div.channel-message-text', nodes => 
      nodes.map(n => {
        n.innerHTML = n.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        return n.textContent.trim();
      })
    );

    if (allMessages.length === 0) {
      return "خطا: هیچ پیامی در صفحه پیدا نشد.";
    }

    const startPostRegex = /برنامه خاموشی.*(\d{4}\/\d{2}\/\d{2})/;
    let latestAnnouncementStartIndex = -1;

    for (let i = allMessages.length - 1; i >= 0; i--) {
        if (startPostRegex.test(allMessages[i])) {
            latestAnnouncementStartIndex = i;
            break;
        }
    }

    if (latestAnnouncementStartIndex === -1) {
      return "اطلاعیه خاموشی پیدا نشد. (ممکن است امروز اطلاعیه‌ای نباشد)";
    }

    const announcementPosts = [];
    for (let i = latestAnnouncementStartIndex; i < allMessages.length; i++) {
        const currentText = allMessages[i];
        if (i > latestAnnouncementStartIndex && startPostRegex.test(currentText)) {
            break;
        }
        announcementPosts.push(currentText);
    }
    
    // متن کامل و دست‌نخورده اطلاعیه
    const latestAnnouncementContent = announcementPosts.join("\n\n---\n\n");
    
    return latestAnnouncementContent;

  } catch (error) {
    console.error("خطا در فرآیند وب‌گردی:", error);
    return `متاسفانه در دریافت اطلاعات مشکلی پیش آمد: ${error.message}`;
  } finally {
    if (browser) await browser.close();
    console.log("فرآیند وب‌گردی تمام شد.");
  }
}

// --- اجرای اصلی برنامه ---
async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("خطا: توکن ربات یا آیدی چت تعریف نشده است!");
    process.exit(1);
  }

  const rawMessage = await getRawAnnouncementText();
  const fullMessage = parseAnnouncement(rawMessage);

  console.log("\n✅ --- متن پردازش‌شده برای ارسال آماده شد --- ✅\n");
  console.log(fullMessage.substring(0, 500) + "...");

  const messageChunks = [];
  for (let i = 0; i < fullMessage.length; i += MAX_TELEGRAM_MESSAGE_LENGTH) {
    messageChunks.push(fullMessage.substring(i, i + MAX_TELEGRAM_MESSAGE_LENGTH));
  }
  
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    console.log(`\n🚀 پیام به ${messageChunks.length} بخش تقسیم شد. در حال ارسال...`);
    
    for (const chunk of messageChunks) {
      await axios.post(telegramApiUrl, { 
        chat_id: TELEGRAM_CHAT_ID, 
        text: chunk 
      }, { timeout: 10000 });
      console.log("یک بخش با موفقیت ارسال شد.");
      await new Promise(resolve => setTimeout(resolve, 500)); 
    }

    console.log("✅ تمام بخش‌های پیام با موفقیت به تلگرام ارسال شد.");
  } catch (error) {
    console.error("❌ خطا در ارسال پیام به تلگرام:", error.response?.data || error.message);
    process.exit(1);
  }
}

main();
