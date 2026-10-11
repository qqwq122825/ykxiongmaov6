<?php
/**
 * WebSocket Token 校验 - 用于 checkphone 等需验证用户身份的请求
 * POST { token, email } - email 为加密后的邮箱（与前端/设备一致）
 */
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['valid' => false]);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$token = isset($input['token']) ? trim((string)$input['token']) : '';
$email = isset($input['email']) ? trim((string)$input['email']) : '';

if ($token === '' || $email === '') {
    echo json_encode(['valid' => false]);
    exit;
}

require_once __DIR__ . '/../private/Eaod85401.php';

try {
    $pdo = new PDO(
        "mysql:host=" . DB_ServerName . ";dbname=" . DB_Name,
        DB_UserName,
        DB_Password
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt = $pdo->prepare("SELECT email FROM users WHERE token = :token LIMIT 1");
    $stmt->bindParam(':token', $token, PDO::PARAM_STR);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        echo json_encode(['valid' => false]);
        exit;
    }

    // 数据库中的 email 已是加密存储，直接比较
    $valid = ($user['email'] === $email);
    echo json_encode(['valid' => $valid]);
} catch (Exception $e) {
    echo json_encode(['valid' => false]);
}
