<?php

namespace App\Http\Controllers;

use App\Models\PartnerApplication;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Public "Apply to become a partner" form on the pricing page. */
class PartnerApplicationController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company' => ['required', 'string', 'max:160'],
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190'],
            'phone' => ['nullable', 'string', 'max:40'],
            'website' => ['nullable', 'string', 'max:255'],
            'message' => ['nullable', 'string', 'max:3000'],
        ]);
        PartnerApplication::ensureTable();
        PartnerApplication::create($data);

        return response()->json(['data' => ['message' => 'Thanks! The 3DEEZI team will contact you to book a consultation.']], 201);
    }
}
