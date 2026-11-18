module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // نمط مقصود في المشروع: void promise() لتعليم "نفّذ ومتستناش" بوضوح.
    'no-void': 'off',
    // كل الـ effects هنا بتعيد التشغيل على "مفتاح مشتق" مقصود (calKey, weekKey,
    // selectedCoordKey, إحداثيات primitive...) لتفادي إعادة التشغيل على هوية الكائن.
    // إضافة الكائنات/الدوال للـ deps ميكانيكيًا بتعمل حلقات إعادة جلب لا نهائية،
    // والتوكن بيتجدّد وقت النداء (ensureFreshToken) فـ settings القديمة مش بتسبب
    // توكن قديم. فالقاعدة إرشادية (warn) مش خطأ — اتراجعت الحالات يدويًا.
    'react-hooks/exhaustive-deps': 'warn',
  },
};
