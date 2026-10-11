<?php
date_default_timezone_set('Asia/Shanghai');
ini_set('display_errors', 0);
error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

require_once '../private/Eaod85401.php';

function getBearerToken(): string
{
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)/i', $authHeader, $m)) {
        return trim($m[1]);
    }
    return '';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'));

    $token = getBearerToken();
    if ($token === '') {
        $token = isset($data->token) ? trim((string)$data->token) : '';
    }
    if ($token === '') {
        http_response_code(401);
        echo json_encode(['status' => 'fail', 'message' => 'Unauthorized']);
        exit();
    }

    if (!isset($data->usrname) || empty($data->usrname)) {
        http_response_code(400);
        echo json_encode(['status' => 'fail', 'message' => 'usrname is required']);
        exit();
    }

    $usrname = $data->usrname;

    try {
        $pdo = new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $stmt = $pdo->prepare("SELECT usrname, authorty FROM users WHERE token = :token AND token_expiration > NOW() LIMIT 1");
        $stmt->bindParam(':token', $token, PDO::PARAM_STR);
        $stmt->execute();
        $caller = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$caller) {
            http_response_code(401);
            echo json_encode(['status' => 'fail', 'message' => 'Unauthorized']);
            exit();
        }

        $callerAuth = strtolower(trim((string)($caller['authorty'] ?? '')));
        $isAdmin = ($callerAuth === 'admin' || $callerAuth === 'godfather');

        if (!$isAdmin && $caller['usrname'] !== $usrname) {
            http_response_code(403);
            echo json_encode(['status' => 'fail', 'message' => 'Forbidden']);
            exit();
        }

        $stmt = $pdo->prepare("SELECT email FROM users WHERE usrname = :usrname");
        $stmt->bindParam(':usrname', $usrname, PDO::PARAM_STR);
        $stmt->execute();

        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user) {
            echo json_encode(['status' => 'success', 'email' => $user['email']]);
        } else {
            http_response_code(404);
            echo json_encode(['status' => 'fail', 'message' => 'User not found']);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'fail', 'message' => 'Server error']);
        error_log("ChangePhone: " . $e->getMessage());
    }
} else {
    http_response_code(405);
    echo json_encode(['status' => 'fail', 'message' => 'Invalid request method']);
}
