<?php
function FloodCheck($UseFor): bool
{
    if (isset($_SESSION[$UseFor]) && isset($_SESSION[$UseFor . '_expiration'])) {
        if (time() < $_SESSION[$UseFor . '_expiration']) {
            return false;
        }
    }

    $_SESSION[$UseFor] = '1';
    $_SESSION[$UseFor . '_expiration'] = time() + 3;
    return true;
}
