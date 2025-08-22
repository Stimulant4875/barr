import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

// --- تابع اصلی دریافت اطلاعات (بدون تغییر) ---
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
    const allMessages = Array.from(dom.window.document.querySelectorAll('div.channel-message-text'));

    if (allMessages.length === 0) {
      return "خطا: هیچ پیامی در صفحه پیدا نشد.";
    }

    const startPostRegex = /برنامه خاموشی.*(\d{4}\/\d{2}\/\d{2})/;
    let latestAnnouncementStartIndex = -1;

    for (let i = allMessages.length - 1; i >= 0; i--) {
        const msg = allMessages[i];
        msg.innerHTML = msg.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        const currentText = msg.textContent.trim();
        if (startPostRegex.test(currentText)) {
            latestAnnouncementStartIndex = i;
            break;
        }
    }

    if (latestAnnouncementStartIndex === -1) {
      return "اطلاعیه خاموشی پیدا نشد. (ممکن است امروز اطلاعیه‌ای نباشد)";
    }

    const announcementPosts = [];
    for (let i = latestAnnouncementStartIndex; i < allMessages.length; i++) {
        const currentText = allMessages[i].textContent.trim();
        if (i > latestAnnouncementStartIndex && startPostRegex.test(currentText)) {
            break;
        }
        announcementPosts.push(currentText);
    }
    
    const latestAnnouncementContent = announcementPosts.join("\n\n");
    return latestAnnouncementContent;

  } catch (error) {
    console.error("خطا در فرآیند وب‌گردی:", error);
    return `متاسفانه در دریافت اطلاعات مشکلی پیش آمد: ${error.message}`;
  } finally {
    if (browser) await browser.close();
    console.log("فرآیند وب‌گردی تمام شد.");
  }
}


// *** تابع جدید برای فیلتر کردن متن اطلاعیه ***
function filterAnnouncement(fullText) {
  console.log("در حال فیلتر کردن متن اطلاعیه...");

  // لیست کلمات کلیدی که باید در یک خط باشند تا آن خط انتخاب شود
  // این کار باعث می‌شود که اگر فرمت کمی تغییر کرد، کد همچنان درست کار کند
  const targetKeywords = [
    // گروه اول: باید شامل "زیرک‌آباد" و "پوزک" باشد
    ['زیرک‌آباد', 'پوزک'], 
    // گروه دوم: باید شامل "خیرآباد" و "کشیگ" باشد
    ['خیرآباد', 'کشیگ']   
  ];

  const lines = fullText.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) {
    return fullText; // اگر متن کوتاه یا غیرعادی بود، همان را برگردان
  }

  const filteredResult = [];
  // خط اول که معمولا عنوان و تاریخ است را نگه می‌داریم
  const title = lines[0];
  filteredResult.push(title);
  filteredResult.push('---'); // یک جداکننده برای خوانایی

  let foundMatch = false;

  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i];

    // بررسی می‌کنیم که آیا خط فعلی با یکی از گروه‌های کلمات کلیدی ما مطابقت دارد یا خیر
    const isMatch = targetKeywords.some(group => 
      group.every(keyword => currentLine.includes(keyword))
    );

    if (isMatch) {
      foundMatch = true;
      // خطی که مناطق را مشخص کرده اضافه کن
      filteredResult.push(currentLine);
      // خط بعدی که زمان را مشخص کرده هم اضافه کن
      if (i + 1 < lines.length) {
        filteredResult.push(lines[i + 1]);
        filteredResult.push(''); // یک خط خالی برای جداسازی و خوانایی بهتر
      }
    }
  }

  // اگر هیچ موردی پیدا نشد، یک پیام مناسب برگردان
  if (!foundMatch) {
    return `${title}\n---\nدر اطلاعیه امروز، خاموشی برای مناطق مورد نظر شما پیدا نشد.`;
  }

  return filteredResult.join('\n');
}


// --- اجرای اصلی برنامه (با تغییر کوچک برای اعمال فیلتر) ---
async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("خطا: توکن ربات یا آیدی چت تعریف نشده است!");
    process.exit(1);
  }

  const rawMessage = await getRawAnnouncementText();
  console.log("\n✅ --- متن خام اطلاعیه دریافت شد --- ✅\n");
  
  // *** اینجا فیلتر را اعمال می‌کنیم ***
  const filteredMessage = filterAnnouncement(rawMessage);
  console.log("✅ --- متن فیلتر شده آماده ارسال --- ✅\n");
  console.log(filteredMessage);

  const messageChunks = [];
  // *** به جای fullMessage از filteredMessage استفاده می‌کنیم ***
  if (filteredMessage.length > 0) {
      for (let i = 0; i < filteredMessage.length; i += MAX_TELEGRAM_MESSAGE_LENGTH) {
        messageChunks.push(filteredMessage.substring(i, i + MAX_TELEGRAM_MESSAGE_LENGTH));
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
