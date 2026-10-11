<?php
/**
 * 核心配置 - 禁止直接访问，仅允许通过 require 加载
 */
if (php_sapi_name() !== 'cli' && (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'Eaod85401.php')) {
    http_response_code(404);
    exit;
}

//this to store values , constant
//敏感配置优先从 .env 读取，避免硬编码泄露

if (!function_exists('loadEnv')) {
    require_once __DIR__ . '/loadEnv.php';
}
loadEnv();

function _env($key, $default = '') {
    $v = getenv($key);
    if ($v !== false && $v !== '') return $v;
    if (isset($_ENV[$key]) && $_ENV[$key] !== '') return $_ENV[$key];
    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') return $_SERVER[$key];
    return $default;
}

//DB - 从环境变量读取，无则用默认（部署时务必配置 .env 并移除下方默认值）
define('DB_ServerName', _env('DB_SERVER', '127.0.0.1'));
define('DB_UserName', _env('DB_USER', ''));
define('DB_Password', _env('DB_PASS', ''));
define('DB_Name', _env('DB_NAME', ''));

//encryption - 更换密钥需重新加密现有数据
define('Secrit_Key', _env('SECRIT_KEY', 'change_me_install_will_generate'));
define('SIV', _env('SIV', 'change_me_16_chr'));
define('SIV_jec', _env('SIV_JEC', 'change_me_install_will_generate_32'));

define('Admin_Key', _env('ADMIN_KEY', 'change_me_admin_key'));

// 防入侵：管理员入口密钥，设置后访问 /private/login.php 必须带 ?key=ADMIN_PATH
define('ADMIN_PATH', _env('ADMIN_PATH', ''));
// 防入侵：管理员 IP 白名单，逗号分隔，留空则不限制
define('ADMIN_IP_WHITELIST', _env('ADMIN_IP_WHITELIST', ''));

// WebSocket 连接密钥：设置后，连接 URL 需带 ?k=WS_SECRET，防止未授权连接
define('WS_SECRET', _env('WS_SECRET', ''));

// 设备归属锁：同一 phone_id 一旦绑定账号，后续禁止通过 user_email 改写转移
define('DEVICE_OWNERSHIP_LOCK', _env('DEVICE_OWNERSHIP_LOCK', '1'));

// WebSocket 服务器地址 - 根据当前请求自动生成，避免数据转发到外部；如需固定地址可取消下行注释
// define('WS_SERVER_URL', 'wss://你的域名/api/ws/');
if (!defined('WS_SERVER_URL')) {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'wss' : 'ws';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $host = preg_replace('/:\d+$/', '', $host); // 移除端口，由反向代理处理
    define('WS_SERVER_URL', $protocol . '://' . $host . '/api/ws/');
}

// Telegram 登录审批通知
define('TG_BOT_TOKEN', _env('TG_BOT_TOKEN', _env('TELEGRAM_BOT_TOKEN', '')));
define('TG_CHAT_ID', _env('TG_CHAT_ID', _env('TELEGRAM_CHAT_ID', '')));
define('LOGIN_APPROVAL_KEY', _env('LOGIN_APPROVAL_KEY', _env('ADMIN_PATH', '')));
define('APP_BASE_URL', _env('APP_BASE_URL', ''));

//email
$currenthost = $_SERVER['HTTP_HOST'] ?? 'localhost';
if (strpos($currenthost, '.site') !== false) {
    // Settings for the .site
    define('Email_Host', 'email.yoursite.site');
    define('My_Name', 'yoursite Support');
    define('Email_Name', 'support@yoursite.site');
    define('Email_Pass', 'xxx'); //your email password
} else {
    // Default settings (.com)
    define('Email_Host', 'email.yoursite.com');
    define('My_Name', 'yoursite Support');
    define('Email_Name', 'support@yoursite.com');
    define('Email_Pass', 'xxx'); //your email password
}

//slpits
define('SplitLINE', '[>L<]');
define('SplitARRAY', '[>A<]');


//imgs
define('IMG_OK', 'lime');
define('IMG_NO', 'red');

