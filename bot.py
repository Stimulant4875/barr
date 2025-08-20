import telegram
from telegram.ext import Updater, CommandHandler, MessageHandler, Filters
import logging

# توکن ربات تلگرام شما
TOKEN = "8346440120:AAGQMSu5W8hU8pFkQceXMc3mql3g5DCNqPU"

# فعال کردن لاگ برای دیباگ کردن
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                    level=logging.INFO)

logger = logging.getLogger(__name__)

# این تابع در آینده باید اطلاعات را از کانال سروش پلاس استخراج کند
# در حال حاضر به صورت ثابت اطلاعات درخواستی شما را برمی‌گرداند
def get_outage_info(area_name):
    """
    این تابع اطلاعات خاموشی را برای منطقه مشخص شده برمی‌گرداند.
    در نسخه نهایی، این تابع باید بتواند به کانال متصل شده و اطلاعات را استخراج کند.
    """
    # اطلاعات بر اساس داده‌های ارائه شده توسط شما
    all_outages = {
        "کهورکان": [
            "نوبت اول: از ساعت 14:00 تا 16:00",
            "نوبت دوم: از ساعت 18:15 تا 20:15"
        ],
        "زیرک آباد": [
            "نوبت اول: از ساعت 08:00 تا 10:00",
            "نوبت دوم: از ساعت 16:00 تا 18:00"
        ]
    }

    # جستجو برای نام منطقه (به صورت ساده)
    for key, value in all_outages.items():
        if key in area_name:
            return f"زمان خاموشی برای '{key}':\n" + "\n".join(value)
    
    return "اطلاعاتی برای این منطقه یافت نشد. لطفاً نام منطقه را به فارسی و دقیق وارد کنید (مثلاً: کهورکان)."


def start(update, context):
    """دستور /start را مدیریت می‌کند."""
    welcome_message = (
        "سلام! به ربات اعلام خاموشی برق نیکشهر خوش آمدید.\n\n"
        "برای دریافت زمان خاموشی، نام روستا یا منطقه مورد نظر خود را ارسال کنید.\n\n"
        "برای مثال: `زیرک آباد` یا `کهورکان`"
    )
    update.message.reply_text(welcome_message)


def get_info(update, context):
    """پیام‌های متنی کاربران را برای دریافت اطلاعات خاموشی پردازش می‌کند."""
    user_input = update.message.text
    outage_info = get_outage_info(user_input)
    update.message.reply_text(outage_info)

def error(update, context):
    """لاگ کردن خطاها."""
    logger.warning('Update "%s" caused error "%s"', update, context.error)


def main():
    """شروع به کار ربات."""
    # ایجاد Updater و پاس دادن توکن ربات
    updater = Updater(TOKEN, use_context=True)

    # دریافت dispatcher برای ثبت handler ها
    dp = updater.dispatcher

    # ثبت دستورات
    dp.add_handler(CommandHandler("start", start))
    
    # ثبت handler برای پیام‌های متنی
    dp.add_handler(MessageHandler(Filters.text & ~Filters.command, get_info))

    # لاگ کردن همه خطاها
    dp.add_error_handler(error)

    # شروع به کار ربات
    # برای Render معمولاً از وب‌هوک استفاده می‌شود، اما برای تست می‌توانید از polling استفاده کنید.
    # در فایل deploy برای Render باید این خط را با تنظیمات وب‌هوک جایگزین کنید.
    updater.start_polling()
    logger.info("ربات شروع به کار کرد...")

    # ربات را تا زمانی که Ctrl+C فشرده شود، در حال اجرا نگه می‌دارد
    updater.idle()


if __name__ == '__main__':
    main()
