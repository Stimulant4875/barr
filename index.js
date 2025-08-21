import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// --- تابع اصلی وب‌گردی ---
async function checkPowerOutage() {
  console.log("شروع فرآیند وب‌گردی با منطق نهایی...");
  
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
      return "خطای غیرمنتظره: هیچ پیامی در صفحه پیدا نشد.";
    }

    const messages = Array.from(messagesNodeList).reverse();
    const announcementPosts = []; // آرایه‌ای برای نگهداری تمام پست‌های مربوط به یک اطلاعیه
    let finalDate = "";
    let foundStartOfAnnouncement = false;
    const startPostRegex = /برنامه خاموشی.*(\d{4}\/\d{2}\/\d{2})/;

    // ۱. پیدا کردن بلوک کامل آخرین اطلاعیه
    for (const msg of messages) {
        msg.innerHTML = msg.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        const currentText = msg.textContent.trim();
        
        if (startPostRegex.test(currentText)) {
            if (!foundStartOfAnnouncement) {
                // این اولین پست شروع است که از آخر پیدا کردیم (پس جدیدترین است)
                finalDate = currentText.match(startPostRegex)[1];
                announcementPosts.push(currentText);
                foundStartOfAnnouncement = true;
            } else {
                // به پست شروع اطلاعیه قدیمی‌تر رسیدیم، پس کار تمام است
                break;
            }
        } else if (foundStartOfAnnouncement) {
            // این یک پست ادامه دهنده است، آن را به ابتدای لیست اضافه می‌کنیم
            announcementPosts.unshift(currentText);
        }
    }
    
    // محتوای کامل اطلاعیه را با چسباندن پست‌ها به هم می‌سازیم
    const latestAnnouncementContent = announcementPosts.join("\n\n");

    if (!foundStartOfAnnouncement) {
      return "پیام‌های کانال خوانده شد، اما هیچ پست اطلاعیه خاموشی جدیدی پیدا نشد.";
    }

    const targetAreas = [
      { searchKeyword: "خیرآباد", customName: "کهورکان", times: [] },
      { searchKeyword: "زیرک آباد", customName: "زیرک آباد", times: [] },
    ];
    targetAreas.forEach(area => area.times = []); // خالی کردن لیست‌ها قبل از هر اجرا

    const lines = latestAnnouncementContent.split('\n').map(line => line.trim()).filter(line => line);
    
    // ۲. منطق جدید و هوشمند برای تحلیل متن
    let currentArea = null; // متغیر برای نگهداری روستایی که در حال پردازش آن هستیم

    lines.forEach(line => {
      // آیا این خط، نام یکی از روستاهای ماست؟
      const foundArea = targetAreas.find(area => line.includes(area.searchKeyword));
      
      if (foundArea) {
        // اگر بله، روستای فعلی را آپدیت می‌کنیم
        currentArea = foundArea;
      }

      // آیا این خط شامل زمان خاموشی است؟
      const timeMatch = line.match(/(\d{2}:\d{2}\s*تا\s*\d{2}:\d{2})/);
      
      // اگر زمان پیدا شد و یک روستای فعلی در حافظه داشتیم
      if (timeMatch && currentArea) {
        const timeStr = timeMatch[1].trim();
        // زمان را به لیست همان روستای فعلی اضافه می‌کنیم
        if (!currentArea.times.includes(timeStr)) {
          currentArea.times.push(timeStr);
        }
      }
      // اگر خط نه نام روستا بود و نه زمان، به سادگی نادیده گرفته می‌شود
    });

    // ۳. ساخت پیام نهایی (بدون تغییر)
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
    return "متاسفانه در دریافت اطلاعات مشکلی پیش آمد. جزئیات خطا در لاگ GitHub Actions ثبت شد.";
  } finally {
    if (browser) await browser.close();
    console.log("فرآیند وب‌گردی تمام شد.");
  }
}

// --- اجرای اصلی برنامه (بدون تغییر) ---
async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("خطا: توکن ربات یا آیدی چت در سکرت‌های گیت‌האב تعریف نشده است!");
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
