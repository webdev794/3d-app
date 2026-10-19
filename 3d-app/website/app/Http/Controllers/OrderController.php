<?php

namespace App\Http\Controllers;

use App\Http\Requests\OrderRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/** Customers order their saved kits and follow the status. */
class OrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $request->user()->orders()->withoutKit()->with('project:id,name,garment,sport')->latest()->get()->makeHidden('admin_notes')]);
    }

    public function store(OrderRequest $request): JsonResponse
    {
        $data = $request->validated();
        $order = DB::transaction(function () use ($request, $data) {
            $order = $request->user()->orders()->make(Arr::except($data, ['design_final', 'project_version']));
            if (isset($data['project_id'])) {
                // Only the customer's own projects can be ordered.
                $project = $request->user()->projects()->lockForUpdate()->find($data['project_id']);
                abort_unless($project, 422, 'Choose one of your saved projects.');
                // The design confirmed as final is the one made.
                if (isset($data['project_version']) && (int) $data['project_version'] !== $project->version) {
                    abort(409, "This kit has changed since you opened it (it is now version {$project->version}). Check it, then order again.");
                }
                $order->keepKit($project);
                if ($project->status !== 'approved') {
                    // Ordering approves the design; the version stays the same.
                    $project->forceFill(['status' => 'approved'])->save();
                }
            }
            $order->save();

            return $order;
        });

        return response()->json(['data' => $order->refresh()->load('project:id,name,garment,sport')->makeHidden('admin_notes')], 201);
    }
}
