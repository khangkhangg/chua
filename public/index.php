<?php
declare(strict_types=1);
require dirname(__DIR__) . '/src/bootstrap.php';

// A fresh install goes to the setup page first.
if (Chua\Setup::needed()) {
    header('Location: setup.php');
    exit;
}

$config = chua_config();
$e = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
$pay = $config['payments'];
$client = [
    'realtime' => (bool) $config['realtime']['enabled'],
    'payments' => (bool) $pay['enabled'],
    'testMode' => (bool) ($pay['enabled'] && $pay['test_mode']),
    'sizes' => $pay['sizes'],
];
$v = $e($config['asset_version']);
?><!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?= $e($config['temple_name']) ?></title>
<meta name="description" content="<?= $e($config['temple_name']) ?>: a Vietnamese mountain temple you can walk through, pray in and visit together, day and night.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Noto+Serif+Display:ital,wght@0,600;1,500&display=swap">
<link rel="stylesheet" href="css/temple.css?v=<?= $v ?>">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js" defer></script>
</head>
<body>
<canvas id="scene" aria-label="Temple courtyard"></canvas>
<div id="labels"></div>

<header class="hud tl">
  <div class="seal" aria-hidden="true">An<br>Tâm</div>
  <div>
    <h1><?= $e($config['temple_name']) ?></h1>
    <p class="sub" data-i18n="sub">Chùa trên núi · open day and night</p>
    <div class="stats">
      <span><span class="dot"></span><b id="online">–</b> <span data-i18n="visiting">visiting</span></span>
      <span><b id="here">0</b> <span data-i18n="here">in this courtyard</span></span>
      <span><span data-i18n="incenseToday">Incense today</span> <b id="incense">0</b></span>
    </div>
    <div class="merit">
      <span class="chip" title="Bodhi leaves"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c-4 4-7 8-7 12a7 7 0 0 0 6 6.9V23h2v-2.1A7 7 0 0 0 19 14c0-4-3-8-7-12z" fill="#7fb85a"/><path d="M12 6v14" stroke="#2f5a22" stroke-width="1.4"/></svg><b id="leaves">0</b> <span data-i18n="leaves">lá bồ đề</span></span>
      <button type="button" class="chip" id="bagBtn" aria-expanded="false" aria-controls="bag"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="9" width="18" height="12" rx="1.5" fill="#c2412b"/><rect x="2" y="6" width="20" height="4" rx="1" fill="#d9aa4a"/><path d="M12 6v15" stroke="#d9aa4a" stroke-width="2"/></svg><b id="giftCount">0</b> <span data-i18n="gifts">gifts</span></button>
      <button type="button" class="chip" id="inviteBtn" hidden><span data-i18n="invite">Invite friends</span></button>
    </div>
    <p class="live" id="liveStatus" hidden></p>
  </div>
</header>

<section class="hud" id="bag" hidden aria-label="Temple gifts">
  <h3 data-i18n="bagTitle">Túi phước</h3>
  <p data-i18n="bagText"></p>
  <ul id="giftList"></ul>
</section>

<details class="hud tr" open id="settings">
  <summary data-i18n="scene">Scene</summary>
  <div class="ctl">
    <div class="row">
      <div class="lab"><span data-i18n="time">Time of day</span><output id="timeOut">--:--</output></div>
      <input type="range" id="time" min="0" max="24" step="0.05" value="16.5" aria-label="Time of day">
      <label class="check"><input type="checkbox" id="live"> <span data-i18n="followClock">Follow my clock</span></label>
    </div>
    <div class="row">
      <div class="lab"><span data-i18n="visitors">Visitors</span><output id="crowdOut">18</output></div>
      <input type="range" id="crowd" min="0" max="30" step="1" value="18" aria-label="Visitors">
    </div>
    <div class="row">
      <div class="lab"><span data-i18n="smoke">Incense smoke</span></div>
      <div class="seg" id="smokeSeg" role="radiogroup">
        <button type="button" role="radio" data-v="0" aria-checked="false" data-i18n="smokeOff">Off</button>
        <button type="button" role="radio" data-v="1" aria-checked="true" data-i18n="smokeLittle">A little</button>
        <button type="button" role="radio" data-v="2" aria-checked="false" data-i18n="smokeFull">Full</button>
      </div>
    </div>
    <div class="row">
      <div class="lab"><span data-i18n="quality">Graphics</span></div>
      <div class="seg" id="qualitySeg" role="radiogroup">
        <button type="button" role="radio" data-v="auto" aria-checked="true" data-i18n="qAuto">Auto</button>
        <button type="button" role="radio" data-v="low" aria-checked="false" data-i18n="qLow">Low</button>
        <button type="button" role="radio" data-v="high" aria-checked="false" data-i18n="qHigh">High</button>
      </div>
    </div>
    <div class="row">
      <div class="lab"><span data-i18n="pixel">Pixel size</span><output id="pixOut">3</output></div>
      <input type="range" id="pix" min="1" max="6" step="1" value="3" aria-label="Pixel size">
    </div>
    <div class="row">
      <div class="lab"><span data-i18n="volAll">All sound</span></div>
      <input type="range" id="volAll" min="0" max="1" step="0.05" value="0.85" aria-label="All sound">
      <div class="lab"><span data-i18n="volNature">Nature</span></div>
      <input type="range" id="volNature" min="0" max="1" step="0.05" value="1" aria-label="Nature">
      <div class="lab"><span data-i18n="volTemple">Bells and chanting</span></div>
      <input type="range" id="volTemple" min="0" max="1" step="0.05" value="1" aria-label="Bells and chanting">
    </div>
    <label class="check"><input type="checkbox" id="reduceMotion"> <span data-i18n="reduceMotion">Reduce motion</span></label>
    <div class="row">
      <div class="lab"><span data-i18n="language">Language</span></div>
      <div class="seg two" id="langSeg" role="radiogroup">
        <button type="button" role="radio" data-v="vi" aria-checked="false">Tiếng Việt</button>
        <button type="button" role="radio" data-v="en" aria-checked="false">English</button>
      </div>
    </div>
    <button class="btn ghost" id="soundBtn" type="button" data-i18n="soundOff">Sound: off</button>
  </div>
</details>

<section class="hud bl" id="entry">
  <h2 data-i18n="enterTitle">Enter the temple</h2>
  <div class="field">
    <label for="name" data-i18n="yourName">Your name</label>
    <input type="text" id="name" maxlength="18" placeholder="Linh" autocomplete="off">
    <p class="err" id="nameErr" hidden></p>
  </div>
  <div class="field">
    <label data-i18n="clothing">Clothing</label>
    <div class="outfits" id="outfits">
      <button type="button" data-o="aotrang" aria-pressed="true">Áo tràng</button>
      <button type="button" data-o="aodai" aria-pressed="false">Áo dài</button>
      <button type="button" data-o="baba" aria-pressed="false">Bà ba</button>
      <button type="button" data-o="modern" aria-pressed="false" data-i18n="everyday">Everyday</button>
    </div>
  </div>
  <div class="field">
    <label data-i18n="colour">Colour</label>
    <div class="swatches" id="swatches"></div>
  </div>
  <button class="btn" id="enterBtn" type="button" data-i18n="walkIn">Walk in · sound on</button>
</section>

<section class="hud bl" id="legend" hidden>
  <details id="legendBox" open>
    <summary><h2 id="hello">Welcome</h2></summary>
    <div class="keys" id="keys">
      <button type="button" data-k="Digit1"><kbd>1</kbd><span data-i18n="kStand">Stand</span></button>
      <button type="button" data-k="Digit2"><kbd>2</kbd>Chắp tay</button>
      <button type="button" data-k="Digit3"><kbd>3</kbd><span data-i18n="kBow">Xá</span></button>
      <button type="button" data-k="Digit4"><kbd>4</kbd><span data-i18n="kKneel">Quỳ</span></button>
      <button type="button" data-k="Digit5"><kbd>5</kbd>Lạy</button>
      <button type="button" data-k="Digit6"><kbd>6</kbd><span data-i18n="kSit">Thiền</span></button>
      <button type="button" data-k="KeyF"><kbd>F</kbd><span data-i18n="kIncense">Incense</span></button>
      <button type="button" data-k="KeyB"><kbd>B</kbd><span data-i18n="kBell">Ring bell</span></button>
      <button type="button" data-k="KeyG"><kbd>G</kbd><span data-i18n="kHelp">Help out</span></button>
      <button type="button" data-k="KeyC"><kbd>C</kbd><span data-i18n="kCandle">Candle</span></button>
      <button type="button" data-k="KeyT"><kbd>T</kbd><span data-i18n="kWish">Wish</span></button>
      <button type="button" data-k="KeyX"><kbd>X</kbd><span data-i18n="kFortune">Xin xăm</span></button>
      <button type="button" data-k="KeyH"><kbd>H</kbd><span data-i18n="kHalls">Halls</span></button>
      <button type="button" data-k="Enter"><kbd>↵</kbd><span data-i18n="kChat">Chat</span></button>
      <button type="button" data-k="KeyV"><kbd>V</kbd><span data-i18n="kEye">Eye view</span></button>
      <button type="button" data-k="KeyN"><kbd>N</kbd><span data-i18n="kDay">Day / night</span></button>
    </div>
    <p class="move" id="moveHelp" data-i18n="moveHelp"></p>
  </details>
</section>

<form id="chatbar" class="hud" hidden>
  <label for="chatInput" class="sr">Chat</label>
  <input id="chatInput" maxlength="120" autocomplete="off" data-i18n-ph="chatPlaceholder">
</form>

<div id="joystick" hidden aria-hidden="true"><div id="knob"></div></div>

<div id="modal" class="hud" role="dialog" aria-modal="true" aria-labelledby="modalTitle" hidden>
  <button type="button" class="x" id="modalClose" aria-label="Close">×</button>
  <h3 id="modalTitle"></h3>
  <div id="modalBody"></div>
</div>

<div id="toast" data-off></div>
<div id="reward" aria-live="polite"></div>

<script>window.CHUA = <?= json_encode($client, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;</script>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js"}}</script>
<script type="module" src="js/temple.js?v=<?= $v ?>"></script>
</body>
</html>
