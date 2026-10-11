<?php
date_default_timezone_set('Asia/Shanghai');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

function respondJson(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respondJson(['code' => 405, 'message' => '请求无效'], 405);
}

require_once __DIR__ . '/../private/Eaod85401.php';

function loginApprovalStorePath(): string
{
    return __DIR__ . '/../private/login_approval_requests.json';
}

function loginApprovalLoad(): array
{
    $path = loginApprovalStorePath();
    if (!is_file($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function loginApprovalSave(array $requests): void
{
    $path = loginApprovalStorePath();
    file_put_contents($path, json_encode($requests, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
}

function tgSendLoginApproval(array $request): void
{
    $botToken = defined('TG_BOT_TOKEN') ? TG_BOT_TOKEN : (getenv('TG_BOT_TOKEN') ?: getenv('TELEGRAM_BOT_TOKEN') ?: '');
    $chatId = defined('TG_CHAT_ID') ? TG_CHAT_ID : (getenv('TG_CHAT_ID') ?: getenv('TELEGRAM_CHAT_ID') ?: '');
    $baseUrl = rtrim((string) (defined('APP_BASE_URL') ? APP_BASE_URL : (getenv('APP_BASE_URL') ?: '')), '/');
    $approvalKey = defined('LOGIN_APPROVAL_KEY') ? LOGIN_APPROVAL_KEY : (getenv('LOGIN_APPROVAL_KEY') ?: getenv('ADMIN_PATH') ?: '');

    if ($botToken === '' || $chatId === '') {
        return;
    }

    $approveUrl = $baseUrl !== ''
        ? $baseUrl . '/api/login_decision.php?request_id=' . rawurlencode($request['request_id']) . '&action=approve&key=' . rawurlencode($approvalKey)
        : '';
    $denyUrl = $baseUrl !== ''
        ? $baseUrl . '/api/login_decision.php?request_id=' . rawurlencode($request['request_id']) . '&action=deny&key=' . rawurlencode($approvalKey)
        : '';

    $message = "鱼缸抛出登入申请\n"
        . "状态：等待允许登入\n"
        . "账号：{$request['username']}\n"
        . "时间：{$request['created_at']}\n"
        . "来源：{$request['ip']}\n"
        . "设备：{$request['user_agent']}\n"
        . "请求号：{$request['request_id']}";

    $payload = [
        'chat_id' => $chatId,
        'text' => $message,
        'disable_web_page_preview' => true,
    ];

    if ($approveUrl !== '' && $denyUrl !== '') {
        $payload['reply_markup'] = json_encode([
            'inline_keyboard' => [[
                ['text' => '允许登入', 'url' => $approveUrl],
                ['text' => '拒绝登入', 'url' => $denyUrl],
            ]],
        ], JSON_UNESCAPED_UNICODE);
    }

    $ch = curl_init('https://api.telegram.org/bot' . $botToken . '/sendMessage');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($payload),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
    ]);
    curl_exec($ch);
    curl_close($ch);
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);
$username = trim((string) ($data['username'] ?? $_POST['username'] ?? ''));
$fishCount = trim((string) ($data['fishCount'] ?? $_POST['fishCount'] ?? ''));

if ($username === '') {
    $username = 'guest';
}

$requestId = bin2hex(random_bytes(16));
$approvalKey = defined('LOGIN_APPROVAL_KEY') ? LOGIN_APPROVAL_KEY : (getenv('LOGIN_APPROVAL_KEY') ?: getenv('ADMIN_PATH') ?: '');

$request = [
    'request_id' => $requestId,
    'username' => $username,
    'fish_count' => $fishCount,
    'status' => 'pending',
    'created_at' => date('Y-m-d H:i:s'),
    'updated_at' => date('Y-m-d H:i:s'),
    'ip' => $_SERVER['REMOTE_ADDR'] ?? '',
    'user_agent' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 180),
];

$requests = loginApprovalLoad();
$requests[$requestId] = $request;
loginApprovalSave($requests);

tgSendLoginApproval($request);

respondJson([
    'code' => 200,
    'message' => '已发送登入申请，请等待TG批准',
    'request_id' => $requestId,
    'status' => 'pending',
    'approval_key_set' => $approvalKey !== '',
]);
