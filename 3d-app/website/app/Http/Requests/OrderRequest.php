<?php

namespace App\Http\Requests;

use App\Models\Order;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Order fields shared by customers and the admin panel. */
class OrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $admin = $this->routeIs('admin.*');
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'user_id' => $admin ? [$required, 'integer', 'exists:users,id'] : ['prohibited'],
            'project_id' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
            'sizes' => [$required, 'array:'.implode(',', Order::SIZES)],
            'sizes.*' => ['integer', 'min:0', 'max:10000'],
            'contact_name' => [$required, 'string', 'max:120'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'shipping_address' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            // Prices, status and internal notes are set by an administrator.
            'status' => $admin ? ['sometimes', Rule::in(Order::STATUSES)] : ['prohibited'],
            'unit_price' => $admin ? ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100000'] : ['prohibited'],
            'admin_notes' => $admin ? ['sometimes', 'nullable', 'string', 'max:2000'] : ['prohibited'],
        ];
    }

    public function after(): array
    {
        return [function ($validator) {
            if ($this->has('sizes') && array_sum(array_map('intval', (array) $this->input('sizes'))) < 1) {
                $validator->errors()->add('sizes', 'Add at least one garment to the order.');
            }
        }];
    }
}
