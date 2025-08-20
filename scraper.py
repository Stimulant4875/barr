# scraper.py
import requests
from bs4 import BeautifulSoup
import re

# آدرس کانال سروش
URL = "https://splus.ir/Tozie_Barq_Nikshahar_ir"

# لیست مکان‌هایی که به دنبال آن‌ها هستیم
# برای هر مکان، یک نام دلخواه و لیستی از کلمات کلیدی آن را تعریف کنید
TARGET_LOCATIONS = {
    "منطقه خیرآباد": ["خیرآباد", "سد خیرآباد", "هیتک", "داروکان", "زهک", "سبز", "موکی", "تهرک", "کهورکان", "باکور", "کشیگ"],
    "منطقه زیرک آباد": ["زیرک آباد", "رئیس کلگ", "جلایی کلگ", "بازیگر", "آبشکی", "حسین آباد", "نیکو جهان", "پوتاپ", "دینار کلگ"]
}

def find_outages():
    try:
        # دریافت محتوای صفحه وب
        response = requests.get(URL, timeout=15)
        response.raise_for_status()  # بررسی موفقیت آمیز بودن درخواست
    except requests.RequestException as e:
        print(f"خطا در اتصال به آدرس: {e}")
        return

    # پارس کردن محتوای HTML
    soup = BeautifulSoup(response.text, 'html.parser')
    messages = soup.find_all('div', class_='channel-message-text')

    if not messages:
        print("هیچ پیامی در کانال یافت نشد.")
        return

    print("آخرین برنامه خاموشی‌های یافت شده برای مناطق مورد نظر شما:")
    print("="*50)

    found_results = {key: [] for key in TARGET_LOCATIONS}
    found_any = False

    # پیام‌ها از آخر به اول بررسی می‌شوند تا جدیدترین‌ها ابتدا پیدا شوند
    for msg in reversed(messages):
        text_content = msg.get_text(separator='\n').strip()
        lines = text_content.split('\n')
        
        for i, line in enumerate(lines):
            for name, keywords in TARGET_LOCATIONS.items():
                # اگر یکی از کلمات کلیدی در خط فعلی وجود داشت
                if any(keyword in line for keyword in keywords):
                    # خط بعدی معمولا شامل ساعت است
                    time_info = "ساعت یافت نشد"
                    if i + 1 < len(lines):
                        # با استفاده از regex، الگوی ساعت را پیدا می‌کنیم
                        time_match = re.search(r'⏰\s*(\d{2}:\d{2})\s*تا\s*(\d{2}:\d{2})', lines[i+1])
                        if time_match:
                            time_info = lines[i+1].strip()

                    # جلوگیری از ثبت نتایج تکراری
                    if (line.strip(), time_info) not in found_results[name]:
                        found_results[name].append((line.strip(), time_info))
                        found_any = True

    # چاپ نتایج
    if not found_any:
        print("در پیام‌های اخیر، هیچ برنامه خاموشی برای مناطق مورد نظر شما یافت نشد.")
    else:
        for name, results in found_results.items():
            if results:
                print(f"\n📍 نتایج برای: {name}")
                for full_line, time in results:
                    print(f"   - {full_line}")
                    print(f"     {time}")
        print("\n" + "="*50)
        print("توجه: این نتایج از آخرین پست‌های کانال استخراج شده است.")


if __name__ == "__main__":
    find_outages()
