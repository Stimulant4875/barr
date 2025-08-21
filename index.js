import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';
import axios from 'axios';
import fs from 'fs';

// --- تنظیمات سراسری ---
const SPLUS_URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// --- تابع اصلی وب‌گردی ---
async function checkPowerOutage() {
  console.log("شروع فرآیند وب‌گردی...");
  
  let browser;
  let page;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote']
    });
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log(`در حال رفتن به صفحه: ${SPLUS_URL}`);
    await page.goto(SPLUS_URL, { waitUntil: "networkidle2", timeout: 90000 });
    console.log("صفحه بارگذاری شد. در حال استخراج محتوای HTML...");
    const htmlContent = await page.content();
    
    const dom = new JSDOM(htmlContent);
    const messagesNodeList = dom.window.document.querySelectorAll('div.channel-message-text');

    if (messagesNodeList.length === 0) {
      console.log("هیچ پستی با سلکتور 'div.channel-message-text' یافت نشد. در حال ایجاد فایل‌های دیباگ...");
      if (!fs.existsSync('./debug')) fs.mkdirSync('./debug');
      await page.screenshot({ path: './debug/screenshot.png', fullPage: true });
      fs.writeFileSync('./debug/page.html', htmlContent);
      console.log("فایل‌های screenshot.png و page.html با موفقیت در پوشه debug ذخیره شدند.");
      return "هیچ پستی در کانال یافت نشد. (فایل‌های دیباگ ایجاد شد)";
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
      return "پیام‌ها با موفقیت یافت شدند، اما هیچ پست اطلاعیه خاموشی جدیدی در بین آن‌ها پیدا نشد.";
    }

    const targetAreas = [
      { searchKeyword: "خیرآباد", customName: "کهورکان", times: [] },
      { searchKeyword: "زیرک آباد", customName: "زیرک آباد", times: [] },
    ];
    const lines = latestAnnouncementContent.split('\n').map(line => line.trim()).filter(line => line);
    lines.forEach((line, i) => {
        targetAreas.forEach(area => {
            if (line.includes(area.searchKeyword)) {
                for (let j = i + 1; j < i + 5 && j < lines.length; j++) {
                    const timeMatch = lines[j].match(/(\d{2}:\d{2}\s*تا\s*\d{2}:\d{2})/);
                    if (timeMatch && timeMatch[1]) {
                        const timeStr = timeMatch[1].trim();
                        if (!area.times.includes(timeStr)) area.times.push(timeStr);
                        break;
                    }
                }
            }
        });
    });

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
    if (page) {
        console.log("تلاش برای گرفتن اسکرین‌شات پس از خطا...");
        if (!fs.existsSync('./debug')) fs.mkdirSync('./debug');
        await page.screenshot({ path: './debug/error_screenshot.png', fullPage: true });
        console.log("اسکرین‌شات خطا ذخیره شد.");
    }
    return "متاسفانه در دریافت اطلاعات مشکلی پیش آمد. جزئیات خطا در لاگ ثبت شد.";
  } finally {
    if (browser) await browser.close();
    console.log("فرآیند وب‌گردی تمام شد.");
  }
}

// --- اجرای اصلی برنامه ---
async function main() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("خطا: توکن ربات یا آیدی چت در سکرت‌های گیت‌هاب تعریف نشده است!");
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
