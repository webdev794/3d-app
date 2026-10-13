<?php

namespace App\Services;

use App\Models\Project;

class DesignSvg
{
    /** A flat visual schematic, not a production pattern or manufacturing file. */
    public function render(Project $project): string
    {
        $design = $project->design;
        $escape = fn (mixed $value) => htmlspecialchars((string) $value, ENT_QUOTES | ENT_XML1, 'UTF-8');
        $main = $escape($design['main']);
        $secondary = $escape($design['secondary']);
        $accent = $escape($design['accent']);
        $name = $escape($project->name);
        $logo = $escape($design['logoText'] ?? '');
        $number = $escape($design['number'] ?? '');
        $backName = $escape($design['backName'] ?? '');
        $pattern = $design['pattern'];
        $garment = $design['garment'] ?? $project->garment;
        $shape = match ($garment) {
            'shorts' => 'M160 120H480L515 515H355L320 290L285 515H125Z',
            'singlet' => 'M200 95L260 75Q320 135 380 75L440 95L420 230L470 535H170L220 230Z',
            default => 'M215 95L260 75Q320 130 380 75L425 95L550 195L490 285L445 240L460 535H180L195 240L150 285L90 195Z',
        };
        $patternMarkup = match ($pattern) {
            'Stripes' => '<path d="M140 50V580M245 50V580M350 50V580M455 50V580" stroke="'.$secondary.'" stroke-width="44" opacity="0.9"/>',
            'Chevron' => '<path d="M70 160L320 340L570 160M70 270L320 450L570 270" fill="none" stroke="'.$secondary.'" stroke-width="45"/><path d="M70 130L320 310L570 130" fill="none" stroke="'.$accent.'" stroke-width="9"/>',
            'Velocity' => '<path d="M80 535L360 70L430 70L150 535ZM215 535L495 70L555 70L275 535Z" fill="'.$secondary.'"/><path d="M305 535L585 70" stroke="'.$accent.'" stroke-width="12"/>',
            default => '',
        };
        $front = $this->garment($shape, $main, $secondary, $patternMarkup, 'front');
        $back = $this->garment($shape, $main, $secondary, $patternMarkup, 'back');
        $frontText = $garment === 'shorts' ? '' : '<text x="320" y="252" text-anchor="middle" fill="'.$accent.'" font-size="34" font-weight="800">'.$logo.'</text>';
        $backText = $garment === 'shorts' ? '' : '<text x="320" y="230" text-anchor="middle" fill="'.$accent.'" font-size="27" font-weight="700">'.$backName.'</text><text x="320" y="390" text-anchor="middle" fill="'.$accent.'" font-size="135" font-weight="800">'.$number.'</text>';

        return '<?xml version="1.0" encoding="UTF-8"?>' .
            '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800" role="img" aria-labelledby="title desc">' .
            '<title id="title">'.$name.' — flat design schematic</title>' .
            '<desc id="desc">Colour, pattern and text preview. Raster logos and artwork are omitted. Not a manufacturing pattern or tech pack.</desc>' .
            '<rect width="1280" height="800" fill="#f2f4f7"/><g font-family="Arial, sans-serif">' .
            '<text x="64" y="60" fill="#09121e" font-size="27" font-weight="700">'.$name.'</text>' .
            '<text x="1216" y="60" text-anchor="end" fill="#526077" font-size="18">3DEEZI · VERSION '.$project->version.'</text>' .
            '<g transform="translate(0 35)">'.$front.$frontText.'</g>' .
            '<g transform="translate(640 35)">'.$back.$backText.'</g>' .
            '<text x="320" y="635" text-anchor="middle" fill="#526077" font-size="18">FRONT</text>' .
            '<text x="960" y="635" text-anchor="middle" fill="#526077" font-size="18">BACK</text>' .
            '<circle cx="560" cy="692" r="15" fill="'.$main.'"/><circle cx="640" cy="692" r="15" fill="'.$secondary.'"/><circle cx="720" cy="692" r="15" fill="'.$accent.'"/>' .
            '<text x="640" y="754" text-anchor="middle" fill="#526077" font-size="15">Flat schematic · Raster artwork omitted · Not a manufacturing pattern or tech pack</text></g></svg>';
    }

    private function garment(string $shape, string $main, string $secondary, string $pattern, string $id): string
    {
        return '<defs><clipPath id="'.$id.'"><path d="'.$shape.'"/></clipPath></defs>' .
            '<path d="'.$shape.'" fill="'.$main.'"/>' .
            '<g clip-path="url(#'.$id.')">'.$pattern.'</g>' .
            '<path d="'.$shape.'" fill="none" stroke="'.$secondary.'" stroke-width="5" stroke-linejoin="round"/>';
    }
}
