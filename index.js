import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// --- تابع اصلی ---
async function checkPowerOutage() {
  console.log("شروع فرآیند وب‌گردی با منطق نهایی و فیلترهای دقیق...");
  
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
      return "خطای غیرمنتظره: هیچ پیامی در صفحه پیدا نشد.";
    }

    const startPostRegex = /برنامه خاموشی.*(\d{4}\/\d{2}\/\d{2})/;
    let latestAnnouncementStartIndex = -1;
    let finalDate = "";

    for (let i = allMessages.length - 1; i >= 0; i--) {
        const currentText = allMessages[i];
        if (startPostRegex.test(currentText)) {
            latestAnnouncementStartIndex = i;
            finalDate = currentText.match(startPostRegex)[1];
            break;
        }
    }

    if (latestAnnouncementStartIndex === -1) {
      return "پیام‌های کانال خوانده شد، اما هیچ پست اطلاعیه خاموشی جدیدی پیدا نشد.";
    }

    const announcementPosts = [];
    for (let i = latestAnnouncementStartIndex; i < allMessages.length; i++) {
        const currentText = allMessages[i];
        if (i > latestAnnouncementStartIndex && startPostRegex.test(currentText)) {
            break;
        }
        announcementPosts.push(currentText);
    }
    const latestAnnouncementContent = announcementPosts.join("\n\n");

    // --- منطق جدید و دقیق برای تحلیل متن بر اساس مثال‌های شما ---
    console.log("اطلاعیه خام پیدا شد. در حال تحلیل با منطق نهایی...");
    
    // **شناسه‌های جدید و دقیق برای هر گروه**
    const targetAreas = [
      { 
        searchKeywords: ["بخش مرکزی : روستاهای خیرآباد", "سد خیرآباد", "هیتک"], // چند کلمه کلیدی برای اطمینان
        customName: "کهورکان", 
        times: [] 
      },
      { 
        searchKeywords: ["بخش مرکزی : روستاهای زیرک‌آباد", "رئیس‌کلگ", "جلایی‌کلگ"], // چند کلمه کلیدی برای اطمینان
        customName: "زیرک آباد", 
        times: [] 
      },
    ];
    targetAreas.forEach(area => area.times = []);

    const lines = latestAnnouncementContent.split('\n').map(line => line.trim()).filter(line => line);
    
    lines.forEach((line, i) => {
      // ۱. بررسی می‌کنیم آیا خط فعلی، تعریف یکی از گروه‌های ماست؟
      const areaInThisLine = targetAreas.find(area => 
        area.searchKeywords.some(keyword => line.includes(keyword))
      );

      if (areaInThisLine) {
        // ۲. اگر بود، شروع به خواندن خطوط بعدی می‌کنیم
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j];

          // ۳. آیا خط بعدی، تعریف یک گروه دیگر است؟
          // اگر بله، یعنی بخش مربوط به گروه فعلی تمام شده است.
          const isNextLineAnotherArea = targetAreas.some(area => 
            area.searchKeywords.some(keyword => nextLine.includes(keyword))
          );
          if (isNextLineAnotherArea) {
            break; // جستجو برای این گروه را متوقف کن
          }

          // ۴. آیا خط بعدی شامل زمان خاموشی است؟
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
            messageBody += `\n📍 گروه روستاهای ${area.customName}:\n`; // تغییر کوچک برای وضوح بیشتر
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

// --- اجرای اصلی برنامه (بدون تغییر) ---
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
