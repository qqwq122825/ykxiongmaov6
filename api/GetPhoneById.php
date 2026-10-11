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

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'));

    $token = isset($data->token) ? trim((string)$data->token) : '';
    if ($token === '') {
        http_response_code(401);
        echo json_encode(['status' => 'fail', 'message' => 'Unauthorized']);
        exit();
    }

    if (!isset($data->phone_id) || empty($data->phone_id)) {
        http_response_code(400);
        echo json_encode(['status' => 'fail', 'message' => 'phone_id is required']);
        exit();
    }

    $phone_id = $data->phone_id;

    try {
        $pdo = new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $stmt = $pdo->prepare("SELECT usrname, authorty FROM users WHERE token = :token LIMIT 1");
        $stmt->bindParam(':token', $token, PDO::PARAM_STR);
        $stmt->execute();
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user) {
            http_response_code(401);
            echo json_encode(['status' => 'fail', 'message' => 'Unauthorized']);
            exit();
        }

        $authorty = strtolower((string)($user['authorty'] ?? ''));
        $isAdmin = ($authorty === 'admin');

        if ($isAdmin) {
            $stmt = $pdo->prepare("SELECT * FROM phones WHERE phone_id = :phone_id");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM phones WHERE phone_id = :phone_id AND usrname = :usrname");
            $stmt->bindParam(':usrname', $user['usrname'], PDO::PARAM_STR);
        }
        $stmt->bindParam(':phone_id', $phone_id, PDO::PARAM_STR);
        $stmt->execute();

        $device = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($device) {
            echo json_encode(['status' => 'success', 'device' => $device]);
        } else {
            http_response_code(404);
            echo json_encode(['status' => 'fail', 'message' => 'Device not found']);
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'fail', 'message' => 'Server error']);
        error_log("GetPhoneById: " . $e->getMessage());
    }
} else {
    http_response_code(405);
    echo json_encode(['status' => 'fail', 'message' => 'Invalid request method']);
}
