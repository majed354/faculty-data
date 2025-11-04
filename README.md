# موقع بيانات أعضاء هيئة التدريس — نسخة بواجهة إدخال + Firebase

تشغيل بواجهة ساكنة (HTML/CSS/JS) مع **Firestore** لتخزين البيانات و**Auth** للتحكم في الكتابة.

## الملفات
- `index.html` : الواجهة (تبويبات، فلاتر، جداول، تبويب الإدارة).
- `styles.css` : التنسيق + تنسيق الطباعة.
- `firebase_config.js` : تهيئة Firebase (إلصق إعدادات مشروعك).
- `app.js` : منطق العرض والقراءة/الكتابة من Firestore + Auth + استيراد/تصدير JSON.
- `firestore.rules` : قواعد الأمان — الكتابة للمشرفين فقط.
- `README.md` : هذا الملف.

## إعداد Firebase (مرة واحدة)
1) أنشئ مشروع Firebase.
2) فعّل Firestore بوضع **production**.
3) فعّل Authentication بطريقة **Google** (أو أي مزوّد تريده).
4) من الإعدادات > Web App خذ تهيئة الويب والصقها في `firebase_config.js`.
5) طبّق القواعد:
   ```bash
   firebase login
   firebase init firestore   # اختر مشروعك
   # استبدل rules بملف firestore.rules هذا
   firebase deploy --only firestore:rules
