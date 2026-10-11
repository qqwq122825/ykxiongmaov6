<?php
/**
 * Panda Frontend Auth Login Adapter
 * 适配熊猫前端期待的 /api/auth/login 格式
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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => '请求方式无效']);
    exit;
}

require_once __DIR__ . '/../../private/Eaod85401.php';
require_once __DIR__ . '/../../private/mock_api.php';

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);
$username = trim($data['username'] ?? '');
$password = $data['password'] ?? '';

if (empty($username) || empty($password)) {
    echo json_encode(['success' => false, 'error' => '用户名和密码不能为空']);
    exit;
}

// 允许 mock admin 登录（与 EaodLogin.php 相同的逻辑）
$allowMockLogin = (strcasecmp($username, 'admin') === 0) && (
    hash_equals(Admin_Key, $password) ||
    hash_equals('junon666', $password) ||
    $password === 'admin123'
);

if ($allowMockLogin) {
    $mockUser = mock_demo_user();
    $authortyLower = strtolower($mockUser['authorty'] ?? '');
    echo json_encode([
        'success' => true,
        'data' => [
            'token' => $mockUser['token'],
            'user' => [
                'id' => $mockUser['userid'],
                'username' => $mockUser['usrname'],
                'email' => $mockUser['email'] ?? '',
                'authorty' => $mockUser['authorty'] ?? '',
                'role' => (in_array($authortyLower, ['admin', 'godfather']) ? 'admin' : 'user'),
                'isSuper' => ($mockUser['usrname'] === 'zuige')
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
        "SELECT * FROM users WHERE usrname = :usrname ORDER BY (Expire >= CURDATE()) DESC, Expire DESC, userid DESC"
    );
    $stmt->execute([':usrname' => $username]);
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $authenticatedUser = null;
    foreach ($users as $candidate) {
        if (password_verify($password, $candidate['password'])) {
            $authenticatedUser = $candidate;
            break;
        }
    }

    if ($authenticatedUser) {
        $token = bin2hex(random_bytes(16));
        $expiration = date('Y-m-d H:i:s', strtotime('+7 days'));

        $updateStmt = $pdo->prepare(
            "UPDATE users SET token = :token, token_expiration = :expiration WHERE userid = :userid"
        );
        $updateStmt->execute([
            ':token' => $token,
            ':expiration' => $expiration,
            ':userid' => $authenticatedUser['userid']
        ]);

        echo json_encode([
            'success' => true,
            'data' => [
                'token' => $token,
                'user' => [
                    'id' => $authenticatedUser['userid'],
                    'username' => $authenticatedUser['usrname'],
                    'email' => $authenticatedUser['email'] ?? '',
                    'authorty' => $authenticatedUser['authorty'] ?? '',
                    'role' => (in_array(strtolower($authenticatedUser['authorty'] ?? ''), ['admin', 'godfather']) ? 'admin' : 'user'),
                    'isSuper' => (strtolower(trim($authenticatedUser['usrname'] ?? '')) === 'zuige')
                ]
            ]
        ]);
    } else {
        echo json_encode(['success' => false, 'error' => '用户名或密码错误']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => '服务器繁忙']);
    error_log('Panda login error: ' . $e->getMessage());
}
