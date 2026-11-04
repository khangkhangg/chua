<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Http;
use Chua\Payment\Orders;
use Chua\Payment\Webhooks;

// Register https://chua.vietnamcos.com/api/payment-webhook.php in the SePay or PayOS dashboard.
Http::requireMethod('POST');
$pay = chua_config()['payments'];
$raw = (string) file_get_contents('php://input', false, null, 0, 65536);
$body = json_decode($raw, true);
if (!is_array($body)) {
    Http::json(['success' => false, 'error' => 'json'], 400);
}
$parsed = $pay['provider'] === 'payos'
    ? Webhooks::payos($body, (string) $pay['payos_checksum_key'])
    : Webhooks::sepay($body, (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ''), (string) $pay['sepay_api_key']);
if ($parsed === null) {
    Http::json(['success' => false, 'error' => 'auth'], 401);
}
if (!empty($parsed['skip'])) {
    Http::json(['success' => true, 'result' => 'ignored']);
}
$result = Orders::applyPayment($pay['provider'], $parsed['txn'], $parsed['amount'], $parsed['content'], $raw);
Http::json(['success' => true, 'result' => $result]);
