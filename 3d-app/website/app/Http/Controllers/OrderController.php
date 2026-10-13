<?php

namespace App\Http\Controllers;

use App\Http\Requests\OrderRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Customers order their saved kits and follow the status. */
class OrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->orders()->with('project:id,name,garment,sport')->latest()->get()->makeHidden('admin_notes')]);
    }

    public function store(OrderRequest $request): JsonResponse
    {
        $data = $request->validated();
        if (isset($data['project_id'])) {
            // Only the customer's own projects can be ordered.
            abort_unless($request->user()->projects()->whereKey($data['project_id'])->exists(), 422, 'Choose one of your saved projects.');
        }
        $order = $request->user()->orders()->create($data);

        return response()->json(['data' => $order->refresh()->load('project:id,name,garment,sport')->makeHidden('admin_notes')], 201);
    }
}
