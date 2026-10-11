<?php
require_once '../private/Eaod85401.php';

header('Content-Type: application/json; charset=utf-8');

function respondJsonLocal($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respondJsonLocal(['ok' => false, 'message' => 'method not allowed'], 405);
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

$phoneId = trim((string)($data['phoneId'] ?? ''));
$protocol = trim((string)($data['protocol'] ?? ''));
$version = trim((string)($data['version'] ?? ''));
$ttlSec = max(30, (int)($data['ttlSec'] ?? 90));
$meta = $data['meta'] ?? null;

if ($phoneId === '' || $protocol === '') {
    respondJsonLocal(['ok' => false, 'message' => 'missing fields'], 400);
}

try {
    $pdo = new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $pdo->exec("CREATE TABLE IF NOT EXISTS protocol_sessions (
        session_id varchar(128) NOT NULL,
        phone_id varchar(100) NOT NULL,
        protocol varchar(20) NOT NULL,
        state varchar(20) NOT NULL,
        version varchar(40) DEFAULT NULL,
        last_seen datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at datetime NOT NULL,
        meta json DEFAULT NULL,
        created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id),
        UNIQUE KEY uniq_phone_protocol (phone_id, protocol),
        KEY idx_phone_state (phone_id, state),
        KEY idx_expires_at (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $sessionId = $protocol . ':' . $phoneId;
    $stmt = $pdo->prepare("INSERT INTO protocol_sessions (session_id, phone_id, protocol, state, version, last_seen, expires_at, meta) VALUES (?, ?, ?, 'active', ?, NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND), ?) ON DUPLICATE KEY UPDATE phone_id = VALUES(phone_id), protocol = VALUES(protocol), state = 'active', version = VALUES(version), last_seen = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND), meta = VALUES(meta), updated_at = NOW()");
    $stmt->execute([$sessionId, $phoneId, $protocol, $version ?: null, $ttlSec, $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null, $ttlSec]);

    $stmt = $pdo->prepare("UPDATE protocol_sessions SET state = 'standby', updated_at = NOW() WHERE phone_id = ? AND protocol <> ? AND state = 'active'");
    $stmt->execute([$phoneId, $protocol]);

    respondJsonLocal(['ok' => true, 'sessionId' => $sessionId, 'protocol' => $protocol]);
} catch (Exception $e) {
    respondJsonLocal(['ok' => false, 'message' => $e->getMessage()], 500);
}