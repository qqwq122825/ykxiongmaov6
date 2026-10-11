# 完整构建镜像：PHP + Java + Android SDK + apktool
FROM php:8.1-fpm-bookworm

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libzip-dev libpng-dev libjpeg-dev libfreetype-dev \
    curl zip unzip wget \
    openjdk-17-jdk-headless \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) pdo_mysql zip gd opcache \
    && rm -rf /var/lib/apt/lists/*

# 时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 安装 Android SDK commandlinetools (兼容 Java 11)
ENV ANDROID_HOME=/opt/android-sdk
RUN mkdir -p $ANDROID_HOME/cmdline-tools \
    && cd /tmp \
    && wget -q https://dl.google.com/android/repository/commandlinetools-linux-10406996_latest.zip \
    && unzip -q commandlinetools-linux-10406996_latest.zip \
    && mv cmdline-tools $ANDROID_HOME/cmdline-tools/latest \
    && rm commandlinetools-linux-10406996_latest.zip

# 安装 build-tools
RUN yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --sdk_root=$ANDROID_HOME "build-tools;33.0.0" 2>/dev/null || true

# 软链接到 PATH
RUN ln -sf $ANDROID_HOME/build-tools/33.0.0/apksigner /usr/local/bin/apksigner \
    && ln -sf $ANDROID_HOME/build-tools/33.0.0/zipalign /usr/local/bin/zipalign

# 下载 apktool 到固定路径（运行时复制到项目目录）
RUN mkdir -p /opt/apk-tools \
    && wget -q -O /opt/apk-tools/apktool.jar \
    https://github.com/iBotPeaches/Apktool/releases/download/v2.9.3/apktool_2.9.3.jar

# 预创建 apktool framework 目录（www-data 用户需要写入）
RUN mkdir -p /var/www/.local/share/apktool/framework \
    && chown -R www-data:www-data /var/www/.local

# 启动时确保 tools 目录有 apktool 并修复权限
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["php-fpm"]

WORKDIR /var/www/html
