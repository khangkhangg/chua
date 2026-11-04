<?php
declare(strict_types=1);

namespace Chua;

/**
 * Names and short texts typed by visitors. Matching is on whole words with their
 * Vietnamese accents kept, because stripping accents turns ordinary words
 * (các, lớn, ngủ) into false matches.
 */
final class NameFilter
{
    /** Whole-word matches, lowercase, accents kept. */
    private const BAD_WORDS = [
        'lồn', 'buồi', 'cặc', 'địt', 'đụ', 'đéo', 'đĩ', 'đm', 'đcm', 'dm', 'dcm', 'dmm', 'đmm',
        'vcl', 'vkl', 'vl', 'clgt', 'cmm', 'đjt', 'djt', 'lol', 'cc', 'đờ mờ',
        'fuck', 'fucking', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'asshole', 'whore', 'slut', 'bastard',
    ];
    /** Phrases matched anywhere in the lowercase text. */
    private const BAD_PHRASES = ['óc chó', 'đụ má', 'địt mẹ', 'đéo mẹ', 'con đĩ', 'mẹ mày', 'fuck you'];
    /** Substrings of English words that are offensive inside longer words too. */
    private const BAD_STEMS = ['fuck', 'shit', 'bitch', 'cunt'];
    /** Names a visitor may not use, so nobody can pose as a monk or as staff. */
    private const RESERVED = ['admin', 'quản trị', 'moderator', 'thích ', 'hòa thượng', 'thượng tọa', 'đại đức', 'sư cô', 'sư thầy', 'trụ trì', 'nhà chùa'];

    public static function cleanName(string $raw): ?string
    {
        $name = trim((string) preg_replace('/\s+/u', ' ', $raw));
        if (class_exists(\Normalizer::class)) {
            $name = (string) \Normalizer::normalize($name, \Normalizer::FORM_C);
        }
        $len = mb_strlen($name);
        if ($len < 2 || $len > 18) {
            return null;
        }
        if (!preg_match('/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u', $name)) {
            return null;
        }
        $lower = mb_strtolower($name);
        foreach (self::RESERVED as $r) {
            if (str_contains($lower . ' ', $r)) {
                return null;
            }
        }
        return self::isOffensive($name) ? null : $name;
    }

    public static function isOffensive(string $text): bool
    {
        $lower = mb_strtolower($text);
        foreach (self::BAD_PHRASES as $p) {
            if (str_contains($lower, $p)) {
                return true;
            }
        }
        foreach (self::tokens($lower) as $t) {
            if (in_array($t, self::BAD_WORDS, true)) {
                return true;
            }
            foreach (self::BAD_STEMS as $s) {
                if (str_contains($t, $s)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Replaces offensive words with asterisks and trims to $max characters. */
    public static function maskText(string $text, int $max = 140): string
    {
        $text = trim((string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $text));
        $text = mb_substr($text, 0, $max);
        foreach (self::BAD_PHRASES as $p) {
            $text = (string) preg_replace('/' . preg_quote($p, '/') . '/iu', str_repeat('*', mb_strlen($p)), $text);
        }
        return (string) preg_replace_callback('/[\p{L}\p{M}\p{N}]+/u', static function (array $m): string {
            $t = mb_strtolower($m[0]);
            $bad = in_array($t, self::BAD_WORDS, true);
            foreach (self::BAD_STEMS as $s) {
                $bad = $bad || str_contains($t, $s);
            }
            return $bad ? str_repeat('*', mb_strlen($m[0])) : $m[0];
        }, $text);
    }

    /** @return list<string> */
    private static function tokens(string $lower): array
    {
        preg_match_all('/[\p{L}\p{M}\p{N}]+/u', $lower, $m);
        return $m[0];
    }
}
