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
        $patterns = ['Solid', 'Stripes', 'Chevron', 'Velocity', 'Hoops', 'Dots', 'Diagonal', 'Tribal', 'Camo'];
        $color = 'regex:/^#[0-9a-fA-F]{6}$/';

        return [
            'name' => [$required, 'string', 'max:120'],
            'sport' => [$required, Rule::in(array_column(config('catalog.sports'), 'id'))],
            'garment' => [$required, Rule::in(array_column(config('catalog.garments'), 'id'))],
            'mode' => ['sometimes', Rule::in(['ai', 'dyo'])],
            'status' => ['sometimes', Rule::in(['draft', 'approved'])],
            'design' => [$required, 'array:garment,main,secondary,accent,pattern,logoText,number,backName,patternImage,logoImage,sponsorImage,patternColor,patternScale,patternBody,prompt,renderFront,renderBack,app,gradient,zones,layers,marks,presetId'],
            'design.garment' => ['sometimes', Rule::in(array_column(config('catalog.garments'), 'id'))],
            'design.main' => ['required_with:design', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'design.secondary' => ['required_with:design', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'design.accent' => ['required_with:design', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'design.pattern' => ['required_with:design', Rule::in($patterns)],
            'design.presetId' => ['sometimes', 'nullable', 'string', 'max:80'],
            'design.gradient' => ['sometimes', 'nullable', 'array:from,to,angle'],
            'design.gradient.from' => ['required_with:design.gradient', $color],
            'design.gradient.to' => ['required_with:design.gradient', $color],
            'design.gradient.angle' => ['sometimes', 'numeric', 'between:-360,360'],
            'design.zones' => ['sometimes', 'array:body,yoke,sleeves,sides,hem'],
            'design.zones.*' => ['string', Rule::in([...$patterns, 'None'])],
            // The fixed marks moved, resized, turned or hidden on the 2D panels.
            'design.marks' => ['sometimes', 'array:top_wordmark,top_sponsor,top_crest,top_name,top_number,shorts_crest,shorts_number,shorts_wordmark'],
            'design.marks.*' => ['array:side,x,y,scale,rot,hidden'],
            'design.marks.*.side' => ['sometimes', Rule::in(['front', 'back'])],
            'design.marks.*.x' => ['sometimes', 'numeric', 'between:-1,1'],
            'design.marks.*.y' => ['sometimes', 'numeric', 'between:-0.5,1.5'],
            'design.marks.*.scale' => ['sometimes', 'numeric', 'between:0.1,6'],
            'design.marks.*.rot' => ['sometimes', 'numeric', 'between:-360,360'],
            'design.marks.*.hidden' => ['sometimes', 'boolean'],
            'design.layers' => ['sometimes', 'array', 'max:40'],
            'design.layers.*' => ['array:id,name,type,part,side,x,y,w,h,rot,opacity,src,text,size,color,shape'],
            'design.layers.*.id' => ['required', 'string', 'max:80', 'distinct:strict'],
            'design.layers.*.name' => ['sometimes', 'string', 'max:120'],
            'design.layers.*.type' => ['required', Rule::in(['image', 'text', 'shape'])],
            'design.layers.*.part' => ['sometimes', Rule::in(['top', 'shorts'])],
            'design.layers.*.side' => ['required', Rule::in(['front', 'back'])],
            'design.layers.*.x' => ['required', 'numeric', 'between:-1,1'],
            'design.layers.*.y' => ['required', 'numeric', 'between:-0.5,1.5'],
            'design.layers.*.w' => ['sometimes', 'numeric', 'between:0.005,1'],
            'design.layers.*.h' => ['sometimes', 'numeric', 'between:0.005,1'],
            'design.layers.*.rot' => ['sometimes', 'numeric', 'between:-360,360'],
            'design.layers.*.opacity' => ['sometimes', 'numeric', 'between:0,1'],
            'design.layers.*.src' => ['required_if:design.layers.*.type,image', 'nullable', 'string', 'max:4000000', $this->imageSourceRule()],
            'design.layers.*.text' => ['required_if:design.layers.*.type,text', 'nullable', 'string', 'max:120'],
            'design.layers.*.size' => ['sometimes', 'numeric', 'between:0.005,0.4'],
            'design.layers.*.color' => ['sometimes', $color],
            'design.layers.*.shape' => ['required_if:design.layers.*.type,shape', Rule::in(['rectangle', 'ellipse', 'triangle'])],
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
