<?php
declare(strict_types=1);

namespace Chua;

/** Email through Resend and messages to the owner's Telegram. */
final class Notify
{
    /** @var list<array<int,string>> Messages kept instead of sent when `notify_fake` is set (tests). */
    public static array $sent = [];

    public static function email(string $to, string $subject, string $html): bool
    {
        $c = chua_config();
        if (!empty($c['notify_fake'])) {
            self::$sent[] = ['email', $to, $subject, $html];
            return true;
        }
        $key = (string) ($c['mail']['resend_key'] ?? '');
        if ($key === '') {
            error_log('chua mail: no resend key');
            return false;
        }
        return self::post('https://api.resend.com/emails', [
            'from' => (string) ($c['mail']['from'] ?? 'An Tâm Nam Chùa <chua@vietnamcos.com>'),
            'to' => [$to], 'subject' => $subject, 'html' => $html,
        ], ['Authorization: Bearer ' . $key]);
    }

    /** Sends HTML-formatted text to the owner; link previews are off. */
    public static function telegram(string $html): bool
    {
        $c = chua_config();
        if (!empty($c['notify_fake'])) {
            self::$sent[] = ['telegram', $html];
            return true;
        }
        $token = (string) ($c['telegram']['bot_token'] ?? '');
        $chat = (string) ($c['telegram']['chat_id'] ?? '');
        if ($token === '' || $chat === '') {
            error_log('chua telegram: not configured');
            return false;
        }
        return self::post("https://api.telegram.org/bot$token/sendMessage", [
            'chat_id' => $chat, 'text' => $html, 'parse_mode' => 'HTML', 'disable_web_page_preview' => true,
        ]);
    }

    /** @param array<string,mixed> $body @param list<string> $headers */
    private static function post(string $url, array $body, array $headers = []): bool
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json'], $headers),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
        ]);
        $out = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code < 200 || $code >= 300) {
            // Log the host only: the Telegram URL carries the bot token.
            error_log('chua notify ' . parse_url($url, PHP_URL_HOST) . " -> $code " . substr((string) $out, 0, 200));
            return false;
        }
        return true;
    }
}
