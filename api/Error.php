<?php

date_default_timezone_set('Asia/Shanghai');
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// 获取设备名和日志内容
$deviceName = isset($_POST['devicename']) ? preg_replace('/[^a-zA-Z0-9_\-]/', '_', $_POST['devicename']) : 'unknown_device';
$deviceName = substr($deviceName, 0, 64); // 限制长度
$log = isset($_POST['log']) ? $_POST['log'] : '';

if (!$log) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing log data']);
    exit;
}

// 限制日志大小（100KB），防止滥用
$maxLogSize = 102400;
if (strlen($log) > $maxLogSize) {
    $log = substr($log, 0, $maxLogSize) . "\n\n[截断：超出大小限制]";
}

// 过滤危险字符，防止路径遍历等注入
$log = str_replace(["\0", "\r\n", "\r"], ["", "\n", "\n"], $log);

$dir = __DIR__ . '/error_logs/' . $deviceName;
if (!file_exists($dir)) {
    mkdir($dir, 0755, true);
}

$filename = $dir . '/' . date('Y-m-d_H-i-s') . '.txt';
file_put_contents($filename, $log, LOCK_EX);

echo json_encode(['success' => true, 'saved_as' => basename($filename)]);
