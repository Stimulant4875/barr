import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

// --- تابع اصلی (با منطق کاملاً جدید برای پیدا کردن بلوک اطلاعیه) ---
async function getRawAnnouncementText() {
  console.log("شروع فرآیند وب‌گردی با منطق اصلاح شده...");
  
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
    
    console.log("پیام‌ها ظاهر شدند. در حال استخراج محتوای HTML...");
    const htmlContent = await page.content();
    
    const dom = new JSDOM(htmlContent);
    // پیام‌ها را به ترتیب زمانی اصلی (قدیم به جدید) نگه می‌داریم
    const allMessages = Array.from(dom.window.document.querySelectorAll('div.channel-message-text'));

    if (allMessages.length === 0) {
      return "خطا: هیچ پیامی در صفحه پیدا نشد.";
    }

    // --- منطق کاملاً جدید بر اساس راهنمایی شما ---
    const startPostRegex = /برنامه خاموشی.*(\d{4}\/\d{2}\/\d{2})/;
    let latestAnnouncementStartIndex = -1;

    // ۱. از آخر به اول می‌گردیم تا جدیدترین پست "شروع اطلاعیه" را پیدا کنیم
    for (let i = allMessages.length - 1; i >= 0; i--) {
        const msg = allMessages[i];
        msg.innerHTML = msg.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        const currentText = msg.textContent.trim();
        if (startPostRegex.test(currentText)) {
            latestAnnouncementStartIndex = i;
            break; // پیدا شد، پس حلقه را متوقف کن
        }
    }

    if (latestAnnouncementStartIndex === -1) {
      return "اطلاعیه خاموشی پیدا نشد. (ممکن است امروز اطلاعیه‌ای نباشد)";
    }

    // ۲. حالا از آن نقطه به جلو (پایین) حرکت می‌کنیم تا تمام پست‌های ادامه را جمع کنیم
    const announcementPosts = [];
    for (let i = latestAnnouncementStartIndex; i < allMessages.length; i++) {
        const currentText = allMessages[i].textContent.trim();
        // اگر به یک پست "شروع اطلاعیه" دیگر رسیدیم، یعنی اطلاعیه فعلی تمام شده
        if (i > latestAnnouncementStartIndex && startPostRegex.test(currentText)) {
            break;
        }
        announcementPosts.push(currentText);
    }
    
    const latestAnnouncementContent = announcementPosts.join("\n\n");
    
    // ارسال متن کامل و دست‌نخورده
    return latestAnnouncementContent;

  } catch (error) {
    console.error("خطا در فرآیند وب‌گردی:", error);
    return `متاسفانه در دریافت اطلاعات مشکلی پیش آمد: ${error.message}`;
  } finally {
    if (browser) await browser.close();
    console.log("فرآیند وب‌گردی تمام شد.");
  }
}

// --- اجرای اصلی برنامه (بدون تغییر) ---
async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("خطا: توکن ربات یا آیدی چت تعریف نشده است!");
    process.exit(1);
  }

  const fullMessage = await getRawAnnouncementText();
  console.log("\n✅ --- متن خام اطلاعیه آماده شد --- ✅\n");
  console.log(fullMessage.substring(0, 500) + "...");
  
  const messageChunks = [];
  if (fullMessage.length > 0) {
      for (let i = 0; i < fullMessage.length; i += MAX_TELEGRAM_MESSAGE_LENGTH) {
        messageChunks.push(fullMessage.substring(i, i + MAX_TELEGRAM_MESSAGE_LENGTH));
      }
  } else {
      messageChunks.push("متنی برای ارسال یافت نشد.");
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
