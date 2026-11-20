<?php
// php viewer/recipe/tiles.php  (from website/): every catalog tile with its starting design, as JSON (the merge gate's list).
error_reporting(E_ERROR);
$c = include __DIR__.'/../../config/catalog.php';
$out = [];
foreach ($c['sports'] as $s) foreach ($s['tiles'] ?? [] as $t) {
    if (empty($t['garment'])) continue;
    $out[] = ['sport' => $s['id'], 'name' => $t['name'], 'garment' => $t['garment'], 'image' => $t['image'] ?? null, 'design' => ($t['design'] ?? []) + ['garment' => $t['garment']]];
}
echo json_encode($out);
