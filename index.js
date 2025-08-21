function parseAnnouncement(rawText) {
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

  const timeRegex = /^(\d{2}:\d{2})\s*تا\s*(\d{2}:\d{2})$/;
  const itemRegex = /^(\d+)\s*-\s*(بخش\s+\S+)\s*:\s*(.+)$/;

  const items = [];
  let current = null;

  for (const line of lines) {
    if (itemRegex.test(line)) {
      // اگر آیتم قبلی پر شده بود، ذخیره‌اش کن
      if (current) items.push(current);

      const [, num, area, places] = line.match(itemRegex);
      current = {
        number: num,
        area,
        places,
        time: null
      };
    } else if (timeRegex.test(line) && current) {
      current.time = line;
      items.push(current);
      current = null;
    } else if (current && !timeRegex.test(line)) {
      // ادامه توضیحات مکان‌ها (اگر در چند خط آمده)
      current.places += " " + line;
    }
  }

  // اگر آیتم ناقص مانده
  if (current) items.push(current);

  // حالا خروجی زیبا بسازیم
  let output = "📋 برنامه خاموشی‌های امروز\n\n";
  for (const item of items) {
    output += `🔹 ${item.area}\n🏘 ${item.places}\n⏰ ${item.time || "زمان نامشخص"}\n\n`;
  }

  return output.trim();
}
