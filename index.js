import puppeteer from 'puppeteer';
import axios from 'axios';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

/**
 * این تابع متن خام اطلاعیه را دریافت کرده و آن را به یک ساختار منظم و قالب‌بندی شده تبدیل می‌کند.
 * @param {string} rawText - متن خام و کامل اطلاعیه.
 * @returns {string} - پیام قالب‌بندی شده برای ارسال به تلگرام.
 */
function parseAndFormatAnnouncement(rawText) {
  console.log("شروع تحلیل و قالب‌بندی متن اطلاعیه...");

  // حذف بخش‌های اضافی بالا و پایین اطلاعیه
  const announcementBody = rawText
    .replace(/--- \[متن خام اطلاعیه برای تحلیل نهایی\] ---/g, '')
    .split('« اطلاع رسانی مدیریت برق شهرستان نیکشهر »')[0]
    .trim();

  const lines = announcementBody.split('\n').filter(line => line.trim() !== '');

  const title = lines[0].trim();
  const scheduleItems = [];
  let currentItem = null;

  // Regex برای تشخیص خطوط زمان (e.g., "08:00 تا 10:00")
  const timeRegex = /^\s*\d{2}:\d{2}\s*تا\s*\d{2}:\d{2}\s*$/;
  // Regex برای تشخیص شروع یک آیتم جدید (e.g., "1 - ", "22 - ")
  const itemStartRegex = /^\s*\d+\s*-\s*/;

  for (const line of lines.slice(1)) { // از خط بعد از عنوان شروع می‌کنیم
    const trimmedLine = line.trim();

    if (itemStartRegex.test(trimmedLine)) {
      // اگر آیتم جدیدی شروع شد، آیتم قبلی را (اگر وجود داشت) ذخیره می‌کنیم
      if (currentItem) {
        scheduleItems.push(currentItem);
      }
      // شروع آیتم جدید
      currentItem = {
        description: [trimmedLine.replace(itemStartRegex, '')],
        time: null
      };
    } else if (timeRegex.test(trimmedLine)) {
      // اگر به خط زمان رسیدیم، آن را به آیتم فعلی اضافه می‌کنیم
      if (currentItem) {
        currentItem.time = trimmedLine;
      }
    } else {
      // اگر خط معمولی بود، به توضیحات آیتم فعلی اضافه می‌کنیم
      if (currentItem) {
        currentItem.description.push(trimmedLine);
      }
    }
  }

  // ذخیره آخرین آیتم پس از پایان حلقه
  if (currentItem) {
    scheduleItems.push(currentItem);
  }

  if (scheduleItems.length === 0) {
    console.log("هیچ برنامه خاموشی معتبری برای قالب‌بندی پیدا نشد.");
    return "برنامه خاموشی مشخصی در متن اطلاعیه پیدا نشد.";
  }

  // ساخت پیام نهایی
  let formattedMessage = `📢 *${title}*\n\n`;
  formattedMessage += "----------------------------------------\n\n";

  for (const item of scheduleItems) {
    if (item.time) {
      formattedMessage += `*⏰ زمان خاموشی: ${item.time}*\n\n`;
      formattedMessage += `📍 *مناطق:* \n`;
      // توضیحات هر آیتم را به صورت یک پاراگراف تمیز نمایش می‌دهیم
      formattedMessage += item.description.join(' ').replace(/\s+/g, ' ').trim();
      formattedMessage += "\n\n----------------------------------------\n\n";
    }
  }
  
  console.log("قالب‌بندی با موفقیت انجام شد.");
  return formattedMessage;
}


// --- تابع اصلی (برای استخراج متن خام اطلاعیه) ---
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
    return `--- [متن خام اطلاعیه برای تحلیل نهایی] ---\n\n${latestAnnouncementContent}`;

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
  
  // بررسی اینکه آیا پیام خطا است یا خیر
  if (rawMessage.startsWith("خطا:") || rawMessage.startsWith("متاسفانه") || rawMessage.startsWith("اطلاعیه خاموشی پیدا نشد")) {
      console.log("پیام خطا یا اطلاع‌رسانی دریافت شد. ارسال مستقیم به تلگرام...");
      await sendToTelegram(rawMessage);
      return;
  }
  
  console.log("\n✅ --- متن خام با موفقیت دریافت شد. شروع تحلیل... --- ✅\n");
  const formattedMessage = parseAndFormatAnnouncement(rawMessage);

  await sendToTelegram(formattedMessage);
}

/**
 * پیام را به بخش‌های کوچک‌تر تقسیم کرده و به تلگرام ارسال می‌کند.
 * @param {string} text - متنی که باید ارسال شود.
 */
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
        parse_mode: 'Markdown' // فعال کردن قالب‌بندی Markdown
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
