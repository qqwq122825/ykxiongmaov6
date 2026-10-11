<?php
date_default_timezone_set('Asia/Shanghai');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, OPTIONS');
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

$requestId = trim((string) ($_GET['request_id'] ?? ''));
if ($requestId === '') {
    respondJson(['code' => 400, 'message' => '参数错误'], 200);
}

$requests = loginApprovalLoad();
$request = $requests[$requestId] ?? null;

if (!$request) {
    respondJson(['code' => 404, 'message' => '请求不存在'], 200);
}

respondJson([
    'code' => 200,
    'status' => $request['status'] ?? 'pending',
    'request_id' => $requestId,
    'message' => $request['status'] === 'approved' ? '已允许登入' : ($request['status'] === 'denied' ? '已拒绝登入' : '等待TG批准'),
]);
