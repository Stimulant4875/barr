import puppeteer from 'puppeteer';
import axios from 'axios';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

/**
 * این تابع متن خام اطلاعیه را دریافت کرده، آن را بر اساس روستاهای مشخص شده فیلتر می‌کند
 * و یک پیام قالب‌بندی شده و اختصاصی تولید می‌کند.
 * @param {string} rawText - متن خام و کامل اطلاعیه.
 * @returns {string} - پیام فیلتر شده برای ارسال به تلگرام.
 */
function parseAndFilterAnnouncement(rawText) {
  console.log("شروع تحلیل و فیلتر کردن متن اطلاعیه...");

  const announcementBody = rawText
    .replace(/--- \[.*\] ---/g, '')
    .split('« اطلاع رسانی مدیریت برق شهرستان نیکشهر »')[0]
    .trim();

  const lines = announcementBody.split('\n').filter(line => line.trim() !== '');

  const titleLine = lines[0] || "برنامه خاموشی";
  const scheduleItems = [];
  let currentItem = null;

  const timeRegex = /^\s*\d{2}:\d{2}\s*تا\s*\d{2}:\d{2}\s*$/;
  const itemStartRegex = /^\s*\d+\s*-\s*/;

  for (const line of lines.slice(1)) {
    const trimmedLine = line.trim();
    if (itemStartRegex.test(trimmedLine)) {
      if (currentItem) scheduleItems.push(currentItem);
      currentItem = {
        description: [trimmedLine.replace(itemStartRegex, '')],
        time: null
      };
    } else if (timeRegex.test(trimmedLine)) {
      if (currentItem) currentItem.time = trimmedLine;
    } else {
      if (currentItem) currentItem.description.push(trimmedLine);
    }
  }
  if (currentItem) scheduleItems.push(currentItem);
  
  // --- مرحله فیلترینگ ---
  console.log(`تعداد کل موارد یافت شده: ${scheduleItems.length}. شروع فیلترینگ...`);

  const filterTargets = [
    { village: "زیرک آباد", group_identifier: "روستاهای زیرک آباد" },
    { village: "کهورکان", group_identifier: "روستاهای خیرآباد" }
  ];
  
  const filteredResults = [];

  for (const item of scheduleItems) {
    const descriptionText = item.description.join(' ').trim();
    for (const target of filterTargets) {
      // بررسی می‌کنیم که آیا توضیحات شامل گروه مورد نظر ما هست یا خیر
      if (descriptionText.includes(target.group_identifier)) {
        filteredResults.push({
          village: target.village,
          time: item.time
        });
        // پس از یافتن، از جستجو در این آیتم خارج می‌شویم
        break; 
      }
    }
  }

  // --- ساخت پیام نهایی ---
  if (filteredResults.length === 0) {
    console.log("هیچ یک از روستاهای مورد نظر در لیست خاموشی یافت نشد.");
    // استخراج تاریخ از عنوان اصلی
    const dateMatch = titleLine.match(/(\d{4}\/\d{2}\/\d{2})/);
    const dateText = dateMatch ? `مورخ ${dateMatch[1]}` : '';
    return `✅ اطلاعیه ${dateText} بررسی شد.\n\nروستاهای مورد نظر شما (زیرک آباد، کهورکان) در لیست خاموشی امروز قرار ندارند.`;
  }

  let formattedMessage = `📢 *نتیجه فیلتر برنامه خاموشی*\n\n`;
  formattedMessage += `*(فقط موارد مربوط به روستاهای زیرک آباد و کهورکان)*\n`;
  formattedMessage += "----------------------------------------\n\n";

  for (const result of filteredResults) {
    formattedMessage += `*📍 روستا: ${result.village}*\n`;
    formattedMessage += `*⏰ زمان خاموشی: ${result.time}*\n\n`;
    formattedMessage += "----------------------------------------\n\n";
  }
  
  console.log("قالب‌بندی پیام فیلتر شده با موفقیت انجام شد.");
  return formattedMessage;
}


// --- تابع اصلی (برای استخراج متن خام اطلاعیه) ---
// این تابع بدون تغییر باقی می‌ماند
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
  
  if (rawMessage.startsWith("خطا:") || rawMessage.startsWith("متاسفانه") || rawMessage.startsWith("اطلاعیه خاموشی پیدا نشد")) {
      console.log("پیام خطا یا اطلاع‌رسانی دریافت شد. ارسال مستقیم به تلگرام...");
      await sendToTelegram(rawMessage);
      return;
  }
  
  console.log("\n✅ --- متن خام با موفقیت دریافت شد. شروع فیلتر... --- ✅\n");
  const filteredMessage = parseAndFilterAnnouncement(rawMessage);

  await sendToTelegram(filteredMessage);
}

/**
 * پیام را به بخش‌های کوچک‌تر تقسیم کرده و به تلگرام ارسال می‌کند.
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
        parse_mode: 'Markdown'
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
