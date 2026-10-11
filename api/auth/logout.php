<?php
/**
 * Panda Frontend Logout Adapter
 */
date_default_timezone_set('Asia/Shanghai');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/../../private/Eaod85401.php';

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token = '';

if (preg_match('/^Bearer\s+(.+)$/i', $authHeader, $matches)) {
    $token = $matches[1];
}

if (empty($token)) {
    // 就算没有 token 也返回成功（幂等）
    echo json_encode(['success' => true, 'data' => null]);
    exit;
}

try {
    $pdo = new PDO(
        "mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4",
        DB_UserName,
        DB_Password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $stmt = $pdo->prepare("UPDATE users SET token = NULL, token_expiration = NULL WHERE token = :token");
    $stmt->execute([':token' => $token]);

    echo json_encode(['success' => true, 'data' => null]);
} catch (PDOException $e) {
    // 即使数据库错误也返回成功（幂登出）
    echo json_encode(['success' => true, 'data' => null]);
    error_log('Panda logout error: ' . $e->getMessage());
}
