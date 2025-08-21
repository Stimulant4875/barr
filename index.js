import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// --- تابع اصلی (فقط برای استخراج متن خام) ---
async function getRawAnnouncementText() {
  console.log("شروع فرآیند وب‌گردی برای دریافت متن خام...");
  
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
    const messagesNodeList = dom.window.document.querySelectorAll('div.channel-message-text');

    if (messagesNodeList.length === 0) {
      return "خطا: هیچ پیامی در صفحه پیدا نشد.";
    }

    const messages = Array.from(messagesNodeList).reverse();
    let latestAnnouncementContent = "";
    let finalDate = "";
    let foundStartOfAnnouncement = false;
    const startPostRegex = /برنامه خاموشی.*(\d{4}\/\d{2}\/\d{2})/;

    for (const msg of messages) {
        msg.innerHTML = msg.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        const currentText = msg.textContent.trim();
        if (startPostRegex.test(currentText)) {
            finalDate = currentText.match(startPostRegex)[1];
            latestAnnouncementContent = currentText;
            let nextMsgIndex = messages.indexOf(msg) + 1;
            while (nextMsgIndex < messages.length && !startPostRegex.test(messages[nextMsgIndex].textContent.trim())) {
                messages[nextMsgIndex].innerHTML = messages[nextMsgIndex].innerHTML.replace(/<br\s*\/?>/gi, '\n');
                latestAnnouncementContent += "\n\n" + messages[nextMsgIndex].textContent.trim();
                nextMsgIndex++;
            }
            foundStartOfAnnouncement = true;
            break;
        }
    }

    if (!foundStartOfAnnouncement) {
      return "اطلاعیه خاموشی پیدا نشد. (اشکالی ندارد، ممکن است امروز اطلاعیه‌ای نباشد)";
    }

    // *** بخش کلیدی: ساخت پیام دیباگ ***
    const debugMessage = `
--- [اطلاعات خام برای دیباگ] ---
لطفاً این متن را به طور کامل کپی کرده و برای توسعه‌دهنده ارسال کنید.

[شروع اطلاعات]
${latestAnnouncementContent}
[پایان اطلاعات]
`;
    
    return debugMessage;

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
    console.error("خطا: توکن ربات یا آیدی چت در سکرت‌های گیت‌האב تعریف نشده است!");
    process.exit(1);
  }

  const message = await getRawAnnouncementText();
  console.log("\n✅ --- پیام دیباگ آماده شد --- ✅\n");
  console.log(message);
  
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    console.log("\n🚀 در حال ارسال پیام دیباگ به تلگرام...");
    await axios.post(telegramApiUrl, { 
      chat_id: TELEGRAM_CHAT_ID, 
      text: message 
    }, { timeout: 10000 });
    console.log("✅ پیام دیباگ با موفقیت به تلگرام ارسال شد.");
  } catch (error) {
    console.error("❌ خطا در ارسال پیام به تلگرام:", error.response?.data || error.message);
    process.exit(1);
  }
}

main();
