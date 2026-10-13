<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:120'],
            'sport' => [$required, Rule::in(array_column(config('catalog.sports'), 'id'))],
            'garment' => [$required, Rule::in(array_column(config('catalog.garments'), 'id'))],
            'mode' => ['sometimes', Rule::in(['ai', 'dyo'])],
            'status' => ['sometimes', Rule::in(['draft', 'approved'])],
            'design' => [$required, 'array:garment,main,secondary,accent,pattern,logoText,number,backName,patternImage,logoImage,sponsorImage,patternColor,patternScale,patternBody,prompt,renderFront,renderBack,app'],
            'design.garment' => ['sometimes', Rule::in(array_column(config('catalog.garments'), 'id'))],
            'design.main' => ['required_with:design', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'design.secondary' => ['required_with:design', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'design.accent' => ['required_with:design', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'design.pattern' => ['required_with:design', Rule::in(['Solid', 'Stripes', 'Chevron', 'Velocity'])],
            'design.logoText' => ['sometimes', 'nullable', 'string', 'max:40'],
            'design.number' => ['sometimes', 'nullable', 'string', 'max:3'],
            'design.backName' => ['sometimes', 'nullable', 'string', 'max:40'],
            'design.patternColor' => ['sometimes', 'nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'design.patternScale' => ['sometimes', 'numeric', 'min:0.1', 'max:10'],
            'design.patternBody' => ['sometimes', 'numeric', 'min:0', 'max:1'],
            'design.logoImage' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.sponsorImage' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.patternImage' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            // The apps also keep their AI renders and app-only details (fabric, AI spec).
            'design.renderFront' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.renderBack' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.app' => ['sometimes', 'nullable', 'array'],
            'thumbnail' => ['sometimes', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.prompt' => ['sometimes', 'nullable', 'string', 'max:1500'],
            'expected_version' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    private function imageSourceRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) {
            if ($value === null || $value === '') {
                return;
            }

            $isRasterData = preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$#D', $value);
            $isLocal = str_starts_with($value, '/') && ! str_starts_with($value, '//') && ! str_contains($value, '\\');
            $origin = $this->getSchemeAndHttpHost();
            $isSameOrigin = str_starts_with($value, $origin.'/');

            if (! $isRasterData && ! $isLocal && ! $isSameOrigin) {
                $fail('The image must be a local image URL or a PNG, JPEG, or WebP data URL.');
            }
        };
    }
}
