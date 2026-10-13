<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PartnerApplication;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Admin: Corporate Partner applications. */
class PartnerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(['status' => ['sometimes', 'nullable', Rule::in(PartnerApplication::STATUSES)]]);
        PartnerApplication::ensureTable();
        $search = trim((string) $request->query('search', ''));
        $partners = PartnerApplication::query()
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('company', 'like', "%{$search}%")
                ->orWhere('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")))
            ->latest()
            ->paginate(min(60, max(6, (int) $request->query('per_page', 12))));

        return response()->json(['data' => $partners]);
    }

    public function update(Request $request, PartnerApplication $partner): JsonResponse
    {
        $partner->fill($request->validate(['status' => ['required', Rule::in(PartnerApplication::STATUSES)]]))->save();

        return response()->json(['data' => $partner]);
    }

    public function destroy(PartnerApplication $partner): JsonResponse
    {
        $partner->delete();

        return response()->json(['data' => ['message' => 'Application deleted.']]);
    }
}
