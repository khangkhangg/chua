<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Http;
use Chua\Payment\Orders;

// Candles burning now, newest first.
header('Cache-Control: max-age=5');
Http::json(['candles' => Orders::activeCandles(60)]);
