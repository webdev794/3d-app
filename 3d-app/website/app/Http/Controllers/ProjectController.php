<?php

namespace App\Http\Controllers;

use App\Http\Requests\ProjectRequest;
use App\Models\Project;
use App\Services\DesignSvg;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'status' => ['sometimes', 'in:draft,approved'],
            'mode' => ['sometimes', 'in:ai,dyo'],
            'search' => ['sometimes', 'string', 'max:120'],
        ]);
        $query = $request->user()->projects()->latest('updated_at');

        foreach (['status', 'mode'] as $field) {
            if (isset($filters[$field])) {
                $query->where($field, $filters[$field]);
            }
        }
        if (isset($filters['search'])) {
            $query->where('name', 'like', '%'.$filters['search'].'%');
        }

        return response()->json(['data' => $query->get()]);
    }

    public function store(ProjectRequest $request): JsonResponse
    {
        $data = $request->safe()->except('expected_version');
        $data['design']['garment'] = $data['garment'];
        $project = DB::transaction(function () use ($request, $data) {
            $project = $request->user()->projects()->create($data);
            $project->refresh()->snapshot();

            return $project;
        });

        return response()->json(['data' => $project], 201);
    }

    public function show(Request $request, int $project): JsonResponse
    {
        return response()->json(['data' => $this->owned($request, $project)]);
    }

    public function update(ProjectRequest $request, int $project): JsonResponse
    {
        $updated = DB::transaction(function () use ($request, $project) {
            $owned = $request->user()->projects()->lockForUpdate()->findOrFail($project);
            if ($request->has('expected_version') && (int) $request->input('expected_version') !== $owned->version) {
                abort(409, 'This project has changed. Reload it before saving again.');
            }
            $data = $request->safe()->except('expected_version');
            if (isset($data['design'])) {
                $data['design']['garment'] = $data['garment'] ?? $owned->garment;
            } elseif (isset($data['garment'])) {
                $data['design'] = array_merge($owned->design, ['garment' => $data['garment']]);
            }
            $owned->fill($data);
            if ($owned->isDirty()) {
                $owned->version++;
                $owned->save();
                $owned->snapshot();
            }

            return $owned;
        });

        return response()->json(['data' => $updated]);
    }

    public function destroy(Request $request, int $project): JsonResponse
    {
        $this->owned($request, $project)->delete();

        return response()->json(['data' => ['message' => 'Project deleted.']]);
    }

    public function versions(Request $request, int $project): JsonResponse
    {
        return response()->json(['data' => $this->owned($request, $project)->versions()->latest('version')->get()]);
    }

    public function export(Request $request, int $project): \Symfony\Component\HttpFoundation\Response
    {
        $request->validate(['format' => ['sometimes', 'in:json,svg']]);
        $owned = $this->owned($request, $project);

        if ($request->input('format') === 'svg') {
            return response(app(DesignSvg::class)->render($owned), 200, [
                'Content-Type' => 'image/svg+xml',
                'Content-Disposition' => 'attachment; filename="3deezi-project-'.$owned->id.'-v'.$owned->version.'.svg"',
                'X-Content-Type-Options' => 'nosniff',
            ]);
        }

        return response()->streamDownload(function () use ($owned) {
            echo json_encode([
                'format' => '3deezi-design',
                'schema_version' => 1,
                'project' => $owned->toArray(),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        }, '3deezi-project-'.$owned->id.'-v'.$owned->version.'.json', ['Content-Type' => 'application/json']);
    }

    public function dashboard(Request $request): JsonResponse
    {
        $projects = $request->user()->projects();

        return response()->json(['data' => [
            'projects' => (clone $projects)->count(),
            'drafts' => (clone $projects)->where('status', 'draft')->count(),
            'approved' => (clone $projects)->where('status', 'approved')->count(),
            'assets' => $request->user()->assets()->count(),
            'recent_projects' => (clone $projects)->latest('updated_at')->limit(6)->get(),
        ]]);
    }

    private function owned(Request $request, int $project): Project
    {
        return $request->user()->projects()->findOrFail($project);
    }
}
