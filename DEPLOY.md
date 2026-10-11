# Деплой на VPS

Сайт запускается обычным Node.js-процессом и сам сохраняет общие суммы в JSON-файл.

## 1. Подготовить VPS

Установите Node.js 20 или новее, затем клонируйте репозиторий:

```bash
git clone <адрес-вашего-репозитория> car-savings
cd car-savings
```

Создайте отдельную постоянную папку для данных. Она не должна находиться внутри папки репозитория, иначе файл можно случайно потерять при передеплое:

```bash
sudo mkdir -p /var/lib/car-savings
sudo chown "$USER":"$USER" /var/lib/car-savings
```

Проверочный запуск:

```bash
HOST=127.0.0.1 PORT=4173 DATA_FILE=/var/lib/car-savings/state.json npm start
```

## 2. Запустить постоянно через systemd

Создайте `/etc/systemd/system/car-savings.service`:

```ini
[Unit]
Description=Car savings tracker
After=network.target

[Service]
Type=simple
User=YOUR_LINUX_USER
WorkingDirectory=/home/YOUR_LINUX_USER/car-savings
Environment=HOST=127.0.0.1
Environment=PORT=4173
Environment=DATA_FILE=/var/lib/car-savings/state.json
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Замените `YOUR_LINUX_USER` и путь к проекту на свои, затем:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now car-savings
sudo systemctl status car-savings
```

## 3. Подключить домен через Nginx

Пример блока сайта Nginx:

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

После настройки DNS включите HTTPS через Certbot.

## Как обновлять сайт

```bash
cd /home/YOUR_LINUX_USER/car-savings
git pull
sudo systemctl restart car-savings
```

Суммы сохраняются отдельно в `/var/lib/car-savings/state.json`, поэтому `git pull` их не затронет.

## Важно

Авторизации нет. Любой человек, у которого есть адрес сайта, сможет не только увидеть, но и изменить накопленную сумму и стоимость автомобиля.
