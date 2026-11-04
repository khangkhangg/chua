<?php
declare(strict_types=1);

namespace Chua\Realtime;

/** One copy of the courtyard, up to shard_size visitors. */
final class Shard
{
    /** @var array<int,Player> id => player */
    public array $players = [];
    private int $nextId = 1;
    public readonly int $seed;

    public function __construct(public readonly string $key)
    {
        $this->seed = random_int(1, 2_000_000_000);
    }

    public function add(Player $p): void
    {
        for ($i = 0; $i < 65535; $i++) {
            $id = $this->nextId;
            $this->nextId = $this->nextId >= 65535 ? 1 : $this->nextId + 1;
            if (!isset($this->players[$id])) {
                $p->id = $id;
                $p->shard = $this->key;
                $this->players[$id] = $p;
                return;
            }
        }
        throw new \OverflowException('Shard full');
    }

    public function remove(Player $p): void
    {
        unset($this->players[$p->id]);
    }

    /** Puts a player in the first room of a hall with space, or back in the courtyard (hall < 0). */
    public function enterRoom(Player $p, int $hall, int $size): void
    {
        if ($hall < 0) {
            $p->room = '';
            return;
        }
        if (str_starts_with($p->room, 'h' . $hall . '#')) {
            return;
        }
        $counts = [];
        foreach ($this->players as $o) {
            if ($o !== $p && $o->room !== '') {
                $counts[$o->room] = ($counts[$o->room] ?? 0) + 1;
            }
        }
        for ($n = 1; ; $n++) {
            $room = 'h' . $hall . '#' . $n;
            if (($counts[$room] ?? 0) < $size) {
                $p->room = $room;
                return;
            }
        }
    }

    /**
     * Nearest visitors to each player, using a 5 m grid so a full shard costs
     * far less than comparing every pair.
     * @return array<int,list<Player>> player id => visible players
     */
    public function visibility(int $count, float $radius): array
    {
        $cell = 5.0;
        $grid = [];
        foreach ($this->players as $p) {
            $grid[(int) floor($p->x / $cell)][(int) floor($p->z / $cell)][] = $p;
        }
        $reach = (int) ceil($radius / $cell);
        $r2 = $radius * $radius;
        $out = [];
        foreach ($this->players as $me) {
            $cx = (int) floor($me->x / $cell);
            $cz = (int) floor($me->z / $cell);
            $near = [];
            for ($ix = $cx - $reach; $ix <= $cx + $reach; $ix++) {
                if (!isset($grid[$ix])) {
                    continue;
                }
                for ($iz = $cz - $reach; $iz <= $cz + $reach; $iz++) {
                    foreach ($grid[$ix][$iz] ?? [] as $o) {
                        if ($o === $me || $o->room !== $me->room) {
                            continue;
                        }
                        $d = ($o->x - $me->x) ** 2 + ($o->z - $me->z) ** 2;
                        if ($d <= $r2) {
                            $near[] = [$d, $o];
                        }
                    }
                }
            }
            if (count($near) > $count) {
                usort($near, static fn ($a, $b) => $a[0] <=> $b[0]);
                $near = array_slice($near, 0, $count);
            }
            $out[$me->id] = array_map(static fn ($n) => $n[1], $near);
        }
        return $out;
    }
}
