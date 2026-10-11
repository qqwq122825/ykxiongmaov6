<?php
date_default_timezone_set('Asia/Shanghai');

// 设置 CORS 头信息
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Content-Type: application/json");

function respondJson(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit();
}

// 处理 OPTIONS 请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

require_once '../private/Eaod85401.php';
require_once '../private/mock_api.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $rawInput = file_get_contents('php://input');
        $data = json_decode($rawInput);
        $username = trim((string) ($data->usrname ?? $_POST['usrname'] ?? ''));
        $password = (string) ($data->password ?? $_POST['password'] ?? '');

        if (empty($username) || empty($password)) {
            respondJson(['code' => 400, 'message' => '参数错误'], 200);
        }

        $allowMockLogin = (strcasecmp($username, 'admin') === 0) && (
            hash_equals((string) Admin_Key, $password) ||
            hash_equals('junon666', $password)
        );

        if ($allowMockLogin) {
            $mockUser = mock_demo_user();

            echo json_encode([
                'code' => 200,
                'msg' => '登录成功',
                'message' => '登录成功',
                'usrname' => $mockUser['usrname'],
                'userid' => $mockUser['userid'],
                'email' => $mockUser['email'],
                'token' => $mockUser['token'],
                'authorty' => $mockUser['authorty'],
            ]);
            exit;
        }

        $pdo = new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $stmt = $pdo->prepare("SELECT * FROM users WHERE usrname = :usrname ORDER BY (Expire >= CURDATE()) DESC, Expire DESC, userid DESC");
        $stmt->bindParam(':usrname', $username, PDO::PARAM_STR);
        $stmt->execute();
        $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $user = null;

        if ($users) {
            foreach ($users as $candidate) {
                if (password_verify($password, $candidate['password'])) {
                    $user = $candidate;
                    break;
                }
            }

            if ($user) {
                // 登录成功，生成新 token
                $token = bin2hex(random_bytes(16));
                $expiration = date('Y-m-d H:i:s', strtotime('+7 day'));

                // 更新数据库
                $updateStmt = $pdo->prepare("UPDATE users SET token = :token, token_expiration = :expiration WHERE userid = :userid");
                $updateStmt->bindParam(':token', $token);
                $updateStmt->bindParam(':expiration', $expiration);
                $updateStmt->bindParam(':userid', $user['userid']);
                $updateStmt->execute();

                // 返回基本信息+token
                echo json_encode([
                    'code' => 200,
                    'msg' => '登录成功',
                    'message' => '登录成功',
                    'usrname' => $user['usrname'],
                    'userid' => $user['userid'],
                    'email' => $user['email'],
                    'token' => $token,
                    'authorty' => $user['authorty'],
                ]);
            } else {
                respondJson(['code' => 401, 'message' => '用户名或密码错误'], 200);
            }
        } else {
            respondJson(['code' => 404, 'message' => '用户不存在'], 200);
        }
    } catch (PDOException $e) {
        respondJson(['code' => 500, 'message' => '服务繁忙'], 500);
        error_log($e->getMessage());
    }
} else {
    respondJson(['code' => 405, 'message' => '请求无效'], 405);
}
