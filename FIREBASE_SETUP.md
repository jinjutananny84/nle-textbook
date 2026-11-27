# วิธีเปิดใช้ Google Login + Cloud Sync (Firebase ฟรี 100%)

ใช้เวลาตั้งค่าประมาณ **3 นาที** (ใช้แผน **Spark ฟรี** ไม่ต้องผูกบัตรเครดิต)

## ขั้นที่ 1: สร้างโปรเจกต์ Firebase
1. ไปที่ https://console.firebase.google.com/ แล้วล็อกอินด้วยบัญชี Google
2. กด **Create a project** (หรือ Add project) → ตั้งชื่อเช่น `nle-textbook` → ปิด Google Analytics (ไม่จำเป็น) → กด **Create project**

## ขั้นที่ 2: เปิดใช้ Google Login
1. เมนูซ้ายเลือก **Build → Authentication** → กด **Get started**
2. แท็บ **Sign-in method** → กด **Google** → เปิดสวิตช์ **Enable** → เลือก Support email ของคุณ → กด **Save**
3. ไปที่แท็บ **Settings → Authorized domains** → กด **Add domain** → พิมพ์:
   `jinjutananny84.github.io`
   แล้วกด Add *(หมายเหตุ: `localhost` มีให้อยู่แล้ว)*

## ขั้นที่ 3: สร้างฐานข้อมูล Firestore และตั้งสิทธิ์ความปลอดภัย
1. เมนูซ้ายเลือก **Build → Firestore Database** → กด **Create database**
2. เลือก Location เป็น `asia-southeast1 (Singapore)` → เลือก **Start in production mode** → กด **Create**
3. ไปที่แท็บ **Rules** แล้ววางโค้ดนี้แทนของเดิม กด **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

*(กฎนี้รับประกันว่าแต่ละบัญชี Google จะอ่าน/เขียนได้เฉพาะข้อมูลของตัวเองเท่านั้น)*

## ขั้นที่ 4: คัดลอกค่า Config มาวางในโปรเจกต์
1. กดรูปเฟือง **Project settings** (มุมซ้ายบน) → เลื่อนลงมาที่ **Your apps** → กดไอคอนเว็บ **`</>`**
2. ตั้งชื่อ app เช่น `nle-web` → กด **Register app**
3. คัดลอกค่าใน `firebaseConfig` มาวางแทนในไฟล์ `assets/firebase-config.js`:

```js
window.NLE_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

4. `git commit` และ `git push` ขึ้น GitHub — เสร็จเรียบร้อย! กดปุ่ม **☁️ Sync** บนเว็บแล้วล็อกอินด้วย Google ได้ทันทีครับ
