<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Admin: every user's projects (kits) — review, approve, rename, delete. */
class ProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'status' => ['sometimes', 'nullable', Rule::in(['draft', 'approved'])],
            'sport' => ['sometimes', 'nullable', Rule::in(array_column(config('catalog.sports'), 'id'))],
        ]);
        $search = trim((string) $request->query('search', ''));
        $projects = Project::query()
            ->select(['id', 'user_id', 'name', 'sport', 'garment', 'mode', 'status', 'version', 'thumbnail', 'created_at', 'updated_at'])
            // The sport's garment tile it was made as ("Netball dress", task 9.99).
            ->addSelect('design->productName as product_name')
            ->with('user:id,name,email')
            ->withCount('orders')
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('sport'), fn ($q, $s) => $q->where('sport', $s))
            ->when($search !== '', fn ($q) => $q->where(fn ($q) => $q->where('name', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))))
            ->latest('updated_at')
            ->paginate(min(60, max(6, (int) $request->query('per_page', 12))));

        return response()->json(['data' => $projects]);
    }

    public function update(Request $request, Project $project): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'status' => ['sometimes', Rule::in(['draft', 'approved'])],
        ]);
        $project->fill($data)->save();

        return response()->json(['data' => $project->load('user:id,name,email')->loadCount('orders')->makeHidden('design')]);
    }

    public function destroy(Project $project): JsonResponse
    {
        $project->delete();

        return response()->json(['data' => ['message' => 'Project deleted.']]);
    }
}
