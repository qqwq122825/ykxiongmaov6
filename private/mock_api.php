<?php

function mock_demo_token()
{
    return 'demo-token-local';
}

function is_mock_token(string $token): bool
{
    return trim((string)$token) === mock_demo_token();
}

function mock_demo_user()
{
    return [
        'userid' => 'demo001',
        'usrname' => 'admin',
        'email' => 'demo@example.com',
        'authorty' => 'ADMIN',
        'token' => mock_demo_token(),
    ];
}

function mock_demo_roles()
{
    return ['R_SUPER', 'R_ADMIN'];
}

function mock_demo_users()
{
    return [
        [
            'userid' => 'demo001',
            'usrname' => 'admin',
            'email' => 'demo@example.com',
            'Expire' => '2099-12-31',
            'authorty' => 'ADMIN',
            'remark' => '演示主账号',
        ],
        [
            'userid' => 'demo002',
            'usrname' => 'operator',
            'email' => 'operator@example.com',
            'Expire' => '2099-12-31',
            'authorty' => 'R_USER',
            'remark' => '演示普通账号',
        ],
        [
            'userid' => 'demo003',
            'usrname' => 'agent',
            'email' => 'agent@example.com',
            'Expire' => '2099-12-31',
            'authorty' => 'R_USER',
            'remark' => '演示下级账号',
        ],
    ];
}

function mock_demo_devices()
{
    return [
        [
            'phone_id' => 'mock-device-01',
            'usrname' => 'admin',
            'phone_name' => '演示设备 A',
            'android_ver' => '14',
            'model' => 'Pixel 8 Pro',
            'wallpaper' => '',
            'phonepassword' => '1234',
            'phonenumber' => '13800000000',
            'battery_charg' => '86',
            'network' => 'WiFi',
            'install_date' => '2026-05-20 12:00:00',
            'last_ping' => date('Y-m-d H:i:s'),
            'address' => 'Shanghai',
            'country' => 'China',
            'phoneopen' => '1',
            'activities' => 'com.demo.MainActivity',
            'accessibility' => '1',
        ],
        [
            'phone_id' => 'mock-device-02',
            'usrname' => 'operator',
            'phone_name' => '演示设备 B',
            'android_ver' => '13',
            'model' => 'Xiaomi 14',
            'wallpaper' => '',
            'phonepassword' => '5678',
            'phonenumber' => '13900000000',
            'battery_charg' => '61',
            'network' => '5G',
            'install_date' => '2026-05-19 18:30:00',
            'last_ping' => date('Y-m-d H:i:s', time() - 30),
            'address' => 'Shenzhen',
            'country' => 'China',
            'phoneopen' => '1',
            'activities' => 'com.demo.PlayerActivity',
            'accessibility' => '0',
        ],
    ];
}
