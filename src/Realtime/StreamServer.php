<?php
declare(strict_types=1);

namespace Chua\Realtime;

/**
 * A small RFC 6455 WebSocket server on plain PHP streams. It needs no extension,
 * which makes it the server for local development, tests and small deployments.
 * stream_select() caps it near 1,000 connections; use OpenSwoole beyond that.
 * GET /metrics on the same port returns Prometheus text.
 */
final class StreamServer implements Transport
{
    private const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    private const MAX_FRAME = 65536;

    /** @var array<int,resource> */
    private array $socks = [];
    /** @var array<int,array{in:string,out:string,ws:bool,closing:bool,ip:string}> */
    private array $conns = [];
    private ?Hub $hub = null;
    /** @var resource */
    private $server;
    private bool $running = true;

    /** @param callable(string):string $ipHasher */
    public function __construct(private readonly string $host, private readonly int $port, private $ipHasher)
    {
    }

    public function attach(Hub $hub): void
    {
        $this->hub = $hub;
    }

    public function stop(): void
    {
        $this->running = false;
    }

    public function run(int $tickMs): void
    {
        $server = stream_socket_server("tcp://{$this->host}:{$this->port}", $errno, $err);
        if ($server === false) {
            throw new \RuntimeException("Cannot listen on {$this->host}:{$this->port}: $err");
        }
        stream_set_blocking($server, false);
        $this->server = $server;
        $nextTick = microtime(true);
        while ($this->running) {
            $read = [$server];
            $write = [];
            foreach ($this->socks as $id => $s) {
                $read[] = $s;
                if ($this->conns[$id]['out'] !== '') {
                    $write[] = $s;
                }
            }
            $except = null;
            $wait = max(0, (int) (($nextTick - microtime(true)) * 1_000_000));
            if (@stream_select($read, $write, $except, 0, min($wait, 50_000)) === false) {
                continue;
            }
            foreach ($read as $s) {
                if ($s === $server) {
                    $this->accept();
                } elseif (isset($this->socks[(int) $s])) {
                    $this->readFrom((int) $s);
                }
            }
            foreach ($write as $s) {
                if (isset($this->socks[(int) $s])) {
                    $this->flush((int) $s);
                }
            }
            if (microtime(true) >= $nextTick) {
                $nextTick += $tickMs / 1000;
                if ($nextTick < microtime(true)) {
                    $nextTick = microtime(true) + $tickMs / 1000;
                }
                $this->hub?->tick();
            }
        }
        foreach (array_keys($this->socks) as $id) {
            $this->drop($id);
        }
        fclose($server);
    }

    public function send(int $fd, string $data, bool $binary): void
    {
        if (!isset($this->conns[$fd]) || !$this->conns[$fd]['ws'] || $this->conns[$fd]['closing']) {
            return;
        }
        if (strlen($this->conns[$fd]['out']) > 1_000_000) {
            $this->drop($fd); // a client that cannot keep up
            return;
        }
        $this->conns[$fd]['out'] .= self::frame($binary ? 2 : 1, $data);
        $this->flush($fd);
    }

    public function close(int $fd): void
    {
        if (!isset($this->conns[$fd])) {
            return;
        }
        $this->conns[$fd]['out'] .= self::frame(8, '');
        $this->conns[$fd]['closing'] = true;
        $this->flush($fd);
    }

    private function accept(): void
    {
        $s = @stream_socket_accept($this->server, 0, $peer);
        if ($s === false) {
            return;
        }
        stream_set_blocking($s, false);
        $id = (int) $s;
        $this->socks[$id] = $s;
        $ip = (string) preg_replace('/:\d+$/', '', (string) $peer);
        $this->conns[$id] = ['in' => '', 'out' => '', 'ws' => false, 'closing' => false, 'ip' => trim($ip, '[]')];
    }

    private function readFrom(int $id): void
    {
        $chunk = @fread($this->socks[$id], 65536);
        if ($chunk === '' || $chunk === false) {
            if (feof($this->socks[$id])) {
                $this->drop($id);
            }
            return;
        }
        $this->conns[$id]['in'] .= $chunk;
        if (!$this->conns[$id]['ws']) {
            $this->handshake($id);
        }
        while (isset($this->conns[$id]) && $this->conns[$id]['ws'] && $this->parseFrame($id)) {
        }
    }

    private function handshake(int $id): void
    {
        $buf = $this->conns[$id]['in'];
        $end = strpos($buf, "\r\n\r\n");
        if ($end === false) {
            if (strlen($buf) > 8192) {
                $this->drop($id);
            }
            return;
        }
        $this->conns[$id]['in'] = substr($buf, $end + 4);
        $lines = explode("\r\n", substr($buf, 0, $end));
        $request = array_shift($lines);
        $headers = [];
        foreach ($lines as $line) {
            if (str_contains($line, ':')) {
                [$k, $v] = explode(':', $line, 2);
                $headers[strtolower(trim($k))] = trim($v);
            }
        }
        if (str_starts_with($request, 'GET /metrics')) {
            $body = $this->hub?->metrics() ?? '';
            $this->conns[$id]['out'] = "HTTP/1.1 200 OK\r\nContent-Type: text/plain; version=0.0.4\r\nContent-Length: " . strlen($body) . "\r\nConnection: close\r\n\r\n" . $body;
            $this->conns[$id]['closing'] = true;
            $this->flush($id);
            return;
        }
        $key = $headers['sec-websocket-key'] ?? '';
        if (strtolower($headers['upgrade'] ?? '') !== 'websocket' || $key === '') {
            $this->conns[$id]['out'] = "HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n";
            $this->conns[$id]['closing'] = true;
            $this->flush($id);
            return;
        }
        $accept = base64_encode(sha1($key . self::GUID, true));
        $this->conns[$id]['out'] .= "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: $accept\r\n\r\n";
        $this->conns[$id]['ws'] = true;
        $ip = $this->conns[$id]['ip'];
        if (in_array($ip, ['127.0.0.1', '::1'], true)) {
            $ip = $headers['cf-connecting-ip'] ?? $headers['x-real-ip'] ?? $ip;
        }
        $this->flush($id);
        $this->hub?->open($id, ($this->ipHasher)($ip));
    }

    private function parseFrame(int $id): bool
    {
        $b = $this->conns[$id]['in'];
        if (strlen($b) < 2) {
            return false;
        }
        $op = ord($b[0]) & 0x0F;
        $masked = (ord($b[1]) & 0x80) !== 0;
        $len = ord($b[1]) & 0x7F;
        $pos = 2;
        if ($len === 126) {
            if (strlen($b) < 4) {
                return false;
            }
            $len = unpack('n', substr($b, 2, 2))[1];
            $pos = 4;
        } elseif ($len === 127) {
            if (strlen($b) < 10) {
                return false;
            }
            $len = unpack('J', substr($b, 2, 8))[1];
            $pos = 10;
        }
        if ($len > self::MAX_FRAME || !$masked) {
            $this->drop($id); // clients must mask; oversized frames are refused
            return false;
        }
        if (strlen($b) < $pos + 4 + $len) {
            return false;
        }
        $mask = substr($b, $pos, 4);
        $data = substr($b, $pos + 4, $len);
        $this->conns[$id]['in'] = substr($b, $pos + 4 + $len);
        if ($len > 0) {
            $data ^= substr(str_repeat($mask, intdiv($len, 4) + 1), 0, $len);
        }
        match ($op) {
            1, 2 => $this->hub?->message($id, $data, $op === 2),
            8 => $this->close($id),
            9 => $this->conns[$id]['out'] .= self::frame(10, $data),
            default => null,
        };
        return isset($this->conns[$id]);
    }

    private function flush(int $id): void
    {
        if (!isset($this->conns[$id])) {
            return;
        }
        $out = $this->conns[$id]['out'];
        if ($out !== '') {
            $n = @fwrite($this->socks[$id], $out);
            if ($n === false) {
                $this->drop($id);
                return;
            }
            $this->conns[$id]['out'] = substr($out, $n);
        }
        if ($this->conns[$id]['closing'] && $this->conns[$id]['out'] === '') {
            $this->drop($id);
        }
    }

    private function drop(int $id): void
    {
        if (!isset($this->socks[$id])) {
            return;
        }
        $wasWs = $this->conns[$id]['ws'];
        @fclose($this->socks[$id]);
        unset($this->socks[$id], $this->conns[$id]);
        if ($wasWs) {
            $this->hub?->close($id);
        }
    }

    private static function frame(int $op, string $data): string
    {
        $len = strlen($data);
        $head = chr(0x80 | $op);
        if ($len < 126) {
            $head .= chr($len);
        } elseif ($len < 65536) {
            $head .= chr(126) . pack('n', $len);
        } else {
            $head .= chr(127) . pack('J', $len);
        }
        return $head . $data;
    }
}
