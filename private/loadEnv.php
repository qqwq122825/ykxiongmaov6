<?php
/**
 * 简易 .env 加载器 - 敏感配置从环境变量读取，避免硬编码
 * 优先使用 getenv()，其次读取 .env 文件（.env 不应提交到版本库）
 */
function loadEnv($envPath = null) {
    if ($envPath === null) {
        $envPath = dirname(__DIR__) . '/.env';
    }
    if (!file_exists($envPath) || !is_readable($envPath)) {
        return;
    }
    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;
        if (strpos($line, '=') === false) continue;
        list($key, $value) = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value, " \t\n\r\0\x0B\"'");
        if ($key !== '' && !getenv($key) && !isset($_ENV[$key]) && !isset($_SERVER[$key])) {
            if (function_exists('putenv')) {
                putenv("$key=$value");
            }
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }
}
