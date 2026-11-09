<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Stalls;

// Opened from the Telegram message. The secret token in the link is the permission, and it works once.
// Opening the page decides nothing (Telegram and mail scanners open links); only the button POST does.
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex');
$e = static fn ($s): string => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$token = (string) ($_POST['t'] ?? $_GET['t'] ?? '');
$done = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && in_array($_POST['do'] ?? '', ['approve', 'notyet'], true)) {
    $done = Stalls::decide($token, $_POST['do'] === 'approve');
    $doneAs = $_POST['do'];
}
$r = $done === null ? Stalls::byToken($token) : null;
?><!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Duyệt thuê sạp</title>
<link rel="stylesheet" href="../vendor/vendor.css">
</head>
<body>
<main>
<h1>Duyệt thuê sạp</h1>
<?php if ($done !== null): ?>
  <div class="msg" role="status"><?= $doneAs === 'approve'
      ? 'Đã duyệt. ' . $e(Stalls::label((int) $done['slot'])) . ' đã được kích hoạt và người thuê đã nhận email.'
      : 'Đã báo người thuê là chùa chưa nhận được tiền. Họ có thể báo lại sau khi chuyển.' ?></div>
<?php elseif ($r === null): ?>
  <div class="err" role="alert">Liên kết này đã được dùng hoặc không còn hiệu lực. Xem danh sách trong trang quản trị, mục Thuê sạp.</div>
<?php else: ?>
  <div class="card">
    <div class="qr" style="grid-template-columns:1fr">
      <dl>
        <dt>Sạp</dt><dd><?= $e(Stalls::label((int) $r['slot'])) ?></dd>
        <dt>Thời gian</dt><dd><?= (int) $r['months'] ?> tháng</dd>
        <dt>Số tiền</dt><dd><?= $e(number_format((int) $r['amount'], 0, ',', '.')) ?> đ</dd>
        <dt>Nội dung</dt><dd><?= $e($r['code']) ?></dd>
        <dt>Email</dt><dd><?= $e($r['email']) ?></dd>
        <dt>Báo lúc (UTC)</dt><dd><?= $e($r['claimed_at']) ?></dd>
      </dl>
    </div>
    <p class="muted" style="margin-top:12px">Kiểm tra tài khoản ngân hàng có khoản chuyển đúng số tiền và nội dung trên, rồi chọn:</p>
    <form method="post" class="row">
      <input type="hidden" name="t" value="<?= $e($token) ?>">
      <button class="btn" name="do" value="approve">Duyệt, đã nhận tiền</button>
      <button class="btn ghost" name="do" value="notyet">Chưa nhận được</button>
    </form>
  </div>
<?php endif; ?>
</main>
</body>
</html>
