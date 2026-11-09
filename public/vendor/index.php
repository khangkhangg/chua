<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Http;
use Chua\Payment\VietQR;
use Chua\Stalls;
use Chua\Vendors;

// Stall renters: sign in by emailed link, rent and pay by bank transfer, then set up the shop (docs/STALLS.md).
$config = chua_config();
session_name('chua_vendor');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS']) || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https']);
session_start();
header('X-Frame-Options: DENY');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');   // the sign-in link carries a token in the address

$e = static fn ($s): string => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
$money = static fn (int $n): string => number_format($n, 0, ',', '.') . ' đ';
$vn = static fn (?string $utc): string => $utc ? (new DateTime($utc, new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Ho_Chi_Minh'))->format('H:i d/m/Y') : '';
$csrf = $_SESSION['csrf'] ??= bin2hex(random_bytes(16));
$msg = (string) ($_SESSION['flash'] ?? '');
unset($_SESSION['flash']);
$err = '';
$ERR = [
    'slot' => 'Sạp này không có.', 'months' => 'Chọn từ 1 đến 12 tháng.', 'taken' => 'Sạp này vừa có người thuê hoặc đang giữ chỗ. Chọn sạp khác trong chợ nhé.',
    'closed' => 'Sạp này đang tạm đóng.', 'stall' => 'Bạn chưa thuê sạp này hoặc sạp đã hết hạn.',
    'name' => 'Tên sạp cần 2 đến 60 ký tự và lời lẽ phù hợp nơi cửa chùa.', 'url' => 'Đường dẫn phải bắt đầu bằng https:// và dài tối đa 200 ký tự.',
    'menu' => 'Thực đơn tối đa 12 món; mỗi món cần tên (tối đa 60 ký tự) và giá bằng số.', 'logo' => 'Logo phải là ảnh PNG, JPG, WebP hoặc GIF, nhỏ hơn 2 MB.',
];

if (isset($_GET['slot'])) {
    $_SESSION['want'] = max(0, min(Stalls::COUNT - 1, (int) $_GET['slot']));
}
if (isset($_GET['login'])) {
    $id = Vendors::login((string) $_GET['login']);
    if ($id !== null) {
        session_regenerate_id(true);
        $_SESSION['vendor'] = $id;
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
        header('Location: ./');
        exit;
    }
    $err = 'Liên kết đăng nhập đã dùng hoặc hết hạn. Hãy xin liên kết mới.';
}
$vid = (int) ($_SESSION['vendor'] ?? 0);

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($csrf, (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(400);
        exit('Phiên làm việc đã hết hạn. Quay lại và tải lại trang.');
    }
    $do = (string) ($_POST['do'] ?? '');
    $slot = (int) ($_POST['slot'] ?? -1);
    $code = null;
    if ($do === 'link') {
        $email = (string) ($_POST['email'] ?? '');
        if (!Http::allow('vlink:' . Http::ipHash(), 5, 900) || !Http::allow('vlink:' . hash('sha256', mb_strtolower(trim($email))), 3, 900)) {
            $err = 'Bạn đã xin quá nhiều liên kết. Đợi 15 phút rồi thử lại.';
        } elseif (Vendors::requestLink($email)) {
            $msg = 'Đã gửi liên kết đăng nhập tới email của bạn. Liên kết dùng được trong 15 phút. Nhớ xem cả thư mục spam.';
        } else {
            $err = 'Email chưa đúng.';
        }
    } elseif ($vid > 0) {
        switch ($do) {
            case 'rent':
                $r = Stalls::rent($vid, $slot, (int) ($_POST['months'] ?? 1));
                $code = $r['error'] ?? null;
                if ($code === null) {
                    unset($_SESSION['want']);
                    $_SESSION['flash'] = 'Đã giữ ' . Stalls::label($slot) . ' cho bạn. Chuyển khoản theo mã bên dưới rồi bấm "Tôi đã chuyển khoản".';
                }
                break;
            case 'claim':
                if (!Http::allow('vclaim:' . $vid, 6, 3600)) {
                    $err = 'Bạn đã báo nhiều lần. Chùa sẽ kiểm tra và email cho bạn.';
                } elseif (Stalls::claim($vid, (int) ($_POST['rental'] ?? 0))) {
                    $_SESSION['flash'] = 'Đã báo chùa. Chùa sẽ kiểm tra tài khoản và email cho bạn.';
                } else {
                    $err = 'Yêu cầu này đã hết hạn. Giữ sạp lại để lấy mã mới.';
                }
                break;
            case 'profile':
                $menu = [];
                foreach ((array) ($_POST['mn'] ?? []) as $i => $n) {
                    $menu[] = [(string) $n, (string) (((array) ($_POST['mp'] ?? []))[$i] ?? '')];
                }
                $code = Stalls::saveProfile($vid, $slot, (string) ($_POST['name'] ?? ''), (string) ($_POST['url'] ?? ''), $menu);
                if ($code === null) {
                    $_SESSION['flash'] = 'Đã lưu. Khách trong chợ sẽ thấy thay đổi trong vòng một phút.';
                }
                break;
            case 'logo':
                $f = $_FILES['logo'] ?? null;
                $code = $f && ($f['error'] ?? 1) === UPLOAD_ERR_OK ? Stalls::saveLogo($vid, $slot, (string) $f['tmp_name']) : 'logo';
                if ($code === null) {
                    $_SESSION['flash'] = 'Đã cập nhật logo.';
                }
                break;
            case 'logout':
                session_destroy();
                header('Location: ./');
                exit;
        }
        if ($code !== null) {
            $err = $ERR[$code] ?? 'Có lỗi, thử lại nhé.';
        }
        if ($err === '') {
            header('Location: ./');
            exit;
        }
    }
}

$pay = $config['payments'] ?? [];
$bankReady = ($pay['bank_bin'] ?? '') !== '' && ($pay['account_no'] ?? '') !== '';
$want = $_SESSION['want'] ?? null;
$hidden = static fn (string $do, array $extra = []): string => '<input type="hidden" name="csrf" value="' . $e($csrf) . '"><input type="hidden" name="do" value="' . $e($do) . '">'
    . implode('', array_map(static fn ($k, $v) => '<input type="hidden" name="' . $e($k) . '" value="' . $e($v) . '">', array_keys($extra), $extra));
$monthsSelect = static function () use ($money): string {
    $o = '';
    foreach ([1, 2, 3, 6, 12] as $m) {
        $o .= '<option value="' . $m . '">' . $m . ' tháng · ' . $money($m * Stalls::price()) . '</option>';
    }
    return '<select name="months" aria-label="Số tháng">' . $o . '</select>';
};
?><!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sạp hàng · An Tâm Nam Chùa</title>
<link rel="stylesheet" href="vendor.css">
</head>
<body>
<main>
<h1>Sạp hàng ở chợ trước cổng chùa</h1>
<p class="muted">Thuê sạp <?= $e($money(Stalls::price())) ?> một tháng. Khách viếng chùa đi ngang sẽ thấy tên, logo, trang web và thực đơn của bạn.
  <a href="policy.php">Quy định sạp hàng</a></p>
<?php if ($msg !== ''): ?><div class="msg" role="status"><?= $e($msg) ?></div><?php endif; ?>
<?php if ($err !== ''): ?><div class="err" role="alert"><?= $e($err) ?></div><?php endif; ?>

<?php if ($vid === 0): ?>
  <div class="card">
    <?php if ($want !== null): ?><p>Bạn đang thuê <b><?= $e(Stalls::label((int) $want)) ?></b>. Nhập email để tiếp tục.</p><?php endif; ?>
    <form method="post">
      <?= $hidden('link') ?>
      <label for="email">Email của bạn</label>
      <div class="row"><input type="email" id="email" name="email" required autocomplete="email" style="flex:1"><button class="btn">Gửi liên kết đăng nhập</button></div>
    </form>
    <p class="muted" style="margin-top:10px">Không cần mật khẩu. Chùa gửi một liên kết đăng nhập tới email này.</p>
  </div>
<?php else:
    $mine = Stalls::forVendor($vid);
    $open = array_values(array_filter($mine['rentals'], static fn ($r) => in_array($r['status'], ['pending', 'claimed'], true)));
?>
  <p class="row"><span class="muted">Đăng nhập: <?= $e(Vendors::email($vid)) ?></span>
    <form method="post" style="display:inline"><?= $hidden('logout') ?><button class="btn ghost">Đăng xuất</button></form></p>

  <?php if ($want !== null): ?>
    <div class="card">
      <h2 style="margin-top:0">Thuê <?= $e(Stalls::label((int) $want)) ?></h2>
      <form method="post" class="row"><?= $hidden('rent', ['slot' => $want]) ?><?= $monthsSelect() ?><button class="btn">Giữ sạp và lấy mã chuyển khoản</button></form>
      <p class="muted" style="margin-top:10px">Sạp được giữ cho bạn <?= (int) ($config['stalls']['hold_minutes'] ?? 30) ?> phút để chuyển khoản.</p>
    </div>
  <?php endif; ?>

  <?php foreach ($open as $r): ?>
    <div class="card" id="r<?= (int) $r['id'] ?>">
      <h2 style="margin-top:0"><?= $e(Stalls::label((int) $r['slot'])) ?> · <?= (int) $r['months'] ?> tháng
        <?= $r['status'] === 'claimed' ? '<span class="pill wait">Đang chờ chùa xác nhận</span>' : '<span class="pill">Chờ chuyển khoản</span>' ?></h2>
      <?php if (!$bankReady): ?>
        <p class="err">Chùa chưa cài tài khoản nhận tiền. Bạn quay lại sau nhé.</p>
      <?php else: ?>
        <div class="qr">
          <img src="<?= $e(VietQR::imageUrl((string) $pay['bank_bin'], (string) $pay['account_no'], (int) $r['amount'], (string) $r['code'], (string) ($pay['account_name'] ?? ''))) ?>" alt="Mã QR chuyển khoản <?= $e($money((int) $r['amount'])) ?>, nội dung <?= $e($r['code']) ?>">
          <div>
            <dl>
              <dt>Số tiền</dt><dd><?= $e($money((int) $r['amount'])) ?></dd>
              <dt>Nội dung</dt><dd><?= $e($r['code']) ?></dd>
              <dt>Ngân hàng</dt><dd><?= $e($pay['bank_label'] ?? '') ?></dd>
              <dt>Số tài khoản</dt><dd><?= $e($pay['account_no']) ?></dd>
              <dt>Chủ tài khoản</dt><dd><?= $e($pay['account_name'] ?? '') ?></dd>
            </dl>
            <p class="muted" style="margin-top:10px">Quét mã bằng ứng dụng ngân hàng. Giữ nguyên nội dung <b><?= $e($r['code']) ?></b> để chùa nhận ra khoản chuyển của bạn.</p>
            <form method="post"><?= $hidden('claim', ['rental' => $r['id']]) ?><button class="btn"><?= $r['status'] === 'claimed' ? 'Báo lại: tôi đã chuyển khoản' : 'Tôi đã chuyển khoản' ?></button></form>
          </div>
        </div>
      <?php endif; ?>
    </div>
  <?php endforeach; ?>

  <h2>Sạp của bạn</h2>
  <?php if (!$mine['stalls']): ?><p class="muted">Bạn chưa có sạp nào. Vào chợ trong chùa, đi tới một sạp trống để thuê.</p><?php endif; ?>
  <?php foreach ($mine['stalls'] as $s):
      $state = Stalls::state($s);
      $slot = (int) $s['slot'];
      $menu = json_decode((string) $s['menu'], true) ?: [];
  ?>
    <div class="card">
      <h2 style="margin-top:0"><?= $e(Stalls::label($slot)) ?>
        <?php if ($state === 'closed'): ?><span class="pill bad">Đã bị gỡ</span>
        <?php elseif ($state === 'rented'): ?><span class="pill ok">Đến <?= $e($vn($s['paid_until'])) ?></span>
        <?php else: ?><span class="pill bad">Đã hết hạn</span><?php endif; ?></h2>
      <?php if ($state === 'closed'): ?>
        <p>Lý do: <?= $e($s['takedown_reason']) ?>. Trả lời email của chùa nếu bạn cho rằng chùa gỡ nhầm.</p>
      <?php else: ?>
        <form method="post" class="row" style="margin-bottom:12px"><?= $hidden('rent', ['slot' => $slot]) ?><?= $monthsSelect() ?><button class="btn ghost">Gia hạn</button></form>
      <?php endif; ?>
      <?php if ($state === 'rented'): ?>
        <form method="post" enctype="multipart/form-data" class="row">
          <?= $hidden('logo', ['slot' => $slot]) ?>
          <?php if ($s['logo']): ?><img class="logo" src="<?= $e(Stalls::logoUrl($s['logo'])) ?>" alt="Logo hiện tại"><?php endif; ?>
          <div><label for="logo<?= $slot ?>">Logo (PNG, JPG, WebP, dưới 2 MB)</label><input type="file" id="logo<?= $slot ?>" name="logo" accept="image/png,image/jpeg,image/webp,image/gif" required>
          <button class="btn ghost">Tải logo lên</button></div>
        </form>
        <form method="post">
          <?= $hidden('profile', ['slot' => $slot]) ?>
          <label for="name<?= $slot ?>">Tên sạp</label><input type="text" id="name<?= $slot ?>" name="name" maxlength="60" required value="<?= $e($s['shop_name']) ?>">
          <label for="url<?= $slot ?>">Trang web (https://…)</label><input type="url" id="url<?= $slot ?>" name="url" maxlength="200" value="<?= $e($s['url']) ?>" placeholder="https://">
          <label>Thực đơn (tối đa <?= Stalls::MENU_MAX ?> món, giá tính bằng đồng)</label>
          <div class="menu">
            <?php for ($i = 0; $i < Stalls::MENU_MAX; $i++): ?>
              <input type="text" name="mn[<?= $i ?>]" maxlength="60" aria-label="Món <?= $i + 1 ?>" value="<?= $e($menu[$i]['n'] ?? '') ?>" placeholder="Món <?= $i + 1 ?>">
              <input type="text" name="mp[<?= $i ?>]" inputmode="numeric" aria-label="Giá món <?= $i + 1 ?>" value="<?= isset($menu[$i]) ? $e($menu[$i]['p']) : '' ?>" placeholder="Giá">
            <?php endfor; ?>
          </div>
          <p style="margin-top:12px"><button class="btn">Lưu sạp</button></p>
        </form>
      <?php endif; ?>
    </div>
  <?php endforeach; ?>

  <?php $past = array_filter($mine['rentals'], static fn ($r) => !in_array($r['status'], ['pending', 'claimed'], true)); ?>
  <?php if ($past): ?>
    <h2>Lịch sử thanh toán</h2>
    <div class="card"><?php foreach ($past as $r): ?>
      <p class="row"><span><?= $e($vn($r['created_at'])) ?> · <?= $e(Stalls::label((int) $r['slot'])) ?> · <?= (int) $r['months'] ?> tháng · <?= $e($money((int) $r['amount'])) ?> · <?= $e($r['code']) ?></span>
        <?= $r['status'] === 'approved' ? '<span class="pill ok">Đã nhận tiền</span>' : '<span class="pill">Hết hạn, chưa thanh toán</span>' ?></p>
    <?php endforeach; ?></div>
  <?php endif; ?>
<?php endif; ?>
</main>
</body>
</html>
