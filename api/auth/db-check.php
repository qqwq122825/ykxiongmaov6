<?php
/**
 * Database Check API adapter - local PHP fallback for system page
 */
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }

try {
    $DB_HOST = getenv("DB_HOST") ?: "127.0.0.1";
    $DB_PORT = getenv("DB_PORT") ?: "3306";
    $DB_NAME = getenv("DB_NAME") ?: "xiaoyu_manager";
    $DB_USER = getenv("DB_USER") ?: "root";
    $DB_PASS = getenv("DB_PASS") ?: "root";
    
    $pdo = new PDO("mysql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_NAME;charset=utf8mb4", $DB_USER, $DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 3,
    ]);
    $stmt = $pdo->query("SELECT VERSION() AS ver");
    $row = $stmt->fetch();
    
    echo json_encode([
        "success" => true,
        "data" => [
            "server" => $row["ver"] ?? "MySQL",
            "host" => "$DB_HOST:$DB_PORT",
            "dbname" => $DB_NAME,
        ]
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    echo json_encode([
        "success" => false,
        "error" => "数据库连接失败: " . $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
