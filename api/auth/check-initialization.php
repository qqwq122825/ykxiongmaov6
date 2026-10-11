<?php
/**
 * Panda Frontend - Check System Initialization
 */
date_default_timezone_set('Asia/Shanghai');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// 对于本地开发模式，始终返回已初始化，这样可以直接进入登录页
echo json_encode([
    'success' => true,
    'data' => [
        'initialized' => true
    ]
]);
