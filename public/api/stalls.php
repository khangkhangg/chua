<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Http;
use Chua\Stalls;

// Every stall's state for the market; shop details only for rented stalls that are not taken down.
header('Cache-Control: max-age=30');
Http::json(['stalls' => Stalls::publicList(), 'price' => Stalls::price()]);
