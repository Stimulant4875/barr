import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

// --- تابع اصلی (بدون تغییر) ---
async function getUnfilteredAnnouncementText() {
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
    
    console.log("پیام‌ها ظاهر شدند. در حال استخراج محتوای HTML...");
    const htmlContent = await page.content();
    
    const dom = new JSDOM(htmlContent);
    const messagesNodeList = dom.window.document.querySelectorAll('div.channel-message-text');

    if (messagesNodeList.length === 0) {
      return "خطا: هیچ پیامی در صفحه پیدا نشد.";
    }

    const messages = Array.from(messagesNodeList).reverse();
    let latestAnnouncementContent = "";
    let foundStartOfAnnouncement = false;
    const startPostRegex = /برنامه خاموشی.*(\d{4}\/\d{2}\/\d{2})/;

    for (const msg of messages) {
        msg.innerHTML = msg.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        const currentText = msg.textContent.trim();
        if (startPostRegex.test(currentText)) {
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
      return "اطلاعیه خاموشی پیدا نشد. (ممکن است امروز اطلاعیه‌ای نباشد)";
    }
    
    return latestAnnouncementContent;

  } catch (error) {
    console.error("خطا در فرآیند وب‌گردی:", error);
    return `متاسفانه در دریافت اطلاعات مشکلی پیش آمد: ${error.message}`;
  } finally {
    if (browser) await browser.close();
    console.log("فرآیند وب‌گردی تمام شد.");
  }
}

// --- اجرای اصلی برنامه (با منطق تقسیم پیام) ---
async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("خطا: توکن ربات یا آیدی چت در سکرت‌های گیت‌האב تعریف نشده است!");
    process.exit(1);
  }

  const fullMessage = await getUnfilteredAnnouncementText();
  console.log("\n✅ --- متن خام اطلاعیه آماده شد --- ✅\n");
  console.log(fullMessage);
  
  // --- بخش جدید: تقسیم پیام به قطعات کوچکتر ---
  const messageChunks = [];
  for (let i = 0; i < fullMessage.length; i += MAX_TELEGRAM_MESSAGE_LENGTH) {
    messageChunks.push(fullMessage.substring(i, i + MAX_TELEGRAM_MESSAGE_LENGTH));
  }
  
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    console.log(`\n🚀 پیام به ${messageChunks.length} بخش تقسیم شد. در حال ارسال...`);
    
    // ارسال هر قطعه به صورت جداگانه
    for (const chunk of messageChunks) {
      await axios.post(telegramApiUrl, { 
        chat_id: TELEGRAM_CHAT_ID, 
        text: chunk 
      }, { timeout: 10000 });
      console.log("یک بخش با موفقیت ارسال شد.");
      // یک تاخیر کوچک برای جلوگیری از مشکلات احتمالی
      await new Promise(resolve => setTimeout(resolve, 500)); 
    }

    console.log("✅ تمام بخش‌های پیام با موفقیت به تلگرام ارسال شد.");
  } catch (error) {
    console.error("❌ خطا در ارسال پیام به تلگرام:", error.response?.data || error.message);
    process.exit(1);
  }
}

main();
