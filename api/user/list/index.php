<?php
date_default_timezone_set('Asia/Shanghai');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

require_once '../../../private/Eaod85401.php';
require_once '../../../private/mock_api.php';

function respond(int $code, string $msg, $data = null): void
{
    $payload = ['code' => $code, 'msg' => $msg];
    if ($data !== null) {
        $payload['data'] = $data;
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit();
}

function read_request_data(): array
{
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    if (is_array($json)) {
        return $json;
    }
    return $_REQUEST;
}

function get_authorization_token(): string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (stripos($header, 'Bearer ') === 0) {
        return trim(substr($header, 7));
    }
    return trim($header);
}

function get_request_token(array $data): string
{
    $token = trim((string)($data['token'] ?? ''));
    if ($token !== '') {
        return $token;
    }

    $authToken = get_authorization_token();
    if ($authToken !== '') {
        return $authToken;
    }

    return trim((string)($_GET['token'] ?? ''));
}

function get_pdo(): PDO
{
    return new PDO(
        'mysql:host=' . DB_ServerName . ';dbname=' . DB_Name . ';charset=utf8mb4',
        DB_UserName,
        DB_Password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 5,
        ]
    );
}

function map_roles(string $authority, string $username): array
{
    $normalizedAuthority = strtoupper(trim((string)$authority));
    $normalizedUsername = strtolower(trim((string)$username));

    if ($normalizedUsername === 'admin' || in_array($normalizedAuthority, ['ADMIN', 'SUPER', 'R_ADMIN', 'R_SUPER'], true)) {
        return ['R_SUPER', 'R_ADMIN'];
    }

    return ['R_USER'];
}

try {
    $data = read_request_data();
    $token = get_request_token($data);

    if ($token === '') {
        respond(401, '未提供 token');
    }

    if (is_mock_token($token)) {
        $mockUser = mock_demo_user();
        respond(200, 'ok', [[
            'userId' => $mockUser['userid'],
            'userName' => $mockUser['usrname'],
            'nickName' => $mockUser['usrname'],
            'realName' => $mockUser['usrname'],
            'email' => $mockUser['email'],
            'avatar' => '',
            'status' => 1,
            'roles' => mock_demo_roles(),
            'buttons' => [],
        ]]);
    }

    $pdo = get_pdo();
    $stmt = $pdo->prepare('SELECT userid, usrname, email, authorty FROM users WHERE token = :token LIMIT 1');
    $stmt->execute([':token' => $token]);
    $user = $stmt->fetch();

    if (!$user) {
        respond(401, '无效 token');
    }

    $roles = map_roles($user['authorty'] ?? '', $user['usrname'] ?? '');
    respond(200, 'ok', [
        [
            'userId' => (string)($user['userid'] ?? ''),
            'userName' => (string)($user['usrname'] ?? ''),
            'nickName' => (string)($user['usrname'] ?? ''),
            'realName' => (string)($user['usrname'] ?? ''),
            'email' => (string)($user['email'] ?? ''),
            'avatar' => '',
            'status' => 1,
            'roles' => $roles,
            'buttons' => [],
        ],
    ]);
} catch (Throwable $exception) {
    respond(500, 'Server error: ' . $exception->getMessage());
}