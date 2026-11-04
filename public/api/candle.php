<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Http;
use Chua\NameFilter;
use Chua\Payment\Orders;
use Chua\Payment\VietQR;

// POST {action:create,name,wish,size} -> order + VietQR. GET ?code= -> order status.
// POST {action:test_pay,code} only when payments.test_mode is on (local testing).
$pay = chua_config()['payments'];
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $code = (string) ($_GET['code'] ?? '');
    if (!preg_match('/^NEN[A-HJ-NP-Z2-9]{6}$/', $code)) {
        Http::json(['error' => 'code'], 400);
    }
    Http::json(['status' => Orders::status($code) ?? 'unknown']);
}
Http::requireMethod('POST');
$in = Http::input();
if (!$pay['enabled']) {
    Http::json(['error' => 'off', 'text' => 'Candle offerings are not open yet.'], 503);
}
$action = (string) ($in['action'] ?? 'create');
if ($action === 'test_pay') {
    if (!$pay['test_mode']) {
        Http::json(['error' => 'off'], 404);
    }
    $code = (string) ($in['code'] ?? '');
    $st = Chua\Db::get()->prepare('SELECT amount FROM candle_orders WHERE code = ?');
    $st->execute([$code]);
    $amount = (int) $st->fetchColumn();
    Http::json(['result' => Orders::applyPayment('test', 'test:' . $code, $amount, 'TEST ' . $code, '{}')]);
}
$ipHash = Http::ipHash();
if (!Http::allow('candle:' . $ipHash, 6, 600)) {
    Http::json(['error' => 'slow', 'text' => 'Please wait a few minutes before ordering another candle.'], 429);
}
$size = (string) ($in['size'] ?? '');
if (!isset($pay['sizes'][$size])) {
    Http::json(['error' => 'size'], 422);
}
$name = NameFilter::cleanName((string) ($in['name'] ?? ''));
if ($name === null) {
    Http::json(['error' => 'name', 'text' => 'Please write the name to show on the candle (2 to 18 letters).'], 422);
}
$wish = NameFilter::maskText((string) ($in['wish'] ?? ''), 140);
$order = Orders::create($name, $wish, $size, $ipHash);
Http::json([
    'code' => $order['code'],
    'amount' => $order['amount'],
    'qr' => VietQR::payload($pay['bank_bin'], $pay['account_no'], $order['amount'], $order['code']),
    'qr_image' => VietQR::imageUrl($pay['bank_bin'], $pay['account_no'], $order['amount'], $order['code'], $pay['account_name']),
    'bank' => ['label' => $pay['bank_label'], 'account' => $pay['account_no'], 'name' => $pay['account_name']],
    'minutes' => (int) $pay['order_minutes'],
    'test_mode' => (bool) $pay['test_mode'],
]);
