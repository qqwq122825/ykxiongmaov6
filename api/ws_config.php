<?php
/**
 * 获取 WebSocket 连接 URL（含密钥）- 仅对已登录用户返回
 * 前端需携带 token 调用，用于构造带 ?k=WS_SECRET 的 WebSocket 地址
 */
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$token = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $token = isset($input['token']) ? trim((string)$input['token']) : '';
} else {
    $token = $_GET['token'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/^Bearer\s+(.+)$/i', $token, $m)) {
        $token = trim($m[1]);
    }
}

if ($token === '') {
    http_response_code(401);
    echo json_encode(['error' => '未提供 token']);
    exit;
}

require_once __DIR__ . '/../private/Eaod85401.php';

$wsSecret = defined('WS_SECRET') ? WS_SECRET : (getenv('WS_SECRET') ?: '');
$baseUrl = defined('WS_SERVER_URL') ? WS_SERVER_URL : '';

if ($baseUrl === '') {
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'wss' : 'ws';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $host = preg_replace('/:\d+$/', '', $host);
    $baseUrl = $protocol . '://' . $host . '/api/ws/';
}

try {
    $pdo = new PDO(
        "mysql:host=" . DB_ServerName . ";dbname=" . DB_Name,
        DB_UserName,
        DB_Password
    );
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt = $pdo->prepare("SELECT 1 FROM users WHERE token = :token LIMIT 1");
    $stmt->bindParam(':token', $token, PDO::PARAM_STR);
    $stmt->execute();

    if (!$stmt->fetch()) {
        http_response_code(401);
        echo json_encode(['error' => '无效 token']);
        exit;
    }

    $url = $baseUrl;
    if ($wsSecret !== '') {
        $url .= (strpos($url, '?') !== false ? '&' : '?') . 'k=' . urlencode($wsSecret);
    }

    echo json_encode(['url' => $url]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => '服务器错误']);
}
