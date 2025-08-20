# scraper.py
import requests
from bs4 import BeautifulSoup
import re
import os # کتابخانه os برای خواندن سکرت‌ها اضافه شد

# آدرس کانال سروش
URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir"

# لیست مکان‌هایی که به دنبال آن‌ها هستیم
TARGET_LOCATIONS = {
    "منطقه خیرآباد": ["خیرآباد", "سد خیرآباد", "هیتک", "داروکان", "زهک", "سبز", "موکی", "تهرک", "کهورکان", "باکور", "کشیگ"],
    "منطقه زیرک آباد": ["زیرک آباد", "رئیس کلگ", "جلایی کلگ", "بازیگر", "آبشکی", "حسین آباد", "نیکو جهان", "پوتاپ", "دینار کلگ"]
}

def send_to_telegram(message):
    """این تابع پیام را به تلگرام ارسال می‌کند"""
    # خواندن توکن و شناسه چت از سکرت‌های گیت‌هاب
    bot_token = os.getenv('TELEGRAM_BOT_TOKEN')
    chat_id = os.getenv('TELEGRAM_CHAT_ID')

    if not bot_token or not chat_id:
        print("خطا: توکن ربات یا شناسه چت در سکرت‌های گیت‌هاب تعریف نشده است.")
        return

    api_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    
    try:
        response = requests.post(api_url, json={'chat_id': chat_id, 'text': message, 'parse_mode': 'Markdown'})
        response.raise_for_status()
        print("پیام با موفقیت به تلگرام ارسال شد.")
    except requests.RequestException as e:
        print(f"خطا در ارسال پیام به تلگرام: {e}")
        # برای دیباگ کردن، محتوای پاسخ خطا را چاپ می‌کنیم
        print(response.text)


def find_outages():
    """این تابع خاموشی‌ها را پیدا کرده و به صورت یک متن آماده می‌کند"""
    try:
        response = requests.get(URL, timeout=15)
        response.raise_for_status()
    except requests.RequestException as e:
        return f"خطا در اتصال به آدرس کانال: {e}"

    soup = BeautifulSoup(response.text, 'html.parser')
    messages = soup.find_all('div', class_='channel-message-text')

    if not messages:
        return "هیچ پیامی در کانال یافت نشد."

    # متغیر برای نگهداری کل پیام نهایی
    final_message_parts = ["*آخرین برنامه خاموشی‌های یافت شده برای مناطق شما:*"]
    
    found_results = {key: [] for key in TARGET_LOCATIONS}
    found_any = False

    for msg in reversed(messages):
        text_content = msg.get_text(separator='\n').strip()
        lines = text_content.split('\n')
        
        for i, line in enumerate(lines):
            for name, keywords in TARGET_LOCATIONS.items():
                if any(keyword in line for keyword in keywords):
                    time_info = "ساعت یافت نشد"
                    if i + 1 < len(lines):
                        time_match = re.search(r'⏰\s*(\d{2}:\d{2})\s*تا\s*(\d{2}:\d{2})', lines[i+1])
                        if time_match:
                            time_info = lines[i+1].strip()
                    
                    if (line.strip(), time_info) not in found_results[name]:
                        found_results[name].append((line.strip(), time_info))
                        found_any = True

    if not found_any:
        return "در پیام‌های اخیر، هیچ برنامه خاموشی برای مناطق مورد نظر شما یافت نشد."
    
    for name, results in found_results.items():
        if results:
            final_message_parts.append(f"\n📍 *نتایج برای: {name}*")
            for full_line, time in results:
                final_message_parts.append(f"   - {full_line}")
                final_message_parts.append(f"     `{time}`")

    final_message_parts.append("\n\n---\n*این پیام به صورت خودکار ارسال شده است.*")
    return "\n".join(final_message_parts)


if __name__ == "__main__":
    # پیدا کردن خاموشی‌ها
    result_message = find_outages()
    # ارسال نتیجه به تلگرام
    send_to_telegram(result_message)
