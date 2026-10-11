<?php

session_start();
require_once 'Eaod14881.php';

// Validate admin login status
if (!isset($_SESSION['admin_logged_in']) || $_SESSION['admin_logged_in'] !== true) {
    $loginUrl = 'login.php';
    if (defined('ADMIN_PATH') && ADMIN_PATH !== '') {
        $loginUrl .= '?key=' . urlencode(ADMIN_PATH);
    }
    header('Location: ' . $loginUrl);
    exit();
}



?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0" />
    <style>
        * {
            -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
            -webkit-tap-highlight-color: transparent;
            -webkit-user-select: text;
            -khtml-user-select: text;
            -moz-user-select: text;
            -ms-user-select: text;
            user-select: text;
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
            -webkit-background-clip: text;
            -webkit-text-fill-color: #333;
            transition: background-color 5000s ease-in-out 0s;
            box-shadow: inset 0 0 20px 20px #ffffff00;
        }

        .material-symbols-outlined {
            font-size: 16px;
            vertical-align: -3px;
            margin-right: 3px;
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20;
        }

        body {
            padding: 0;
            background: #fff;
            color: #333;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            min-height: 100vh;
            font-size: 14px;
        }

        @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px 24px;
        }

        .container > * {
            animation: fadeSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) both;
        }
        .container > *:nth-child(1) { animation-delay: 0.03s; }
        .container > *:nth-child(2) { animation-delay: 0.06s; }
        .container > *:nth-child(3) { animation-delay: 0.09s; }
        .container > *:nth-child(4) { animation-delay: 0.12s; }
        .container > *:nth-child(5) { animation-delay: 0.15s; }
        .container > *:nth-child(6) { animation-delay: 0.18s; }
        .container > *:nth-child(7) { animation-delay: 0.21s; }

        h1 {
            text-align: left;
            margin-bottom: 20px;
            color: #1a1a1a;
            font-size: 20px;
            font-weight: 600;
            padding-bottom: 12px;
            border-bottom: 1px solid #e0e0e0;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        h1 .material-symbols-outlined {
            font-size: 22px;
            vertical-align: -2px;
            color: #666;
        }

        h2 {
            color: #1a1a1a;
            font-size: 15px;
            font-weight: 600;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 5px;
        }

        h2 .material-symbols-outlined {
            font-size: 18px;
            color: #888;
        }

        .logout-button {
            position: fixed;
            top: 18px;
            right: 24px;
            background: transparent;
            color: #888;
            border: 1px solid #ccc;
            padding: 6px 14px;
            border-radius: 3px;
            cursor: pointer;
            font-weight: 400;
            font-size: 13px;
            transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
            z-index: 1000;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .logout-button:hover {
            color: #333;
            border-color: #999;
            background: #f5f5f5;
        }

        .form-section {
            background: transparent;
            padding: 0 0 16px 0;
            border-radius: 0;
            border: none;
            border-bottom: 1px solid #eee;
            margin-bottom: 20px;
        }

        .form-section h2 {
            text-align: left;
            margin-bottom: 14px;
            color: #1a1a1a;
            font-size: 15px;
            font-weight: 600;
            padding-bottom: 0;
            border-bottom: none;
        }

        .form-row {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 10px;
            align-items: center;
        }

        .form-row input,
        .form-row select {
            flex: 1;
            min-width: 200px;
            padding: 8px 10px;
            margin: 3px 0;
            border: 1px solid #d0d0d0;
            border-radius: 3px;
            box-sizing: border-box;
            font-size: 13px;
            transition: border-color 0.25s ease, box-shadow 0.25s ease;
            background: #fff;
            color: #333;
        }

        .form-row input:focus,
        .form-row select:focus {
            outline: none;
            border-color: #555;
            box-shadow: 0 1px 0 0 #555;
        }

        .form-row button,
        .action-button,
        .modal-content button,
        .pagination-container button {
            position: relative;
            overflow: hidden;
        }

        .form-row button::after,
        .action-button::after,
        .modal-content button::after,
        .pagination-container button::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            background: rgba(0, 0, 0, 0.06);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            transition: width 0.4s ease, height 0.4s ease;
        }

        .form-row button:active::after,
        .action-button:active::after,
        .modal-content button:active::after,
        .pagination-container button:active::after {
            width: 200px;
            height: 200px;
            transition: width 0s, height 0s;
        }

        .form-row button {
            flex: 0 0 auto;
            min-width: 100px;
            padding: 7px 14px;
            margin: 3px 0;
            border: 1px solid #ccc;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 400;
            background: #fafafa;
            color: #333;
            transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }

        .form-row button:hover {
            background: #f0f0f0;
            border-color: #aaa;
        }

        .form-row button:active {
            transform: scale(0.97);
        }

        .form-row button:nth-child(1),
        .form-row button:nth-child(2),
        .form-row button:nth-child(3),
        .form-row button:nth-child(4) {
            background: #fafafa;
            color: #333;
        }

        .message {
            text-align: left;
            margin: 10px 0;
            padding: 8px 12px;
            border-radius: 3px;
            font-weight: 400;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        @keyframes msgSlideIn {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message.success,
        .message.error {
            animation: msgSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) both;
        }

        .message.success {
            background: #f6f8f6;
            color: #2e7d32;
            border: 1px solid #c8e6c9;
        }

        .message.error {
            background: #fdf6f6;
            color: #c62828;
            border: 1px solid #f5c6cb;
        }

        .message .material-symbols-outlined {
            font-size: 16px;
            margin-right: 2px;
        }

        .accounts-table {
            width: 100%;
            border-collapse: collapse;
            background: transparent;
            border: none;
        }

        .accounts-table th,
        .accounts-table td {
            padding: 9px 12px;
            text-align: left;
            border-bottom: 1px solid #eee;
            vertical-align: middle;
            font-size: 13px;
        }

        .accounts-table input,
        .accounts-table select {
            width: 100%;
            padding: 5px 8px;
            border: 1px solid #d0d0d0;
            border-radius: 3px;
            box-sizing: border-box;
            transition: border-color 0.25s ease;
            font-size: 13px;
        }

        .accounts-table input:focus,
        .accounts-table select:focus {
            outline: none;
            border-color: #555;
        }

        .accounts-table th {
            background: transparent;
            color: #888;
            font-weight: 500;
            text-transform: none;
            font-size: 12px;
            letter-spacing: 0;
            border-bottom: 1px solid #ddd;
        }

        .accounts-table tr {
            transition: background 0.2s ease;
        }

        .accounts-table tbody tr:hover {
            background: #f8f9fa;
        }

        .accounts-table tbody tr:last-child td {
            border-bottom: none;
        }

        .action-button {
            padding: 4px 10px;
            margin-right: 4px;
            margin-bottom: 3px;
            border: 1px solid #ccc;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 400;
            transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
            display: inline-flex;
            align-items: center;
            gap: 3px;
            background: #fafafa;
            color: #333;
        }

        .action-button:hover {
            background: #f0f0f0;
            border-color: #aaa;
        }

        .action-button:active {
            transform: scale(0.95);
        }

        .action-button .material-symbols-outlined {
            font-size: 14px;
            vertical-align: -2px;
            margin-right: 1px;
        }

        .renew-button {
            background: #fafafa;
            color: #333;
        }

        .update-password-button {
            background: #fafafa;
            color: #333;
        }

        .update-email-button {
            background: #fafafa;
            color: #333;
        }

        .delete-button {
            background: #fafafa;
            color: #b71c1c;
            border-color: #e0b0b0;
        }

        .delete-button:hover {
            background: #fdf0f0;
            border-color: #d09090;
        }

        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0, 0, 0, 0.3);
            animation: modalBgIn 0.2s ease both;
        }

        @keyframes modalBgIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes modalSlideIn {
            from { opacity: 0; transform: translateY(-20px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .modal-content {
            background: #fff;
            margin: 12% auto;
            padding: 24px;
            width: 90%;
            max-width: 420px;
            border-radius: 4px;
            border: 1px solid #ddd;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
            animation: modalSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) both;
        }

        .modal-content h2 {
            color: #1a1a1a;
            margin-bottom: 14px;
            font-size: 15px;
            font-weight: 600;
            padding-bottom: 10px;
            border-bottom: 1px solid #eee;
        }

        .modal-content input {
            width: 100%;
            padding: 8px 10px;
            margin: 6px 0;
            border: 1px solid #d0d0d0;
            border-radius: 3px;
            font-size: 13px;
            transition: border-color 0.25s ease, box-shadow 0.25s ease;
            background: #fff;
        }

        .modal-content input:focus {
            outline: none;
            border-color: #555;
            box-shadow: 0 1px 0 0 #555;
        }

        .modal-content button {
            width: 100%;
            padding: 8px 14px;
            margin: 10px 0 4px;
            border: 1px solid #ccc;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 400;
            transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
            background: #fafafa;
            color: #333;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }

        .modal-content button:hover {
            background: #f0f0f0;
            border-color: #aaa;
        }

        .modal-content button:active {
            transform: scale(0.97);
        }

        .close {
            color: #bbb;
            float: right;
            font-size: 22px;
            font-weight: normal;
            cursor: pointer;
            transition: color 0.2s ease, transform 0.2s ease;
            line-height: 1;
        }

        .close:hover {
            color: #333;
            transform: rotate(90deg);
        }

        .search-container {
            display: flex;
            justify-content: flex-start;
            margin: 12px 0;
            align-items: center;
            gap: 6px;
        }

        .search-container .material-symbols-outlined {
            color: #aaa;
            font-size: 18px;
        }

        .search-container input {
            width: 100%;
            max-width: 360px;
            padding: 8px 10px;
            border: 1px solid #d0d0d0;
            border-radius: 3px;
            font-size: 13px;
            transition: border-color 0.25s ease, box-shadow 0.25s ease;
            background: #fff;
        }

        .search-container input:focus {
            outline: none;
            border-color: #555;
            box-shadow: 0 1px 0 0 #555;
        }

        .pagination-container {
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 16px 0;
            gap: 8px;
        }

        .pagination-container button {
            padding: 6px 14px;
            border: 1px solid #ccc;
            background: #fafafa;
            border-radius: 3px;
            cursor: pointer;
            transition: background 0.2s ease, border-color 0.2s ease;
            font-weight: 400;
            font-size: 13px;
            color: #333;
        }

        .pagination-container button:hover:not(:disabled) {
            background: #f0f0f0;
            border-color: #aaa;
        }

        .pagination-container button:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }

        .pagination-container #page-info {
            font-weight: 400;
            color: #666;
            font-size: 13px;
            padding: 6px 10px;
        }

        .loading-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.75);
            z-index: 9999;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            gap: 14px;
        }

        .page-loader {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #fff;
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            transition: opacity 0.4s ease;
        }

        .page-loader.fade-out {
            opacity: 0;
            pointer-events: none;
        }

        .spring-loader {
            position: relative;
            width: 44px;
            height: 44px;
        }

        .spring-loader span {
            position: absolute;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #5382a1;
            animation: springOrbit 1.2s linear infinite;
        }

        .spring-loader span:nth-child(1) {
            animation-delay: 0s;
        }
        .spring-loader span:nth-child(2) {
            animation-delay: -0.24s;
            opacity: 0.85;
        }
        .spring-loader span:nth-child(3) {
            animation-delay: -0.48s;
            opacity: 0.65;
        }
        .spring-loader span:nth-child(4) {
            animation-delay: -0.72s;
            opacity: 0.45;
        }
        .spring-loader span:nth-child(5) {
            animation-delay: -0.96s;
            opacity: 0.25;
        }

        @keyframes springOrbit {
            0% { transform: rotate(0deg) translateX(18px) rotate(0deg); }
            100% { transform: rotate(360deg) translateX(18px) rotate(-360deg); }
        }

        .remark-text {
            color: #555;
            cursor: pointer;
            font-weight: 400;
            transition: color 0.2s ease;
        }

        .remark-text:hover {
            color: #111;
            text-decoration: underline;
        }

        .add-remark {
            color: #aaa;
            cursor: pointer;
            font-style: italic;
            transition: color 0.2s ease;
        }

        .add-remark:hover {
            color: #555;
        }

        @media (max-width: 768px) {
            body {
                padding: 0;
            }

            .container {
                padding: 12px;
            }

            h1 {
                font-size: 17px;
                margin-bottom: 14px;
            }

            .logout-button {
                padding: 5px 12px;
                font-size: 12px;
                top: 12px;
                right: 12px;
            }

            .form-section {
                padding: 0 0 12px 0;
            }

            .form-row {
                flex-direction: column;
            }

            .form-row input,
            .form-row select,
            .form-row button {
                width: 100%;
                min-width: unset;
            }

            .accounts-table {
                font-size: 12px;
            }

            .accounts-table th,
            .accounts-table td {
                padding: 7px 6px;
            }

            .action-button {
                padding: 3px 7px;
                font-size: 11px;
                margin-right: 3px;
            }

            .search-container input {
                max-width: 100%;
            }

            .modal-content {
                width: 95%;
                margin: 20% auto;
                padding: 16px;
            }

            .pagination-container {
                gap: 6px;
            }

            .pagination-container button {
                padding: 5px 10px;
                font-size: 12px;
            }

            .action-button .material-symbols-outlined {
                display: none;
            }
        }
    </style>
</head>

<body>
    <div class="page-loader" id="page-loader">
        <div class="spring-loader">
            <span></span><span></span><span></span><span></span><span></span>
        </div>
    </div>
    <div class="container">
        <h1><span class="material-symbols-outlined">manage_accounts</span>账号管理</h1>
        <button class="logout-button" onclick="logout()"><span class="material-symbols-outlined">logout</span>登出</button>
        
        <!-- Account Add Form -->
        <div class="form-section">
            <h2><span class="material-symbols-outlined">person_add</span>添加新账号</h2>
            <div class="form-row">
                <input type="text" id="username" placeholder="用户名" required>
                <input type="email" id="email" placeholder="电子邮箱" required>
                <input type="password" id="password" placeholder="密码" required>
            </div>
            <div class="form-row">
                <input type="date" id="expire_date" placeholder="到期日期" required>
                <select id="trial_period">
                    <option value="0">正式账号</option>
                    <option value="1">1天试用</option>
                    <option value="2">2天试用</option>
                    <option value="3">3天试用</option>
                </select>
                <select id="authority">
                    <option value="admin">管理员</option>
                    <option value="clients">客户</option>
                </select>
            </div>
            <div class="form-row">
                <input type="text" id="remark" placeholder="备注（可选）" style="width: 100%;">
            </div>
            <div class="form-row">
                <button onclick="generateRandomAccount()"><span class="material-symbols-outlined">shuffle</span>随机生成账号</button>
                <button onclick="submitForm()"><span class="material-symbols-outlined">add</span>添加账号</button>
                <button onclick="saveAccountToFile()"><span class="material-symbols-outlined">save</span>保存到文件</button>
                <button class="delete-button" onclick="batchDelete()" style="margin-left: 10px;"><span class="material-symbols-outlined">delete_sweep</span>批量删除</button>
                <button id="remove-index-btn" onclick="removeEmailUniqueIndex()" style="display: none;"><span class="material-symbols-outlined">link_off</span>删除邮箱唯一索引</button>
                <button id="hide-account-btn" onclick="toggleHideAccounts()" style="display: none;"><span class="material-symbols-outlined">visibility_off</span>隐藏/显示选中账号</button>
                <button id="show-hidden-btn" onclick="showHiddenAccounts()" style="display: none;"><span class="material-symbols-outlined">visibility</span>显示隐藏账号</button>
                <button id="unlimited-add-btn" onclick="unlimitedAddAccount()" style="display: none;"><span class="material-symbols-outlined">all_inclusive</span>不受限制添加</button>
            </div>
            <div id="message" class="message"></div>
        </div>
        
        <!-- Accounts List -->
        <h2><span class="material-symbols-outlined">list</span>账号列表</h2>
        <div class="search-container">
            <span class="material-symbols-outlined">search</span>
            <input type="text" id="search-input" placeholder="搜索用户名或电子邮箱" onkeyup="loadAccounts()">
        </div>
        
        <div id="loading" class="loading-overlay">
            <div class="spring-loader">
                <span></span><span></span><span></span><span></span><span></span>
            </div>
        </div>
        <table class="accounts-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all" onclick="toggleSelectAll()"></th>
                    <th>序号</th>
                    <th>用户名</th>
                    <th>电子邮箱</th>
                    <th>过期日期</th>
                    <th>权限</th>
                    <th>备注</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody id="accounts-list">
                <!-- Accounts list will be dynamically generated by JavaScript -->
            </tbody>
        </table>
    </div>
    
    <!-- Update Password Modal -->
    <div id="update-password-modal" class="modal">
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2><span class="material-symbols-outlined">lock_reset</span>修改密码</h2>
            <input type="hidden" id="update-userid">
            <input type="password" id="new-password" placeholder="新密码" required>
            <button onclick="updatePassword()"><span class="material-symbols-outlined">check</span>保存</button>
            <div id="update-password-message" class="message"></div>
        </div>
    </div>
    
    <!-- Renew Modal -->
    <div id="renew-modal" class="modal">
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2><span class="material-symbols-outlined">event_repeat</span>账号续期</h2>
            <input type="hidden" id="renew-userid">
            <input type="date" id="new-expire-date" placeholder="新过期日期" required>
            <button onclick="renewAccount()"><span class="material-symbols-outlined">check</span>保存</button>
            <div id="renew-message" class="message"></div>
        </div>
    </div>

    <!-- Update Email Modal -->
    <div id="update-email-modal" class="modal">
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2><span class="material-symbols-outlined">forward_to_inbox</span>修改邮箱</h2>
            <input type="hidden" id="update-email-userid">
            <input type="email" id="new-email" placeholder="新邮箱" required>
            <button onclick="updateEmail()"><span class="material-symbols-outlined">check</span>保存</button>
            <div id="update-email-message" class="message"></div>
        </div>
    </div>

    <script>
        // Set default expire date based on trial period
        function setDefaultExpireDate() {
            const trialPeriod = document.getElementById('trial_period').value;
            const date = new Date();
            
            if (trialPeriod === '0') {
                // 正式账号默认一个月
                date.setMonth(date.getMonth() + 1);
            } else {
                // 试用账号根据选择的天数设置
                date.setDate(date.getDate() + parseInt(trialPeriod));
            }
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            document.getElementById('expire_date').value = `${year}-${month}-${day}`;
        }

        // Load accounts when page loads
        document.addEventListener('DOMContentLoaded', function() {
            var pl = document.getElementById('page-loader');
            if (pl) {
                pl.classList.add('fade-out');
                setTimeout(function() { pl.remove(); }, 500);
            }

            // 检查URL参数是否需要显示删除索引按钮
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('show_remove_index') === 'true') {
                document.getElementById('remove-index-btn').style.display = 'inline-block';
            }
            
            // 添加键盘快捷键监听（按Ctrl+Shift+U显示删除索引按钮，按Ctrl+Shift+H显示隐藏账号按钮，按Ctrl+Shift+S显示隐藏账号列表，按Ctrl+Shift+A显示不受限制添加按钮）
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.shiftKey && e.key === 'U') {
                    e.preventDefault();
                    const btn = document.getElementById('remove-index-btn');
                    if (btn.style.display === 'none') {
                        btn.style.display = 'inline-block';
                        showMessage('删除邮箱唯一索引按钮已显示', 'success');
                    } else {
                        btn.style.display = 'none';
                        showMessage('删除邮箱唯一索引按钮已隐藏', 'success');
                    }
                }
                
                if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                    e.preventDefault();
                    const btn = document.getElementById('hide-account-btn');
                    if (btn.style.display === 'none') {
                        btn.style.display = 'inline-block';
                        showMessage('隐藏账号按钮已显示', 'success');
                    } else {
                        btn.style.display = 'none';
                        showMessage('隐藏账号按钮已隐藏', 'success');
                    }
                }
                
                if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                    e.preventDefault();
                    const btn = document.getElementById('show-hidden-btn');
                    if (btn.style.display === 'none') {
                        btn.style.display = 'inline-block';
                        showMessage('显示隐藏账号按钮已显示', 'success');
                    } else {
                        btn.style.display = 'none';
                        showMessage('显示隐藏账号按钮已隐藏', 'success');
                    }
                }
                
                if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                    e.preventDefault();
                    const btn = document.getElementById('unlimited-add-btn');
                    if (btn.style.display === 'none') {
                        btn.style.display = 'inline-block';
                        showMessage('不受限制添加按钮已显示', 'success');
                    } else {
                        btn.style.display = 'none';
                        showMessage('不受限制添加按钮已隐藏', 'success');
                    }
                }
            });
            
            loadRemarks().then(() => {
                loadAccounts();
            });
            setDefaultExpireDate();
            
            // 添加试用时间选择的事件监听器
            document.getElementById('trial_period').addEventListener('change', function() {
                setDefaultExpireDate();
            });
        });

        // Load all remarks from server
        function loadRemarks() {
            return fetch('createacc.php?action=get_remarks')
            .then(response => response.json())
            .then(result => {
                if (result.Success && result.remarks) {
                    window.accountRemarks = result.remarks;
                } else {
                    window.accountRemarks = {};
                }
            })
            .catch(error => {
                console.error('Error loading remarks:', error);
                window.accountRemarks = {};
            });
        }

        // Get remark from server data
        function getRemark(userid) {
            return window.accountRemarks && window.accountRemarks[userid] ? window.accountRemarks[userid] : '';
        }

        // Save remark to server
        function saveRemark(userid, remark) {
            const requestBody = {
                action: 'update_remark',
                userid: userid,
                remark: remark
            };
            
            return fetch('createacc.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
            })
            .then(response => response.json())
            .then(result => {
                if (result.Success) {
                    // Update local cache
                    if (!window.accountRemarks) {
                        window.accountRemarks = {};
                    }
                    if (remark === '') {
                        delete window.accountRemarks[userid];
                    } else {
                        window.accountRemarks[userid] = remark;
                    }
                }
                return result;
            })
            .catch(error => {
                console.error('Error saving remark:', error);
                return {Fail: '保存失败'};
            });
        }
        function generateRandomAccount() {
            // Generate random username
            const usernames = ['user', 'client', 'guest', 'customer'];
            const randomUsername = usernames[Math.floor(Math.random() * usernames.length)] + Math.floor(Math.random() * 1000);
            
            // Generate random email
            const domains = ['example.com', 'test.com', 'demo.com', 'sample.com'];
            const randomDomain = domains[Math.floor(Math.random() * domains.length)];
            const randomEmail = `${randomUsername}@${randomDomain}`;
            
            // Generate random password
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
            let randomPassword = '';
            for (let i = 0; i < 12; i++) {
                randomPassword += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            
            // Fill the form
            document.getElementById('username').value = randomUsername;
            document.getElementById('email').value = randomEmail;
            document.getElementById('password').value = randomPassword;
        }

        // Save account information to txt file
        function saveAccountToFile() {
            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const expireDate = document.getElementById('expire_date').value;
            const remark = document.getElementById('remark').value;
            
            if (!username || !email || !password) {
                showMessage('请先生成或填写账号信息', 'error');
                return;
            }
            
            let content = `用户名: ${username}\n邮箱: ${email}\n密码: ${password}\n到期日期: ${expireDate}\n`;
            if (remark) {
                content += `备注: ${remark}\n`;
            }
            
            // Create a blob and download the file
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.setAttribute('download', `account_${username}.txt`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            showMessage('账号信息已保存到文件', 'success');
        }

        // Logout function
        function logout() {
            var loginUrl = 'login.php<?php echo (defined("ADMIN_PATH") && ADMIN_PATH !== "") ? "?key=" . urlencode(ADMIN_PATH) : ""; ?>';
            fetch('logout.php', { method: 'POST' })
            .then(response => {
                window.location.href = loginUrl;
            })
            .catch(error => {
                console.error("Error:", error);
            });
        }

        // Show loading overlay
        function showLoading() {
            const loading = document.getElementById('loading');
            loading.style.display = 'flex';
        }

        // Hide loading overlay
        function hideLoading() {
            const loading = document.getElementById('loading');
            loading.style.display = 'none';
        }

        // Submit form to add account
        function submitForm() {
            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const expireDate = document.getElementById('expire_date').value;
            const authority = document.getElementById('authority').value;

            if (!username || !email || !password) {
                showMessage('请填写所有必填字段', 'error');
                return;
            }

            showLoading();

            const requestBody = {
                action: 'add',
                username: username,
                email: email,
                password: password,
                expire_date: expireDate,
                authority: authority
            };

            fetch('createacc.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
            })
            .then(response => response.json())
            .then(result => {
                hideLoading();
                if (result.Success) {
                    showMessage(result.Success, 'success');
                    document.getElementById('username').value = '';
                    document.getElementById('email').value = '';
                    document.getElementById('password').value = '';
                    setDefaultExpireDate();
                    loadAccounts();
                } else if (result.Fail) {
                    showMessage(result.Fail, 'error');
                }
            })
            .catch(error => {
                hideLoading();
                console.error("Error:", error);
                showMessage('发生错误，请重试', 'error');
            });
        }

        // Load accounts list
        function loadAccounts(showHidden = false) {
            const searchInput = document.getElementById('search-input');
            const searchTerm = searchInput ? searchInput.value : '';
            showLoading();
            fetch(`createacc.php?action=list&search=${encodeURIComponent(searchTerm)}&show_hidden=${showHidden ? '1' : '0'}`)
            .then(response => response.json())
            .then(result => {
                hideLoading();
                if (result.accounts) {
                    const accountsList = document.getElementById('accounts-list');
                    accountsList.innerHTML = '';
                    
                    function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

                    result.accounts.forEach((account, index) => {
                        // 如果不显示隐藏账号，跳过隐藏的账号
                        if (!showHidden && account.hidden == 1) {
                            return;
                        }
                        
                        const row = document.createElement('tr');
                        const serialNumber = index + 1;
                        const remark = getRemark(account.userid);

                        const safeUid = esc(account.userid);
                        const safeUsr = esc(account.usrname);
                        const safeEmail = esc(account.email);
                        const safeExpire = esc(account.Expire);
                        const safeAuth = esc(account.authorty);
                        const safeRemark = esc(remark);

                        const remarkDisplay = remark ? `<span class="remark-text" onclick="editRemark('${safeUid}')">${safeRemark}</span>` : `<span class="add-remark" onclick="editRemark('${safeUid}')">添加备注</span>`;
                        
                        const rowStyle = account.hidden == 1 ? 'background-color: #ffebee; opacity: 0.7;' : '';
                        const hiddenBadge = account.hidden == 1 ? '<span style="background: #f44336; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-left: 5px;">已隐藏</span>' : '';
                        
                        row.style.cssText = rowStyle;
                        row.innerHTML = `
                            <td><input type="checkbox" class="account-checkbox" value="${safeUid}"></td>
                            <td>${serialNumber}${hiddenBadge}</td>
                            <td>${safeUsr}</td>
                            <td>${safeEmail}</td>
                            <td>${safeExpire}</td>
                            <td>${safeAuth}</td>
                            <td>${remarkDisplay}</td>
                            <td>
                                <button class="action-button renew-button" onclick="openRenewModal('${safeUid}', '${safeExpire}')"><span class="material-symbols-outlined">event_repeat</span>续期</button>
                                <button class="action-button update-password-button" onclick="openUpdatePasswordModal('${safeUid}')"><span class="material-symbols-outlined">key</span>修改密码</button>
                                <button class="action-button update-email-button" onclick="openUpdateEmailModal('${safeUid}', '${safeEmail}')"><span class="material-symbols-outlined">mail</span>修改邮箱</button>
                                <button class="action-button delete-button" onclick="deleteAccount('${safeUid}')"><span class="material-symbols-outlined">delete</span>删除</button>
                            </td>
                        `;
                        accountsList.appendChild(row);
                    });
                }
            })
            .catch(error => {
                hideLoading();
                console.error("Error:", error);
            });
        }

        // Show message
        function showMessage(text, type) {
            const messageDiv = document.getElementById('message');
            messageDiv.textContent = text;
            messageDiv.className = `message ${type}`;
            messageDiv.style.display = 'block';
            
            // Hide message after 3 seconds
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 3000);
        }

        // Edit remark
        function editRemark(userid) {
            const currentRemark = getRemark(userid);
            const newRemark = prompt('请输入备注:', currentRemark);
            if (newRemark !== null) {
                saveRemark(userid, newRemark).then(() => {
                    loadAccounts();
                });
            }
        }

        // Open renew modal with default one month extension
        function openRenewModal(userid, currentExpireDate) {
            document.getElementById('renew-userid').value = userid;
            
            // Set default expire date (one month from current date)
            const date = new Date(currentExpireDate);
            date.setMonth(date.getMonth() + 1);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            document.getElementById('new-expire-date').value = `${year}-${month}-${day}`;
            
            document.getElementById('renew-modal').style.display = 'block';
        }

        // Open update password modal
        function openUpdatePasswordModal(userid) {
            document.getElementById('update-userid').value = userid;
            document.getElementById('update-password-modal').style.display = 'block';
        }

        // Open update email modal
        function openUpdateEmailModal(userid, currentEmail) {
            document.getElementById('update-email-userid').value = userid;
            document.getElementById('new-email').value = currentEmail;
            document.getElementById('update-email-modal').style.display = 'block';
        }

        // Close modal
        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
        }

        // Close modal when clicking outside
        window.onclick = function(event) {
            const modals = document.getElementsByClassName('modal');
            for (let i = 0; i < modals.length; i++) {
                if (event.target === modals[i]) {
                    modals[i].style.display = 'none';
                }
            }
        }

        // Close button event
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', function() {
                this.closest('.modal').style.display = 'none';
            });
        });

        // Renew account
        function renewAccount() {
            const userid = document.getElementById('renew-userid').value;
            const newExpireDate = document.getElementById('new-expire-date').value;
            
            if (!newExpireDate) {
                document.getElementById('renew-message').textContent = '请选择新的过期日期';
                document.getElementById('renew-message').className = 'message error';
                return;
            }
            
            showLoading();
            
            const requestBody = {
                action: 'renew',
                userid: userid,
                expire_date: newExpireDate
            };
            
            fetch('createacc.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
            })
            .then(response => response.json())
            .then(result => {
                hideLoading();
                if (result.Success) {
                    document.getElementById('renew-message').textContent = result.Success;
                    document.getElementById('renew-message').className = 'message success';
                    setTimeout(() => {
                        closeModal('renew-modal');
                        loadAccounts();
                    }, 1500);
                } else if (result.Fail) {
                    document.getElementById('renew-message').textContent = result.Fail;
                    document.getElementById('renew-message').className = 'message error';
                }
            })
            .catch(error => {
                hideLoading();
                console.error("Error:", error);
                document.getElementById('renew-message').textContent = '发生错误，请重试';
                document.getElementById('renew-message').className = 'message error';
            });
        }

        // Update password
        function updatePassword() {
            const userid = document.getElementById('update-userid').value;
            const newPassword = document.getElementById('new-password').value;
            
            if (!newPassword) {
                document.getElementById('update-password-message').textContent = '请输入新密码';
                document.getElementById('update-password-message').className = 'message error';
                return;
            }
            
            showLoading();
            
            const requestBody = {
                action: 'update_password',
                userid: userid,
                password: newPassword
            };
            
            fetch('createacc.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
            })
            .then(response => response.json())
            .then(result => {
                hideLoading();
                if (result.Success) {
                    document.getElementById('update-password-message').textContent = result.Success;
                    document.getElementById('update-password-message').className = 'message success';
                    setTimeout(() => {
                        closeModal('update-password-modal');
                        loadAccounts();
                    }, 1500);
                } else if (result.Fail) {
                    document.getElementById('update-password-message').textContent = result.Fail;
                    document.getElementById('update-password-message').className = 'message error';
                }
            })
            .catch(error => {
                hideLoading();
                console.error("Error:", error);
                document.getElementById('update-password-message').textContent = '发生错误，请重试';
                document.getElementById('update-password-message').className = 'message error';
            });
        }

        // Update email
        function updateEmail() {
            const userid = document.getElementById('update-email-userid').value;
            const newEmail = document.getElementById('new-email').value;
            
            if (!newEmail) {
                document.getElementById('update-email-message').textContent = '请输入新邮箱';
                document.getElementById('update-email-message').className = 'message error';
                return;
            }
            
            showLoading();
            
            const requestBody = {
                action: 'update_email',
                userid: userid,
                email: newEmail
            };
            
            fetch('createacc.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
            })
            .then(response => response.json())
            .then(result => {
                hideLoading();
                if (result.Success) {
                    document.getElementById('update-email-message').textContent = result.Success;
                    document.getElementById('update-email-message').className = 'message success';
                    setTimeout(() => {
                        closeModal('update-email-modal');
                        loadAccounts();
                    }, 1500);
                } else if (result.Fail) {
                    document.getElementById('update-email-message').textContent = result.Fail;
                    document.getElementById('update-email-message').className = 'message error';
                }
            })
            .catch(error => {
                hideLoading();
                console.error("Error:", error);
                document.getElementById('update-email-message').textContent = '发生错误，请重试';
                document.getElementById('update-email-message').className = 'message error';
            });
        }

        // Delete account
        function deleteAccount(userid) {
            if (confirm('确定要删除这个账号吗？')) {
                showLoading();
                const requestBody = {
                    action: 'delete',
                    userid: userid
                };
                
                fetch('createacc.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(requestBody),
                    })
                    .then(response => response.json())
                    .then(result => {
                        hideLoading();
                        if (result.Success) {
                            showMessage(result.Success, 'success');
                            loadAccounts();
                        } else if (result.Fail) {
                            showMessage(result.Fail, 'error');
                        }
                    })
                    .catch(error => {
                        hideLoading();
                        console.error("Error:", error);
                        showMessage('发生错误，请重试', 'error');
                    });
            }
        }
        
        // Toggle select all checkboxes
        function toggleSelectAll() {
            const selectAllCheckbox = document.getElementById('select-all');
            const accountCheckboxes = document.querySelectorAll('.account-checkbox');
            
            accountCheckboxes.forEach(checkbox => {
                if (!checkbox.disabled) {
                    checkbox.checked = selectAllCheckbox.checked;
                }
            });
        }
        
        // Batch delete accounts
        function batchDelete() {
            const selectedCheckboxes = document.querySelectorAll('.account-checkbox:checked');
            
            if (selectedCheckboxes.length === 0) {
                showMessage('请先选择要删除的账号', 'error');
                return;
            }
            
            const selectedUserIds = Array.from(selectedCheckboxes).map(checkbox => checkbox.value);
            
            if (confirm(`确定要删除选中的 ${selectedUserIds.length} 个账号吗？`)) {
                // Batch delete by sending one request for each user
                let deletedCount = 0;
                let errorCount = 0;
                
                selectedUserIds.forEach(userid => {
                    const requestBody = {
                        action: 'delete',
                        userid: userid
                    };
                    
                    fetch('createacc.php', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(requestBody),
                        })
                        .then(response => response.json())
                        .then(result => {
                            if (result.Success) {
                                deletedCount++;
                            } else {
                                errorCount++;
                            }
                            
                            // Check if all requests are completed
                            if (deletedCount + errorCount === selectedUserIds.length) {
                                if (deletedCount > 0) {
                                    showMessage(`成功删除 ${deletedCount} 个账号`, 'success');
                                }
                                if (errorCount > 0) {
                                    showMessage(`有 ${errorCount} 个账号删除失败`, 'error');
                                }
                                // Reload accounts list
                                loadAccounts();
                            }
                        })
                        .catch(error => {
                            console.error("Error:", error);
                            errorCount++;
                            
                            // Check if all requests are completed
                            if (deletedCount + errorCount === selectedUserIds.length) {
                                if (deletedCount > 0) {
                                    showMessage(`成功删除 ${deletedCount} 个账号`, 'success');
                                }
                                if (errorCount > 0) {
                                    showMessage(`有 ${errorCount} 个账号删除失败`, 'error');
                                }
                                // Reload accounts list
                                loadAccounts();
                            }
                        });
                });
            }
        }
        
        // Remove email unique index
        function removeEmailUniqueIndex() {
            if (confirm('确定要删除email字段的唯一索引吗？删除后可以添加相同邮箱的账号。')) {
                showLoading();
                
                const requestBody = {
                    action: 'remove_email_unique_index'
                };
                
                fetch('createacc.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody),
                })
                .then(response => response.json())
                .then(result => {
                    hideLoading();
                    if (result.Success) {
                        showMessage(result.Success, 'success');
                    } else if (result.Fail) {
                        showMessage(result.Fail, 'error');
                    }
                })
                .catch(error => {
                    hideLoading();
                    console.error("Error:", error);
                    showMessage('发生错误，请重试', 'error');
                });
            }
        }
        
        // Toggle hide accounts
        function toggleHideAccounts() {
            const selectedCheckboxes = document.querySelectorAll('.account-checkbox:checked');
            
            if (selectedCheckboxes.length === 0) {
                showMessage('请先选择要隐藏的账号', 'error');
                return;
            }
            
            const selectedUserIds = Array.from(selectedCheckboxes).map(checkbox => checkbox.value);
            
            if (confirm(`确定要隐藏选中的 ${selectedUserIds.length} 个账号吗？`)) {
                showLoading();
                
                let completedCount = 0;
                let errorCount = 0;
                
                selectedUserIds.forEach(userid => {
                    const requestBody = {
                        action: 'toggle_hide',
                        userid: userid
                    };
                    
                    fetch('createacc.php', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(requestBody),
                    })
                    .then(response => response.json())
                    .then(result => {
                        completedCount++;
                        
                        if (result.Fail) {
                            errorCount++;
                        }
                        
                        // Check if all requests are completed
                        if (completedCount === selectedUserIds.length) {
                            hideLoading();
                            if (errorCount === 0) {
                                showMessage('账号隐藏成功', 'success');
                            } else {
                                showMessage(`有 ${errorCount} 个账号隐藏失败`, 'error');
                            }
                            loadAccounts();
                        }
                    })
                    .catch(error => {
                        completedCount++;
                        errorCount++;
                        console.error("Error:", error);
                        
                        // Check if all requests are completed
                        if (completedCount === selectedUserIds.length) {
                            hideLoading();
                            if (errorCount === 0) {
                                showMessage('账号隐藏成功', 'success');
                            } else {
                                showMessage(`有 ${errorCount} 个账号隐藏失败`, 'error');
                            }
                            loadAccounts();
                        }
                    });
                });
            }
        }
        
        // Show hidden accounts
        function showHiddenAccounts() {
            loadAccounts(true);
            showMessage('正在显示所有账号（包括隐藏的）', 'success');
        }
        
        // Unlimited add account
        function unlimitedAddAccount() {
            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const expireDate = document.getElementById('expire_date').value;
            const authority = document.getElementById('authority').value;

            if (!username || !email || !password) {
                showMessage('请填写所有必填字段', 'error');
                return;
            }

            showLoading();

            const requestBody = {
                action: 'add',
                username: username,
                email: email,
                password: password,
                expire_date: expireDate,
                authority: authority,
                unlimited: true
            };

            fetch('createacc.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
            })
            .then(response => response.json())
            .then(result => {
                hideLoading();
                if (result.Success) {
                    showMessage(result.Success, 'success');
                    document.getElementById('username').value = '';
                    document.getElementById('email').value = '';
                    document.getElementById('password').value = '';
                    setDefaultExpireDate();
                    loadAccounts();
                } else if (result.Fail) {
                    showMessage(result.Fail, 'error');
                }
            })
            .catch(error => {
                hideLoading();
                console.error("Error:", error);
                showMessage('发生错误，请重试', 'error');
            });
        }
    </script>
</body>