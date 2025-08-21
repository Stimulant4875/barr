import http from 'http'; // ماژول داخلی برای ساخت وب سرور
import puppeteer from "puppeteer";
import { JSDOM } from "jsdom";

// تابع اصلی شما بدون تغییر باقی می‌ماند
async function checkPowerOutage() {
  console.log("--- [شروع فرآیند بررسی خاموشی] ---");
  const url = "https://splus.ir/Tozie_Barq_Nikshahar_ir";
  // ... (بقیه کد تابع checkPowerOutage دقیقاً مثل قبل است)
  // ... من آن را برای خلاصه‌سازی حذف کرده‌ام، شما کد کامل قبلی را اینجا قرار دهید
  const targetAreas = [
    { searchKeyword: "خیرآباد", customName: "کهورکان", times: [] },
    { searchKeyword: "زیرک آباد", customName: "زیرک آباد", times: [] }
  ];

  let browser;
  let htmlContent = "";
  console.log("🚀 [۱/۵] در حال آماده‌سازی مرورگر مجازی (Puppeteer)...");
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process'
      ],
    });
    const page = await browser.newPage();
    console.log(`🌎 [۲/۵] در حال باز کردن صفحه وب: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
    console.log("⏳ [۳/۵] در حال انتظار برای بارگذاری کامل محتوای پیام‌ها...");
    await page.waitForSelector('div.channel-message-text', { timeout: 45000 });
    htmlContent = await page.content();
    console.log("✅ [۴/۵] محتوای صفحه با موفقیت دریافت شد.");
  } catch (error) {
    console.error("❌ خطای بحرانی در حین اجرای Puppeteer:", error);
    throw new Error("خطا در دریافت اطلاعات از صفحه وب: " + error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log("🚪 مرورگر مجازی بسته شد.");
    }
  }

  const dom = new JSDOM(htmlContent);
  const messagesNodeList = dom.window.document.querySelectorAll('div.channel-message-text');

  if (messagesNodeList.length === 0) {
    return "نتیجه: هیچ پستی در صفحه کانال یافت نشد.";
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
    return "نتیجه: هیچ اطلاعیه برنامه خاموشی جدیدی یافت نشد.";
  }
  
  console.log(`🔍 [۵/۵] در حال تحلیل محتوای اطلاعیه برای تاریخ: ${finalDate}`);
  const lines = latestAnnouncementContent.split('\n').map(line => line.trim()).filter(line => line);
  
  lines.forEach((line, i) => {
    targetAreas.forEach(area => {
      if (line.includes(area.searchKeyword)) {
        for (let j = i + 1; j < i + 5 && j < lines.length; j++) {
          const timeMatch = lines[j].match(/(\d{2}:\d{2}\s*تا\s*\d{2}:\d{2})/);
          if (timeMatch && timeMatch[1]) {
            const timeStr = timeMatch[1].trim();
            if (!area.times.includes(timeStr)) {
              area.times.push(timeStr);
            }
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
}


// --- بخش جدید: وب سرور و اجرای دوره‌ای ---

const PORT = process.env.PORT || 10000; // پورت را از Render می‌گیریم
const CHECK_INTERVAL = 60 * 60 * 1000; // هر 60 دقیقه یک بار (میلی‌ثانیه)

// 1. ساخت وب سرور حداقلی برای زنده نگه داشتن سرویس
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('ربات بررسی خاموشی فعال است. لاگ‌ها را برای خروجی بررسی کنید.');
});

server.listen(PORT, () => {
  console.log(`✅ سرور با موفقیت روی پورت ${PORT} اجرا شد.`);
  console.log(`⏰ اسکریپت هر ${CHECK_INTERVAL / 60000} دقیقه یک بار اجرا خواهد شد.`);
  
  // 2. اجرای تابع برای اولین بار بلافاصله پس از شروع
  console.log("🚀 اجرای اولیه بلافاصله پس از شروع سرور...");
  runCheck();

  // 3. تنظیم اجرای دوره‌ای تابع در آینده
  setInterval(runCheck, CHECK_INTERVAL);
});

// تابعی کمکی برای اجرای بررسی و مدیریت خطاها
async function runCheck() {
  try {
    const message = await checkPowerOutage();
    console.log("\n\n✅ --- پیام نهایی با موفقیت آماده شد --- ✅\n");
    console.log(message);
    console.log("\n--- [پایان فرآیند] ---");
  } catch (error) {
    console.error("\n\n❌ --- خطای نهایی در اجرای اسکریپت --- ❌\n");
    console.error(error);
  }
}
