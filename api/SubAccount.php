<?php
/**
 * 章鱼出海 - 子账户管理 API
 * 自动检测数据库可用性，不可用时使用 Mock 演示模式
 */
date_default_timezone_set('Asia/Shanghai');

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

// 尝试加载真实数据库，失败则使用 mock
$useMock = false;
try {
    require_once __DIR__ . '/../private/Eaod85401.php';
    $pdo = new PDO("mysql:host=" . DB_ServerName . ";dbname=" . DB_Name . ";charset=utf8mb4", DB_UserName, DB_Password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 检查 users 表是否存在
    $check = $pdo->query("SHOW TABLES LIKE 'users'");
    if ($check->rowCount() === 0) {
        $useMock = true;
    }
} catch (Exception $e) {
    $useMock = true;
}

if ($useMock) {
    // ======== MOCK MODE ========
    require_once __DIR__ . '/../private/mock_api.php';

    $token = '';
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)/i', $authHeader, $m)) {
        $token = trim($m[1]);
    }
    if ($token === '') {
        $token = $_GET['token'] ?? '';
    }

    // 兼容 panda auth_token
    if ($token === '' && isset($_GET['auth_token'])) {
        $token = $_GET['auth_token'];
    }

    $authUser = null;
    $adminKey = getenv('ADMIN_KEY') ?: 'junon666';
    if ($token === '' || $token === 'demo-token-local' || $token === $adminKey) {
        $authUser = mock_demo_user();
    }

    if (!$authUser) {
        http_response_code(401);
        echo json_encode(['Fail' => '未授权，请重新登录']);
        exit();
    }

    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = $data['action'] ?? ($_GET['action'] ?? '');

    switch ($action) {
        case 'list':
            $searchTerm = $_GET['search'] ?? '';
            $users = mock_demo_users();
            if ($searchTerm) {
                $users = array_filter($users, function($u) use ($searchTerm) {
                    return stripos($u['usrname'], $searchTerm) !== false || stripos($u['email'], $searchTerm) !== false;
                });
                $users = array_values($users);
            }
            foreach ($users as &$user) {
                $user['device_count'] = rand(1, 5);
                $user['online_device_count'] = rand(0, 3);
                $user['account_online'] = $user['online_device_count'] > 0;
            }
            echo json_encode(['Success' => true, 'accounts' => $users], JSON_UNESCAPED_UNICODE);
            break;

        case 'add':
            echo json_encode(['Success' => '演示模式：子账户创建成功（模拟）'], JSON_UNESCAPED_UNICODE);
            break;

        case 'renew':
            echo json_encode(['Success' => '演示模式：续费成功（模拟）'], JSON_UNESCAPED_UNICODE);
            break;

        case 'update_password':
            echo json_encode(['Success' => '演示模式：密码更新成功（模拟）'], JSON_UNESCAPED_UNICODE);
            break;

        case 'update_email':
            echo json_encode(['Success' => '演示模式：邮箱更新成功（模拟）'], JSON_UNESCAPED_UNICODE);
            break;

        case 'login_as':
            $userid = $data['userid'] ?? 'demo002';
            $demoUsers = mock_demo_users();
            $targetUser = null;
            foreach ($demoUsers as $u) {
                if ($u['userid'] === $userid) { $targetUser = $u; break; }
            }
            if (!$targetUser) {
                $targetUser = $demoUsers[0];
            }
            echo json_encode([
                'Success' => '切换登录成功',
                'login' => [
                    'token' => 'sub-token-' . $targetUser['userid'],
                    'userid' => $targetUser['userid'],
                    'usrname' => $targetUser['usrname'],
                    'email' => $targetUser['email'],
                    'authorty' => 'clients'
                ]
            ], JSON_UNESCAPED_UNICODE);
            break;

        case 'delete':
            echo json_encode(['Success' => '演示模式：子账户删除成功（模拟）'], JSON_UNESCAPED_UNICODE);
            break;

        default:
            echo json_encode(['Fail' => '无效操作'], JSON_UNESCAPED_UNICODE);
    }

    exit();
} // end mock

// ======== REAL DB MODE ========
require_once __DIR__ . '/../private/Eaod29251.php';
require_once __DIR__ . '/../private/Eaod14881.php';

function getAuthUser($pdo) {
    $token = '';
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (preg_match('/Bearer\s+(.+)/i', $authHeader, $m)) {
        $token = trim($m[1]);
    }
    if ($token === '') {
        $token = $_GET['token'] ?? '';
    }
    if ($token === '') {
        return null;
    }
    $stmt = $pdo->prepare("SELECT userid, usrname, email, authorty, Expire FROM users WHERE token = :token AND token_expiration > NOW() LIMIT 1");
    $stmt->bindParam(':token', $token, PDO::PARAM_STR);
    $stmt->execute();
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function isUserIDTaken($pdo, $userID) {
    $stmt = $pdo->prepare('SELECT COUNT(*) AS count FROM users WHERE userid = :uuid');
    $stmt->bindParam(':uuid', $userID);
    $stmt->execute();
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    return $result['count'] > 0;
}

function validatePassword($password) {
    if (strlen($password) < 6) return '密码长度至少 6 位';
    if (strlen($password) > 128) return '密码长度不能超过 128 位';
    if (!preg_match('/[a-zA-Z]/', $password)) return '密码需包含至少一个字母';
    if (!preg_match('/[0-9]/', $password)) return '密码需包含至少一个数字';
    return true;
}

function createUserFolder($UserID) {
    $baseDirectory = __DIR__ . '/../user/storage/';
    $AppsDirectory = __DIR__ . '/../user/apps/';
    $assetsImagePath = __DIR__ . '/../assets/imgs/useracc.png';
    $userwalldir = $baseDirectory . $UserID . '/wall';
    if (!is_dir($userwalldir)) {
        mkdir($userwalldir, 0777, true);
    }
    $destinationImage = $userwalldir . '/Prof.png';
    if (file_exists($assetsImagePath)) {
        copy($assetsImagePath, $destinationImage);
    }
    $userDirectory = $baseDirectory . $UserID . '/';
    $userAppsDirectory = $AppsDirectory . $UserID . '/';
    $userIconDir = $baseDirectory . $UserID . '/icons/';
    if (!is_dir($userDirectory)) mkdir($userDirectory, 0777, true);
    if (!is_dir($userAppsDirectory)) mkdir($userAppsDirectory, 0777, true);
    if (!is_dir($userIconDir)) mkdir($userIconDir, 0777, true);
    file_put_contents($userDirectory . '.htaccess', "Order Deny,Allow\nDeny from all\n");
    file_put_contents($userAppsDirectory . '.htaccess', "Order Deny,Allow\nDeny from all\n");
}

// 确保 users 表有 parent_id 列
$colCheck = $pdo->prepare("SHOW COLUMNS FROM users LIKE 'parent_id'");
$colCheck->execute();
if ($colCheck->rowCount() === 0) {
    $pdo->exec("ALTER TABLE users ADD COLUMN parent_id varchar(20) DEFAULT NULL, ADD KEY idx_parent_id (parent_id)");
}

$authUser = getAuthUser($pdo);
if (!$authUser) {
    http_response_code(401);
    echo json_encode(['Fail' => '未授权，请重新登录']);
    exit();
}

if ($authUser['authorty'] !== 'admin' && $authUser['authorty'] !== 'godfather') {
    http_response_code(403);
    echo json_encode(['Fail' => '权限不足，仅管理员可管理子账户']);
    exit();
}

$parentId = $authUser['userid'];
$data = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $data['action'] ?? ($_GET['action'] ?? '');

if ($action === 'list') {
    $searchTerm = $_GET['search'] ?? '';
    if (!empty($searchTerm)) {
        $searchTermEncrypted = EN($searchTerm);
        $stmt = $pdo->prepare("SELECT userid, usrname, email, Expire, authorty FROM users WHERE authorty = 'clients' AND parent_id = :parent_id AND (usrname LIKE CONCAT('%', :searchTerm, '%') OR email LIKE CONCAT('%', :searchTermEnc, '%'))");
        $stmt->bindParam(':parent_id', $parentId);
        $stmt->bindParam(':searchTerm', $searchTerm);
        $stmt->bindParam(':searchTermEnc', $searchTermEncrypted);
    } else {
        $stmt = $pdo->prepare("SELECT userid, usrname, email, Expire, authorty FROM users WHERE authorty = 'clients' AND parent_id = :parent_id");
        $stmt->bindParam(':parent_id', $parentId);
    }
    $stmt->execute();
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $statsStmt = $pdo->prepare("SELECT COUNT(*) AS device_count, SUM(CASE WHEN isonline = 1 AND last_ping >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 ELSE 0 END) AS online_device_count FROM phones WHERE usrname = :usrname");
    foreach ($users as &$user) {
        try {
            $decryptedEmail = DE($user['email']);
            if ($decryptedEmail !== false && $decryptedEmail !== 'empty' && $decryptedEmail !== '' && mb_check_encoding($decryptedEmail, 'UTF-8')) {
                $user['email'] = $decryptedEmail;
            }
        } catch (Exception $e) {}
        $statsStmt->bindValue(':usrname', $user['usrname'], PDO::PARAM_STR);
        $statsStmt->execute();
        $stats = $statsStmt->fetch(PDO::FETCH_ASSOC) ?: ['device_count' => 0, 'online_device_count' => 0];
        $user['device_count'] = (int)($stats['device_count'] ?? 0);
        $user['online_device_count'] = (int)($stats['online_device_count'] ?? 0);
        $user['account_online'] = $user['online_device_count'] > 0;
    }
    echo json_encode(['Success' => true, 'accounts' => $users], JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);

} elseif ($action === 'add') {
    $username = $data['username'] ?? '';
    $email = EN($data['email'] ?? '');
    $password = $data['password'] ?? '';
    $expire_date = $data['expire_date'] ?? '';
    if (empty($username) || empty($email) || empty($password) || empty($expire_date)) {
        echo json_encode(['Fail' => '请填写所有必填字段']);
        exit();
    }
    $result2 = validatePassword($password);
    if ($result2 !== true) {
        echo json_encode(['Fail' => $result2]);
        exit();
    }
    $maxSubAccounts = 10;
    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE parent_id = :parent_id AND authorty = 'clients'");
    $countStmt->bindParam(':parent_id', $parentId);
    $countStmt->execute();
    $currentCount = $countStmt->fetchColumn();
    if ($currentCount >= $maxSubAccounts) {
        echo json_encode(['Fail' => "子账户数量已达上限（{$maxSubAccounts}个）"]);
        exit();
    }
    $pass = password_hash($password, PASSWORD_DEFAULT);
    $profilePic = 'Prof.png';
    $subtype = '12 Month';
    do { $newid = substr("" . uniqid(rand()), 0, 6); } while (isUserIDTaken($pdo, $newid));
    $stmt = $pdo->prepare("INSERT INTO users (userid, usrname, profilepic, email, password, Expire, subtype, authorty, parent_id) VALUES (:userid, :usrname, :profilepic, :email, :password, :expire, :subtype, 'admin', :parent_id)");
    $stmt->bindParam(':userid', $newid);
    $stmt->bindParam(':usrname', $username);
    $stmt->bindParam(':profilepic', $profilePic);
    $stmt->bindParam(':email', $email);
    $stmt->bindParam(':password', $pass);
    $stmt->bindParam(':expire', $expire_date);
    $stmt->bindParam(':subtype', $subtype);
    $stmt->bindParam(':parent_id', $parentId);
    if ($stmt->execute()) {
        createUserFolder($newid);
        echo json_encode(['Success' => '子账户创建成功']);
    } else {
        echo json_encode(['Fail' => '子账户创建失败']);
    }

} elseif ($action === 'renew') {
    $userid = $data['userid'] ?? '';
    $expire_date = $data['expire_date'] ?? '';
    if (empty($userid) || empty($expire_date)) {
        echo json_encode(['Fail' => '请提供用户ID和新的到期日期']);
        exit();
    }
    $stmt = $pdo->prepare("UPDATE users SET Expire = :expire_date WHERE userid = :userid AND parent_id = :parent_id AND authorty = 'clients'");
    $stmt->bindParam(':userid', $userid);
    $stmt->bindParam(':expire_date', $expire_date);
    $stmt->bindParam(':parent_id', $parentId);
    if ($stmt->execute() && $stmt->rowCount() > 0) {
        echo json_encode(['Success' => '续费成功']);
    } else {
        echo json_encode(['Fail' => '续费失败，账户不存在或无权操作']);
    }

} elseif ($action === 'update_password') {
    $userid = $data['userid'] ?? '';
    $password = $data['password'] ?? '';
    if (empty($userid) || empty($password)) {
        echo json_encode(['Fail' => '请提供用户ID和新密码']);
        exit();
    }
    $result2 = validatePassword($password);
    if ($result2 !== true) {
        echo json_encode(['Fail' => $result2]);
        exit();
    }
    $newPass = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $pdo->prepare("UPDATE users SET password = :password WHERE userid = :userid AND parent_id = :parent_id AND authorty = 'clients'");
    $stmt->bindParam(':userid', $userid);
    $stmt->bindParam(':password', $newPass);
    $stmt->bindParam(':parent_id', $parentId);
    if ($stmt->execute() && $stmt->rowCount() > 0) {
        echo json_encode(['Success' => '密码更新成功']);
    } else {
        echo json_encode(['Fail' => '密码更新失败']);
    }

} elseif ($action === 'update_email') {
    $userid = $data['userid'] ?? '';
    $email = $data['email'] ?? '';
    if (empty($userid) || empty($email)) {
        echo json_encode(['Fail' => '请提供用户ID和新邮箱']);
        exit();
    }
    $encryptedEmail = EN($email);
    $stmt = $pdo->prepare("UPDATE users SET email = :email WHERE userid = :userid AND parent_id = :parent_id AND authorty = 'clients'");
    $stmt->bindParam(':userid', $userid);
    $stmt->bindParam(':email', $encryptedEmail);
    $stmt->bindParam(':parent_id', $parentId);
    if ($stmt->execute() && $stmt->rowCount() > 0) {
        echo json_encode(['Success' => '邮箱更新成功']);
    } else {
        echo json_encode(['Fail' => '邮箱更新失败']);
    }

} elseif ($action === 'login_as') {
    $userid = $data['userid'] ?? '';
    if (empty($userid)) {
        echo json_encode(['Fail' => '请提供用户ID']);
        exit();
    }
    $targetStmt = $pdo->prepare("SELECT userid, usrname, email, authorty, Expire FROM users WHERE userid = :userid AND parent_id = :parent_id AND authorty = 'clients' LIMIT 1");
    $targetStmt->bindParam(':userid', $userid);
    $targetStmt->bindParam(':parent_id', $parentId);
    $targetStmt->execute();
    $targetUser = $targetStmt->fetch(PDO::FETCH_ASSOC);
    if (!$targetUser) {
        echo json_encode(['Fail' => '账户不存在或无权操作']);
        exit();
    }
    $token = bin2hex(random_bytes(16));
    $expiration = date('Y-m-d H:i:s', strtotime('+7 day'));
    $updateStmt = $pdo->prepare("UPDATE users SET token = :token, token_expiration = :expiration WHERE userid = :userid AND parent_id = :parent_id AND authorty = 'clients'");
    $updateStmt->bindParam(':token', $token, PDO::PARAM_STR);
    $updateStmt->bindParam(':expiration', $expiration, PDO::PARAM_STR);
    $updateStmt->bindParam(':userid', $userid, PDO::PARAM_STR);
    $updateStmt->bindParam(':parent_id', $parentId, PDO::PARAM_STR);
    if (!$updateStmt->execute() || $updateStmt->rowCount() <= 0) {
        echo json_encode(['Fail' => '登录切换失败']);
        exit();
    }
    try {
        $decryptedEmail = DE($targetUser['email']);
        if ($decryptedEmail !== false && $decryptedEmail !== 'empty' && $decryptedEmail !== '' && mb_check_encoding($decryptedEmail, 'UTF-8')) {
            $targetUser['email'] = $decryptedEmail;
        }
    } catch (Exception $e) {}
    echo json_encode([
        'Success' => '切换登录成功',
        'login' => [
            'token' => $token,
            'userid' => $targetUser['userid'],
            'usrname' => $targetUser['usrname'],
            'email' => $targetUser['email'],
            'authorty' => $targetUser['authorty']
        ]
    ], JSON_UNESCAPED_UNICODE);

} elseif ($action === 'delete') {
    $userid = $data['userid'] ?? '';
    if (empty($userid)) {
        echo json_encode(['Fail' => '请提供用户ID']);
        exit();
    }
    $delApps = $pdo->prepare("DELETE FROM custom_app WHERE user_id = :userid");
    $delApps->bindParam(':userid', $userid);
    $delApps->execute();
    $stmt = $pdo->prepare("DELETE FROM users WHERE userid = :userid AND parent_id = :parent_id AND authorty = 'clients'");
    $stmt->bindParam(':userid', $userid);
    $stmt->bindParam(':parent_id', $parentId);
    if ($stmt->execute() && $stmt->rowCount() > 0) {
        echo json_encode(['Success' => '子账户删除成功']);
    } else {
        echo json_encode(['Fail' => '删除失败，账户不存在或无权操作']);
    }

} else {
    echo json_encode(['Fail' => '无效操作']);
}
