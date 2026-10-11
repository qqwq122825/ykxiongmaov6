<?php
/**
 * Server Info API adapter - local PHP fallback for system page
 */
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }

// 尝试查询在线统计（DB 不可用时返回 0）
$onlineUsers = 0;
$onlineDevices = 0;
$totalUsers = 0;
$totalDevices = 0;
try {
    require_once __DIR__ . '/../../private/Eaod85401.php';
    $pdo = new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 3
    ]);
    // 总用户数（排除 hidden=1）
    $totalUsers = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE hidden = 0 OR hidden IS NULL")->fetchColumn();
    // 在线用户：过去5分钟内有设备 ping 的用户
    $onlineUsers = (int)$pdo->query("SELECT COUNT(DISTINCT usrname) FROM phones WHERE isonline = 1 AND last_ping >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)")->fetchColumn();
    // 总设备
    $totalDevices = (int)$pdo->query("SELECT COUNT(*) FROM phones WHERE isRemoved = 0 OR isRemoved IS NULL")->fetchColumn();
    // 在线设备
    $onlineDevices = (int)$pdo->query("SELECT COUNT(*) FROM phones WHERE isonline = 1 AND last_ping >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)")->fetchColumn();
} catch (Exception $e) {
    // DB 不可用时静默降级
}

echo json_encode([
    "success" => true,
    "data" => [
        "php_version" => phpversion(),
        "phpversion" => phpversion(),
        "memory_limit" => ini_get("memory_limit"),
        "memoryLimit" => ini_get("memory_limit"),
        "upload_max_filesize" => ini_get("upload_max_filesize"),
        "uploadMaxFilesize" => ini_get("upload_max_filesize"),
        "server_software" => $_SERVER["SERVER_SOFTWARE"] ?? "nginx",
        "serverSoftware" => $_SERVER["SERVER_SOFTWARE"] ?? "nginx",
        "mysql" => extension_loaded("pdo_mysql"),
        "curl" => extension_loaded("curl"),
        "gd" => extension_loaded("gd"),
        "json" => extension_loaded("json"),
        "max_execution_time" => ini_get("max_execution_time"),
        "maxExecutionTime" => ini_get("max_execution_time"),
        "timezone" => date_default_timezone_get(),
        "date_default_timezone" => date_default_timezone_get(),
        "memory_usage" => round(memory_get_usage(true) / 1024 / 1024, 2) . " MB",
        "memoryUsage" => round(memory_get_usage(true) / 1024 / 1024, 2) . " MB",
        "total_users" => $totalUsers,
        "totalUsers" => $totalUsers,
        "online_users" => $onlineUsers,
        "onlineUsers" => $onlineUsers,
        "total_devices" => $totalDevices,
        "totalDevices" => $totalDevices,
        "online_devices" => $onlineDevices,
        "onlineDevices" => $onlineDevices,
    ]
], JSON_UNESCAPED_UNICODE);
