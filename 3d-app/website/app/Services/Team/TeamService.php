<?php

namespace App\Services\Team;

use App\Models\Asset;
use App\Models\Invoice;
use App\Models\OrderDraft;
use App\Models\OrderFile;
use App\Models\TeamAllowance;
use App\Models\TeamFile;
use App\Models\TeamMessage;
use App\Models\TeamRequest;
use App\Models\User;
use App\Notifications\TeamRequestNotification;
use App\Services\Payments\InvoiceService;
use App\Services\Payments\PaymentRules;
use App\Services\Pricing\BillingSettings;
use App\Services\Pricing\Money;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * The 3DEEZI TEAM workflow (team-api.md): a customer's brief, paid from the monthly allowance or by invoice, assigned
 * to a designer, designed, delivered in versions, reviewed (approve, revisions, messages) and, once approved, saved
 * to the customer's assets for the Studio's "My design picture" and the order form.
 */
class TeamService
{
    /** The first reference: TEAM-1001. */
    public const FIRST = 1001;

    // ---------------------------------------------------------------- submitting and paying

    /**
     * A new request with its logos and references. Billing: the month's included requests, then bonus requests, then
     * an invoice (the request waits for payment when "pay first" is on). 422 when too many are open.
     *
     * @param  array<int, UploadedFile>  $logos
     * @param  array<int, UploadedFile>  $references
     */
    public function submit(User $user, array $data, array $logos = [], array $references = []): TeamRequest
    {
        $status = TeamPlans::status($user);
        if (! $status['can_submit']) {
            throw ValidationException::withMessages(['allowance' => $status['blocked_reason']]);
        }
        $request = DB::transaction(function () use ($user, $data) {
            $allowance = TeamAllowance::query()->where('user_id', $user->id)->lockForUpdate()->first() ?? TeamPlans::allowanceFor($user);
            $plan = TeamPlans::plan((string) $allowance->plan);
            $included = $allowance->monthly_included ?? (int) $plan['included_per_month'];
            $next = TeamPlans::nextBilling($allowance, $plan, max(0, $included - TeamPlans::usedThisMonth($user)));
            if ($next['bonus'] && $allowance->exists) {
                $allowance->decrement('bonus_requests');
            }
            $payFirst = (bool) TeamPlans::config()['pay_first'];
            $request = new TeamRequest(array_intersect_key($data, array_flip(['name', 'email', 'sport', 'garment', 'category', 'description', 'colours', 'instructions'])));
            $request->forceFill([
                'user_id' => $user->id,
                'status' => $next['billing'] === 'paid' && $payFirst ? 'awaiting_payment' : 'received',
                'billing' => $next['billing'],
                'plan' => $plan['id'],
                'period' => TeamPlans::period(),
                'price_cents' => $next['price_cents'],
                'used_bonus' => $next['bonus'],
                'revisions_allowed' => (int) $plan['revisions'],
                'status_changed_at' => now(),
                'idempotency_key' => $data['idempotency_key'] ?? null,
            ]);
            $this->number($request);
            $request->log('submitted', ['user_id' => $user->id, 'role' => 'customer', 'to_status' => $request->status,
                'body' => match ($next['billing']) {
                    'paid' => 'Request sent: '.Money::format($next['price_cents'], BillingSettings::currency()).' incl. '.TeamPlans::taxName().($payFirst ? ', starts once paid.' : '.'),
                    'free' => 'Request sent (no charge).',
                    default => 'Request sent: included in the '.$plan['name'].' plan'.($next['bonus'] ? ' (a bonus request).' : '.'),
                }]);

            return $request;
        });
        try {
            foreach ([['logo', $logos], ['reference', $references]] as [$kind, $uploads]) {
                foreach ($uploads as $upload) {
                    $file = TeamFile::fromUpload($upload, $kind, $request->id);
                    $file->user_id = $user->id;
                    $request->files()->save($file);
                }
            }
        } catch (Throwable $e) {
            $request->files()->get()->each->delete();
            $request->delete();
            throw $e;
        }
        if ($request->billing === 'paid') {
            $this->issueInvoice($request);
        }
        if ($request->status === 'received') {
            $this->started($request);
        }

        return $request->refresh();
    }

    /** TEAM-1001, 1002, ...: the next number, taken again when another request took it at the same moment. */
    private function number(TeamRequest $request): void
    {
        for ($attempt = 1; ; $attempt++) {
            $sequence = max((int) TeamRequest::query()->max('sequence') + 1, self::FIRST);
            $request->forceFill(['sequence' => $sequence, 'number' => 'TEAM-'.$sequence]);
            try {
                DB::transaction(fn () => $request->save());

                return;
            } catch (UniqueConstraintViolationException $e) {
                if ($attempt >= 5 || ($request->idempotency_key && TeamRequest::where('user_id', $request->user_id)->where('idempotency_key', $request->idempotency_key)->exists())) {
                    throw $e;
                }
            }
        }
    }

    /**
     * The request's invoice in the existing invoices (INV-..., no order): one line, paid in full. TEAM prices include
     * GST, so the line and subtotal are the price before GST and the GST is the part of the price (A$99.00 = A$90.00 +
     * A$9.00 GST). Emailed like order invoices. $purpose "revision" is an extra revision round (A$25 incl. GST).
     */
    public function issueInvoice(TeamRequest $request, string $purpose = 'request', ?int $priceCents = null, ?string $lineName = null): Invoice
    {
        $ready = TeamRequest::answersReady();
        $existing = $purpose === 'request' ? $request->invoices()->where('status', '!=', 'cancelled')
            ->when($ready, fn ($q) => $q->where(fn ($q) => $q->whereNull('team_purpose')->orWhere('team_purpose', 'request')))->latest('id')->first() : null;
        if ($existing) {
            return $existing;
        }
        $settings = BillingSettings::all();
        $currency = BillingSettings::currency();
        $total = $priceCents ?? (int) $request->price_cents;
        $rate = (string) (float) $settings['tax_rate'];
        $tax = TeamPlans::includedTax($total);
        $price = $total - $tax;
        $taxName = (string) $settings['tax_name'] ?: 'Tax';
        $planName = TeamPlans::plan($request->plan)['name'];
        $name = ($lineName ?? "3DEEZI TEAM design request {$request->number} ({$planName} plan)").' · '.Money::format($total, $currency).($tax > 0 ? " incl. {$taxName}" : '');
        $line = ['key' => 'team', 'kind' => 'custom', 'garment' => null, 'sport' => null, 'name' => $name,
            'quantity' => 1, 'unit_cents' => $price, 'total_cents' => $price, 'priced' => true];
        $quote = ['status' => 'priced', 'currency' => $currency, 'quantity' => 1, 'lines' => [$line], 'extras' => [], 'garments_total_cents' => $price,
            'extras_total_cents' => 0, 'shipping' => null, 'discounts' => [], 'discount_total_cents' => 0, 'subtotal_cents' => $price,
            'tax' => ['name' => $taxName, 'rate' => $rate, 'amount_cents' => $tax, 'applies' => (float) $rate > 0, 'included' => true],
            'total_cents' => $total, 'reasons' => [], 'discount_code' => null];
        $user = $request->user;
        $snapshot = [
            'order' => ['id' => null, 'number' => $request->number, 'name' => '3DEEZI TEAM · '.$request->name, 'source' => 'team', 'quantity' => 0, 'items' => [],
                'summary' => $purpose === 'revision' ? 'Extra revision round' : 'Design request'],
            'customer' => ['name' => $request->name, 'contact' => $user?->name, 'email' => $request->email ?: $user?->email, 'phone' => null, 'address' => null],
            'seller' => BillingSettings::seller(),
            'note' => trim((string) $settings['invoice_note']),
            'bank_details' => trim((string) $settings['bank_details']),
            // A design request is paid in full (no deposit).
            'payment_rule' => ['rule' => 'full', 'deposit_percent' => 100],
            'team' => ['purpose' => $purpose, 'tax_included' => true],
        ];
        $invoice = new Invoice;
        for ($attempt = 1; ; $attempt++) {
            try {
                DB::transaction(function () use ($invoice, $request, $quote, $snapshot, $settings, $currency, $price, $tax, $total, $purpose, $ready) {
                    $sequence = max((int) Invoice::query()->lockForUpdate()->max('sequence') + 1, max(1, (int) $settings['invoice_start']));
                    $invoice->forceFill([
                        'order_id' => null, 'user_id' => $request->user_id, 'team_request_id' => $request->id,
                        'sequence' => $sequence, 'number' => 'INV-'.$sequence, 'status' => 'awaiting_payment', 'currency' => $currency,
                        'subtotal_cents' => $price, 'tax_cents' => $tax, 'total_cents' => $total, 'paid_cents' => 0, 'refunded_cents' => 0,
                        'quote' => $quote, 'snapshot' => $snapshot, 'issued_at' => now(),
                        'due_at' => now()->addDays(max(0, (int) $settings['due_days']))->toDateString(),
                    ] + ($ready ? ['team_purpose' => $purpose] : []))->save();
                });
                break;
            } catch (UniqueConstraintViolationException $e) {
                if ($attempt >= 5) {
                    throw $e;
                }
            }
        }
        $request->log('payment', ['visibility' => 'customer', 'body' => "Invoice {$invoice->number} issued: ".Money::format($invoice->total_cents, $currency).($tax > 0 ? ' incl. '.$taxName : '').'.', 'data' => ['invoice' => $invoice->number, 'purpose' => $purpose]]);
        app(InvoiceService::class)->emailInvoice($invoice);

        return $invoice;
    }

    /** Called when one of the invoices is paid in full (InvoiceService::paymentReceived): the request starts. */
    public function invoicePaid(Invoice $invoice): void
    {
        $request = $invoice->team_request_id ? TeamRequest::find($invoice->team_request_id) : null;
        if (! $request || $invoice->status !== 'paid') {
            return;
        }
        $request->log('payment', ['body' => "Invoice {$invoice->number} paid.", 'data' => ['invoice' => $invoice->number]]);
        if (($invoice->team_purpose ?? null) === 'revision') {
            $this->startExtraRevision($request, null, "Extra revision paid (invoice {$invoice->number}).");

            return;
        }
        if ($request->status === 'awaiting_payment') {
            $this->move($request, 'received', null, null);
            $this->started($request, 'paid');
        }
    }

    /**
     * A request that is now with the team (included, or paid): the first draft's due date is set (business days,
     * Admin > 3DEEZI TEAM), the customer and admins are told, and the default designer (if set) takes it.
     */
    private function started(TeamRequest $request, string $kind = 'received'): void
    {
        $request->forceFill(['due_date' => TeamPlans::businessDays(TeamPlans::turnaround()['first_draft_days'])->toDateString()])->save();
        $designer = $request->designer_id ? null : TeamPlans::defaultDesigner();
        $this->notifyCustomer($request, 'received', 'Your design request was received');
        // The default designer hears "assigned to you" instead of the admins' "new request".
        $this->notifyStaff($request, $this->admins()->reject(fn (User $u) => $designer && $u->id === $designer->id), 'new_request', ($kind === 'paid' ? 'Paid design request: ' : 'New design request: ').$request->name);
        if ($designer) {
            $this->assign($request, $designer, null);
        }
    }

    // ---------------------------------------------------------------- the workflow

    /** An admin assigns a designer (null unassigns); no $actor: the default designer, assigned automatically. */
    public function assign(TeamRequest $request, ?User $designer, ?User $actor): TeamRequest
    {
        abort_if(! $request->isOpen(), 409, 'This request is finished.');
        abort_if($designer && ! $designer->is_designer && ! $designer->is_admin, 422, 'Choose a designer (mark the account as a designer in Admin > Users).');
        $before = $request->designer_id;
        $request->designer_id = $designer?->id;
        $request->save();
        $request->log('assign', ['user_id' => $actor?->id, 'role' => $actor ? 'admin' : 'system', 'visibility' => 'customer',
            'body' => $designer ? "Designer assigned: {$designer->name}".($actor ? '.' : ' (automatically).') : 'Designer unassigned.', 'data' => ['from' => $before, 'to' => $designer?->id, 'auto' => ! $actor]]);
        if ($designer && $request->status === 'received') {
            $this->move($request, 'assigned', $actor, null);
        }
        if ($designer) {
            $this->notifyCustomer($request, 'assigned', "{$designer->name} is designing your request");
            if (! $actor || $designer->id !== $actor->id) {
                $this->notifyStaff($request, collect([$designer]), 'assigned', "Assigned to you: {$request->number} · {$request->name}");
            }
        }

        return $request->refresh();
    }

    /** Staff change the status. Designers: in_progress and review only; review needs a delivery. */
    public function changeStatus(TeamRequest $request, string $status, User $actor, ?string $note = null, bool $force = false): TeamRequest
    {
        abort_unless(isset(TeamRequest::STATUSES[$status]), 422, 'Choose a status.');
        if (! $actor->is_admin) {
            abort_unless(in_array($status, TeamRequest::DESIGNER_STATUSES, true), 403, 'Only an administrator can set this status.');
        }
        abort_if(! $request->isOpen() && ! $actor->is_admin, 409, 'This request is finished.');
        abort_if($request->status === 'awaiting_payment' && ! $force && $status !== 'closed', 409, 'This request is not paid yet. Confirm to start it anyway.');
        if ($status === $request->status) {
            return $request;
        }
        if ($status === 'review') {
            abort_if($request->latestVersion() === 0, 422, 'Upload the artwork or mockups first.');
        }
        if ($status === 'approved') {
            return $this->approve($request, null, $actor);
        }
        if ($status === 'closed') {
            return $this->close($request, $actor, $note);
        }
        $wasAwaiting = $request->status === 'awaiting_payment';
        $this->move($request, $status, $actor, $note);
        if ($wasAwaiting) {
            $this->started($request);
        }
        if ($status === 'review') {
            $this->notifyCustomer($request, 'review', 'Your design is ready for review', $note);
        } elseif (in_array($status, ['in_progress', 'assigned', 'received', 'revision'], true)) {
            $this->notifyCustomer($request, 'status', $request->label(), $note);
        }

        return $request->refresh();
    }

    /** Staff upload a new delivery version (artwork and mockups), and may send it for review. */
    public function deliver(TeamRequest $request, array $uploads, string $kind, User $actor, ?string $note, bool $send): TeamRequest
    {
        abort_if(! $request->isOpen() || $request->status === 'awaiting_payment', 409, $request->status === 'awaiting_payment' ? 'This request is not paid yet.' : 'This request is finished.');
        $version = $request->latestVersion() + 1;
        $message = $request->log('delivery', ['user_id' => $actor->id, 'role' => $this->role($actor, $request), 'visibility' => 'customer',
            'body' => $note ?: "Version {$version} uploaded.", 'data' => ['version' => $version]]);
        foreach ($uploads as $upload) {
            $file = TeamFile::fromUpload($upload, $kind, $request->id);
            $file->forceFill(['user_id' => $actor->id, 'version' => $version, 'visibility' => 'customer', 'team_message_id' => $message->id]);
            $request->files()->save($file);
        }
        if (in_array($request->status, ['received', 'assigned'], true)) {
            $this->move($request, 'in_progress', $actor, null);
        }
        if ($send) {
            $this->move($request, 'review', $actor, $note);
            $this->notifyCustomer($request, 'review', 'Your design is ready for review', $note);
        }

        return $request->refresh();
    }

    /**
     * A message (customer or staff), optionally with files; staff may write internal notes. The other side is told.
     *
     * @param  array<int, UploadedFile>  $uploads
     */
    public function message(TeamRequest $request, User $actor, ?string $body, array $uploads, bool $internal = false): TeamMessage
    {
        abort_if($request->status === 'closed', 409, 'This request is closed.');
        $role = $this->role($actor, $request);
        $internal = $internal && $role !== 'customer';
        $message = $request->log('message', ['user_id' => $actor->id, 'role' => $role, 'visibility' => $internal ? 'internal' : 'customer', 'body' => $body]);
        foreach ($uploads as $upload) {
            $file = TeamFile::fromUpload($upload, $role === 'customer' ? 'attachment' : 'working', $request->id);
            $file->forceFill(['user_id' => $actor->id, 'visibility' => $internal ? 'internal' : 'customer', 'team_message_id' => $message->id]);
            $request->files()->save($file);
        }
        $text = trim((string) $body) !== '' ? (string) $body : count($uploads).' file'.(count($uploads) === 1 ? '' : 's').' attached';
        if ($role === 'customer') {
            $request->forceFill(['customer_read_at' => now()])->save();
            $this->notifyStaff($request, $this->staffFor($request), 'message', "Message from {$request->name}", $text);
        } elseif (! $internal) {
            $request->forceFill(['staff_read_at' => now()])->save();
            $this->notifyCustomer($request, 'message', 'New message from your 3DEEZI designer', $text);
        }

        return $message->load('files', 'author');
    }

    /** The customer asks for changes to the version in review (counts against the revision limit). */
    public function revise(TeamRequest $request, User $actor, string $body, array $uploads, bool $extra = false): TeamRequest
    {
        abort_unless($request->status === 'review', 409, 'You can ask for revisions when a design is ready for review.');
        if ($request->revisions_used >= $request->revisions_allowed) {
            if ($extra && TeamRequest::answersReady()) {
                return $this->requestExtraRevision($request, $actor, $body, $uploads);
            }
            throw ValidationException::withMessages(['revisions' => "You have used all {$request->revisions_allowed} revisions for this request. Ask for an extra revision, message your designer or approve the design."]);
        }
        $request->revisions_used++;
        $request->save();
        $message = $request->log('revision', ['user_id' => $actor->id, 'role' => 'customer', 'body' => $body,
            'data' => ['version' => $request->latestVersion(), 'revision' => $request->revisions_used]]);
        foreach ($uploads as $upload) {
            $file = TeamFile::fromUpload($upload, 'attachment', $request->id);
            $file->forceFill(['user_id' => $actor->id, 'team_message_id' => $message->id]);
            $request->files()->save($file);
        }
        $this->move($request, 'revision', $actor, null);
        $this->notifyStaff($request, $this->staffFor($request, true), 'revision', "Revisions requested: {$request->number}", $body);

        return $request->refresh();
    }

    /**
     * Approves a version (the customer, or an admin for them): the final design is saved to the customer's assets
     * (its pictures, for the Studio's "My design picture").
     */
    public function approve(TeamRequest $request, ?int $version, User $actor): TeamRequest
    {
        $isCustomer = $actor->id === $request->user_id;
        abort_unless($request->status === 'review' || (! $isCustomer && $actor->is_admin && $request->isOpen()), 409, 'There is no design to approve yet.');
        $latest = $request->latestVersion();
        abort_if($latest === 0, 422, 'There is no delivered design to approve.');
        $version = $version ?: $latest;
        $files = $request->files()->whereIn('kind', TeamFile::DELIVERY_KINDS)->where('visibility', 'customer')->where('version', $version)->get();
        abort_if($files->isEmpty(), 422, 'That version was not found.');
        $assets = [];
        foreach ($files->filter->isPicture() as $file) {
            $asset = $this->toAsset($request, $file);
            if ($asset) {
                $assets[] = $asset->id;
            }
        }
        $this->dropPendingRevision($request, 'Design approved.');
        $request->forceFill(['final_version' => $version, 'final_asset_ids' => $assets, 'approved_at' => now()])->save();
        $request->log('approval', ['user_id' => $actor->id, 'role' => $this->role($actor, $request), 'body' => "Version {$version} approved.", 'data' => ['version' => $version, 'assets' => $assets]]);
        $this->move($request, 'approved', $actor, null);
        $this->notifyCustomer($request, 'approved', 'Your design is final and saved to your account');
        $this->notifyStaff($request, $this->staffFor($request), 'approved', "Approved: {$request->number} · {$request->name}");

        return $request->refresh();
    }

    /** Closes a request (admin any time before approval; the customer while unpaid or not started). */
    public function close(TeamRequest $request, User $actor, ?string $note = null): TeamRequest
    {
        abort_if($request->status === 'closed', 409, 'This request is already closed.');
        $isCustomer = $actor->id === $request->user_id && ! $actor->is_admin;
        if ($isCustomer) {
            abort_unless($request->notStarted(), 409, 'Your designer has started: message them to stop the request.');
        }
        abort_if($request->status === 'approved' && ! $actor->is_admin, 409, 'This request is approved.');
        // Not worked on yet: an unpaid invoice is cancelled, and an included request is given back.
        $untouched = $request->notStarted();
        if ($invoice = $request->invoices()->whereIn('status', Invoice::PAYABLE)->where('paid_cents', 0)->first()) {
            app(InvoiceService::class)->cancel($invoice, "Design request {$request->number} closed.");
        }
        if ($untouched && $request->billing === 'included') {
            if ($request->used_bonus) {
                TeamAllowance::query()->where('user_id', $request->user_id)->increment('bonus_requests');
            }
            // Not counted in the month any more.
            $request->billing = 'free';
            $request->save();
        }
        // A paid request cancelled before work started: a full refund is due (made by hand in Airwallex or Stripe).
        if (TeamRequest::answersReady() && $request->notStarted()
            && $request->invoice()->where('paid_cents', '>', 0)->exists()) {
            $request->refund_status = 'due';
            $request->log('note', ['user_id' => $actor->id, 'role' => $this->role($actor, $request), 'visibility' => 'customer',
                'body' => 'Cancelled before work started: a full refund is due.']);
        }
        $this->dropPendingRevision($request, "Design request {$request->number} closed.");
        $request->closed_at = now();
        $this->move($request, 'closed', $actor, $note);
        $this->notifyCustomer($request, 'closed', 'Your design request was closed', $note);
        if ($isCustomer) {
            $this->notifyStaff($request, $this->staffFor($request), 'closed', "Closed by the customer: {$request->number}");
        }

        return $request->refresh();
    }

    // ---------------------------------------------------------------- extra revision rounds and refunds

    /**
     * The customer's revisions are used up and they ask for another: an extra round (A$25 incl. GST, Admin > 3DEEZI
     * TEAM) is invoiced and starts when it is paid, like a paid request. Their message waits with the invoice.
     */
    private function requestExtraRevision(TeamRequest $request, User $actor, string $body, array $uploads): TeamRequest
    {
        abort_if((bool) $request->pending_revision_message_id, 409, 'Your extra revision is waiting for its invoice to be paid.');
        $cents = (int) TeamPlans::config()['extra_revision_cents'];
        $round = (int) $request->extra_revisions + 1;
        $message = $request->log('revision', ['user_id' => $actor->id, 'role' => 'customer', 'body' => $body,
            'data' => ['version' => $request->latestVersion(), 'extra' => true, 'pending' => $cents > 0]]);
        foreach ($uploads as $upload) {
            $file = TeamFile::fromUpload($upload, 'attachment', $request->id);
            $file->forceFill(['user_id' => $actor->id, 'team_message_id' => $message->id]);
            $request->files()->save($file);
        }
        $request->forceFill(['pending_revision_message_id' => $message->id])->save();
        if ($cents <= 0) {
            return $this->startExtraRevision($request, $actor, 'Extra revision (no charge).');
        }
        $this->issueInvoice($request, 'revision', $cents, "3DEEZI TEAM extra revision round {$round} · {$request->number}");
        $request->log('note', ['visibility' => 'customer', 'body' => 'Extra revision requested: it starts once its invoice is paid.']);

        return $request->refresh();
    }

    /** The extra revision starts (its invoice paid, or an admin waived it): one more revision, used now. */
    public function startExtraRevision(TeamRequest $request, ?User $actor, string $note): TeamRequest
    {
        $message = $request->pending_revision_message_id ? TeamMessage::find($request->pending_revision_message_id) : null;
        if (! $message || $request->status !== 'review') {
            $request->forceFill(['pending_revision_message_id' => null])->save();

            return $request->refresh();
        }
        $request->forceFill([
            'pending_revision_message_id' => null,
            'extra_revisions' => (int) $request->extra_revisions + 1,
            'revisions_allowed' => (int) $request->revisions_allowed + 1,
            'revisions_used' => (int) $request->revisions_used + 1,
        ])->save();
        $message->forceFill(['data' => array_merge((array) $message->data, ['pending' => false, 'revision' => $request->revisions_used])])->save();
        $request->log('note', ['user_id' => $actor?->id, 'role' => $actor ? $this->role($actor, $request) : 'system', 'visibility' => 'customer', 'body' => $note]);
        $this->move($request, 'revision', $actor, null);
        $this->notifyCustomer($request, 'status', 'Your extra revision has started');
        $this->notifyStaff($request, $this->staffFor($request, true), 'revision', "Revisions requested (extra round): {$request->number}", (string) $message->body);

        return $request->refresh();
    }

    /**
     * An admin gives a revision for free: a waiting extra revision starts at once (its invoice is cancelled);
     * otherwise the customer gets one more revision to ask for.
     */
    public function freeRevision(TeamRequest $request, User $actor): TeamRequest
    {
        abort_unless(TeamRequest::answersReady(), 409, 'Run the database update first (php artisan migrate).');
        abort_unless($request->isOpen() && $request->status !== 'awaiting_payment', 409, 'This request is not open for revisions.');
        if ($request->pending_revision_message_id) {
            $this->cancelRevisionInvoice($request, 'Extra revision given free by 3DEEZI.');

            return $this->startExtraRevision($request, $actor, 'Extra revision given free by 3DEEZI.');
        }
        $request->forceFill(['revisions_allowed' => (int) $request->revisions_allowed + 1, 'extra_revisions' => (int) $request->extra_revisions + 1])->save();
        $request->log('note', ['user_id' => $actor->id, 'role' => $this->role($actor, $request), 'visibility' => 'customer', 'body' => 'An extra revision was added free by 3DEEZI.']);
        $this->notifyCustomer($request, 'status', 'You have a free extra revision');

        return $request->refresh();
    }

    /** A waiting extra revision is dropped (approved or closed instead): its unpaid invoice is cancelled. */
    private function dropPendingRevision(TeamRequest $request, string $note): void
    {
        if (! TeamRequest::answersReady() || ! $request->pending_revision_message_id) {
            return;
        }
        $this->cancelRevisionInvoice($request, $note);
        $request->forceFill(['pending_revision_message_id' => null])->save();
    }

    private function cancelRevisionInvoice(TeamRequest $request, string $note): void
    {
        foreach ($request->invoices()->where('team_purpose', 'revision')->whereIn('status', Invoice::PAYABLE)->where('paid_cents', 0)->get() as $invoice) {
            app(InvoiceService::class)->cancel($invoice, $note);
        }
    }

    /**
     * The refund mark: "due" (a paid request cancelled before work started, or 3DEEZI could not deliver), "refunded"
     * (an admin refunded it by hand in Airwallex or Stripe; recorded on the invoice, no payment call) or none.
     */
    public function setRefund(TeamRequest $request, ?string $state, User $actor): TeamRequest
    {
        abort_unless(TeamRequest::answersReady(), 409, 'Run the database update first (php artisan migrate).');
        abort_unless(in_array($state, [null, 'due', 'refunded'], true), 422, 'Choose due, refunded or none.');
        $invoice = $request->invoices()->where('paid_cents', '>', 0)->where(fn ($q) => $q->whereNull('team_purpose')->orWhere('team_purpose', 'request'))->latest('id')->first();
        abort_if($state !== null && ! $invoice, 422, 'This request has no paid invoice to refund.');
        $request->forceFill(['refund_status' => $state, 'refunded_at' => $state === 'refunded' ? now() : null, 'refunded_by' => $state === 'refunded' ? $actor->id : null])->save();
        if ($state === 'refunded' && $invoice->status !== 'refunded') {
            // Recorded only: the money went back by hand in Airwallex or Stripe.
            DB::transaction(function () use ($invoice, $request) {
                $invoice->forceFill(['status' => 'refunded', 'refunded_cents' => $invoice->paid_cents, 'refunded_at' => now(),
                    'notes' => trim(($invoice->notes ? $invoice->notes."\n" : '')."Refunded by hand for design request {$request->number}.")])->save();
                $invoice->payments()->where('status', 'succeeded')->update(['status' => 'refunded']);
            });
        }
        $request->log('note', ['user_id' => $actor->id, 'role' => $this->role($actor, $request), 'visibility' => $state === 'refunded' ? 'customer' : 'internal',
            'body' => match ($state) { 'refunded' => 'Refunded in full.', 'due' => 'Marked: refund due.', default => 'Refund mark cleared.' }]);

        return $request->refresh();
    }

    /** The approved design's picture as the customer's asset, for the Studio (made again if it was deleted). */
    public function studioAsset(TeamRequest $request): Asset
    {
        abort_unless($request->status === 'approved', 409, 'The design is not approved yet.');
        $asset = Asset::query()->where('user_id', $request->user_id)->whereIn('id', (array) ($request->final_asset_ids ?? []))->orderBy('id')->first();
        if ($asset) {
            return $asset;
        }
        $file = $request->files()->whereIn('kind', TeamFile::DELIVERY_KINDS)->where('version', $request->final_version)->get()->first(fn (TeamFile $f) => $f->isPicture());
        abort_unless($file, 422, 'The final design has no picture (PNG, JPG or WEBP) to put on the 3D kit.');
        $asset = $this->toAsset($request, $file);
        abort_unless($asset, 500, 'The design could not be copied to your assets.');
        $request->forceFill(['final_asset_ids' => array_values(array_unique(array_merge((array) ($request->final_asset_ids ?? []), [$asset->id])))])->save();

        return $asset;
    }

    /** "Order this design": an order-form draft with the design attached, opened at /orders/new?draft=ID. */
    public function orderDraft(TeamRequest $request): OrderDraft
    {
        abort_unless($request->status === 'approved', 409, 'The design is not approved yet.');
        $garment = array_key_exists($request->garment, \App\Models\Order::GARMENTS) ? $request->garment : 'jersey';
        $draft = new OrderDraft(['kind' => 'form', 'data' => ['team_name' => $request->name]]);
        $draft->user_id = $request->user_id;
        $draft->save();
        $ids = [];
        foreach ($request->files()->whereIn('kind', TeamFile::DELIVERY_KINDS)->where('version', $request->final_version)->get() as $file) {
            if (! Storage::disk('local')->exists($file->path) || count($ids) >= 5) {
                continue;
            }
            $path = 'order-files/draft-'.$draft->id.'/'.Str::uuid().'.'.$file->extension;
            Storage::disk('local')->copy($file->path, $path);
            $copy = new OrderFile(['kind' => 'artwork', 'visibility' => 'customer', 'name' => $file->name, 'extension' => $file->extension, 'path' => $path,
                'mime_type' => $file->mime_type, 'size' => $file->size, 'thumb' => $file->thumb]);
            $copy->user_id = $request->user_id;
            $copy->order_draft_id = $draft->id;
            $copy->save();
            $ids[] = $copy->id;
        }
        $draft->data = [
            'contact_name' => $request->user?->name ?? $request->name,
            'contact_email' => $request->email,
            'team_name' => $request->name,
            'notes' => "Design by 3DEEZI TEAM: {$request->number} (version {$request->final_version}).",
            'items' => [['garment' => $garment, 'sport' => mb_substr((string) $request->sport, 0, 40), 'label' => $request->number, 'sizes' => (object) [], 'open' => true, 'file_ids' => $ids]],
        ];
        $draft->save();

        return $draft;
    }

    // ---------------------------------------------------------------- helpers

    /** Moves the request to a status, with a history entry. */
    private function move(TeamRequest $request, string $status, ?User $actor, ?string $note): void
    {
        $from = $request->status;
        if ($from === $status) {
            return;
        }
        $request->forceFill(['status' => $status, 'status_changed_at' => now()]);
        if ($status === 'revision') {
            // Each revision is due in the admin-set business days (2 by default); staff can still change it by hand.
            $request->due_date = TeamPlans::businessDays(TeamPlans::turnaround()['revision_days'])->toDateString();
        }
        $request->save();
        $request->log('status', ['user_id' => $actor?->id, 'role' => $actor ? $this->role($actor, $request) : 'system', 'from_status' => $from, 'to_status' => $status,
            'body' => $note ?: TeamRequest::STATUSES[$status][0]]);
    }

    private function toAsset(TeamRequest $request, TeamFile $file): ?Asset
    {
        if (! Storage::disk('local')->exists($file->path)) {
            return null;
        }
        $path = 'assets/'.$request->user_id.'/'.Str::uuid().'.'.$file->extension;
        Storage::disk('local')->copy($file->path, $path);
        $garment = collect(config('catalog.garments'))->firstWhere('id', $request->garment)['name'] ?? ucfirst((string) $request->garment);
        $asset = new Asset(['name' => mb_substr("3DEEZI TEAM · {$request->number} · {$garment}", 0, 120), 'type' => 'reference', 'path' => $path, 'mime_type' => $file->mime_type, 'size' => $file->size]);
        $asset->user_id = $request->user_id;
        $asset->save();

        return $asset;
    }

    /** customer, designer or admin, as shown in the conversation. */
    public function role(User $user, TeamRequest $request): string
    {
        if ($user->id === $request->user_id && ! $user->is_admin && $user->id !== $request->designer_id) {
            return 'customer';
        }

        return $user->is_admin && $user->id !== $request->designer_id ? 'admin' : ($user->is_designer || $user->id === $request->designer_id ? 'designer' : 'customer');
    }

    private function admins()
    {
        return User::query()->where('is_admin', true)->get();
    }

    /** Who hears about the customer's news: the designer, or every admin while nobody is assigned (with $admins too). */
    private function staffFor(TeamRequest $request, bool $admins = false)
    {
        $designer = $request->designer;
        $people = $designer ? collect([$designer]) : $this->admins();

        return $admins && $designer ? $people->merge($this->admins())->unique('id') : $people;
    }

    private function notifyCustomer(TeamRequest $request, string $kind, string $text, ?string $message = null): void
    {
        $this->send(collect([$request->user])->filter(), new TeamRequestNotification($request, $kind, $text, $message));
    }

    private function notifyStaff(TeamRequest $request, $people, string $kind, string $text, ?string $message = null): void
    {
        $actor = auth()->user();
        $this->send(collect($people)->filter()->reject(fn (User $u) => $actor && $u->id === $actor->id || $u->id === $request->user_id),
            new TeamRequestNotification($request, $kind, $text, $message, true));
    }

    /** Notifications never break the workflow (a mail server that is down is logged). */
    private function send($people, TeamRequestNotification $notification): void
    {
        if ($people->isEmpty()) {
            return;
        }
        try {
            Notification::send($people, $notification);
        } catch (Throwable $e) {
            report($e);
        }
    }

    /** Whether the invoice rules let this request start (always for included and free ones). */
    public static function paid(TeamRequest $request): bool
    {
        return $request->billing !== 'paid' || PaymentRules::met($request->invoice);
    }
}
