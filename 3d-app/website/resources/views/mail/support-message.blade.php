<x-mail::message>
# New support message

**From:** {{ $item->name }} ({{ $item->email }})
@if ($item->order_reference)

**Order reference:** {{ $item->order_reference }}
@endif
@if ($item->user_id)

**Account:** user #{{ $item->user_id }}
@endif

**Message:**

{!! nl2br(e($item->message)) !!}

<x-mail::button :url="rtrim((string) config('app.url'), '/').'/admin/support'">
Open Support messages
</x-mail::button>

Reply to this email to answer {{ $item->name }} directly.
</x-mail::message>
