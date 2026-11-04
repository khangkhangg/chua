<?php
declare(strict_types=1);

namespace Chua\Realtime;

final class Player
{
    public int $id = 0;
    public string $shard = '';
    /** '' in the courtyard, or 'h<hall>#<n>' for room n of a hall */
    public string $room = '';
    public float $x = 0.0;
    public float $z = 30.0;
    public int $h = 128;
    public int $pose = 0;
    /** @var list<float> times of recent chat messages */
    public array $chatTimes = [];
    public float $lastAct = 0.0;
    public float $lastReport = 0.0;

    /** @param array<string,string> $look */
    public function __construct(
        public readonly int $fd,
        public readonly string $name,
        public readonly array $look,
        public readonly string $ipHash,
    ) {
    }

    public function profile(): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'look' => $this->look, 'x' => round($this->x, 2), 'z' => round($this->z, 2), 'h' => $this->h, 'pose' => $this->pose];
    }
}
