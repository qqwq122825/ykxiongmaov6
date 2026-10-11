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

function respond(int $code, string $msg, $data = null): void
{
    $payload = ['code' => $code, 'msg' => $msg];
    if ($data !== null) {
        $payload['data'] = $data;
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit();
}

$roles = [
    [
        'roleName' => '超级管理员',
        'roleCode' => 'R_SUPER',
        'status' => 1,
        'remark' => '系统超级管理员',
    ],
    [
        'roleName' => '管理员',
        'roleCode' => 'R_ADMIN',
        'status' => 1,
        'remark' => '后台管理员',
    ],
    [
        'roleName' => '普通用户',
        'roleCode' => 'R_USER',
        'status' => 1,
        'remark' => '普通用户',
    ],
];

respond(200, 'ok', $roles);