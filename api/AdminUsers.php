<?php
date_default_timezone_set('Asia/Shanghai');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['code' => 405, 'msg' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit();
}

require_once '../private/Eaod85401.php';
require_once '../private/mock_api.php';

function respond(int $code, string $msg, $data = null): void
{
    $payload = ['code' => $code, 'msg' => $msg];
    if ($data !== null) {
        $payload['data'] = $data;
    }
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit();
}

function read_json_input(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function get_pdo(): PDO
{
    return new PDO(
        'mysql:host=' . DB_ServerName . ';dbname=' . DB_Name . ';charset=utf8mb4',
        DB_UserName,
        DB_Password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 5,
        ]
    );
}

function is_admin_user(array $user): bool
{
    $authority = strtoupper((string)($user['authorty'] ?? ''));
    $username = strtolower((string)($user['usrname'] ?? ''));
    return $username === 'admin' || in_array($authority, ['ADMIN', 'SUPER', 'R_ADMIN', 'R_SUPER'], true);
}

function remarks_file_path(): string
{
    return dirname(__DIR__) . '/private/remarks.json';
}

function load_remarks_map(): array
{
    $path = remarks_file_path();
    if (!file_exists($path)) {
        return [];
    }

    $content = file_get_contents($path);
    $decoded = json_decode($content, true);
    return is_array($decoded) ? $decoded : [];
}

function save_remarks_map(array $remarks): bool
{
    $path = remarks_file_path();
    $json = json_encode($remarks, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    return file_put_contents($path, $json) !== false;
}

function create_user_storage(string $userId): void
{
    $storageDir = dirname(__DIR__) . '/user/storage/' . $userId;
    $appsDir = dirname(__DIR__) . '/user/apps/' . $userId;
    $wallDir = $storageDir . '/wall';
    $iconDir = $storageDir . '/icons';

    if (!is_dir($wallDir)) {
        mkdir($wallDir, 0777, true);
    }
    if (!is_dir($appsDir)) {
        mkdir($appsDir, 0777, true);
    }
    if (!is_dir($iconDir)) {
        mkdir($iconDir, 0777, true);
    }

    $defaultProfile = dirname(__DIR__) . '/assets/imgs/useracc.png';
    $targetProfile = $wallDir . '/Prof.png';
    if (file_exists($defaultProfile) && !file_exists($targetProfile)) {
        @copy($defaultProfile, $targetProfile);
    }

    @file_put_contents($storageDir . '/.htaccess', "Order Deny,Allow\nDeny from all\n");
    @file_put_contents($appsDir . '/.htaccess', "Order Deny,Allow\nDeny from all\n");
}

try {
    $data = read_json_input();
    $token = trim((string)($data['token'] ?? ''));
    $action = trim((string)($data['action'] ?? ''));

    if ($token === '' || $action === '') {
        respond(400, '缺少 token 或 action');
    }

    if (is_mock_token($token)) {
        if ($action === 'list') {
            respond(200, 'ok', mock_demo_users());
        }

        if ($action === 'add') {
            $newUser = [
                'userid' => 'demo' . mt_rand(100, 999),
                'usrname' => trim((string)($data['username'] ?? $data['usrname'] ?? 'demo-user')),
                'email' => trim((string)($data['email'] ?? 'demo-new@example.com')),
                'Expire' => trim((string)($data['expire'] ?? '2099-12-31')),
                'authorty' => trim((string)($data['authority'] ?? $data['authorty'] ?? 'R_USER')),
                'remark' => trim((string)($data['remark'] ?? 'mock 新增账号')),
            ];
            respond(200, '账号添加成功 (mock)', $newUser);
        }

        if (in_array($action, ['renew', 'update_password', 'update_email', 'update_remark', 'delete'], true)) {
            respond(200, '操作成功 (mock)');
        }

        respond(400, '无效操作');
    }

    $pdo = get_pdo();

    $tokenStmt = $pdo->prepare('SELECT * FROM users WHERE token = :token LIMIT 1');
    $tokenStmt->execute([':token' => $token]);
    $currentUser = $tokenStmt->fetch();

    if (!$currentUser) {
        respond(401, '无效 token');
    }

    if (!is_admin_user($currentUser)) {
        respond(403, '无权限操作下级账号');
    }

    if ($action === 'list') {
        $remarks = load_remarks_map();
        $stmt = $pdo->query('SELECT userid, usrname, email, Expire, authorty FROM users ORDER BY usrname ASC, userid ASC');
        $users = $stmt->fetchAll();

        foreach ($users as &$user) {
            $user['remark'] = $remarks[$user['userid']] ?? '';
        }

        respond(200, 'ok', $users);
    }

    if ($action === 'add') {
        $username = trim((string)($data['username'] ?? $data['usrname'] ?? ''));
        $email = trim((string)($data['email'] ?? ''));
        $password = trim((string)($data['password'] ?? ''));
        $expire = trim((string)($data['expire'] ?? $data['expire_date'] ?? ''));
        $authority = trim((string)($data['authority'] ?? $data['authorty'] ?? 'R_USER'));
        $remark = trim((string)($data['remark'] ?? ''));

        if ($username === '' || $email === '' || $password === '' || $expire === '') {
            respond(400, '缺少必要字段');
        }

        $existsStmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE usrname = :usrname OR email = :email');
        $existsStmt->execute([':usrname' => $username, ':email' => $email]);
        if ((int)$existsStmt->fetchColumn() > 0) {
            respond(409, '用户名或邮箱已存在');
        }

        do {
            $userId = substr(uniqid((string)mt_rand(), true), 0, 6);
            $idStmt = $pdo->prepare('SELECT COUNT(*) FROM users WHERE userid = :userid');
            $idStmt->execute([':userid' => $userId]);
            $idExists = (int)$idStmt->fetchColumn() > 0;
        } while ($idExists);

        $insertStmt = $pdo->prepare(
            'INSERT INTO users (userid, usrname, profilepic, email, password, Expire, subtype, authorty)
             VALUES (:userid, :usrname, :profilepic, :email, :password, :expire, :subtype, :authorty)'
        );
        $insertStmt->execute([
            ':userid' => $userId,
            ':usrname' => $username,
            ':profilepic' => 'Prof.png',
            ':email' => $email,
            ':password' => password_hash($password, PASSWORD_DEFAULT),
            ':expire' => $expire,
            ':subtype' => '12 Month',
            ':authorty' => $authority,
        ]);

        create_user_storage($userId);

        if ($remark !== '') {
            $remarks = load_remarks_map();
            $remarks[$userId] = $remark;
            save_remarks_map($remarks);
        }

        respond(200, '账号添加成功', [
            'userid' => $userId,
            'usrname' => $username,
            'email' => $email,
            'Expire' => $expire,
            'authorty' => $authority,
            'remark' => $remark,
        ]);
    }

    if ($action === 'renew') {
        $userId = trim((string)($data['userid'] ?? ''));
        $expire = trim((string)($data['expire'] ?? $data['expire_date'] ?? ''));
        if ($userId === '' || $expire === '') {
            respond(400, '缺少 userid 或 expire');
        }

        $stmt = $pdo->prepare('UPDATE users SET Expire = :expire WHERE userid = :userid');
        $stmt->execute([':expire' => $expire, ':userid' => $userId]);
        respond(200, '续期成功');
    }

    if ($action === 'update_password') {
        $userId = trim((string)($data['userid'] ?? ''));
        $password = trim((string)($data['password'] ?? ''));
        if ($userId === '' || $password === '') {
            respond(400, '缺少 userid 或 password');
        }

        $stmt = $pdo->prepare('UPDATE users SET password = :password WHERE userid = :userid');
        $stmt->execute([
            ':password' => password_hash($password, PASSWORD_DEFAULT),
            ':userid' => $userId,
        ]);
        respond(200, '密码修改成功');
    }

    if ($action === 'update_email') {
        $userId = trim((string)($data['userid'] ?? ''));
        $email = trim((string)($data['email'] ?? ''));
        if ($userId === '' || $email === '') {
            respond(400, '缺少 userid 或 email');
        }

        $stmt = $pdo->prepare('UPDATE users SET email = :email WHERE userid = :userid');
        $stmt->execute([':email' => $email, ':userid' => $userId]);
        respond(200, '邮箱修改成功');
    }

    if ($action === 'update_remark') {
        $userId = trim((string)($data['userid'] ?? ''));
        $remark = (string)($data['remark'] ?? '');
        if ($userId === '') {
            respond(400, '缺少 userid');
        }

        $remarks = load_remarks_map();
        if (trim($remark) === '') {
            unset($remarks[$userId]);
        } else {
            $remarks[$userId] = $remark;
        }

        if (!save_remarks_map($remarks)) {
            respond(500, '备注保存失败');
        }

        respond(200, '备注更新成功');
    }

    if ($action === 'delete') {
        $userId = trim((string)($data['userid'] ?? ''));
        if ($userId === '') {
            respond(400, '缺少 userid');
        }

        $appStmt = $pdo->prepare('DELETE FROM custom_app WHERE user_id = :userid');
        $appStmt->execute([':userid' => $userId]);

        $userStmt = $pdo->prepare('DELETE FROM users WHERE userid = :userid');
        $userStmt->execute([':userid' => $userId]);

        $remarks = load_remarks_map();
        if (isset($remarks[$userId])) {
            unset($remarks[$userId]);
            save_remarks_map($remarks);
        }

        respond(200, '账号删除成功');
    }

    respond(400, '无效操作');
} catch (PDOException $exception) {
    http_response_code(500);
    echo json_encode([
        'code' => 500,
        'msg' => '数据库错误: ' . $exception->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'code' => 500,
        'msg' => '服务器错误: ' . $exception->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}