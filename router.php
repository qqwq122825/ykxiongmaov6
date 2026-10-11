<?php
/**
 * 章鱼出海 - PHP 内置服务器路由 (完整版)
 * 用法: php -S 127.0.0.1:3000 router.php
 *
 * - /api/*       → api/ 目录 PHP 文件
 * - /private/*   → private/ 目录 PHP 文件
 * - 静态文件     → 由 PHP 内置服务器处理
 * - 特殊页面     → HTML 页面直接加载
 * - SPA 回退     → index.html
 */

$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$projectRoot = __DIR__;

// ——— 1. API 路由 ———
    // SPA APK 模块路由: /api/apk/* → api/apk/index.php
    if (strpos($uri, '/api/apk/') === 0) {
        require $projectRoot . '/api/apk/index.php';
        return true;
    }

if (strpos($uri, '/api/') === 0) {
    $phpFile = $projectRoot . $uri . '.php';
    if (file_exists($phpFile)) {
        require $phpFile;
        return true;
    }

    $phpFile = $projectRoot . $uri;
    if (file_exists($phpFile) && substr($phpFile, -4) === '.php') {
        require $phpFile;
        return true;
    }

    // /api/auth/subaccount → api/SubAccount.php
    if (strpos($uri, '/api/auth/subaccount') !== false) {
        require $projectRoot . '/api/SubAccount.php';
        return true;
    }

        // 路径别名: /api/server-info → api/auth/server-info.php
        if ($uri === '/api/server-info') {
            require $projectRoot . '/api/auth/server-info.php';
            return true;
        }

        // 路径别名: /api/db-check → api/auth/db-check.php
        if ($uri === '/api/db-check') {
            require $projectRoot . '/api/auth/db-check.php';
            return true;
        }

    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'API endpoint not found']);
    return true;
}

// ——— 2. Private 管理后台 ———
if (strpos($uri, '/private/') === 0) {
    $phpFile = $projectRoot . $uri;
    if (file_exists($phpFile) && substr($phpFile, -4) === '.php') {
        require $phpFile;
        return true;
    }
    http_response_code(404);
    echo 'Not Found';
    return true;
}

// ——— 3. 特殊页面路由 ———
$specialPages = [
    '/apk-builder'      => '/apk-builder.html',
    '/apk-builder.html' => '/apk-builder.html',
    '/subaccount'       => '/subaccount.html',
    '/subaccount.html'  => '/subaccount.html',
    '/system'           => '/system.html',
    '/system.html'      => '/system.html',
];

if (isset($specialPages[$uri])) {
    $htmlFile = $projectRoot . $specialPages[$uri];
    if (file_exists($htmlFile)) {
        header('Content-Type: text/html; charset=utf-8');
        readfile($htmlFile);
        return true;
    }
}

// ——— 4. 静态文件 ———
if ($uri === '/' || $uri === '') {
    $uri = '/index.html';
}

$staticFile = $projectRoot . $uri;
if (file_exists($staticFile) && is_file($staticFile)) {
    $ext = pathinfo($staticFile, PATHINFO_EXTENSION);
    $mimeTypes = [
        'html' => 'text/html; charset=utf-8',
        'css'  => 'text/css; charset=utf-8',
        'js'   => 'application/javascript; charset=utf-8',
        'json' => 'application/json',
        'png'  => 'image/png',
        'jpg'  => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'gif'  => 'image/gif',
        'svg'  => 'image/svg+xml',
        'ico'  => 'image/x-icon',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
        'md'   => 'text/markdown; charset=utf-8',
    ];
    if (isset($mimeTypes[$ext])) {
        header('Content-Type: ' . $mimeTypes[$ext]);
    }
    return false; // PHP built-in server handles the file
}

// ——— 5. SPA fallback ———
$indexFile = $projectRoot . '/index.html';
if (file_exists($indexFile)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($indexFile);
    return true;
}

// ——— 6. 404 ———
http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo '404 Not Found';
return true;
