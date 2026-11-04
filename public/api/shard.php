<?php
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

use Chua\Bus;
use Chua\Http;

// GET ?invite=sxxxxxx -> which realtime node this visitor should connect to.
$rt = chua_config()['realtime'];
if (!$rt['enabled']) {
    Http::json(['enabled' => false]);
}
$invite = preg_match('/^s[a-f0-9]{6}$/', (string) ($_GET['invite'] ?? '')) ? (string) $_GET['invite'] : '';
$bus = Bus::fromConfig();
$nodes = $bus->nodes();
if (!$nodes) {
    Http::json(['enabled' => true, 'url' => $rt['public_url'], 'invite' => $invite]);
}
if ($invite !== '' && ($node = $bus->shardNode($invite)) !== null && isset($nodes[$node])) {
    Http::json(['enabled' => true, 'url' => $nodes[$node]['url'], 'invite' => $invite]);
}
uasort($nodes, static fn ($a, $b) => $a['count'] <=> $b['count']);
Http::json(['enabled' => true, 'url' => reset($nodes)['url'], 'invite' => $invite]);
