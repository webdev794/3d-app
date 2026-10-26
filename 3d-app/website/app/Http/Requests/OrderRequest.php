<?php

namespace App\Http\Requests;

use App\Models\Order;
use App\Support\OrderDelivery;
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
        // Customers order a Studio kit (studio), fill in the order form (form) or upload their own order form (upload).
        $source = $admin ? null : $this->source();
        $byForm = in_array($source, ['form', 'upload'], true);
        // A customer ordering a kit confirms the design is final and says what goes on the back.
        $kit = ! $admin && ! $byForm && $this->filled('project_id');
        $names = $this->names();
        // The order form's garment rows decide the sizes; staff may edit them on any order.
        $hasItems = is_array($this->input('items')) && $this->input('items') !== [];
        $items = match (true) {
            $admin => ['sometimes', 'nullable', 'array', 'max:'.Order::MAX_ITEMS],
            $source === 'form' => ['required', 'array', 'min:1', 'max:'.Order::MAX_ITEMS],
            // Rows read from an uploaded order form, once the customer has checked them.
            $source === 'upload' => ['sometimes', 'nullable', 'array', 'max:'.Order::MAX_ITEMS],
            default => ['prohibited'],
        };
        $staff = fn (array $rules) => $admin ? ['sometimes', 'nullable', ...$rules] : ['prohibited'];
        // Upload Your Order needs the date required, a mobile and delivery or pick up (client 2026-10-22); drafts save without them.
        // The order form needs them too (client 2026-10-22).
        $upload = in_array($source, ['form', 'upload'], true);
        $delivery = fn (array $rules) => $admin ? ['prohibited'] : ['sometimes', 'nullable', ...$rules];
        // The customer's pricing choices (destination, extras, discount code): the payments feature's rules.
        $pricing = class_exists(\App\Services\Pricing\PricingService::class) ? \App\Services\Pricing\PricingService::choiceRules() : [];

        return [
            ...$pricing,
            'source' => $admin ? ['prohibited'] : ['sometimes', Rule::in(['studio', 'form', 'upload'])],
            'user_id' => $admin ? [$required, 'integer', 'exists:users,id'] : ['prohibited'],
            'project_id' => $byForm ? ['prohibited'] : ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
            'draft_id' => $admin ? ['prohibited'] : ['sometimes', 'nullable', 'integer'],
            'idempotency_key' => ['sometimes', 'nullable', 'string', 'regex:/^[A-Za-z0-9_-]{8,80}$/'],
            // With a players list or garment rows, the sizes are counted from them.
            'sizes' => $byForm ? ['prohibited'] : [$names === 'list' || ($admin && $hasItems) ? 'sometimes' : $required, 'array:'.implode(',', Order::SIZES)],
            'sizes.*' => ['integer', 'min:0', 'max:10000'],
            'contact_name' => [$required, 'string', 'max:120'],
            'contact_email' => ['sometimes', 'nullable', 'email', 'max:190'],
            'phone' => [$upload ? 'required' : 'sometimes', 'nullable', 'string', 'max:40'],
            'team_name' => [$byForm ? 'required' : 'sometimes', 'nullable', 'string', 'max:120'],
            'shipping_address' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:'.($byForm || $admin ? 4000 : 2000)],
            'needed_by' => [$upload ? 'required' : 'sometimes', 'nullable', 'date_format:Y-m-d', ...($admin ? [] : ['after_or_equal:today'])],
            // Deliver to an address or pick up; kept on the order as its shipping_address text (App\Support\OrderDelivery).
            'delivery' => $upload ? ['required', Rule::in(OrderDelivery::METHODS)] : $delivery([Rule::in(OrderDelivery::METHODS)]),
            'address' => $delivery(['array:'.implode(',', OrderDelivery::ADDRESS_FIELDS)]),
            'address.*' => ['nullable', 'string', 'max:200'],
            'items' => $items,
            'items.*' => ['array:garment,sport,fit,label,project_id,sizes,players,file_ids,name,quantity,thumbnail,project_name,project_version'],
            // The draft's artwork files chosen for this garment (kept with the row in the order).
            'items.*.file_ids' => ['sometimes', 'nullable', 'array', 'max:15'],
            'items.*.file_ids.*' => ['integer'],
            'items.*.garment' => ['required', Rule::in(array_keys(Order::GARMENTS))],
            'items.*.sport' => ['sometimes', 'nullable', Rule::in(array_column(config('catalog.sports'), 'id'))],
            'items.*.fit' => ['sometimes', 'nullable', Rule::in(array_keys(Order::FITS))],
            'items.*.label' => ['sometimes', 'nullable', 'string', 'max:60'],
            'items.*.project_id' => ['sometimes', 'nullable', 'integer'],
            'items.*.sizes' => ['required', 'array:'.implode(',', Order::SIZES)],
            'items.*.sizes.*' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'items.*.players' => ['sometimes', 'nullable', 'list', 'max:'.Order::MAX_PLAYERS],
            'items.*.players.*' => ['array:name,number,size'],
            'items.*.players.*.name' => ['nullable', 'string', 'max:40'],
            'items.*.players.*.number' => ['nullable', 'regex:/^\d{0,3}$/'],
            'items.*.players.*.size' => ['nullable', Rule::in(Order::SIZES)],
            // Staff only: the sub-status, design approval, delivery tracking, who looks after it and when it is due.
            'step' => $staff(['string', 'max:30']),
            'approval' => $staff([Rule::in(Order::APPROVALS)]),
            'carrier' => $staff(['string', 'max:80']),
            'tracking_number' => $staff(['string', 'max:80']),
            'tracking_url' => $staff(['url:http,https', 'max:500']),
            'assigned_to' => $staff(['integer', Rule::exists('users', 'id')->where('is_admin', true)]),
            'due_date' => $staff(['date_format:Y-m-d']),
            // Staff moving an order into Production without approval or full payment confirm it (see OrderGate).
            'confirm_without_approval' => $admin ? ['sometimes', 'boolean'] : ['prohibited'],
            'confirm_unpaid' => $admin ? ['sometimes', 'boolean'] : ['prohibited'],
            'override_reason' => $admin ? ['sometimes', 'nullable', 'string', 'max:500'] : ['prohibited'],
            // Who makes it (preferred suppliers, task 9.118): 3DEEZI (none sent), Mantis or an approved supplier; staff may pick any.
            'supplier_id' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'design_final' => $kit ? ['accepted'] : ['sometimes', 'boolean'],
            // The version of the kit the customer saw, when known: a newer one has to be checked first.
            'project_version' => $admin ? ['prohibited'] : ['sometimes', 'nullable', 'integer', 'min:1'],
            // The order form keeps names and numbers with each garment row instead.
            'names' => $byForm ? ['prohibited'] : [$kit ? 'required' : 'sometimes', 'nullable', Rule::in(Order::NAMES)],
            'players' => $byForm ? ['prohibited'] : ['required_if:names,same,list', 'nullable', 'list', $names === 'same' ? 'size:1' : 'max:'.Order::MAX_PLAYERS],
            'players.*' => ['array:name,number,size'],
            'players.*.name' => ['nullable', 'string', 'max:40'],
            'players.*.number' => ['nullable', 'regex:/^\d{1,3}$/'],
            'players.*.size' => $names === 'list' ? ['required', Rule::in(Order::SIZES)] : ['nullable', Rule::in(Order::SIZES)],
            // Prices, status and internal notes are set by an administrator.
            'status' => $admin ? ['sometimes', Rule::in(Order::STATUSES)] : ['prohibited'],
            'unit_price' => $admin ? ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100000'] : ['prohibited'],
            'admin_notes' => $admin ? ['sometimes', 'nullable', 'string', 'max:2000'] : ['prohibited'],
        ];
    }

    public function messages(): array
    {
        $choose = 'Choose what goes on the back: the same name and number on every shirt, one for each player, or none.';

        return [
            'design_final.accepted' => 'Tick “This design is final” to place the order.',
            'names.required' => $choose,
            'names.in' => $choose,
            'players.required_if' => 'Add the names and numbers to print.',
            'players.list' => 'Send the players as a list.',
            'players.size' => 'Give one name and number for every shirt.',
            'players.max' => 'A list can have up to '.Order::MAX_PLAYERS.' players.',
            'players.*.array' => 'Each player has a name, a number and a size.',
            'players.*.name.max' => 'Player :position: a name can be up to 40 characters.',
            'players.*.number.regex' => 'Player :position: the number is digits only, up to 3.',
            'players.*.size.required' => 'Player :position: choose a size.',
            'players.*.size.in' => 'Player :position: choose a size from the list.',
            'team_name.required' => 'Add your team or organisation name.',
            'contact_name.required' => 'Add a contact name.',
            'contact_email.email' => 'Check the email address.',
            'needed_by.after_or_equal' => 'The needed-by date can’t be in the past.',
            'needed_by.date_format' => 'Give the needed-by date as a date.',
            'needed_by.required' => 'Choose the date you need the order by.',
            'phone.required' => 'Add a mobile number so we can reach you.',
            'delivery.required' => 'Choose delivery or pick up.',
            'delivery.in' => 'Choose delivery or pick up.',
            'address.array' => 'Send the delivery address as street, suburb, state, postcode and country.',
            'address.*.max' => 'Each part of the address can be up to 200 characters.',
            'items.required' => 'Add at least one garment to the order.',
            'items.min' => 'Add at least one garment to the order.',
            'items.max' => 'An order form can have up to '.Order::MAX_ITEMS.' garments.',
            'items.prohibited' => 'Garment rows belong to the order form.',
            'items.*.array' => 'Garment :position: send it as garment, fit, sizes and players.',
            'items.*.garment.required' => 'Garment :position: choose a garment.',
            'items.*.garment.in' => 'Garment :position: choose a garment from the list.',
            'items.*.sport.in' => 'Garment :position: choose a sport from the list.',
            'items.*.fit.in' => 'Garment :position: choose a fit from the list.',
            'items.*.label.max' => 'Garment :position: the name can be up to 60 characters.',
            'items.*.sizes.required' => 'Garment :position: add at least one size and quantity.',
            'items.*.sizes.array' => 'Garment :position: use the sizes XS to 8XL, W8 to W24 or 2Y to 16Y.',
            'items.*.players.max' => 'Garment :position: up to '.Order::MAX_PLAYERS.' names and numbers.',
            'items.*.players.*.name.max' => 'A name can be up to 40 characters.',
            'items.*.players.*.number.regex' => 'A number is digits only, up to 3.',
            'items.*.players.*.size.in' => 'Choose a size from the list.',
            'sizes.prohibited' => 'The order form counts the sizes from its garments.',
            'project_id.prohibited' => 'Choose a saved design on a garment row instead.',
            'idempotency_key.regex' => 'The idempotency key is 8 to 80 letters, digits, - or _.',
            'tracking_url.url' => 'The tracking link must start with http:// or https://.',
            'assigned_to.exists' => 'Assign the order to a staff member (an administrator).',
            'supplier_id.integer' => 'Choose who makes your order from the list.',
        ];
    }

    public function after(): array
    {
        return [function ($validator) {
            if ($this->names() !== 'list' && $this->has('sizes') && ! $this->filled('items') && array_sum(array_map('intval', (array) $this->input('sizes'))) < 1) {
                $validator->errors()->add('sizes', 'Add at least one garment to the order.');
            }
            // Upload Your Order: a sensible mobile number, and the full address when delivering.
            if (! $this->routeIs('admin.*') && in_array($this->source(), ['form', 'upload'], true)) {
                if ($this->filled('phone') && ! $validator->errors()->has('phone') && ! OrderDelivery::validMobile((string) $this->input('phone'))) {
                    $validator->errors()->add('phone', OrderDelivery::MOBILE_MESSAGE);
                }
                if ($this->input('delivery') === 'deliver' && ! $validator->errors()->has('address')) {
                    foreach (OrderDelivery::addressErrors($this->input('address')) as $field => $message) {
                        $validator->errors()->add("address.$field", $message);
                    }
                }
            }
            // "Made by": one of the choices offered (an approved supplier), or any supplier for staff.
            if ($this->filled('supplier_id') && ! $validator->errors()->has('supplier_id') && \App\Models\Supplier::ready()
                && ! \App\Models\Supplier::forOrder($this->input('supplier_id'), $this->routeIs('admin.*'))) {
                $validator->errors()->add('supplier_id', 'Choose who makes your order from the list: that supplier is not available.');
            }
            // Every garment row has a quantity.
            foreach (is_array($this->input('items')) ? array_values($this->input('items')) : [] as $i => $item) {
                $sizes = is_array($item) && is_array($item['sizes'] ?? null) ? $item['sizes'] : [];
                if (array_sum(array_map('intval', array_filter($sizes, 'is_numeric'))) < 1 && ! $validator->errors()->has("items.$i.sizes")) {
                    $validator->errors()->add("items.$i.sizes", 'Garment '.($i + 1).': add at least one size and quantity.');
                }
            }
            // A sub-status belongs to its stage.
            if ($this->filled('step')) {
                $status = (string) $this->input('status', $this->route('order')?->status ?? 'pending');
                if (! \App\Support\OrderStages::validStep($status, (string) $this->input('step'))) {
                    $validator->errors()->add('step', 'Choose a sub-status of '.\App\Support\OrderStages::label($status).'.');
                }
            }
            if (! in_array($this->names(), ['same', 'list'], true) || ! is_array($this->input('players'))) {
                return;
            }
            // Every row prints something, and not the sample name.
            $same = $this->names() === 'same';
            foreach (array_values($this->input('players')) as $i => $player) {
                $name = is_array($player) && is_string($player['name'] ?? null) ? trim($player['name']) : '';
                $number = is_array($player) ? trim((string) ($player['number'] ?? '')) : '';
                $who = $same ? '' : 'Player '.($i + 1).': ';
                if (strcasecmp($name, Order::PLACEHOLDER_NAME) === 0) {
                    $validator->errors()->add("players.$i.name", $same ? 'Change YOUR NAME to the name to print on every shirt.' : $who.'change YOUR NAME to the player’s name.');
                } elseif ($name === '' && $number === '') {
                    $validator->errors()->add("players.$i", $same ? 'Add the name or the number to print, or choose “No name or number on the back”.' : $who.'add a name or a number.');
                }
            }
        }];
    }

    /**
     * Checks order fields that were not sent with this request (a saved draft's), as if they had been: returns the
     * validated fields or throws the usual 422.
     */
    public static function check(\Illuminate\Http\Request $base, array $fields): array
    {
        $request = static::createFrom($base);
        $request->replace($fields);
        $request->setContainer(app())->setRedirector(app('redirect'));
        $request->validateResolved();

        return $request->validated();
    }

    /** Where a customer's order comes from: studio (default), form or upload. */
    private function source(): string
    {
        $source = $this->input('source', 'studio');

        return is_string($source) ? $source : 'studio';
    }

    /** The names choice sent, or the order's own when an administrator edits it without one. */
    private function names(): ?string
    {
        $names = $this->input('names', $this->route('order')?->names);

        return is_string($names) ? $names : null;
    }
}
