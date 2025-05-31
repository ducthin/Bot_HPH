# 🚀 Hướng dẫn Deploy Happy House Bot

## 📋 Yêu cầu trước khi deploy:
- Bot đã test hoạt động tốt ở local
- Có Discord Bot Token
- Có file .env với DISCORD_TOKEN

## 🌟 Phương pháp 1: Railway (Khuyến nghị - Miễn phí)

### Bước 1: Chuẩn bị
1. Tạo tài khoản tại [Railway.app](https://railway.app)
2. Connect GitHub account

### Bước 2: Deploy
1. Push code lên GitHub repository
2. Tại Railway, click "New Project" -> "Deploy from GitHub repo"
3. Chọn repository chứa bot
4. Railway sẽ tự động detect Node.js và deploy

### Bước 3: Cấu hình Environment Variables
1. Vào project -> Settings -> Variables
2. Thêm biến: `DISCORD_TOKEN` = `your_bot_token_here`
3. Save và restart service

### Bước 4: Kiểm tra
- Vào Deployments tab để xem logs
- Bot sẽ online 24/7

---

## 🔥 Phương pháp 2: Heroku

### Bước 1: Cài đặt Heroku CLI
```bash
# Download và cài đặt từ: https://devcenter.heroku.com/articles/heroku-cli
```

### Bước 2: Deploy
```bash
# Login Heroku
heroku login

# Tạo app mới
heroku create your-bot-name

# Set environment variable
heroku config:set DISCORD_TOKEN=your_bot_token_here

# Deploy
git add .
git commit -m "Deploy bot"
git push heroku main
```

### Bước 3: Scale worker
```bash
heroku ps:scale web=1
```

---

## ⚡ Phương pháp 3: Render (Miễn phí)

### Bước 1: Chuẩn bị
1. Tạo tài khoản tại [Render.com](https://render.com)
2. Connect GitHub

### Bước 2: Deploy
1. New -> Web Service
2. Connect repository
3. Cấu hình:
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `node index.js`

### Bước 3: Environment Variables
- Thêm `DISCORD_TOKEN` = `your_token`

---

## 🐳 Phương pháp 4: Docker + VPS

### Tạo Dockerfile:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "index.js"]
```

### Deploy:
```bash
# Build image
docker build -t happy-house-bot .

# Run container
docker run -d --name bot -e DISCORD_TOKEN=your_token happy-house-bot
```

---

## 📝 Checklist trước khi deploy:

- [ ] Bot test hoạt động ở local
- [ ] File .env có DISCORD_TOKEN
- [ ] Package.json có script "start"
- [ ] Không commit file .env lên GitHub
- [ ] Code đã push lên GitHub (nếu dùng Railway/Render)

---

## 🛠️ Troubleshooting:

### Lỗi thường gặp:
1. **Bot offline**: Kiểm tra logs, có thể thiếu environment variables
2. **Module not found**: Chạy `npm install` trên server
3. **Voice không hoạt động**: Cần cài libsodium-wrappers trên server

### Commands hữu ích:
```bash
# Xem logs Railway
railway logs

# Xem logs Heroku  
heroku logs --tail

# Restart service
heroku restart
```

---

## 🎯 Khuyến nghị:

1. **Railway**: Tốt nhất cho beginners, setup đơn giản
2. **Heroku**: Ổn định, nhiều features
3. **Render**: Alternative tốt cho Heroku
4. **VPS**: Cho advanced users, full control

**Lưu ý**: Đảm bảo server có đủ RAM (ít nhất 512MB) để chạy Discord bot với voice features.
