import puppeteer from 'puppeteer';
import axios from 'axios';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

/**
 * این تابع متن خام اطلاعیه را دریافت، فیلتر، گروه‌بندی و در نهایت
 * با فرمت درخواستی کاربر، قالب‌بندی می‌کند.
 * @param {string} rawText - متن خام و کامل اطلاعیه.
 * @returns {string} - پیام نهایی برای ارسال به تلگرام.
 */
function parseFilterAndFormat(rawText) {
  console.log("شروع تحلیل، فیلتر و قالب‌بندی نهایی...");

  const announcementBody = rawText
    .replace(/--- \[.*\] ---/g, '')
    .split('« اطلاع رسانی مدیریت برق شهرستان نیکشهر »')[0]
    .trim();

  const lines = announcementBody.split('\n').filter(line => line.trim() !== '');
  const titleLine = lines[0] || "برنامه خاموشی";
  
  // مرحله 1: استخراج تمام آیتم‌ها از متن خام
  const scheduleItems = [];
  let currentItem = null;
  const timeRegex = /^\s*(\d{2}:\d{2})\s*تا\s*(\d{2}:\d{2})\s*$/;
  const itemStartRegex = /^\s*\d+\s*-\s*/;

  for (const line of lines.slice(1)) {
    const trimmedLine = line.trim();
    if (itemStartRegex.test(trimmedLine)) {
      if (currentItem) scheduleItems.push(currentItem);
      currentItem = { description: [trimmedLine.replace(itemStartRegex, '')], time: null };
    } else if (timeRegex.test(trimmedLine)) {
      if (currentItem) currentItem.time = trimmedLine;
    } else {
      if (currentItem) currentItem.description.push(trimmedLine);
    }
  }
  if (currentItem) scheduleItems.push(currentItem);

  // مرحله 2: فیلتر کردن فقط برای روستاهای مورد نظر
  console.log(`تعداد کل موارد یافت شده: ${scheduleItems.length}. شروع فیلترینگ...`);
  const filterTargets = [
    { village: "زیرک آباد", group_identifier: "روستاهای زیرک آباد" },
    { village: "کهورکان", group_identifier: "روستاهای خیرآباد" }
  ];
  const filteredResults = [];
  for (const item of scheduleItems) {
    const descriptionText = item.description.join(' ').trim();
    for (const target of filterTargets) {
      if (descriptionText.includes(target.group_identifier)) {
        filteredResults.push({ village: target.village, time: item.time });
        break;
      }
    }
  }

  // مرحله 3: ساخت پیام نهایی
  const dateMatch = titleLine.match(/(\d{4}\/\d{2}\/\d{2})/);
  const dateText = dateMatch ? dateMatch[1] : 'نا مشخص';

  if (filteredResults.length === 0) {
    console.log("هیچ یک از روستاهای مورد نظر در لیست خاموشی یافت نشد.");
    return `✅ اطلاعیه مورخ ${dateText} بررسی شد.\n\nروستاهای مورد نظر شما (زیرک آباد، کهورکان) در لیست خاموشی امروز قرار ندارند.`;
  }

  // مرحله 4: گروه‌بندی نتایج بر اساس نام روستا
  const groupedByVillage = {};
  for (const result of filteredResults) {
    if (!groupedByVillage[result.village]) {
      groupedByVillage[result.village] = [];
    }
    // فقط زمان‌های معتبر را اضافه کن
    if (result.time) {
      groupedByVillage[result.village].push(result.time);
    }
  }

  // مرحله 5: ساخت پیام با فرمت نهایی
  let formattedMessage = `*گزارش برنامه خاموشی برای تاریخ: ${dateText}*\n\n`;
  const turnWords = ["اول", "دوم", "سوم", "چهارم", "پنجم"];

  for (const village in groupedByVillage) {
    formattedMessage += `*روستای ${village}:*\n`;
    const times = groupedByVillage[village];
    
    if (times.length === 0) {
        formattedMessage += `- نوبت خاموشی برای این روستا اعلام نشده است.\n`;
    } else {
        times.forEach((time, index) => {
          const match = time.match(timeRegex);
          if (match) {
            const [, startTime, endTime] = match;
            const turnNumber = turnWords[index] || `شماره ${index + 1}`;
            formattedMessage += `نوبت ${turnNumber}: از ساعت ${startTime} تا ساعت ${endTime}\n`;
          }
        });
    }
    formattedMessage += "\n";
  }

  console.log("قالب‌بندی پیام گروه بندی شده با موفقیت انجام شد.");
  return formattedMessage.trim();
}


// --- تابع اصلی (برای استخراج متن خام اطلاعیه) ---
// این تابع بدون تغییر باقی می‌ماند
async function getRawAnnouncementText() {
  console.log("شروع فرآیند وب‌گردی...");
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(SPLUS_URL, { waitUntil: "networkidle2", timeout: 90000 });
    await page.waitForSelector('div.channel-message-text', { timeout: 30000 });
    const allMessages = await page.$$eval('div.channel-message-text', nodes =>
      nodes.map(n => {
        n.innerHTML = n.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        return n.textContent.trim();
      })
    );
    if (allMessages.length === 0) return "خطا: هیچ پیامی در صفحه پیدا نشد.";
    const startPostRegex = /برنامه خاموشی.*(\d{4}\/\d{2}\/\d{2})/;
    let latestAnnouncementStartIndex = -1;
    for (let i = allMessages.length - 1; i >= 0; i--) {
      if (startPostRegex.test(allMessages[i])) {
        latestAnnouncementStartIndex = i;
        break;
      }
    }
    if (latestAnnouncementStartIndex === -1) return "اطلاعیه خاموشی پیدا نشد.";
    const announcementPosts = [];
    for (let i = latestAnnouncementStartIndex; i < allMessages.length; i++) {
      const currentText = allMessages[i];
      if (i > latestAnnouncementStartIndex && startPostRegex.test(currentText)) break;
      announcementPosts.push(currentText);
    }
    return `--- [متن خام] ---\n\n${announcementPosts.join("\n\n---\n\n")}`;
  } catch (error) {
    console.error("خطا در وب‌گردی:", error);
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
  if (rawMessage.startsWith("خطا:") || rawMessage.startsWith("متاسفانه") || rawMessage.startsWith("اطلاعیه خاموشی پیدا نشد")) {
    await sendToTelegram(rawMessage);
    return;
  }
  const finalMessage = parseFilterAndFormat(rawMessage);
  await sendToTelegram(finalMessage);
}

// --- تابع ارسال به تلگرام ---
async function sendToTelegram(text) {
  const messageChunks = [];
  for (let i = 0; i < text.length; i += MAX_TELEGRAM_MESSAGE_LENGTH) {
    messageChunks.push(text.substring(i, i + MAX_TELEGRAM_MESSAGE_LENGTH));
  }
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    console.log(`\n🚀 پیام به ${messageChunks.length} بخش تقسیم شد. در حال ارسال...`);
    for (const chunk of messageChunks) {
      await axios.post(telegramApiUrl, {
        chat_id: TELEGRAM_CHAT_ID,
        text: chunk,
        parse_mode: 'Markdown'
      }, { timeout: 10000 });
    }
    console.log("✅ پیام با موفقیت به تلگرام ارسال شد.");
  } catch (error) {
    console.error("❌ خطا در ارسال پیام به تلگرام:", error.response?.data || error.message);
    process.exit(1);
  }
}

main();
