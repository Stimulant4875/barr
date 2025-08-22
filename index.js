import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';

// --- تنظیمات سراسری (بدون تغییر) ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

// --- تابع دریافت اطلاعات (بدون تغییر) ---
async function getRawAnnouncementText() {
  console.log("شروع فرآیند وب‌گردی...");
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.goto(SPLUS_URL, { waitUntil: "networkidle2", timeout: 90000 });
    await page.waitForSelector('div.channel-message-text', { timeout: 30000 });
    const htmlContent = await page.content();
    const dom = new JSDOM(htmlContent);
    const allMessages = Array.from(dom.window.document.querySelectorAll('div.channel-message-text'));
    if (allMessages.length === 0) return "خطا: هیچ پیامی در صفحه پیدا نشد.";
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
    if (latestAnnouncementStartIndex === -1) return "اطلاعیه خاموشی پیدا نشد.";
    const announcementPosts = [];
    for (let i = latestAnnouncementStartIndex; i < allMessages.length; i++) {
      const currentText = allMessages[i].textContent.trim();
      if (i > latestAnnouncementStartIndex && startPostRegex.test(currentText)) break;
      announcementPosts.push(currentText);
    }
    return announcementPosts.join("\n\n");
  } catch (error) {
    console.error("خطا در فرآیند وب‌گردی:", error);
    return `متاسفانه در دریافت اطلاعات مشکلی پیش آمد: ${error.message}`;
  } finally {
    if (browser) await browser.close();
    console.log("فرآیند وب‌گردی تمام شد.");
  }
}

// *** تابع جدید برای فیلتر، گروه‌بندی و خلاصه‌سازی ***
function processAndSummarizeAnnouncement(fullText) {
  console.log("شروع فرآیند خلاصه‌سازی و مرتب‌سازی...");

  // ۱. تعریف گروه‌های مورد نظر با یک نام دلخواه
  const locationGroups = [
    {
      name: "📍 گروه ۱ (خیرآباد، کشیگ و...)",
      keywords: ['خیرآباد', 'کشیگ']
    },
    {
      name: "📍 گروه ۲ (زیرک‌آباد، پوزک و...)",
      keywords: ['زیرک‌آباد', 'پوزک']
    }
  ];

  const lines = fullText.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return fullText;

  const title = lines[0]; // عنوان اصلی اطلاعیه
  const summary = {}; // آبجکتی برای نگهداری نتایج

  // ۲. پیدا کردن زمان‌ها برای هر گروه
  for (let i = 1; i < lines.length; i++) {
    const currentLine = lines[i];
    const timeLine = lines[i + 1]; // خط زمان، خط بعدی است

    if (!timeLine) continue; // اگر خط بعدی وجود نداشت، ادامه بده

    for (const group of locationGroups) {
      // اگر خط فعلی شامل تمام کلمات کلیدی یک گروه بود
      if (group.keywords.every(keyword => currentLine.includes(keyword))) {
        if (!summary[group.name]) {
          summary[group.name] = []; // اگر گروه برای اولین بار پیدا شد، یک آرایه برایش بساز
        }
        summary[group.name].push(timeLine.trim()); // زمان را به آرایه آن گروه اضافه کن
        break; // وقتی گروه پیدا شد، نیازی به چک کردن بقیه گروه‌ها برای این خط نیست
      }
    }
  }

  // ۳. ساختن متن خروجی زیبا و خلاصه
  if (Object.keys(summary).length === 0) {
    return `${title}\n---\nدر اطلاعیه امروز، خاموشی برای مناطق مورد نظر شما پیدا نشد.`;
  }

  let formattedMessage = `📢 **خلاصه برنامه خاموشی‌های احتمالی**\n${title}\n\n`;
  for (const groupName in summary) {
    formattedMessage += `${groupName}\n`;
    formattedMessage += `⏰ **خاموشی در ساعت‌های:**\n`;
    summary[groupName].forEach(time => {
      formattedMessage += ` - ${time}\n`;
    });
    formattedMessage += `\n---\n`;
  }
  
  return formattedMessage;
}


// --- اجرای اصلی برنامه (با تغییر برای فراخوانی تابع جدید) ---
async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("خطا: توکن ربات یا آیدی چت تعریف نشده است!");
    process.exit(1);
  }

  const rawMessage = await getRawAnnouncementText();
  console.log("\n✅ --- متن خام اطلاعیه دریافت شد --- ✅\n");
  
  // *** اینجا تابع جدید خلاصه‌سازی را فراخوانی می‌کنیم ***
  const summarizedMessage = processAndSummarizeAnnouncement(rawMessage);
  console.log("✅ --- متن خلاصه شده آماده ارسال --- ✅\n");
  console.log(summarizedMessage);

  const messageChunks = [];
  // *** از summarizedMessage برای ارسال استفاده می‌کنیم ***
  if (summarizedMessage.length > 0) {
    for (let i = 0; i < summarizedMessage.length; i += MAX_TELEGRAM_MESSAGE_LENGTH) {
      messageChunks.push(summarizedMessage.substring(i, i + MAX_TELEGRAM_MESSAGE_LENGTH));
    }
  } else {
    messageChunks.push("متنی برای ارسال یافت نشد.");
  }
  
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    console.log(`\n🚀 در حال ارسال پیام به تلگرام...`);
    for (const chunk of messageChunks) {
      await axios.post(telegramApiUrl, { 
        chat_id: TELEGRAM_CHAT_ID, 
        text: chunk,
        parse_mode: 'Markdown' // *** این گزینه برای نمایش درست *bold* اضافه شد ***
      }, { timeout: 10000 });
    }
    console.log("✅ پیام با موفقیت به تلگرام ارسال شد.");
  } catch (error) {
    console.error("❌ خطا در ارسال پیام به تلگرام:", error.response?.data || error.message);
  }
}

main();
