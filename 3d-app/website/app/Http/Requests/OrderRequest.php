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
        // A customer ordering a kit confirms the design is final and says what goes on the back.
        $kit = ! $admin && $this->filled('project_id');
        $names = $this->names();

        return [
            'user_id' => $admin ? [$required, 'integer', 'exists:users,id'] : ['prohibited'],
            'project_id' => ['sometimes', 'nullable', 'integer', 'exists:projects,id'],
            // With a players list, the sizes are counted from the list.
            'sizes' => [$names === 'list' ? 'sometimes' : $required, 'array:'.implode(',', Order::SIZES)],
            'sizes.*' => ['integer', 'min:0', 'max:10000'],
            'contact_name' => [$required, 'string', 'max:120'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'shipping_address' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'design_final' => $kit ? ['accepted'] : ['sometimes', 'boolean'],
            // The version of the kit the customer saw, when known: a newer one has to be checked first.
            'project_version' => $admin ? ['prohibited'] : ['sometimes', 'nullable', 'integer', 'min:1'],
            'names' => [$kit ? 'required' : 'sometimes', 'nullable', Rule::in(Order::NAMES)],
            'players' => ['required_if:names,same,list', 'nullable', 'list', $names === 'same' ? 'size:1' : 'max:'.Order::MAX_PLAYERS],
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
        ];
    }

    public function after(): array
    {
        return [function ($validator) {
            if ($this->names() !== 'list' && $this->has('sizes') && array_sum(array_map('intval', (array) $this->input('sizes'))) < 1) {
                $validator->errors()->add('sizes', 'Add at least one garment to the order.');
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

    /** The names choice sent, or the order's own when an administrator edits it without one. */
    private function names(): ?string
    {
        $names = $this->input('names', $this->route('order')?->names);

        return is_string($names) ? $names : null;
    }
}
