<?php
/**
 * SubAccount API - Panda auth adapter
 * Routes to SubAccount.php for DB + Mock fallback
 */
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Content-Type: application/json; charset=utf-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }

// Delegate to the shared SubAccount implementation
require_once __DIR__ . "/../SubAccount.php";
