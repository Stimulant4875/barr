import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// --- تابع اصلی ---
async function checkPowerOutage() {
  console.log("شروع فرآیند وب‌گردی با منطق نهایی و اصلاح شده...");
  
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
      return "خطای غیرمنتظره: هیچ پیامی در صفحه پیدا نشد.";
    }

    const startPostRegex = /برنامه خاموشی.*(\d{4}\/\d{2}\/\d{2})/;
    let latestAnnouncementStartIndex = -1;
    let finalDate = "";

    for (let i = allMessages.length - 1; i >= 0; i--) {
        const msg = allMessages[i];
        msg.innerHTML = msg.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        const currentText = msg.textContent.trim();
        if (startPostRegex.test(currentText)) {
            latestAnnouncementStartIndex = i;
            // *** اصلاحیه ۱: استخراج صحیح تاریخ ***
            // ما فقط گروه اول (خود تاریخ) را از نتیجه match استخراج می‌کنیم
            finalDate = currentText.match(startPostRegex)[1];
            break;
        }
    }

    if (latestAnnouncementStartIndex === -1) {
      return "پیام‌های کانال خوانده شد، اما هیچ پست اطلاعیه خاموشی جدیدی پیدا نشد.";
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

    console.log("اطلاعیه خام پیدا شد. در حال تحلیل با منطق نهایی...");
    const targetAreas = [
      { searchKeyword: "خیرآباد", customName: "کهورکان", times: [] },
      { searchKeyword: "زیرک آباد", customName: "زیرک آباد", times: [] },
    ];
    targetAreas.forEach(area => area.times = []);

    const lines = latestAnnouncementContent.split('\n').map(line => line.trim()).filter(line => line);
    
    lines.forEach((line, i) => {
      const areaInThisLine = targetAreas.find(area => line.includes(area.searchKeyword));

      if (areaInThisLine) {
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];
          if (nextLine.includes(':')) {
            break;
          }
          // *** اصلاحیه ۲: استخراج صحیح زمان خاموشی ***
          const timeMatch = nextLine.match(/(\d{2}:\d{2}\s*تا\s*\d{2}:\d{2})/);
          if (timeMatch && timeMatch[1]) {
            const timeStr = timeMatch[1].trim();
            if (!areaInThisLine.times.includes(timeStr)) {
              areaInThisLine.times.push(timeStr);
            }
          }
        }
      }
    });

    // --- ساخت پیام نهایی (بدون تغییر) ---
    const newHeader = `💡 گزارش برنامه خاموشی برای تاریخ: ${finalDate} 💡`;
    let messageBody = "";
    let foundAnyResults = false;
    const turnLabels = ["نوبت اول", "نوبت دوم", "نوبت سوم", "نوبت چهارم", "نوبت پنجم"];
    targetAreas.forEach(area => {
        if (area.times.length > 0) {
            foundAnyResults = true;
            messageBody += `\n📍 روستای ${area.customName}:\n`;
            const sortedTimes = area.times.sort();
            sortedTimes.forEach((time, index) => {
                const label = turnLabels[index] || `نوبت ${index + 1}`;
                messageBody += `${label}: از ساعت ${time.replace("تا", "تا ساعت")}\n`;
            });
        }
    });

    let finalMessage = newHeader + "\n";
    if (foundAnyResults) {
      finalMessage += messageBody;
    } else {
      const areaNames = targetAreas.map(a => `"${a.customName}"`).join(' و ');
      finalMessage += `\nبرای مناطق مشخص شده شما (${areaNames})، برنامه‌ای یافت نشد.`;
    }
    return finalMessage.trim();

  } catch (error) {
    console.error("خطا در فرآیند وب‌گردی:", error);
    return "متاسفانه در دریافت اطلاعات مشکلی پیش آمد.";
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

  const message = await checkPowerOutage();
  console.log("\n✅ --- پیام نهایی آماده شد --- ✅\n");
  console.log(message);
  
  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    console.log("\n🚀 در حال ارسال پیام به تلگرام...");
    await axios.post(telegramApiUrl, { 
      chat_id: TELEGRAM_CHAT_ID, 
      text: message 
    }, { timeout: 10000 });
    console.log("✅ پیام با موفقیت به تلگرام ارسال شد.");
  } catch (error) {
    console.error("❌ خطا در ارسال پیام به تلگرام:", error.response?.data || error.message);
    process.exit(1);
  }
}

main();
