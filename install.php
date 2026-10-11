<?php
/**
 * Fisher / Panda V6 Web Installer
 * - Checks PHP/runtime environment
 * - Writes .env
 * - Optionally imports docker/init.sql
 * - Creates/resets administrator account
 * - Writes install.lock after a successful install
 */
declare(strict_types=1);

date_default_timezone_set('Asia/Shanghai');

$root = __DIR__;
$lockFile = $root . '/install.lock';
$envFile = $root . '/.env';
$initSql = $root . '/docker/init.sql';

function h($v): string { return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); }
function rand_hex(int $bytes): string { return bin2hex(random_bytes($bytes)); }
function check_item(string $name, bool $ok, string $detail = ''): array { return compact('name', 'ok', 'detail'); }
function env_line(string $k, string $v): string { return $k . '=' . str_replace(["\r", "\n"], '', $v) . "\n"; }

function split_sql_statements(string $sql): array {
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $parts = [];
    $buf = '';
    $inSingle = false;
    $inDouble = false;
    $len = strlen($sql);
    for ($i = 0; $i < $len; $i++) {
        $ch = $sql[$i];
        $prev = $i > 0 ? $sql[$i - 1] : '';
        if ($ch === "'" && !$inDouble && $prev !== '\\') $inSingle = !$inSingle;
        if ($ch === '"' && !$inSingle && $prev !== '\\') $inDouble = !$inDouble;
        if ($ch === ';' && !$inSingle && !$inDouble) {
            $stmt = trim($buf);
            if ($stmt !== '') $parts[] = $stmt;
            $buf = '';
        } else {
            $buf .= $ch;
        }
    }
    $stmt = trim($buf);
    if ($stmt !== '') $parts[] = $stmt;
    return $parts;
}

function table_exists(PDO $pdo, string $table): bool {
    $stmt = $pdo->prepare('SHOW TABLES LIKE :table');
    $stmt->execute([':table' => $table]);
    return (bool)$stmt->fetchColumn();
}

function column_exists(PDO $pdo, string $table, string $column): bool {
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE :column");
    $stmt->execute([':column' => $column]);
    return (bool)$stmt->fetchColumn();
}

$checks = [
    check_item('PHP >= 7.4', version_compare(PHP_VERSION, '7.4.0', '>='), PHP_VERSION),
    check_item('PDO 扩展', extension_loaded('pdo'), extension_loaded('pdo') ? '已启用' : '未启用'),
    check_item('PDO MySQL 扩展', extension_loaded('pdo_mysql'), extension_loaded('pdo_mysql') ? '已启用' : '未启用'),
    check_item('JSON 扩展', extension_loaded('json'), extension_loaded('json') ? '已启用' : '未启用'),
    check_item('OpenSSL 扩展', extension_loaded('openssl'), extension_loaded('openssl') ? '已启用' : '未启用'),
    check_item('cURL 扩展', extension_loaded('curl'), extension_loaded('curl') ? '已启用' : '未启用'),
    check_item('Zip 扩展', extension_loaded('zip'), extension_loaded('zip') ? '已启用' : '未启用'),
    check_item('根目录可写', is_writable($root), is_writable($root) ? $root : '请调整权限'),
    check_item('private 目录存在', is_dir($root . '/private'), $root . '/private'),
    check_item('docker/init.sql 存在', is_file($initSql), $initSql),
];

$locked = is_file($lockFile);
$result = null;
$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$locked) {
    $dbHost = trim($_POST['db_host'] ?? '127.0.0.1');
    $dbName = trim($_POST['db_name'] ?? '');
    $dbUser = trim($_POST['db_user'] ?? '');
    $dbPass = (string)($_POST['db_pass'] ?? '');
    $adminUser = trim($_POST['admin_user'] ?? 'admin');
    $adminPass = (string)($_POST['admin_pass'] ?? '');
    $adminEmail = trim($_POST['admin_email'] ?? 'admin@example.com');
    $expire = trim($_POST['expire'] ?? date('Y-m-d', strtotime('+10 years')));
    $initDb = isset($_POST['init_db']);

    try {
        if ($dbHost === '' || $dbName === '' || $dbUser === '') throw new RuntimeException('请填写数据库主机、库名、用户名。');
        if ($adminUser === '' || strlen($adminPass) < 6) throw new RuntimeException('管理员用户名不能为空，密码至少 6 位。');
        if (!extension_loaded('pdo_mysql')) throw new RuntimeException('缺少 pdo_mysql 扩展。');

        $dsn = "mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4";
        $pdo = new PDO($dsn, $dbUser, $dbPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);

        if ($initDb && is_file($initSql)) {
            foreach (split_sql_statements(file_get_contents($initSql)) as $stmt) {
                $pdo->exec($stmt);
            }
        }
        if (!table_exists($pdo, 'users')) throw new RuntimeException('users 表不存在；请勾选“导入/修复基础表结构”或先导入 docker/init.sql。');

        $userid = null;
        $stmt = $pdo->prepare('SELECT userid FROM users WHERE usrname = :usrname ORDER BY userid LIMIT 1');
        $stmt->execute([':usrname' => $adminUser]);
        $userid = $stmt->fetchColumn();
        $hash = password_hash($adminPass, PASSWORD_DEFAULT);
        $auth = 'ADMIN';
        $subtype = 'ADMIN';

        if ($userid) {
            $sql = 'UPDATE users SET password = :password, email = :email, authorty = :authorty';
            $params = [':password' => $hash, ':email' => $adminEmail, ':authorty' => $auth, ':userid' => $userid];
            if (column_exists($pdo, 'users', 'Expire')) { $sql .= ', Expire = :expire'; $params[':expire'] = $expire; }
            if (column_exists($pdo, 'users', 'token')) $sql .= ', token = NULL';
            if (column_exists($pdo, 'users', 'token_expiration')) $sql .= ', token_expiration = NULL';
            $sql .= ' WHERE userid = :userid';
            $pdo->prepare($sql)->execute($params);
        } else {
            do { $userid = (string)random_int(100000, 999999); $s = $pdo->prepare('SELECT COUNT(*) FROM users WHERE userid = :id'); $s->execute([':id' => $userid]); } while ((int)$s->fetchColumn() > 0);
            $pdo->prepare('INSERT INTO users (userid, usrname, profilepic, email, password, Expire, subtype, authorty) VALUES (:userid, :usrname, :profilepic, :email, :password, :expire, :subtype, :authorty)')
                ->execute([':userid' => $userid, ':usrname' => $adminUser, ':profilepic' => 'Prof.png', ':email' => $adminEmail, ':password' => $hash, ':expire' => $expire, ':subtype' => $subtype, ':authorty' => $auth]);
        }

        $env = '';
        $env .= env_line('DB_SERVER', $dbHost);
        $env .= env_line('DB_USER', $dbUser);
        $env .= env_line('DB_PASS', $dbPass);
        $env .= env_line('DB_NAME', $dbName);
        $env .= env_line('SECRIT_KEY', rand_hex(24));
        $env .= env_line('SIV', substr(rand_hex(16), 0, 16));
        $env .= env_line('SIV_JEC', rand_hex(16));
        $env .= env_line('ADMIN_KEY', $adminPass);
        $env .= env_line('ADMIN_PATH', rand_hex(12));
        $env .= env_line('WS_SECRET', rand_hex(16));
        $env .= env_line('DEVICE_OWNERSHIP_LOCK', '1');
        file_put_contents($envFile, $env, LOCK_EX);
        @chmod($envFile, 0600);

        $lock = [
            'installed_at' => date('c'),
            'admin_user' => $adminUser,
            'admin_userid' => $userid,
            'db_host' => $dbHost,
            'db_name' => $dbName,
            'schema_checked' => true,
            'init_db_requested' => $initDb,
        ];
        file_put_contents($lockFile, json_encode($lock, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
        @chmod($lockFile, 0600);
        $locked = true;
        $result = '安装完成：已写入 .env，已创建/重置管理员账号，并已生成 install.lock。';
    } catch (Throwable $e) {
        $error = $e->getMessage();
    }
}
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fisher / Panda V6 安装器</title>
<style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,"Microsoft YaHei",sans-serif;background:#0f172a;color:#e5e7eb}.wrap{max-width:980px;margin:36px auto;padding:0 18px}.card{background:#111827;border:1px solid #263244;border-radius:14px;padding:22px;margin-bottom:18px;box-shadow:0 14px 40px rgba(0,0,0,.25)}h1{margin:0 0 8px;font-size:26px}.muted{color:#94a3b8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.check{padding:12px;border-radius:10px;background:#0b1220;border:1px solid #243044}.ok{color:#22c55e}.bad{color:#f87171}label{display:block;margin:12px 0 6px;color:#cbd5e1}input{width:100%;box-sizing:border-box;border:1px solid #334155;background:#0b1220;color:#f8fafc;border-radius:9px;padding:11px 12px;font-size:14px}button{margin-top:16px;border:0;border-radius:10px;background:#2563eb;color:white;padding:12px 18px;font-weight:700;cursor:pointer}.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.alert{padding:13px 15px;border-radius:10px;margin-bottom:16px}.success{background:#052e1b;border:1px solid #166534;color:#bbf7d0}.error{background:#3b1111;border:1px solid #991b1b;color:#fecaca}.locked{background:#422006;border:1px solid #92400e;color:#fde68a}code{background:#020617;padding:2px 6px;border-radius:5px}.checkbox{display:flex;gap:8px;align-items:center;margin-top:12px}.checkbox input{width:auto}</style>
</head>
<body><div class="wrap">
<div class="card"><h1>Fisher / Panda V6 安装器</h1><div class="muted">用于首次部署校验环境、写入 <code>.env</code>、导入基础表结构、创建或重置管理员账号。安装完成后会生成 <code>install.lock</code> 并锁定本页面。</div></div>
<?php if ($locked): ?><div class="alert locked">已检测到 <code>install.lock</code>，安装器已锁定。需要重新安装时，请先在服务器手动删除该文件。</div><?php endif; ?>
<?php if ($result): ?><div class="alert success"><?=h($result)?></div><?php endif; ?>
<?php if ($error): ?><div class="alert error">安装失败：<?=h($error)?></div><?php endif; ?>
<div class="card"><h2>环境校验</h2><div class="grid"><?php foreach ($checks as $c): ?><div class="check"><strong class="<?=$c['ok']?'ok':'bad'?>"><?=$c['ok']?'✓':'×'?> <?=h($c['name'])?></strong><br><span class="muted"><?=h($c['detail'])?></span></div><?php endforeach; ?></div></div>
<?php if (!$locked): ?><form class="card" method="post" autocomplete="off"><h2>数据库与管理员</h2><div class="row"><div><label>数据库主机</label><input name="db_host" value="127.0.0.1" required></div><div><label>数据库名</label><input name="db_name" required></div></div><div class="row"><div><label>数据库用户名</label><input name="db_user" required></div><div><label>数据库密码</label><input name="db_pass" type="password"></div></div><div class="checkbox"><input type="checkbox" name="init_db" id="init_db" checked><label for="init_db" style="margin:0">导入/修复基础表结构 docker/init.sql</label></div><div class="row"><div><label>管理员用户名</label><input name="admin_user" value="admin" required></div><div><label>管理员邮箱</label><input name="admin_email" value="admin@example.com" required></div></div><div class="row"><div><label>管理员新密码</label><input name="admin_pass" type="password" minlength="6" required></div><div><label>账号到期日期</label><input name="expire" value="<?=h(date('Y-m-d', strtotime('+10 years')))?>" required></div></div><button type="submit">开始安装 / 重置管理员</button></form><?php endif; ?>
</div></body></html>
