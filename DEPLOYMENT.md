# Satranç Oyunu - Dağıtım (Deployment) Rehberi

Bu rehber, geliştirdiğimiz Node.js tabanlı satranç oyununu internette herkesin erişebileceği hale getirmek için yapmanız gerekenleri anlatır.

İki seçeneğiniz var:
1.  **Kolay Yöntem:** Her şeyi (Frontend + Backend) tek bir yerde (Render.com) yayınlamak.
2.  **Ayrık Yöntem (İsteğiniz üzerine):** Backend'i Render'da, Frontend'i Vercel'de yayınlamak.

---

## 1. Hazırlık (GitHub)

Kodlarınızı başarıyla GitHub'a gönderdim (veya siz `git push -u origin main` komutuyla gönderebilirsiniz).
Depo Adresiniz: `https://github.com/mantar32/satranc`

## 2. Backend Dağıtımı (Render.com)

Socket.io kullandığımız için backend'in sürekli çalışması gerekir. Render bunun için harikadır (ve ücretsiz).

1.  [Render.com](https://render.com) adresine gidin ve üye olun.
2.  "New +" butonuna tıklayın ve "Web Service" seçeneğini seçin.
3.  GitHub hesabınızı bağlayın ve `mantar32/satranc` deposunu seçin.
4.  Ayarları şu şekilde yapın:
    -   **Name:** `satranc-server` (veya istediğiniz bir isim)
    -   **Environment:** `Node`
    -   **Build Command:** `npm install`
    -   **Start Command:** `node server.js`
5.  "Create Web Service" butonuna tıklayın.
6.  İşlem bittiğinde size `https://satranc-server-x123.onrender.com` gibi bir URL verecek. **Bu URL'i kopyalayın.**

*Şu anda, bu URL'e girdiğinizde oyununuz açılacaktır! Eğer sadece Render kullanmak isterseniz işlem bu kadar!*

---

## 3. Frontend Dağıtımı (Vercel) - İsteğe Bağlı

Eğer Vercel üzerinden `satranc.vercel.app` gibi bir adres almak istiyorsanız:

1.  Bilgisayarınızdaki `chess.js` dosyasını açın.
2.  `productionUrl` satırını bulun ve Render'dan aldığınız URL ile değiştirin:
    ```javascript
    // ÖNCE:
    const productionUrl = null;

    // SONRA (Örnek):
    const productionUrl = 'https://sizin-render-adresiniz.onrender.com';
    ```
3.  Değişikliği kaydedip terminalden şu komutlarla GitHub'a gönderin:
    ```bash
    git add .
    git commit -m "Update production URL"
    git push
    ```
4.  [Vercel.com](https://vercel.com) adresine gidin.
5.  "Add New..." -> "Project" seçeneğini seçin.
6.  GitHub deponuzu seçin ("Import").
7.  **ÖNEMLİ:** "Configure Project" ekranında şu ayarları **değiştirmeniz (Override)** çok önemlidir, yoksa CSS/JS yüklenmeyebilir:
    -   **Framework Preset:** `Other` seçin.
    -   **Build Command:** `OVERRIDE` kutusunu işaretleyin ve içine `echo 'SKIP BUILD'` yazın.
    -   **Output Directory:** `OVERRIDE` kutusunu işaretleyin ve içine `.` (sadece nokta işareti) yazın.
    -   **Install Command:** `OVERRIDE` kutusunu işaretleyin ve içine `echo 'SKIP INSTALL'` yazın.
8.  "Deploy" butonuna tıklayın.

Bu ayarlar, Vercel'e "Bu bir Node.js sunucusu değil, sadece statik HTML/CSS dosyalarıdır, bunları olduğu gibi sun" der.

Artık oyununuz Vercel adresinizden çalışacak (ve animasyonlar görünecek), arka planda ise Render sunucusuna bağlanacaktır.

> **Not:** Render'ın ücretsiz sürümü kullanılmadığında uyku moduna geçer. Siteye ilk girişinizde açılması 30-50 saniye sürebilir.
