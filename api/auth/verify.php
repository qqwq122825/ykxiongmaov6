<?php
/**
 * Panda Frontend Token Verify Adapter
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
require_once __DIR__ . '/../../private/mock_api.php';

$input = json_decode(file_get_contents('php://input'), true);
$token = $input['token'] ?? '';

if (empty($token)) {
    echo json_encode(['success' => false, 'error' => 'Token 不能为空']);
    exit;
}

// Mock/demo token 验证（无数据库回退）
if (is_mock_token($token)) {
    $demoUser = mock_demo_user();
    $authLower = strtolower($demoUser['authorty'] ?? '');
    echo json_encode([
        'success' => true,
        'data' => [
            'valid' => true,
            'user' => [
                'id' => $demoUser['userid'],
                'username' => $demoUser['usrname'],
                'email' => $demoUser['email'] ?? '',
                'authorty' => $demoUser['authorty'] ?? '',
                'role' => (in_array($authLower, ['admin', 'godfather']) ? 'admin' : 'user'),
                'isSuper' => ($demoUser['usrname'] === 'zuige')
            ]
        ]
    ]);
    exit;
}

try {
    $pdo = new PDO(
        "mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4",
        DB_UserName,
        DB_Password,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $stmt = $pdo->prepare(
        "SELECT userid, usrname, email, authorty, token_expiration FROM users WHERE token = :token LIMIT 1"
    );
    $stmt->execute([':token' => $token]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        $expired = ($user['token_expiration'] ?? '') < date('Y-m-d H:i:s');
        if ($expired) {
            echo json_encode(['success' => false, 'error' => 'Token 已过期']);
        } else {
            echo json_encode([
                'success' => true,
                'data' => [
                    'valid' => true,
                    'user' => [
                        'id' => $user['userid'],
                        'username' => $user['usrname'],
                        'email' => $user['email'] ?? '',
                        'authorty' => $user['authorty'] ?? '',
                        'role' => (in_array(strtolower($user['authorty'] ?? ''), ['admin', 'godfather']) ? 'admin' : 'user'),
                        'isSuper' => (strtolower(trim($user['usrname'] ?? '')) === 'zuige')
                    ]
                ]
            ]);
        }
    } else {
        echo json_encode(['success' => false, 'error' => 'Token 无效']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => '服务器繁忙']);
    error_log('Panda verify error: ' . $e->getMessage());
}
