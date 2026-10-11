<?php
date_default_timezone_set('Asia/Shanghai');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
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

$approvalKey = getenv('LOGIN_APPROVAL_KEY') ?: getenv('ADMIN_PATH') ?: '';
$providedKey = trim((string) ($_GET['key'] ?? $_POST['key'] ?? ''));
$requestId = trim((string) ($_GET['request_id'] ?? $_POST['request_id'] ?? ''));
$action = strtolower(trim((string) ($_GET['action'] ?? $_POST['action'] ?? '')));

if ($approvalKey !== '' && !hash_equals($approvalKey, $providedKey)) {
    respondJson(['code' => 403, 'message' => '无权限'], 403);
}

if ($requestId === '' || !in_array($action, ['approve', 'deny'], true)) {
    respondJson(['code' => 400, 'message' => '参数错误'], 200);
}

$requests = loginApprovalLoad();
if (!isset($requests[$requestId])) {
    respondJson(['code' => 404, 'message' => '请求不存在'], 200);
}

$requests[$requestId]['status'] = $action === 'approve' ? 'approved' : 'denied';
$requests[$requestId]['updated_at'] = date('Y-m-d H:i:s');
$requests[$requestId]['decision_ip'] = $_SERVER['REMOTE_ADDR'] ?? '';
loginApprovalSave($requests);

respondJson([
    'code' => 200,
    'message' => $action === 'approve' ? '已允许登入' : '已拒绝登入',
    'request_id' => $requestId,
    'status' => $requests[$requestId]['status'],
]);
